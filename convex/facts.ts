import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isVisible, valueKey } from "./lib/visibility";
import { attrId, BUILTIN_CARDINALITY } from "./lib/meta";
import {
  assertEvent,
  eventPatch,
  retractEvent,
  tombstoneEvent,
  type ProtocolEventPatch,
} from "./lib/coreEvent";
import { maxByOrder, type Event, type Value } from "@metacrdt/core";

// --- internal helpers (exported for the schema-as-facts module) -------------

export async function createTransaction(
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

async function getTx(
  ctx: MutationCtx,
  txId: Id<"transactions">,
): Promise<Doc<"transactions">> {
  const tx = await ctx.db.get(txId);
  if (!tx) throw new Error(`transaction ${txId} not found`);
  return tx;
}

function targetEventId(fact: Doc<"facts">): string {
  // Legacy facts created before protocol metadata do not have assertEventId.
  // Keep them readable/actionable with a deterministic compatibility target.
  return fact.assertEventId ?? `legacy:${fact._id}`;
}

async function insertFactEvent(
  ctx: MutationCtx,
  row: {
    txId: Id<"transactions">;
    txTime: number;
    kind: "assert" | "retract" | "tombstone" | "untombstone" | "correction";
    factId?: Id<"facts">;
    e: string;
    a: string;
    v: unknown;
    validFrom?: number;
    validTo?: number;
    reason?: string;
    metadata?: unknown;
  },
  protocol?: ProtocolEventPatch,
): Promise<Id<"factEvents">> {
  return await ctx.db.insert("factEvents", {
    ...row,
    ...(protocol ?? {}),
  });
}

async function assertEventForFact(
  ctx: MutationCtx,
  fact: Doc<"facts">,
): Promise<Event> {
  if (fact.assertEventId !== undefined) {
    const row = await ctx.db
      .query("factEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", fact.assertEventId))
      .unique();
    if (row) {
      const tx = await getTx(ctx, row.txId);
      return assertEvent(tx, {
        e: row.e,
        a: row.a,
        v: row.v,
        validFrom: row.validFrom ?? row.txTime,
        validTo: row.validTo,
        reason: row.reason,
        causalRefs: row.causalRefs,
      });
    }
  }
  // Legacy fallback for facts created before protocol metadata. This preserves a
  // deterministic order without rewriting historical event rows.
  return {
    id: targetEventId(fact),
    kind: "assert",
    actor: "system",
    actorType: "system",
    hlc: { pt: fact.assertedAt, l: 0, r: "convex:legacy" },
    e: fact.e,
    a: fact.a,
    v: fact.v as Value,
    validFrom: fact.validFrom,
    validTo: fact.validTo ?? null,
    causalRefs: [],
  };
}

async function reconcileCardinalityOneCurrent(
  ctx: MutationCtx,
  tx: Doc<"transactions">,
  now: number,
  e: string,
  a: string,
  candidates: Doc<"facts">[],
): Promise<Doc<"facts">> {
  const pairs = await Promise.all(
    candidates
      .filter((f) => f.retractedAt === undefined && f.tombstonedAt === undefined)
      .map(async (fact) => ({ fact, event: await assertEventForFact(ctx, fact) })),
  );
  if (pairs.length === 0) throw new Error(`no candidates for ${e}/${a}`);
  const winnerEvent = maxByOrder(pairs.map((p) => p.event));
  const winner = pairs.find((p) => p.event.id === winnerEvent?.id)?.fact;
  if (!winner) throw new Error(`no ≺ winner for ${e}/${a}`);

  for (const { fact, event } of pairs) {
    if (fact._id === winner._id) continue;
    await ctx.db.patch("facts", fact._id, {
      retractedAt: now,
      lastTxId: tx._id,
    });
    const ev = retractEvent(
      tx,
      event.id,
      "superseded by ≺-max cardinality-one assertion",
    );
    await insertFactEvent(
      ctx,
      {
        txId: tx._id,
        txTime: now,
        kind: "retract",
        factId: fact._id,
        e: fact.e,
        a: fact.a,
        v: fact.v,
        reason: "superseded by ≺-max cardinality-one assertion",
      },
      eventPatch(ev),
    );
  }

  const existing = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", a))
    .collect();
  for (const row of existing) await ctx.db.delete("currentFacts", row._id);

  await ctx.db.insert("currentFacts", {
    e: winner.e,
    a: winner.a,
    v: winner.v,
    factId: winner._id,
    validFrom: winner.validFrom,
    txTime: now,
    updatedAt: now,
  });

  return winner;
}

/**
 * Cardinality is itself schema-as-facts: read the current value of
 * (attr:<a>, "cardinality", ?). Meta-attributes fall back to a hardcoded
 * bootstrap map (so asserting schema facts works before schema exists);
 * anything undeclared defaults to "many".
 */
async function cardinalityOf(
  ctx: MutationCtx,
  a: string,
): Promise<"one" | "many"> {
  const row = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_a", (q) => q.eq("e", attrId(a)).eq("a", "cardinality"))
    .first();
  if (row) return row.v === "one" ? "one" : "many";
  return BUILTIN_CARDINALITY[a] ?? "many";
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

// --- core write helpers (shared with the schema-as-facts module) ------------

/**
 * Assert one fact within an already-open transaction. Handles cardinality-one
 * supersession, the fact interval, the append-only event, the currentFacts
 * projection, and scheduling materialization. Returns the new fact id.
 */
export async function assertInTx(
  ctx: MutationCtx,
  txId: Id<"transactions">,
  now: number,
  args: {
    e: string;
    a: string;
    value: unknown;
    validFrom?: number;
    validTo?: number;
    reason?: string;
    source?: string;
  },
): Promise<Id<"facts">> {
  const validFrom = args.validFrom ?? now;
  const cardinality = await cardinalityOf(ctx, args.a);
  const tx = await getTx(ctx, txId);
  const priorCurrent =
    cardinality === "one"
      ? await ctx.db
          .query("currentFacts")
          .withIndex("by_e_a", (q) => q.eq("e", args.e).eq("a", args.a))
          .collect()
      : [];

  const ev = assertEvent(tx, {
    e: args.e,
    a: args.a,
    v: args.value,
    validFrom,
    validTo: args.validTo,
    reason: args.reason,
  });
  const factId = await ctx.db.insert("facts", {
    e: args.e,
    a: args.a,
    v: args.value,
    firstTxId: txId,
    assertedAt: now,
    validFrom,
    validTo: args.validTo,
    assertEventId: ev.id,
    source: args.source,
  });

  await insertFactEvent(
    ctx,
    {
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
    },
    eventPatch(ev),
  );

  const fact = (await ctx.db.get("facts", factId))!;
  if (cardinality === "one") {
    const candidates: Doc<"facts">[] = [fact];
    for (const row of priorCurrent) {
      const old = await ctx.db.get("facts", row.factId);
      if (old) candidates.push(old);
    }
    await reconcileCardinalityOneCurrent(ctx, tx, now, args.e, args.a, candidates);
  } else {
    await upsertCurrentFact(ctx, fact, cardinality, now);
  }

  await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
    e: args.e,
    a: args.a,
    factId,
    txTime: now,
    changeKind: "assert",
  });

  return factId;
}

/** Retract one fact within an already-open transaction. */
export async function retractInTx(
  ctx: MutationCtx,
  txId: Id<"transactions">,
  now: number,
  factId: Id<"facts">,
  reason?: string,
): Promise<void> {
  const fact = await ctx.db.get("facts", factId);
  if (!fact || fact.retractedAt !== undefined) return;
  const tx = await getTx(ctx, txId);
  await ctx.db.patch("facts", fact._id, { retractedAt: now, lastTxId: txId });
  const ev = retractEvent(tx, targetEventId(fact), reason);
  await insertFactEvent(
    ctx,
    {
      txId,
      txTime: now,
      kind: "retract",
      factId: fact._id,
      e: fact.e,
      a: fact.a,
      v: fact.v,
      reason,
    },
    eventPatch(ev),
  );
  await removeCurrentFact(ctx, fact._id, fact.e, fact.a);
  await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
    e: fact.e,
    a: fact.a,
    factId: fact._id,
    txTime: now,
    changeKind: "retract",
  });
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
    const txId = await createTransaction(ctx, {
      actorId: args.actorId,
      reason: args.reason,
      source: args.source,
      now,
    });
    const factId = await assertInTx(ctx, txId, now, {
      e: args.e,
      a: args.a,
      value: args.value,
      validFrom: args.validFrom,
      validTo: args.validTo,
      reason: args.reason,
      source: args.source,
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
    const tx = await getTx(ctx, txId);

    await ctx.db.patch("facts", fact._id, {
      retractedAt: now,
      validTo: args.validTo ?? fact.validTo,
      lastTxId: txId,
    });

    const ev = retractEvent(tx, targetEventId(fact), args.reason);
    await insertFactEvent(
      ctx,
      {
        txId,
        txTime: now,
        kind: "retract",
        factId: fact._id,
        e: fact.e,
        a: fact.a,
        v: fact.v,
        validTo: args.validTo ?? fact.validTo,
        reason: args.reason,
      },
      eventPatch(ev),
    );

    await removeCurrentFact(ctx, fact._id, fact.e, fact.a);

    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: fact.e,
      a: fact.a,
      factId: fact._id,
      txTime: now,
      changeKind: "retract",
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
    const tx = await getTx(ctx, txId);

    await ctx.db.patch("facts", fact._id, {
      tombstonedAt: now,
      tombstoneTxId: txId,
      tombstoneReason: args.reason,
      lastTxId: txId,
    });

    const ev = tombstoneEvent(tx, targetEventId(fact), args.reason);
    await insertFactEvent(
      ctx,
      {
        txId,
        txTime: now,
        kind: "tombstone",
        factId: fact._id,
        e: fact.e,
        a: fact.a,
        v: fact.v,
        reason: args.reason,
      },
      eventPatch(ev),
    );

    await removeCurrentFact(ctx, fact._id, fact.e, fact.a);

    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: fact.e,
      a: fact.a,
      factId: fact._id,
      txTime: now,
      changeKind: "tombstone",
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
    const tx = await getTx(ctx, txId);
    const oldTarget = targetEventId(old);
    const tombEv = tombstoneEvent(tx, oldTarget, args.reason);

    // Tombstone the old assertion.
    await ctx.db.patch("facts", old._id, {
      tombstonedAt: now,
      tombstoneTxId: txId,
      tombstoneReason: args.reason,
      lastTxId: txId,
    });
    await insertFactEvent(
      ctx,
      {
        txId,
        txTime: now,
        kind: "tombstone",
        factId: old._id,
        e: old.e,
        a: old.a,
        v: old.v,
        reason: args.reason,
      },
      eventPatch(tombEv),
    );
    await removeCurrentFact(ctx, old._id, old.e, old.a);

    // Assert the corrected fact, linked to the old one.
    const value = args.newValue ?? old.v;
    const validFrom = args.newValidFrom ?? old.validFrom;
    const assertEv = assertEvent(tx, {
      e: old.e,
      a: old.a,
      v: value,
      validFrom,
      validTo: args.newValidTo ?? old.validTo,
      reason: args.reason,
      causalRefs: [tombEv.id, oldTarget],
    });
    const newFactId = await ctx.db.insert("facts", {
      e: old.e,
      a: old.a,
      v: value,
      firstTxId: txId,
      assertedAt: now,
      validFrom,
      validTo: args.newValidTo ?? old.validTo,
      assertEventId: assertEv.id,
      supersedes: old._id,
      source: old.source,
    });
    await ctx.db.patch("facts", old._id, { supersededBy: newFactId });

    await insertFactEvent(
      ctx,
      {
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
      },
      eventPatch(assertEv),
    );

    const newFact = (await ctx.db.get("facts", newFactId))!;
    const cardinality = await cardinalityOf(ctx, old.a);
    await upsertCurrentFact(ctx, newFact, cardinality, now);

    // A correction changes an edge (old value removed, new added), so closures
    // must fully recompute — mark it as such.
    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: old.e,
      a: old.a,
      factId: newFactId,
      txTime: now,
      changeKind: "correction",
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

// --- M6: bitemporal reconstruction & comparison -----------------------------

const coordValidator = v.object({
  txTime: v.number(),
  validTime: v.number(),
});

/**
 * Reconstruct an entity's attribute map at an arbitrary bitemporal coordinate
 * directly from the canonical `facts` log (not the currentFacts projection),
 * so it works for any past txTime / validTime. This is the general form of the
 * asOf* helpers: pass now/now to reproduce getEntity.
 */
export const entityAsOf = query({
  args: {
    e: v.string(),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    includeTombstoned: v.optional(v.boolean()),
    includeRetracted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const rows = await ctx.db
      .query("facts")
      .withIndex("by_e", (q) => q.eq("e", args.e))
      .take(2000);

    const attributes: Record<string, unknown[]> = {};
    for (const f of rows) {
      if (
        !isVisible(f, coord, {
          includeTombstoned: args.includeTombstoned,
          includeRetracted: args.includeRetracted,
        })
      ) {
        continue;
      }
      (attributes[f.a] ??= []).push(f.v);
    }
    return { id: args.e, coord, attributes };
  },
});

/**
 * Compare the visible value(s) of an (e, a) at two bitemporal coordinates —
 * e.g. "what did we believe on May 1?" vs "what is now believed to have been
 * true on May 1?". Returns both sides and whether they differ.
 */
export const compareFacts = query({
  args: {
    e: v.string(),
    a: v.string(),
    before: coordValidator,
    after: coordValidator,
    includeTombstoned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("facts")
      .withIndex("by_e_a", (q) => q.eq("e", args.e).eq("a", args.a))
      .take(2000);

    const opts = { includeTombstoned: args.includeTombstoned };
    const visibleValues = (coord: { txTime: number; validTime: number }) =>
      rows
        .filter((f) => isVisible(f, coord, opts))
        .map((f) => f.v)
        .sort((x, y) => valueKey(x).localeCompare(valueKey(y)));

    const before = visibleValues(args.before);
    const after = visibleValues(args.after);
    const changed =
      JSON.stringify(before.map(valueKey)) !==
      JSON.stringify(after.map(valueKey));

    return { e: args.e, a: args.a, before, after, changed };
  },
});

/**
 * Bitemporal time-travel + provenance in one: the facts visible for an entity
 * at a (txTime, validTime) coordinate, each annotated with the transaction that
 * asserted it (actor, reason, time) and its valid interval. Powers the
 * time-travel UI — "what was true as of T, and who/what recorded each fact".
 */
export const entityFactsAsOf = query({
  args: {
    e: v.string(),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    includeTombstoned: v.optional(v.boolean()),
    includeRetracted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const rows = await ctx.db
      .query("facts")
      .withIndex("by_e", (q) => q.eq("e", args.e))
      .take(2000);

    const opts = {
      includeTombstoned: args.includeTombstoned,
      includeRetracted: args.includeRetracted,
    };
    const out = [];
    for (const f of rows) {
      if (!isVisible(f, coord, opts)) continue;
      const tx = await ctx.db.get("transactions", f.firstTxId);
      out.push({
        a: f.a,
        v: f.v,
        assertedAt: f.assertedAt,
        retractedAt: f.retractedAt,
        validFrom: f.validFrom,
        validTo: f.validTo,
        tombstonedAt: f.tombstonedAt,
        actor: tx?.actorId,
        reason: tx?.reason,
        txTime: tx?.txTime,
      });
    }
    out.sort((x, y) => x.a.localeCompare(y.a));
    return { id: args.e, coord, facts: out };
  },
});

/**
 * Full transaction-time event timeline for an entity (assert/retract/tombstone/
 * correction across all its attributes), newest first, annotated with actor.
 */
export const entityTimeline = query({
  args: { e: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("factEvents")
      .withIndex("by_e", (q) => q.eq("e", args.e))
      .order("desc")
      .take(Math.min(args.limit ?? 200, 1000));

    const out = [];
    for (const ev of events) {
      const tx = await ctx.db.get("transactions", ev.txId);
      out.push({
        kind: ev.kind,
        a: ev.a,
        v: ev.v,
        txTime: ev.txTime,
        validFrom: ev.validFrom,
        validTo: ev.validTo,
        actor: tx?.actorId,
        reason: ev.reason ?? tx?.reason,
      });
    }
    return out;
  },
});
