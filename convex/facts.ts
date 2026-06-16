import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isVisible, valueKey } from "./lib/visibility";
import { attrId, BUILTIN_CARDINALITY } from "./lib/meta";
import {
  canReadAttribute,
  readPrincipal,
  redactAttributeMap,
} from "./lib/readAuth";
import {
  TENANT_ACCESS_DENIED,
  requireLegacyGlobalRead,
  requireTenant,
  type TenantContext,
} from "./lib/tenantAuth";
import {
  assertEvent,
  CARDINALITY_ONE_SUPERSESSION_REASON,
  eventPatch,
  reconcileCardinalityOneCandidates,
  retractEvent,
  tombstoneEvent,
  type ProtocolEventPatch,
} from "./lib/coreEvent";
import {
  entity as coreEntity,
  fromEvents,
  valueOf as coreValueOf,
  visibleAsserts,
  type Event,
  type Log,
  type Value,
} from "@metacrdt/core";
import {
  protocolEventFromRows,
  type ConvexTransactionRow,
  type ProtocolFactEventRow,
} from "@metacrdt/convex";

// --- internal helpers (exported for the schema-as-facts module) -------------

function tenantIdForWrite(tenantId: Id<"tenants"> | undefined): Id<"tenants"> {
  if (tenantId === undefined) throw new Error("Tenant context required");
  return tenantId;
}

export async function createTransaction(
  ctx: MutationCtx,
  args: {
    actorId?: string;
    actorType?: "user" | "system" | "agent" | "migration";
    tenantId?: Id<"tenants">;
    reason?: string;
    source?: string;
    now: number;
  },
): Promise<Id<"transactions">> {
  return await ctx.db.insert("transactions", {
    tenantId: tenantIdForWrite(args.tenantId),
    actorId: args.actorId ?? "system",
    actorType: args.actorType ?? "system",
    reason: args.reason,
    source: args.source,
    txTime: args.now,
  });
}

async function readTenantOrLegacy(ctx: QueryCtx, tenantSlug?: string) {
  if (tenantSlug === undefined) {
    await requireLegacyGlobalRead(ctx);
    return null;
  }
  return await requireTenant(ctx, tenantSlug);
}

async function requireTenantFactWrite(
  ctx: MutationCtx,
  tenantSlug: string,
  fact: Doc<"facts">,
): Promise<TenantContext> {
  const tenant = await requireTenant(ctx, tenantSlug, "editor");
  if (fact.tenantId !== tenant.tenantId) throw new Error(TENANT_ACCESS_DENIED);
  return tenant;
}

async function getTx(
  ctx: MutationCtx,
  txId: Id<"transactions">,
): Promise<Doc<"transactions">> {
  const tx = await ctx.db.get(txId);
  if (!tx) throw new Error(`transaction ${txId} not found`);
  return tx;
}

function txForCore(tx: Doc<"transactions">): ConvexTransactionRow {
  return {
    _creationTime: tx._creationTime,
    actorId: tx.actorId,
    actorType: tx.actorType,
    txTime: tx.txTime,
    reason: tx.reason,
  };
}

function rowForCore(row: Doc<"factEvents">): ProtocolFactEventRow {
  return {
    txTime: row.txTime,
    eventId: row.eventId,
    hlc: row.hlc,
    replicaId: row.replicaId,
    seq: row.seq,
    targetEventId: row.targetEventId,
    causalRefs: row.causalRefs,
    kind: row.kind,
    e: row.e,
    a: row.a,
    v: row.v,
    validFrom: row.validFrom,
    validTo: row.validTo,
    reason: row.reason,
  };
}

function targetEventId(fact: Doc<"facts">): string {
  // Legacy facts created before protocol metadata do not have assertEventId.
  // Keep them readable/actionable with a deterministic compatibility target.
  return fact.assertEventId ?? `legacy:${fact._id}`;
}

async function insertFactEvent(
  ctx: MutationCtx,
  row: {
    tenantId?: Id<"tenants">;
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
    tenantId: tenantIdForWrite(row.tenantId),
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
      .map(async (fact) => ({
        item: fact,
        event: await assertEventForFact(ctx, fact),
      })),
  );
  const { winner, losers } = reconcileCardinalityOneCandidates(pairs, `${e}/${a}`);

  for (const { item: fact, event } of losers) {
    await ctx.db.patch("facts", fact._id, {
      retractedAt: now,
      lastTxId: tx._id,
    });
    const ev = retractEvent(tx, event.id, CARDINALITY_ONE_SUPERSESSION_REASON);
    await insertFactEvent(
      ctx,
      {
        tenantId: tx.tenantId,
        txId: tx._id,
        txTime: now,
        kind: "retract",
        factId: fact._id,
        e: fact.e,
        a: fact.a,
        v: fact.v,
        reason: CARDINALITY_ONE_SUPERSESSION_REASON,
      },
      eventPatch(ev),
    );
  }

  const existing = await ctx.db
    .query("currentFacts")
    .withIndex(
      tx.tenantId === undefined ? "by_e_a" : "by_tenant_and_e_a",
      (q) =>
        tx.tenantId === undefined
          ? q.eq("e", e).eq("a", a)
          : q.eq("tenantId", tx.tenantId).eq("e", e).eq("a", a),
    )
    .collect();
  for (const row of existing) await ctx.db.delete("currentFacts", row._id);

  // Same now-visibility guard as upsertCurrentFact: a ≺-winning assert whose
  // valid interval has already lapsed is not current.
  if (isVisible(winner.item, { txTime: now, validTime: now })) {
    await ctx.db.insert("currentFacts", {
      tenantId: winner.item.tenantId,
      e: winner.item.e,
      a: winner.item.a,
      v: winner.item.v,
      factId: winner.item._id,
      validFrom: winner.item.validFrom,
      txTime: now,
      updatedAt: now,
    });
  }

  return winner.item;
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
  tenantId?: Id<"tenants">,
): Promise<"one" | "many"> {
  const row =
    tenantId === undefined
      ? await ctx.db
          .query("currentFacts")
          .withIndex("by_e_a", (q) => q.eq("e", attrId(a)).eq("a", "cardinality"))
          .first()
      : await ctx.db
          .query("currentFacts")
          .withIndex("by_tenant_and_e_a", (q) =>
            q.eq("tenantId", tenantId).eq("e", attrId(a)).eq("a", "cardinality"),
          )
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
      .withIndex(
        fact.tenantId === undefined ? "by_e_a" : "by_tenant_and_e_a",
        (q) =>
          fact.tenantId === undefined
            ? q.eq("e", fact.e).eq("a", fact.a)
            : q.eq("tenantId", fact.tenantId).eq("e", fact.e).eq("a", fact.a),
      )
      .collect();
    for (const row of existing) {
      await ctx.db.delete("currentFacts", row._id);
    }
  } else {
    // For cardinality-many, dedupe on the exact value.
    const existing = await ctx.db
      .query("currentFacts")
      .withIndex(
        fact.tenantId === undefined ? "by_e_a_v" : "by_tenant_and_e_a_v",
        (q) =>
          fact.tenantId === undefined
            ? q.eq("e", fact.e).eq("a", fact.a).eq("v", fact.v)
            : q
                .eq("tenantId", fact.tenantId)
                .eq("e", fact.e)
                .eq("a", fact.a)
                .eq("v", fact.v),
      )
      .collect();
    for (const row of existing) {
      await ctx.db.delete("currentFacts", row._id);
    }
  }

  // currentFacts is the now-projection: only facts the core fold deems visible
  // at (now, now) belong in it. Same predicate as rebuildProjections, so the
  // write path and a rebuild agree (e.g. an assert whose validTo has already
  // lapsed never surfaces as current).
  if (!isVisible(fact, { txTime: now, validTime: now })) return;

  await ctx.db.insert("currentFacts", {
    tenantId: fact.tenantId,
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
  tenantId?: Id<"tenants">,
): Promise<void> {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex(
      tenantId === undefined ? "by_e_a" : "by_tenant_and_e_a",
      (q) =>
        tenantId === undefined
          ? q.eq("e", e).eq("a", a)
          : q.eq("tenantId", tenantId).eq("e", e).eq("a", a),
    )
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
  const tx = await getTx(ctx, txId);
  const validFrom = args.validFrom ?? now;
  const cardinality = await cardinalityOf(ctx, args.a, tx.tenantId);
  const priorCurrent =
    cardinality === "one"
      ? await ctx.db
          .query("currentFacts")
          .withIndex(
            tx.tenantId === undefined ? "by_e_a" : "by_tenant_and_e_a",
            (q) =>
              tx.tenantId === undefined
                ? q.eq("e", args.e).eq("a", args.a)
                : q
                    .eq("tenantId", tx.tenantId)
                    .eq("e", args.e)
                    .eq("a", args.a),
          )
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
    tenantId: tx.tenantId,
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
      tenantId: tx.tenantId,
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
      tenantId: tx.tenantId,
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
  await removeCurrentFact(ctx, fact._id, fact.e, fact.a, fact.tenantId);
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
    tenantSlug: v.string(),
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    actorId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    const actorId = tenant.principal;
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      actorId,
      tenantId: tenant.tenantId,
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
    tenantSlug: v.string(),
    factId: v.id("facts"),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fact = await ctx.db.get("facts", args.factId);
    if (!fact) throw new Error(`fact ${args.factId} not found`);
    const tenant = await requireTenantFactWrite(ctx, args.tenantSlug, fact);
    const actorId = tenant.principal;
    if (fact.retractedAt !== undefined) {
      return { txId: null, factId: args.factId, alreadyRetracted: true };
    }

    const txId = await createTransaction(ctx, {
      tenantId: tenant.tenantId,
      actorId,
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
        tenantId: tx.tenantId,
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

    await removeCurrentFact(ctx, fact._id, fact.e, fact.a, fact.tenantId);

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
    tenantSlug: v.string(),
    factId: v.id("facts"),
    reason: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fact = await ctx.db.get("facts", args.factId);
    if (!fact) throw new Error(`fact ${args.factId} not found`);
    const tenant = await requireTenantFactWrite(ctx, args.tenantSlug, fact);
    const actorId = tenant.principal;

    const txId = await createTransaction(ctx, {
      tenantId: tenant.tenantId,
      actorId,
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
        tenantId: tx.tenantId,
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

    await removeCurrentFact(ctx, fact._id, fact.e, fact.a, fact.tenantId);

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
    tenantSlug: v.string(),
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
    const tenant = await requireTenantFactWrite(ctx, args.tenantSlug, old);
    const actorId = tenant.principal;

    const txId = await createTransaction(ctx, {
      tenantId: tenant.tenantId,
      actorId,
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
        tenantId: tx.tenantId,
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
    await removeCurrentFact(ctx, old._id, old.e, old.a, old.tenantId);

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
      tenantId: tx.tenantId,
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
        tenantId: tx.tenantId,
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
    const cardinality = await cardinalityOf(ctx, old.a, tx.tenantId);
    await upsertCurrentFact(ctx, newFact, cardinality, now);

    // A correction is protocol-level tombstone-old + assert-new. Notify the
    // materializer about both sides so incremental rule paths can discover stale
    // outputs justified by the old fact and new outputs justified by the
    // replacement.
    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: old.e,
      a: old.a,
      factId: old._id,
      txTime: now,
      changeKind: "tombstone",
    });
    await ctx.scheduler.runAfter(0, internal.materialize.processFactChange, {
      e: old.e,
      a: old.a,
      factId: newFactId,
      txTime: now,
      changeKind: "assert",
    });

    return { txId, oldFactId: old._id, newFactId };
  },
});

// --- queries ----------------------------------------------------------------

export const getEntity = query({
  args: { e: v.string(), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const result = await entityAttributesFromEventLog(ctx, {
      e: args.e,
      tenantId: tenant?.tenantId,
    });
    return { id: args.e, attributes: result.attributes, denied: result.denied };
  },
});

async function protocolEventsForRows(
  ctx: QueryCtx,
  rows: Doc<"factEvents">[],
): Promise<{ events: Event[]; skipped: number }> {
  const events: Event[] = [];
  let skipped = 0;
  for (const row of rows) {
    const tx = await ctx.db.get(row.txId);
    if (tx === null) {
      skipped++;
      continue;
    }
    const ev = protocolEventFromRows(rowForCore(row), txForCore(tx));
    if (ev === null) {
      skipped++;
      continue;
    }
    events.push(ev);
  }
  return { events, skipped };
}

async function eventsForEntity(
  ctx: QueryCtx,
  e: string,
  limit: number,
  tenantId?: Id<"tenants">,
): Promise<Doc<"factEvents">[]> {
  if (tenantId !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_tenant_and_e", (q) => q.eq("tenantId", tenantId).eq("e", e))
      .take(limit);
  }
  return await ctx.db.query("factEvents").withIndex("by_e", (q) => q.eq("e", e)).take(limit);
}

async function fetchCandidateFactEvents(
  ctx: QueryCtx,
  args: { e?: string; a?: string; tenantId?: Id<"tenants"> },
  scanLimit: number,
): Promise<Doc<"factEvents">[]> {
  const { e, a, tenantId } = args;
  if (tenantId !== undefined) {
    if (e !== undefined && a !== undefined) {
      return await ctx.db
        .query("factEvents")
        .withIndex("by_tenant_and_e_a_tx", (q) =>
          q.eq("tenantId", tenantId).eq("e", e).eq("a", a),
        )
        .take(scanLimit);
    }
    if (e !== undefined) return await eventsForEntity(ctx, e, scanLimit, tenantId);
    if (a !== undefined) {
      const rows = await ctx.db
        .query("factEvents")
        .withIndex("by_a_tx", (q) => q.eq("a", a))
        .take(scanLimit);
      return rows.filter((row) => row.tenantId === tenantId);
    }
  }
  if (e !== undefined && a !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_e_a_tx", (q) => q.eq("e", e).eq("a", a))
      .take(scanLimit);
  }
  if (e !== undefined) return await eventsForEntity(ctx, e, scanLimit);
  if (a !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_a_tx", (q) => q.eq("a", a))
      .take(scanLimit);
  }
  throw new Error("event-log fact queries require at least one of `e` or `a`");
}

type QueryFactRow = {
  _id?: Id<"facts">;
  _creationTime?: number;
  e: string;
  a: string;
  v: unknown;
  firstTxId?: Id<"transactions">;
  lastTxId?: Id<"transactions">;
  assertedAt: number;
  retractedAt?: number;
  validFrom: number;
  validTo?: number;
  tombstonedAt?: number;
  tombstoneTxId?: Id<"transactions">;
  tombstoneReason?: string;
  assertEventId: string;
  actor: string;
  actorType: string;
  reason?: string;
};

type EventRow = { ev: Event; row: Doc<"factEvents"> };

async function protocolEventRowsForRows(
  ctx: QueryCtx,
  rows: Doc<"factEvents">[],
): Promise<{ eventRows: EventRow[]; skipped: number }> {
  const eventRows: EventRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const tx = await ctx.db.get(row.txId);
    if (tx === null) {
      skipped++;
      continue;
    }
    const ev = protocolEventFromRows(rowForCore(row), txForCore(tx));
    if (ev === null) {
      skipped++;
      continue;
    }
    eventRows.push({ ev, row });
  }
  return { eventRows, skipped };
}

function lifecycleEvents(
  events: readonly Event[],
  kind: "retract" | "tombstone" | "untombstone",
  target: string,
  txTime: number,
): Event[] {
  return events.filter(
    (ev) => ev.kind === kind && ev.target === target && ev.hlc.pt <= txTime,
  );
}

function firstLifecycleEvent(
  events: readonly Event[],
  kind: "retract",
  target: string,
  txTime: number,
): Event | undefined {
  return lifecycleEvents(events, kind, target, txTime).sort(
    (a, b) => a.hlc.pt - b.hlc.pt,
  )[0];
}

function activeTombstoneEvent(
  events: readonly Event[],
  target: string,
  txTime: number,
): Event | undefined {
  const tombstones = lifecycleEvents(events, "tombstone", target, txTime).sort(
    (a, b) => b.hlc.pt - a.hlc.pt,
  );
  const latestTombstone = tombstones[0];
  if (latestTombstone === undefined) return undefined;
  const laterUntombstone = lifecycleEvents(events, "untombstone", target, txTime).some(
    (ev) => ev.hlc.pt > latestTombstone.hlc.pt,
  );
  return laterUntombstone ? undefined : latestTombstone;
}

async function queryFactRowsFromEventLog(
  ctx: QueryCtx,
  args: {
    e?: string;
    a?: string;
    value?: unknown;
    txTime?: number;
    validTime?: number;
    includeTombstoned?: boolean;
    includeRetracted?: boolean;
    limit?: number;
    tenantId?: Id<"tenants">;
  },
): Promise<{
  coord: { txTime: number; validTime: number };
  skipped: number;
  rows: QueryFactRow[];
  denied: Array<{ a: string; reason: "pii" }>;
}> {
  const coord = {
    txTime: args.txTime ?? Date.now(),
    validTime: args.validTime ?? Date.now(),
  };
  const scanLimit = Math.min(args.limit ?? 1000, 2000);
  const rawRows = await fetchCandidateFactEvents(ctx, args, scanLimit);
  const protocol = await protocolEventRowsForRows(ctx, rawRows);
  const events = protocol.eventRows.map(({ ev }) => ev);
  const log = fromEvents(events);
  const rowByEventId = new Map(
    protocol.eventRows.map(({ ev, row }) => [ev.id, row] as const),
  );
  const principal = await readPrincipal(ctx);
  const out: QueryFactRow[] = [];
  const deniedByAttr = new Map<string, { a: string; reason: "pii" }>();
  const keys =
    args.e !== undefined && args.a !== undefined
      ? [[args.e, args.a] as const]
      : [...new Set(events.flatMap((ev) =>
          ev.kind === "assert" && ev.e !== undefined && ev.a !== undefined
            ? [`${ev.e}\u0000${ev.a}`]
            : [],
        ))].map((k) => k.split("\u0000") as [string, string]);

  for (const [e, a] of keys) {
    const evs = visibleAsserts(e, a, coord, log, {
      includeRetracted: args.includeRetracted,
      includeTombstoned: args.includeTombstoned,
    });
    for (const ev of evs) {
      if (args.value !== undefined && valueKey(ev.v) !== valueKey(args.value)) {
        continue;
      }
      if (!(await canReadAttribute(ctx, principal, ev.e!, ev.a!))) {
        deniedByAttr.set(ev.a!, { a: ev.a!, reason: "pii" });
        continue;
      }

      const row = rowByEventId.get(ev.id);
      const retraction = firstLifecycleEvent(events, "retract", ev.id, coord.txTime);
      const retractionRow =
        retraction === undefined ? undefined : rowByEventId.get(retraction.id);
      const tombstone = activeTombstoneEvent(events, ev.id, coord.txTime);
      const tombstoneRow =
        tombstone === undefined ? undefined : rowByEventId.get(tombstone.id);
      out.push({
        ...(row?.factId === undefined ? {} : { _id: row.factId }),
        ...(row === undefined ? {} : { _creationTime: row._creationTime }),
        e: ev.e!,
        a: ev.a!,
        v: ev.v,
        ...(row === undefined ? {} : { firstTxId: row.txId }),
        ...(retractionRow === undefined ? {} : { lastTxId: retractionRow.txId }),
        assertedAt: ev.hlc.pt,
        ...(retraction === undefined ? {} : { retractedAt: retraction.hlc.pt }),
        validFrom: ev.validFrom!,
        ...(ev.validTo === undefined || ev.validTo === null ? {} : { validTo: ev.validTo }),
        ...(tombstone === undefined ? {} : { tombstonedAt: tombstone.hlc.pt }),
        ...(tombstoneRow === undefined ? {} : { tombstoneTxId: tombstoneRow.txId }),
        ...(tombstone?.reason === undefined ? {} : { tombstoneReason: tombstone.reason }),
        assertEventId: ev.id,
        actor: ev.actor,
        actorType: ev.actorType,
        ...(ev.reason === undefined ? {} : { reason: ev.reason }),
      });
    }
  }
  out.sort((x, y) => x.e.localeCompare(y.e) || x.a.localeCompare(y.a));
  return {
    coord,
    skipped: protocol.skipped,
    rows: out,
    denied: [...deniedByAttr.values()],
  };
}

async function cardinalityEventsForAttributes(
  ctx: QueryCtx,
  attrs: Iterable<string>,
  perAttributeLimit: number,
  tenantId?: Id<"tenants">,
): Promise<Doc<"factEvents">[]> {
  const out: Doc<"factEvents">[] = [];
  for (const a of attrs) {
    const rows =
      tenantId === undefined
        ? await ctx.db
            .query("factEvents")
            .withIndex("by_e_a_tx", (q) =>
              q.eq("e", attrId(a)).eq("a", "cardinality"),
            )
            .take(perAttributeLimit)
        : await ctx.db
            .query("factEvents")
            .withIndex("by_tenant_and_e_a_tx", (q) =>
              q
                .eq("tenantId", tenantId)
                .eq("e", attrId(a))
                .eq("a", "cardinality"),
            )
            .take(perAttributeLimit);
    out.push(...rows);
  }
  return out;
}

function cardinalityFromLog(log: Log, coord: { txTime: number; validTime: number }) {
  return (a: string) => {
    const v = coreValueOf(attrId(a), "cardinality", coord, log, () => "one");
    if (v === "one" || v === "many") return v;
    return BUILTIN_CARDINALITY[a] ?? "many";
  };
}

async function entityAttributesFromEventLog(
  ctx: QueryCtx,
  args: {
    e: string;
    txTime?: number;
    validTime?: number;
    includeTombstoned?: boolean;
    includeRetracted?: boolean;
    limit?: number;
    tenantId?: Id<"tenants">;
  },
): Promise<{
  coord: { txTime: number; validTime: number };
  skippedLegacyEvents: number;
  attributes: Record<string, unknown[]>;
  denied: Array<{ a: string; reason: "pii" }>;
}> {
  const coord = {
    txTime: args.txTime ?? Date.now(),
    validTime: args.validTime ?? Date.now(),
  };
  const limit = Math.min(args.limit ?? 2000, 5000);
  const entityRows = await eventsForEntity(ctx, args.e, limit, args.tenantId);
  const entityProtocol = await protocolEventsForRows(ctx, entityRows);
  const attrs = new Set<string>();
  for (const ev of entityProtocol.events) {
    if (ev.kind === "assert" && ev.a !== undefined) attrs.add(ev.a);
  }
  const schemaRows = await cardinalityEventsForAttributes(
    ctx,
    attrs,
    100,
    args.tenantId,
  );
  const schemaProtocol = await protocolEventsForRows(ctx, schemaRows);
  const log = fromEvents([...entityProtocol.events, ...schemaProtocol.events]);
  const folded = coreEntity(args.e, coord, log, cardinalityFromLog(log, coord), {
    includeRetracted: args.includeRetracted,
    includeTombstoned: args.includeTombstoned,
  });

  const attributes: Record<string, unknown[]> = {};
  for (const [a, evOrEvents] of Object.entries(folded)) {
    const evs = Array.isArray(evOrEvents) ? evOrEvents : [evOrEvents];
    attributes[a] = evs.map((ev) => ev.v);
  }

  return {
    coord,
    skippedLegacyEvents: entityProtocol.skipped + schemaProtocol.skipped,
    ...(await redactAttributeMap(ctx, args.e, attributes)),
  };
}

/**
 * Fold one entity directly from the append-only protocol event log. This is a
 * bounded proof/read-model surface for retiring the hand-maintained
 * `currentFacts` projection: it ignores legacy rows that cannot reconstruct a
 * core event, folds current value(s) with @metacrdt/core, and derives declared
 * cardinality from schema-as-facts in the same log.
 */
export const entityFromEventLog = query({
  args: {
    e: v.string(),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    includeTombstoned: v.optional(v.boolean()),
    includeRetracted: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const result = await entityAttributesFromEventLog(ctx, {
      ...args,
      tenantId: tenant?.tenantId,
    });
    return { id: args.e, ...result };
  },
});

/**
 * Bitemporal point query. Production reads fold protocol-shaped `factEvents`
 * directly instead of trusting the disposable `facts` projection.
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
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    return (
      await queryFactRowsFromEventLog(ctx, {
        ...args,
        tenantId: tenant?.tenantId,
      })
    ).rows;
  },
});

/**
 * Bounded bitemporal point query over the append-only protocol event log. This is
 * the event-log counterpart to `queryFacts`: it folds protocol-shaped
 * `factEvents` directly with @metacrdt/core instead of reading the folded
 * `facts` projection. Legacy/non-verifiable rows are skipped and reported.
 */
export const queryFactsFromEventLog = query({
  args: {
    e: v.optional(v.string()),
    a: v.optional(v.string()),
    value: v.optional(v.any()),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    includeTombstoned: v.optional(v.boolean()),
    includeRetracted: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const result = await queryFactRowsFromEventLog(ctx, {
      ...args,
      tenantId: tenant?.tenantId,
    });
    return {
      coord: result.coord,
      skippedLegacyEvents: result.skipped,
      facts: result.rows.map((row) => ({
        eventId: row.assertEventId,
        e: row.e,
        a: row.a,
        v: row.v,
        assertedAt: row.assertedAt,
        validFrom: row.validFrom,
        ...(row.validTo === undefined ? {} : { validTo: row.validTo }),
        actor: row.actor,
        actorType: row.actorType,
        ...(row.reason === undefined ? {} : { reason: row.reason }),
      })),
    };
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
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const limit = Math.min(args.limit ?? 200, 1000);
    const principal = await readPrincipal(ctx);
    if (args.a !== undefined) {
      if (!(await canReadAttribute(ctx, principal, args.e, args.a))) return [];
      return tenant === null
        ? await ctx.db
            .query("factEvents")
            .withIndex("by_e_a_tx", (q) => q.eq("e", args.e).eq("a", args.a!))
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("factEvents")
            .withIndex("by_tenant_and_e_a_tx", (q) =>
              q.eq("tenantId", tenant.tenantId).eq("e", args.e).eq("a", args.a!),
            )
            .order("desc")
            .take(limit);
    }
    // Without an attribute, scan by entity across attributes is not indexed;
    // fall back to the canonical interval records ordered by assertion time.
    const rows =
      tenant === null
        ? await ctx.db
            .query("facts")
            .withIndex("by_e", (q) => q.eq("e", args.e))
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("facts")
            .withIndex("by_tenant_and_e", (q) =>
              q.eq("tenantId", tenant.tenantId).eq("e", args.e),
            )
            .order("desc")
            .take(limit);
    const out: Doc<"facts">[] = [];
    for (const row of rows) {
      if (await canReadAttribute(ctx, principal, row.e, row.a)) out.push(row);
    }
    return out;
  },
});

// --- M6: bitemporal reconstruction & comparison -----------------------------

const coordValidator = v.object({
  txTime: v.number(),
  validTime: v.number(),
});

/**
 * Reconstruct an entity's attribute map at an arbitrary bitemporal coordinate
 * directly from protocol-shaped `factEvents`, so it works for any past txTime /
 * validTime without trusting the disposable `facts` / `currentFacts`
 * projections. This is the general form of the asOf* helpers: pass now/now to
 * reproduce getEntity.
 */
export const entityAsOf = query({
  args: {
    e: v.string(),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    includeTombstoned: v.optional(v.boolean()),
    includeRetracted: v.optional(v.boolean()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const result = await queryFactRowsFromEventLog(ctx, {
      ...args,
      tenantId: tenant?.tenantId,
    });
    const attributes: Record<string, unknown[]> = {};
    for (const row of result.rows) {
      (attributes[row.a] ??= []).push(row.v);
    }
    return {
      id: args.e,
      coord: result.coord,
      attributes,
      denied: result.denied,
    };
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
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const queryArgs = {
      e: args.e,
      a: args.a,
      includeTombstoned: args.includeTombstoned,
      tenantId: tenant?.tenantId,
    };
    const [beforeResult, afterResult] = await Promise.all([
      queryFactRowsFromEventLog(ctx, {
        ...queryArgs,
        txTime: args.before.txTime,
        validTime: args.before.validTime,
      }),
      queryFactRowsFromEventLog(ctx, {
        ...queryArgs,
        txTime: args.after.txTime,
        validTime: args.after.validTime,
      }),
    ]);
    const visibleValues = (rows: QueryFactRow[]) =>
      rows.map((f) => f.v).sort((x, y) => valueKey(x).localeCompare(valueKey(y)));

    const before = visibleValues(beforeResult.rows);
    const after = visibleValues(afterResult.rows);
    const changed =
      JSON.stringify(before.map(valueKey)) !==
      JSON.stringify(after.map(valueKey));
    const denied = beforeResult.denied[0] ?? afterResult.denied[0] ?? null;

    return {
      e: args.e,
      a: args.a,
      before,
      after,
      changed,
      denied,
    };
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
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const result = await queryFactRowsFromEventLog(ctx, {
      ...args,
      tenantId: tenant?.tenantId,
    });
    const out = result.rows.map((f) => ({
      a: f.a,
      v: f.v,
      assertedAt: f.assertedAt,
      retractedAt: f.retractedAt,
      validFrom: f.validFrom,
      validTo: f.validTo,
      tombstonedAt: f.tombstonedAt,
      actor: f.actor,
      reason: f.reason,
      txTime: f.assertedAt,
    }));
    out.sort((x, y) => x.a.localeCompare(y.a));
    return { id: args.e, coord: result.coord, facts: out, denied: result.denied };
  },
});

/**
 * Full transaction-time event timeline for an entity (assert/retract/tombstone/
 * correction across all its attributes), newest first, annotated with actor.
 */
export const entityTimeline = query({
  args: {
    e: v.string(),
    limit: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const events =
      tenant === null
        ? await ctx.db
            .query("factEvents")
            .withIndex("by_e", (q) => q.eq("e", args.e))
            .order("desc")
            .take(Math.min(args.limit ?? 200, 1000))
        : await ctx.db
            .query("factEvents")
            .withIndex("by_tenant_and_e", (q) =>
              q.eq("tenantId", tenant.tenantId).eq("e", args.e),
            )
            .order("desc")
            .take(Math.min(args.limit ?? 200, 1000));

    const principal = await readPrincipal(ctx);
    const out = [];
    for (const ev of events) {
      const tx = await ctx.db.get("transactions", ev.txId);
      const readable = await canReadAttribute(ctx, principal, ev.e, ev.a);
      out.push({
        kind: ev.kind,
        a: ev.a,
        v: readable ? ev.v : "[denied]",
        denied: !readable,
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
