import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isVisible, valueKey } from "./lib/visibility";

// --- internal helpers -------------------------------------------------------

async function createTransaction(
  ctx: MutationCtx,
  args: {
    actorId?: string;
    actorType?: "user" | "system" | "agent" | "migration";
    reason?: string;
    source?: string;
    now: number;
  },
): Promise<Id<"transactions">> {
  return await ctx.db.insert("transactions", {
    actorId: args.actorId ?? "system",
    actorType: args.actorType ?? "system",
    reason: args.reason,
    source: args.source,
    txTime: args.now,
  });
}

async function cardinalityOf(
  ctx: MutationCtx,
  a: string,
): Promise<"one" | "many"> {
  const attr = await ctx.db
    .query("attributes")
    .withIndex("by_name", (q) => q.eq("name", a))
    .unique();
  return attr?.cardinality ?? "many";
}

/** Upsert the current-fact projection row for an (e, a[, v]) key. */
async function upsertCurrentFact(
  ctx: MutationCtx,
  fact: Doc<"facts">,
  cardinality: "one" | "many",
  now: number,
): Promise<void> {
  if (cardinality === "one") {
    // Replace any existing current row for this (e, a).
    const existing = await ctx.db
      .query("currentFacts")
      .withIndex("by_e_a", (q) => q.eq("e", fact.e).eq("a", fact.a))
      .collect();
    for (const row of existing) {
      await ctx.db.delete("currentFacts", row._id);
    }
  } else {
    // For cardinality-many, dedupe on the exact value.
    const existing = await ctx.db
      .query("currentFacts")
      .withIndex("by_e_a_v", (q) =>
        q.eq("e", fact.e).eq("a", fact.a).eq("v", fact.v),
      )
      .collect();
    for (const row of existing) {
      await ctx.db.delete("currentFacts", row._id);
    }
  }

  await ctx.db.insert("currentFacts", {
    e: fact.e,
    a: fact.a,
    v: fact.v,
    factId: fact._id,
    validFrom: fact.validFrom,
    txTime: now,
    updatedAt: now,
  });
}

/** Remove a fact from the current-fact projection. */
async function removeCurrentFact(
  ctx: MutationCtx,
  factId: Id<"facts">,
  e: string,
  a: string,
): Promise<void> {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", a))
    .collect();
  for (const row of rows) {
    if (row.factId === factId) {
      await ctx.db.delete("currentFacts", row._id);
    }
  }
}

// --- mutations --------------------------------------------------------------

export const assertFact = mutation({
  args: {
    e: v.string(),
    a: v.string(),
    value: v.any(),
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    actorId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const validFrom = args.validFrom ?? now;

    const txId = await createTransaction(ctx, {
      actorId: args.actorId,
      reason: args.reason,
      source: args.source,
      now,
    });

    const cardinality = await cardinalityOf(ctx, args.a);

    // Cardinality-one: retract any currently-true fact for this (e, a) before
    // asserting the new one, so transaction-time history stays consistent.
    if (cardinality === "one") {
      const current = await ctx.db
        .query("currentFacts")
        .withIndex("by_e_a", (q) => q.eq("e", args.e).eq("a", args.a))
        .collect();
      for (const row of current) {
        const old = await ctx.db.get("facts", row.factId);
        if (old && old.retractedAt === undefined) {
          await ctx.db.patch("facts", old._id, {
            retractedAt: now,
            validTo: old.validTo ?? validFrom,
            lastTxId: txId,
          });
          await ctx.db.insert("factEvents", {
            txId,
            txTime: now,
            kind: "retract",
            factId: old._id,
            e: old.e,
            a: old.a,
            v: old.v,
            validTo: old.validTo ?? validFrom,
            reason: "superseded by new cardinality-one assertion",
          });
        }
      }
    }

    const factId = await ctx.db.insert("facts", {
      e: args.e,
      a: args.a,
      v: args.value,
      firstTxId: txId,
      assertedAt: now,
      validFrom,
      validTo: args.validTo,
      source: args.source,
    });

    await ctx.db.insert("factEvents", {
      txId,
      txTime: now,
      kind: "assert",
      factId,
      e: args.e,
      a: args.a,
      v: args.value,
      validFrom,
      validTo: args.validTo,
      reason: args.reason,
    });

    const fact = (await ctx.db.get("facts", factId))!;
    await upsertCurrentFact(ctx, fact, cardinality, now);

    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: args.e,
      a: args.a,
      factId,
      txTime: now,
    });

    return { txId, factId };
  },
});

export const retractFact = mutation({
  args: {
    factId: v.id("facts"),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fact = await ctx.db.get("facts", args.factId);
    if (!fact) throw new Error(`fact ${args.factId} not found`);
    if (fact.retractedAt !== undefined) {
      return { txId: null, factId: args.factId, alreadyRetracted: true };
    }

    const txId = await createTransaction(ctx, {
      actorId: args.actorId,
      reason: args.reason,
      now,
    });

    await ctx.db.patch("facts", fact._id, {
      retractedAt: now,
      validTo: args.validTo ?? fact.validTo,
      lastTxId: txId,
    });

    await ctx.db.insert("factEvents", {
      txId,
      txTime: now,
      kind: "retract",
      factId: fact._id,
      e: fact.e,
      a: fact.a,
      v: fact.v,
      validTo: args.validTo ?? fact.validTo,
      reason: args.reason,
    });

    await removeCurrentFact(ctx, fact._id, fact.e, fact.a);

    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: fact.e,
      a: fact.a,
      factId: fact._id,
      txTime: now,
    });

    return { txId, factId: fact._id };
  },
});

export const tombstoneFact = mutation({
  args: {
    factId: v.id("facts"),
    reason: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fact = await ctx.db.get("facts", args.factId);
    if (!fact) throw new Error(`fact ${args.factId} not found`);

    const txId = await createTransaction(ctx, {
      actorId: args.actorId,
      reason: args.reason,
      now,
    });

    await ctx.db.patch("facts", fact._id, {
      tombstonedAt: now,
      tombstoneTxId: txId,
      tombstoneReason: args.reason,
      lastTxId: txId,
    });

    await ctx.db.insert("factEvents", {
      txId,
      txTime: now,
      kind: "tombstone",
      factId: fact._id,
      e: fact.e,
      a: fact.a,
      v: fact.v,
      reason: args.reason,
    });

    await removeCurrentFact(ctx, fact._id, fact.e, fact.a);

    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: fact.e,
      a: fact.a,
      factId: fact._id,
      txTime: now,
    });

    return { txId, factId: fact._id };
  },
});

export const correctFact = mutation({
  args: {
    factId: v.id("facts"),
    newValue: v.optional(v.any()),
    newValidFrom: v.optional(v.number()),
    newValidTo: v.optional(v.number()),
    reason: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const old = await ctx.db.get("facts", args.factId);
    if (!old) throw new Error(`fact ${args.factId} not found`);

    const txId = await createTransaction(ctx, {
      actorId: args.actorId,
      reason: args.reason,
      now,
    });

    // Tombstone the old assertion.
    await ctx.db.patch("facts", old._id, {
      tombstonedAt: now,
      tombstoneTxId: txId,
      tombstoneReason: args.reason,
      lastTxId: txId,
    });
    await ctx.db.insert("factEvents", {
      txId,
      txTime: now,
      kind: "correction",
      factId: old._id,
      e: old.e,
      a: old.a,
      v: old.v,
      reason: args.reason,
    });
    await removeCurrentFact(ctx, old._id, old.e, old.a);

    // Assert the corrected fact, linked to the old one.
    const value = args.newValue ?? old.v;
    const validFrom = args.newValidFrom ?? old.validFrom;
    const newFactId = await ctx.db.insert("facts", {
      e: old.e,
      a: old.a,
      v: value,
      firstTxId: txId,
      assertedAt: now,
      validFrom,
      validTo: args.newValidTo ?? old.validTo,
      supersedes: old._id,
      source: old.source,
    });
    await ctx.db.patch("facts", old._id, { supersededBy: newFactId });

    await ctx.db.insert("factEvents", {
      txId,
      txTime: now,
      kind: "assert",
      factId: newFactId,
      e: old.e,
      a: old.a,
      v: value,
      validFrom,
      validTo: args.newValidTo ?? old.validTo,
      reason: args.reason,
    });

    const newFact = (await ctx.db.get("facts", newFactId))!;
    const cardinality = await cardinalityOf(ctx, old.a);
    await upsertCurrentFact(ctx, newFact, cardinality, now);

    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: old.e,
      a: old.a,
      factId: newFactId,
      txTime: now,
    });

    return { txId, oldFactId: old._id, newFactId };
  },
});

// --- queries ----------------------------------------------------------------

export const getEntity = query({
  args: { e: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("currentFacts")
      .withIndex("by_e", (q) => q.eq("e", args.e))
      .collect();

    const attributes: Record<string, unknown[]> = {};
    for (const row of rows) {
      (attributes[row.a] ??= []).push(row.v);
    }
    return { id: args.e, attributes };
  },
});

/**
 * Bitemporal point query. Picks the most selective available index from the
 * bound terms, then filters candidates through the visibility predicate.
 */
export const queryFacts = query({
  args: {
    e: v.optional(v.string()),
    a: v.optional(v.string()),
    value: v.optional(v.any()),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    includeTombstoned: v.optional(v.boolean()),
    includeRetracted: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const opts = {
      includeTombstoned: args.includeTombstoned,
      includeRetracted: args.includeRetracted,
    };
    const scanLimit = Math.min(args.limit ?? 1000, 2000);

    const candidates = await fetchCandidateFacts(ctx, args, scanLimit);
    return candidates.filter((f) => isVisible(f, coord, opts));
  },
});

async function fetchCandidateFacts(
  ctx: QueryCtx,
  args: { e?: string; a?: string; value?: unknown },
  scanLimit: number,
): Promise<Doc<"facts">[]> {
  const { e, a, value } = args;
  const hasV = value !== undefined;

  if (e !== undefined && a !== undefined) {
    const rows = await ctx.db
      .query("facts")
      .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", a))
      .take(scanLimit);
    return hasV ? rows.filter((r) => valueKey(r.v) === valueKey(value)) : rows;
  }
  if (a !== undefined && hasV) {
    return await ctx.db
      .query("facts")
      .withIndex("by_a_v", (q) => q.eq("a", a).eq("v", value))
      .take(scanLimit);
  }
  if (a !== undefined) {
    return await ctx.db
      .query("facts")
      .withIndex("by_a", (q) => q.eq("a", a))
      .take(scanLimit);
  }
  if (e !== undefined) {
    return await ctx.db
      .query("facts")
      .withIndex("by_e", (q) => q.eq("e", e))
      .take(scanLimit);
  }
  throw new Error("queryFacts requires at least one of `e` or `a`");
}

/** Full transaction-time history for an entity (optionally one attribute). */
export const history = query({
  args: {
    e: v.string(),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 200, 1000);
    if (args.a !== undefined) {
      return await ctx.db
        .query("factEvents")
        .withIndex("by_e_a_tx", (q) => q.eq("e", args.e).eq("a", args.a!))
        .order("desc")
        .take(limit);
    }
    // Without an attribute, scan by entity across attributes is not indexed;
    // fall back to the canonical interval records ordered by assertion time.
    return await ctx.db
      .query("facts")
      .withIndex("by_e", (q) => q.eq("e", args.e))
      .order("desc")
      .take(limit);
  },
});
