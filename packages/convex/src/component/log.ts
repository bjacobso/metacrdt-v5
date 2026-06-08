import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  buildAssertFactEvent,
  buildLifecycleFactEvent,
  CARDINALITY_ONE_SUPERSESSION_REASON,
  protocolEventFromRows,
  reconcileCardinalityOneCandidates,
  summarizeProtocolEvent,
} from "../index.js";
import type { Event } from "@metacrdt/core";
import type { ConvexTransactionRow, ProtocolFactEventRow } from "../types.js";

const actorType = v.union(
  v.literal("user"),
  v.literal("system"),
  v.literal("agent"),
  v.literal("migration"),
);

const hlcValidator = v.object({
  pt: v.number(),
  l: v.number(),
  r: v.string(),
});

const protocolKind = v.union(
  v.literal("assert"),
  v.literal("retract"),
  v.literal("tombstone"),
  v.literal("untombstone"),
);

const cardinality = v.union(v.literal("many"), v.literal("one"));

const eventSummaryValidator = v.object({
  rowId: v.id("factEvents"),
  txId: v.id("transactions"),
  eventId: v.string(),
  kind: protocolKind,
  e: v.string(),
  a: v.string(),
  v: v.any(),
  txTime: v.number(),
  actor: v.string(),
  actorType: v.union(
    v.literal("human"),
    v.literal("system"),
    v.literal("agent"),
    v.literal("migration"),
  ),
  validFrom: v.optional(v.number()),
  validTo: v.optional(v.number()),
  hlc: hlcValidator,
  targetEventId: v.optional(v.string()),
  causalRefs: v.array(v.string()),
  hasProtocolMetadata: v.boolean(),
  verifiable: v.boolean(),
  validEventId: v.boolean(),
  reason: v.optional(v.string()),
});

const appendResultValidator = v.object({
  txId: v.id("transactions"),
  rowId: v.id("factEvents"),
  eventId: v.string(),
  factId: v.optional(v.id("facts")),
});

const currentFactValidator = v.object({
  factId: v.id("facts"),
  e: v.string(),
  a: v.string(),
  v: v.any(),
  assertedAt: v.number(),
  validFrom: v.number(),
  validTo: v.optional(v.number()),
  txTime: v.number(),
  updatedAt: v.number(),
  assertEventId: v.string(),
});

const currentAttributeValidator = v.object({
  a: v.string(),
  values: v.array(v.any()),
  facts: v.array(currentFactValidator),
});

const currentEntityValidator = v.object({
  e: v.string(),
  facts: v.array(currentFactValidator),
  attributes: v.array(currentAttributeValidator),
});

const currentEntityListItemValidator = v.object({
  e: v.string(),
  type: v.string(),
  name: v.optional(v.any()),
  updatedAt: v.number(),
  typeFact: currentFactValidator,
});

const collectionResultValidator = v.object({
  runId: v.id("flowRuns"),
  token: v.string(),
  collectUrl: v.string(),
  reused: v.boolean(),
});

const collectionPageValidator = v.union(
  v.object({
    found: v.literal(false),
    reason: v.optional(v.string()),
  }),
  v.object({
    found: v.literal(true),
    status: v.string(),
    subject: v.string(),
    form: v.string(),
    scope: v.string(),
    title: v.string(),
    fields: v.array(v.any()),
  }),
);

const collectionSubmitResultValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), reason: v.string() }),
);

const rebuildResultValidator = v.object({
  events: v.number(),
  facts: v.number(),
  currentFacts: v.number(),
});

const txArgs = {
  actorId: v.string(),
  actorType,
  txTime: v.optional(v.number()),
  reason: v.optional(v.string()),
  source: v.optional(v.string()),
  requestId: v.optional(v.string()),
  metadata: v.optional(v.any()),
};

const REBUILD_LIMIT = 5000;
const DEFAULT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function withoutUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val !== undefined) out[k] = val;
  }
  return out as T;
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

function rowForSummary(row: Doc<"factEvents">): ProtocolFactEventRow {
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

function summarizeOwned(row: Doc<"factEvents">, tx: Doc<"transactions">) {
  const summary = summarizeProtocolEvent(rowForSummary(row), txForCore(tx));
  return {
    rowId: row._id,
    txId: row.txId,
    eventId: row.eventId,
    kind: row.kind,
    e: summary.e,
    a: summary.a,
    v: summary.v,
    txTime: summary.txTime,
    actor: summary.actor,
    actorType: summary.actorType,
    hlc: row.hlc,
    causalRefs: summary.causalRefs,
    hasProtocolMetadata: summary.hasProtocolMetadata,
    verifiable: summary.verifiable,
    validEventId: summary.validEventId,
    ...(summary.validFrom === undefined ? {} : { validFrom: summary.validFrom }),
    ...(summary.validTo === undefined ? {} : { validTo: summary.validTo }),
    ...(summary.targetEventId === undefined
      ? {}
      : { targetEventId: summary.targetEventId }),
    ...(summary.reason === undefined ? {} : { reason: summary.reason }),
  };
}

async function deleteCurrentForFact(ctx: MutationCtx, factId: Id<"facts">) {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex("by_factId", (q) => q.eq("factId", factId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

async function insertCurrentIfNowVisible(
  ctx: MutationCtx,
  fact: Doc<"facts">,
  now: number,
) {
  if (fact.retractedAt !== undefined || fact.tombstonedAt !== undefined) return;
  if (fact.validFrom > now) return;
  if (fact.validTo !== undefined && fact.validTo <= now) return;
  await deleteCurrentForFact(ctx, fact._id);
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

async function targetFact(
  ctx: MutationCtx,
  eventId: string,
): Promise<Doc<"facts">> {
  const fact = await ctx.db
    .query("facts")
    .withIndex("by_assertEventId", (q) => q.eq("assertEventId", eventId))
    .unique();
  if (fact === null) throw new Error(`target assert event ${eventId} not found`);
  return fact;
}

async function assertEventForFact(
  ctx: MutationCtx,
  fact: Doc<"facts">,
): Promise<Event> {
  const row = await ctx.db
    .query("factEvents")
    .withIndex("by_eventId", (q) => q.eq("eventId", fact.assertEventId))
    .unique();
  if (row === null) {
    throw new Error(`assert event ${fact.assertEventId} not found`);
  }
  const tx = await ctx.db.get(row.txId);
  if (tx === null) throw new Error(`transaction ${row.txId} not found`);
  const ev = protocolEventFromRows(rowForSummary(row), txForCore(tx));
  if (ev === null || ev.kind !== "assert") {
    throw new Error(`assert event ${fact.assertEventId} is not verifiable`);
  }
  return ev;
}

function isNowVisible(fact: Doc<"facts">, now: number): boolean {
  if (fact.retractedAt !== undefined || fact.tombstonedAt !== undefined) {
    return false;
  }
  if (fact.validFrom > now) return false;
  if (fact.validTo !== undefined && fact.validTo <= now) return false;
  return true;
}

async function visibleCandidateFacts(
  ctx: MutationCtx,
  e: string,
  a: string,
  now: number,
): Promise<Doc<"facts">[]> {
  const facts = await ctx.db
    .query("facts")
    .withIndex("by_e_and_a", (q) => q.eq("e", e).eq("a", a))
    .collect();
  return facts.filter((fact) => isNowVisible(fact, now));
}

async function reconcileCardinalityOneCurrent(
  ctx: MutationCtx,
  tx: Doc<"transactions">,
  e: string,
  a: string,
): Promise<void> {
  const facts = await visibleCandidateFacts(ctx, e, a, tx.txTime);
  if (facts.length <= 1) return;

  const candidates = await Promise.all(
    facts.map(async (fact) => ({
      item: fact,
      event: await assertEventForFact(ctx, fact),
    })),
  );
  const { winner, losers } = reconcileCardinalityOneCandidates(
    candidates,
    `${e}/${a}`,
  );

  for (const { item: fact, event } of losers) {
    const built = buildLifecycleFactEvent<Id<"transactions">, Id<"facts">>({
      tx: txForCore(tx),
      txId: tx._id,
      factId: fact._id,
      kind: "retract",
      targetEventId: event.id,
      e: fact.e,
      a: fact.a,
      v: fact.v,
      reason: CARDINALITY_ONE_SUPERSESSION_REASON,
      causalRefs: [winner.event.id],
    });
    await ctx.db.insert("factEvents", withoutUndefined(built.row));
    await ctx.db.patch(fact._id, {
      retractedAt: tx.txTime,
      lastTxId: tx._id,
    });
    await deleteCurrentForFact(ctx, fact._id);
  }

  const current = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_and_a", (q) => q.eq("e", e).eq("a", a))
    .collect();
  for (const row of current) {
    if (row.factId !== winner.item._id) await ctx.db.delete(row._id);
  }
  await insertCurrentIfNowVisible(ctx, winner.item, tx.txTime);
}

function currentFactSummary(
  row: Doc<"currentFacts">,
  fact: Doc<"facts">,
): typeof currentFactValidator.type {
  return {
    factId: fact._id,
    e: row.e,
    a: row.a,
    v: row.v,
    assertedAt: fact.assertedAt,
    validFrom: row.validFrom,
    txTime: row.txTime,
    updatedAt: row.updatedAt,
    assertEventId: fact.assertEventId,
    ...(fact.validTo === undefined ? {} : { validTo: fact.validTo }),
  };
}

async function summarizeCurrentRows(
  ctx: MutationCtx | QueryCtx,
  rows: Doc<"currentFacts">[],
): Promise<(typeof currentFactValidator.type)[]> {
  const out = [];
  for (const row of rows) {
    const fact = await ctx.db.get(row.factId);
    if (fact !== null) out.push(currentFactSummary(row, fact));
  }
  return out;
}

function groupCurrentEntity(
  e: string,
  facts: (typeof currentFactValidator.type)[],
): typeof currentEntityValidator.type {
  const byAttr = new Map<string, (typeof currentFactValidator.type)[]>();
  for (const fact of facts) {
    const attrFacts = byAttr.get(fact.a) ?? [];
    attrFacts.push(fact);
    byAttr.set(fact.a, attrFacts);
  }
  const attributes = [...byAttr.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([a, attrFacts]) => ({
      a,
      values: attrFacts.map((fact) => fact.v),
      facts: attrFacts,
    }));
  return { e, facts, attributes };
}

function formEntity(form: string): string {
  return `form:${form}`;
}

function tokenInvalidReason(
  run: {
    status: string;
    tokenConsumedAt?: number;
    tokenExpiresAt?: number;
  },
  now: number,
): "used" | "expired" | "not waiting" | null {
  if (run.tokenConsumedAt !== undefined) return "used";
  if (run.tokenExpiresAt !== undefined && run.tokenExpiresAt <= now) return "expired";
  if (run.status !== "waiting") return "not waiting";
  return null;
}

function hasLiveCollectionToken(run: Doc<"flowRuns">, now: number): boolean {
  return tokenInvalidReason(run, now) === null;
}

async function loadFormDef(
  ctx: QueryCtx,
  form: string,
): Promise<{ title: string; fields: unknown[] } | null> {
  const row = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_and_a", (q) =>
      q.eq("e", formEntity(form)).eq("a", "formDef"),
    )
    .first();
  return row ? (row.v as { title: string; fields: unknown[] }) : null;
}

async function createTransaction(
  ctx: MutationCtx,
  args: {
    actorId: string;
    actorType: "user" | "system" | "agent" | "migration";
    txTime?: number;
    reason?: string;
    source?: string;
    requestId?: string;
    metadata?: unknown;
  },
): Promise<Doc<"transactions">> {
  const txId = await ctx.db.insert(
    "transactions",
    withoutUndefined({
      actorId: args.actorId,
      actorType: args.actorType,
      reason: args.reason,
      source: args.source,
      txTime: args.txTime ?? Date.now(),
      requestId: args.requestId,
      metadata: args.metadata,
    }),
  );
  const tx = await ctx.db.get(txId);
  if (tx === null) throw new Error(`inserted transaction ${txId} not found`);
  return tx;
}

async function boundedRows<TableName extends "factEvents" | "facts" | "currentFacts">(
  ctx: MutationCtx,
  tableName: TableName,
) {
  const rows = await ctx.db.query(tableName).take(REBUILD_LIMIT + 1);
  if (rows.length > REBUILD_LIMIT) {
    throw new Error(
      `projection rebuild is limited to ${REBUILD_LIMIT} ${tableName} rows`,
    );
  }
  return rows;
}

async function clearProjectionTables(ctx: MutationCtx) {
  const currentRows = await boundedRows(ctx, "currentFacts");
  const factRows = await boundedRows(ctx, "facts");
  for (const row of currentRows) await ctx.db.delete(row._id);
  for (const row of factRows) await ctx.db.delete(row._id);
}

async function replayAssert(
  ctx: MutationCtx,
  row: Doc<"factEvents">,
  factsByAssertEventId: Map<string, Doc<"facts">>,
) {
  const factId = await ctx.db.insert(
    "facts",
    withoutUndefined({
      e: row.e,
      a: row.a,
      v: row.v,
      firstTxId: row.txId,
      assertedAt: row.txTime,
      validFrom: row.validFrom ?? row.txTime,
      validTo: row.validTo,
      assertEventId: row.eventId,
      metadata: row.metadata,
    }),
  );
  const fact = await ctx.db.get(factId);
  if (fact === null) throw new Error(`inserted fact ${factId} not found`);
  factsByAssertEventId.set(row.eventId, fact);
  await insertCurrentIfNowVisible(ctx, fact, row.txTime);
}

async function replayLifecycle(
  ctx: MutationCtx,
  row: Doc<"factEvents">,
  factsByAssertEventId: Map<string, Doc<"facts">>,
) {
  if (row.targetEventId === undefined) {
    throw new Error(`lifecycle event ${row.eventId} is missing targetEventId`);
  }
  const targetEventId = row.targetEventId;
  const existing =
    factsByAssertEventId.get(targetEventId) ??
    (await ctx.db
      .query("facts")
      .withIndex("by_assertEventId", (q) =>
        q.eq("assertEventId", targetEventId),
      )
      .unique());
  if (existing === null) {
    throw new Error(`target assert event ${targetEventId} not found`);
  }

  if (row.kind === "retract") {
    await ctx.db.patch(existing._id, {
      retractedAt: row.txTime,
      lastTxId: row.txId,
    });
    await deleteCurrentForFact(ctx, existing._id);
  } else if (row.kind === "tombstone") {
    await ctx.db.patch(existing._id, {
      tombstonedAt: row.txTime,
      tombstoneTxId: row.txId,
      tombstoneReason: row.reason,
      lastTxId: row.txId,
    });
    await deleteCurrentForFact(ctx, existing._id);
  } else if (row.kind === "untombstone") {
    await ctx.db.patch(existing._id, {
      tombstonedAt: undefined,
      tombstoneTxId: undefined,
      tombstoneReason: undefined,
      lastTxId: row.txId,
    });
    const patched = await ctx.db.get(existing._id);
    if (patched !== null) {
      factsByAssertEventId.set(targetEventId, patched);
      await insertCurrentIfNowVisible(ctx, patched, row.txTime);
    }
  }
}

async function appendAssertInTx(
  ctx: MutationCtx,
  tx: Doc<"transactions">,
  args: {
    e: string;
    a: string;
    v: unknown;
    validFrom?: number;
    validTo?: number;
    reason?: string;
    eventMetadata?: unknown;
    causalRefs?: string[];
    cardinality?: "many" | "one";
  },
): Promise<typeof appendResultValidator.type> {
  const built = buildAssertFactEvent<Id<"transactions">, Id<"facts">>({
    tx: txForCore(tx),
    txId: tx._id,
    factId: undefined,
    e: args.e,
    a: args.a,
    v: args.v,
    validFrom: args.validFrom ?? tx.txTime,
    validTo: args.validTo,
    reason: args.reason,
    metadata: args.eventMetadata,
    causalRefs: args.causalRefs,
  });
  const factId = await ctx.db.insert(
    "facts",
    withoutUndefined({
      e: args.e,
      a: args.a,
      v: args.v,
      firstTxId: tx._id,
      assertedAt: tx.txTime,
      validFrom: args.validFrom ?? tx.txTime,
      validTo: args.validTo,
      assertEventId: built.event.id,
      metadata: args.eventMetadata,
    }),
  );
  const rowId = await ctx.db.insert(
    "factEvents",
    withoutUndefined({ ...built.row, factId }),
  );
  const fact = await ctx.db.get(factId);
  if (fact === null) throw new Error(`inserted fact ${factId} not found`);
  await insertCurrentIfNowVisible(ctx, fact, tx.txTime);
  if (args.cardinality === "one") {
    await reconcileCardinalityOneCurrent(ctx, tx, args.e, args.a);
  }
  return { txId: tx._id, rowId, eventId: built.event.id, factId };
}

export const appendAssert = mutation({
  args: {
    ...txArgs,
    factId: v.optional(v.string()),
    e: v.string(),
    a: v.string(),
    v: v.any(),
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    eventMetadata: v.optional(v.any()),
    causalRefs: v.optional(v.array(v.string())),
    cardinality: v.optional(cardinality),
  },
  returns: appendResultValidator,
  handler: async (ctx, args) => {
    const tx = await createTransaction(ctx, args);
    return await appendAssertInTx(ctx, tx, args);
  },
});

export const appendLifecycle = mutation({
  args: {
    ...txArgs,
    factId: v.optional(v.string()),
    kind: v.union(
      v.literal("retract"),
      v.literal("tombstone"),
      v.literal("untombstone"),
    ),
    targetEventId: v.string(),
    e: v.string(),
    a: v.string(),
    v: v.any(),
    validTo: v.optional(v.number()),
    eventMetadata: v.optional(v.any()),
    causalRefs: v.optional(v.array(v.string())),
  },
  returns: appendResultValidator,
  handler: async (ctx, args) => {
    const tx = await createTransaction(ctx, args);
    const fact = await targetFact(ctx, args.targetEventId);
    const built = buildLifecycleFactEvent<Id<"transactions">, Id<"facts">>({
      tx: txForCore(tx),
      txId: tx._id,
      factId: fact._id,
      kind: args.kind,
      targetEventId: args.targetEventId,
      e: args.e,
      a: args.a,
      v: args.v,
      validTo: args.validTo,
      reason: args.reason,
      metadata: args.eventMetadata,
      causalRefs: args.causalRefs,
    });
    const rowId = await ctx.db.insert(
      "factEvents",
      withoutUndefined(built.row),
    );
    if (args.kind === "retract") {
      await ctx.db.patch(fact._id, {
        retractedAt: tx.txTime,
        lastTxId: tx._id,
      });
      await deleteCurrentForFact(ctx, fact._id);
    } else if (args.kind === "tombstone") {
      await ctx.db.patch(fact._id, {
        tombstonedAt: tx.txTime,
        tombstoneTxId: tx._id,
        tombstoneReason: args.reason,
        lastTxId: tx._id,
      });
      await deleteCurrentForFact(ctx, fact._id);
    } else {
      await ctx.db.patch(fact._id, {
        tombstonedAt: undefined,
        tombstoneTxId: undefined,
        tombstoneReason: undefined,
        lastTxId: tx._id,
      });
      const patched = await ctx.db.get(fact._id);
      if (patched !== null) await insertCurrentIfNowVisible(ctx, patched, tx.txTime);
    }
    return { txId: tx._id, rowId, eventId: built.event.id, factId: fact._id };
  },
});

export const issueCollection = mutation({
  args: {
    actorId: v.string(),
    actorType,
    subject: v.string(),
    form: v.string(),
    scope: v.string(),
    expireMs: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  returns: collectionResultValidator,
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const existing = await ctx.db
      .query("flowRuns")
      .withIndex("by_target", (q) =>
        q.eq("subject", args.subject).eq("form", args.form).eq("scope", args.scope),
      )
      .take(100);
    const live = existing.find((run) => hasLiveCollectionToken(run, now));
    if (live) {
      return {
        runId: live._id,
        token: live.token,
        collectUrl: `/collect?token=${live.token}`,
        reused: true,
      };
    }

    const token = crypto.randomUUID();
    const runId = await ctx.db.insert(
      "flowRuns",
      withoutUndefined({
        subject: args.subject,
        form: args.form,
        scope: args.scope,
        status: "waiting" as const,
        issuedAt: now,
        updatedAt: now,
        token,
        tokenExpiresAt: now + (args.expireMs ?? DEFAULT_TOKEN_TTL_MS),
      }),
    );
    return { runId, token, collectUrl: `/collect?token=${token}`, reused: false };
  },
});

export const collectionByToken = query({
  args: { token: v.string() },
  returns: collectionPageValidator,
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("flowRuns")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (run === null) return { found: false as const };
    const invalid = tokenInvalidReason(run, Date.now());
    if (invalid) return { found: false as const, reason: invalid };

    const def = await loadFormDef(ctx, run.form);
    return {
      found: true as const,
      status: run.status,
      subject: run.subject,
      form: run.form,
      scope: run.scope,
      title: def?.title ?? run.form,
      fields: def?.fields ?? [],
    };
  },
});

export const submitCollection = mutation({
  args: {
    token: v.string(),
    values: v.any(),
    now: v.optional(v.number()),
  },
  returns: collectionSubmitResultValidator,
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("flowRuns")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (run === null) return { ok: false as const, reason: "unknown token" };

    const now = args.now ?? Date.now();
    const invalid = tokenInvalidReason(run, now);
    if (invalid === "used") {
      return { ok: false as const, reason: "already submitted" };
    }
    if (invalid === "expired") {
      await ctx.db.patch("flowRuns", run._id, {
        status: "expired",
        updatedAt: now,
      });
      return { ok: false as const, reason: "expired token" };
    }
    if (invalid) return { ok: false as const, reason: "already submitted" };

    const values = (args.values ?? {}) as Record<string, unknown>;
    const tx = await createTransaction(ctx, {
      actorId: run.subject,
      actorType: "user",
      txTime: now,
      reason: `submit ${run.form}`,
      source: "component.collection.submit",
    });
    for (const [field, value] of Object.entries(values)) {
      await appendAssertInTx(ctx, tx, {
        e: run.subject,
        a: `${run.form}/${field}`,
        v: value,
        reason: `submit ${run.form}`,
      });
    }
    await appendAssertInTx(ctx, tx, {
      e: run.subject,
      a: `submitted.${run.form}`,
      v: run.scope,
      reason: `submit ${run.form}`,
    });

    await ctx.db.patch("flowRuns", run._id, {
      status: "completed",
      updatedAt: now,
      tokenConsumedAt: now,
      context: values,
    });
    return { ok: true as const };
  },
});

export const rebuildProjections = mutation({
  args: {},
  returns: rebuildResultValidator,
  handler: async (ctx) => {
    const events = await ctx.db
      .query("factEvents")
      .withIndex("by_txTime")
      .order("asc")
      .take(REBUILD_LIMIT + 1);
    if (events.length > REBUILD_LIMIT) {
      throw new Error(
        `projection rebuild is limited to ${REBUILD_LIMIT} factEvents rows`,
      );
    }

    await clearProjectionTables(ctx);

    const factsByAssertEventId = new Map<string, Doc<"facts">>();
    for (const row of events) {
      if (row.kind === "assert") {
        await replayAssert(ctx, row, factsByAssertEventId);
      } else {
        await replayLifecycle(ctx, row, factsByAssertEventId);
      }
    }

    const currentFacts = await ctx.db
      .query("currentFacts")
      .take(REBUILD_LIMIT + 1);
    if (currentFacts.length > REBUILD_LIMIT) {
      throw new Error(
        `projection rebuild produced more than ${REBUILD_LIMIT} currentFacts rows`,
      );
    }

    return {
      events: events.length,
      facts: factsByAssertEventId.size,
      currentFacts: currentFacts.length,
    };
  },
});

export const getEvent = query({
  args: {
    eventId: v.string(),
  },
  returns: v.union(eventSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("factEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (row === null) return null;
    const tx = await ctx.db.get(row.txId);
    if (tx === null) return null;
    return summarizeOwned(row, tx);
  },
});

export const listEvents = query({
  args: {
    e: v.optional(v.string()),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(eventSummaryValidator),
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows =
      args.e === undefined
        ? await ctx.db.query("factEvents").order("desc").take(take)
        : args.a === undefined
          ? await ctx.db
              .query("factEvents")
              .withIndex("by_e", (q) => q.eq("e", args.e!))
              .order("desc")
              .take(take)
          : await ctx.db
              .query("factEvents")
              .withIndex("by_e_and_a_and_txTime", (q) =>
                q.eq("e", args.e!).eq("a", args.a!),
              )
              .order("desc")
              .take(take);

    const out = [];
    for (const row of rows) {
      const tx = await ctx.db.get(row.txId);
      if (tx !== null) out.push(summarizeOwned(row, tx));
    }
    return out;
  },
});

export const listCurrent = query({
  args: {
    e: v.optional(v.string()),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(currentFactValidator),
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows =
      args.e === undefined
        ? await ctx.db.query("currentFacts").order("desc").take(take)
        : args.a === undefined
          ? await ctx.db
              .query("currentFacts")
              .withIndex("by_e", (q) => q.eq("e", args.e!))
              .order("desc")
              .take(take)
          : await ctx.db
              .query("currentFacts")
              .withIndex("by_e_and_a", (q) =>
                q.eq("e", args.e!).eq("a", args.a!),
              )
              .order("desc")
              .take(take);

    const out = [];
    for (const row of rows) {
      const fact = await ctx.db.get(row.factId);
      if (fact !== null) out.push(currentFactSummary(row, fact));
    }
    return out;
  },
});

export const getCurrentEntity = query({
  args: {
    e: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.union(currentEntityValidator, v.null()),
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(args.limit ?? 200, 500));
    const rows = await ctx.db
      .query("currentFacts")
      .withIndex("by_e", (q) => q.eq("e", args.e))
      .order("asc")
      .take(take);
    if (rows.length === 0) return null;
    const facts = await summarizeCurrentRows(ctx, rows);
    if (facts.length === 0) return null;
    return groupCurrentEntity(args.e, facts);
  },
});

export const listCurrentEntities = query({
  args: {
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(currentEntityListItemValidator),
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));
    const typeRows =
      args.type === undefined
        ? await ctx.db
            .query("currentFacts")
            .withIndex("by_a_and_updatedAt", (q) => q.eq("a", "type"))
            .order("desc")
            .take(take)
        : await ctx.db
            .query("currentFacts")
            .withIndex("by_a_and_v_and_updatedAt", (q) =>
              q.eq("a", "type").eq("v", args.type!),
            )
            .order("desc")
            .take(take);

    const out = [];
    for (const typeRow of typeRows) {
      const typeFact = await ctx.db.get(typeRow.factId);
      if (typeFact === null) continue;
      const names = await ctx.db
        .query("currentFacts")
        .withIndex("by_e_and_a", (q) => q.eq("e", typeRow.e).eq("a", "name"))
        .take(1);
      out.push(
        withoutUndefined({
          e: typeRow.e,
          type: String(typeRow.v),
          name: names[0]?.v,
          updatedAt: typeRow.updatedAt,
          typeFact: currentFactSummary(typeRow, typeFact),
        }),
      );
    }
    return out;
  },
});
