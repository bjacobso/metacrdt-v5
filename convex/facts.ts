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
import { requireWritePrincipal } from "./lib/writeAuth";
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
    .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", a))
    .collect();
  for (const row of existing) await ctx.db.delete("currentFacts", row._id);

  await ctx.db.insert("currentFacts", {
    e: winner.item.e,
    a: winner.item.a,
    v: winner.item.v,
    factId: winner.item._id,
    validFrom: winner.item.validFrom,
    txTime: now,
    updatedAt: now,
  });

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
    const actorId = await requireWritePrincipal(ctx);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      actorId,
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
    const actorId = await requireWritePrincipal(ctx);
    const now = Date.now();
    const fact = await ctx.db.get("facts", args.factId);
    if (!fact) throw new Error(`fact ${args.factId} not found`);
    if (fact.retractedAt !== undefined) {
      return { txId: null, factId: args.factId, alreadyRetracted: true };
    }

    const txId = await createTransaction(ctx, {
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
    const actorId = await requireWritePrincipal(ctx);
    const now = Date.now();
    const fact = await ctx.db.get("facts", args.factId);
    if (!fact) throw new Error(`fact ${args.factId} not found`);

    const txId = await createTransaction(ctx, {
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
    const actorId = await requireWritePrincipal(ctx);
    const now = Date.now();
    const old = await ctx.db.get("facts", args.factId);
    if (!old) throw new Error(`fact ${args.factId} not found`);

    const txId = await createTransaction(ctx, {
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
    return { id: args.e, ...(await redactAttributeMap(ctx, args.e, attributes)) };
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
): Promise<Doc<"factEvents">[]> {
  return await ctx.db
    .query("factEvents")
    .withIndex("by_e", (q) => q.eq("e", e))
    .take(limit);
}

async function fetchCandidateFactEvents(
  ctx: QueryCtx,
  args: { e?: string; a?: string },
  scanLimit: number,
): Promise<Doc<"factEvents">[]> {
  const { e, a } = args;
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

async function cardinalityEventsForAttributes(
  ctx: QueryCtx,
  attrs: Iterable<string>,
  perAttributeLimit: number,
): Promise<Doc<"factEvents">[]> {
  const out: Doc<"factEvents">[] = [];
  for (const a of attrs) {
    const rows = await ctx.db
      .query("factEvents")
      .withIndex("by_e_a_tx", (q) =>
        q.eq("e", attrId(a)).eq("a", "cardinality"),
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
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const limit = Math.min(args.limit ?? 2000, 5000);
    const entityRows = await eventsForEntity(ctx, args.e, limit);
    const entityProtocol = await protocolEventsForRows(ctx, entityRows);
    const attrs = new Set<string>();
    for (const ev of entityProtocol.events) {
      if (ev.kind === "assert" && ev.a !== undefined) attrs.add(ev.a);
    }
    const schemaRows = await cardinalityEventsForAttributes(ctx, attrs, 100);
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
      id: args.e,
      coord,
      skippedLegacyEvents: entityProtocol.skipped + schemaProtocol.skipped,
      ...(await redactAttributeMap(ctx, args.e, attributes)),
    };
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

    const principal = await readPrincipal(ctx);
    const candidates = await fetchCandidateFacts(ctx, args, scanLimit);
    const out: Doc<"facts">[] = [];
    for (const f of candidates) {
      if (!isVisible(f, coord, opts)) continue;
      if (!(await canReadAttribute(ctx, principal, f.e, f.a))) continue;
      out.push(f);
    }
    return out;
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
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const scanLimit = Math.min(args.limit ?? 1000, 2000);
    const eventRows = await fetchCandidateFactEvents(ctx, args, scanLimit);
    const protocol = await protocolEventsForRows(ctx, eventRows);
    const log = fromEvents(protocol.events);
    const principal = await readPrincipal(ctx);
    const out: Array<{
      eventId: string;
      e: string;
      a: string;
      v: unknown;
      assertedAt: number;
      validFrom: number;
      validTo?: number;
      actor: string;
      actorType: string;
      reason?: string;
    }> = [];
    const keys =
      args.e !== undefined && args.a !== undefined
        ? [[args.e, args.a] as const]
        : [...new Set(protocol.events.flatMap((ev) =>
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
        if (!(await canReadAttribute(ctx, principal, ev.e!, ev.a!))) continue;
        out.push({
          eventId: ev.id,
          e: ev.e!,
          a: ev.a!,
          v: ev.v,
          assertedAt: ev.hlc.pt,
          validFrom: ev.validFrom!,
          ...(ev.validTo === undefined || ev.validTo === null
            ? {}
            : { validTo: ev.validTo }),
          actor: ev.actor,
          actorType: ev.actorType,
          ...(ev.reason === undefined ? {} : { reason: ev.reason }),
        });
      }
    }
    out.sort((x, y) => x.e.localeCompare(y.e) || x.a.localeCompare(y.a));
    return {
      coord,
      skippedLegacyEvents: protocol.skipped,
      facts: out,
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
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 200, 1000);
    const principal = await readPrincipal(ctx);
    if (args.a !== undefined) {
      if (!(await canReadAttribute(ctx, principal, args.e, args.a))) return [];
      return await ctx.db
        .query("factEvents")
        .withIndex("by_e_a_tx", (q) => q.eq("e", args.e).eq("a", args.a!))
        .order("desc")
        .take(limit);
    }
    // Without an attribute, scan by entity across attributes is not indexed;
    // fall back to the canonical interval records ordered by assertion time.
    const rows = await ctx.db
      .query("facts")
      .withIndex("by_e", (q) => q.eq("e", args.e))
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
    return {
      id: args.e,
      coord,
      ...(await redactAttributeMap(ctx, args.e, attributes)),
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
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("facts")
      .withIndex("by_e_a", (q) => q.eq("e", args.e).eq("a", args.a))
      .take(2000);

    const principal = await readPrincipal(ctx);
    const readable = await canReadAttribute(ctx, principal, args.e, args.a);
    const opts = { includeTombstoned: args.includeTombstoned };
    const visibleValues = (coord: { txTime: number; validTime: number }) =>
      rows
        .filter((f) => readable && isVisible(f, coord, opts))
        .map((f) => f.v)
        .sort((x, y) => valueKey(x).localeCompare(valueKey(y)));

    const before = visibleValues(args.before);
    const after = visibleValues(args.after);
    const changed =
      JSON.stringify(before.map(valueKey)) !==
      JSON.stringify(after.map(valueKey));

    return {
      e: args.e,
      a: args.a,
      before,
      after,
      changed,
      denied: readable ? null : { a: args.a, reason: "pii" as const },
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
    const principal = await readPrincipal(ctx);
    const out = [];
    const deniedByAttr = new Map<string, { a: string; reason: "pii" }>();
    for (const f of rows) {
      if (!isVisible(f, coord, opts)) continue;
      if (!(await canReadAttribute(ctx, principal, f.e, f.a))) {
        deniedByAttr.set(f.a, { a: f.a, reason: "pii" });
        continue;
      }
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
    return { id: args.e, coord, facts: out, denied: [...deniedByAttr.values()] };
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
