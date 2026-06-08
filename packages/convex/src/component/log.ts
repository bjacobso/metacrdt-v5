import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  buildAssertFactEvent,
  buildLifecycleFactEvent,
  summarizeProtocolEvent,
} from "../index.js";
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
  },
  returns: appendResultValidator,
  handler: async (ctx, args) => {
    const tx = await createTransaction(ctx, args);
    const built = buildAssertFactEvent<Id<"transactions">, string>({
      tx: txForCore(tx),
      txId: tx._id,
      factId: args.factId,
      e: args.e,
      a: args.a,
      v: args.v,
      validFrom: args.validFrom ?? tx.txTime,
      validTo: args.validTo,
      reason: args.reason,
      metadata: args.eventMetadata,
      causalRefs: args.causalRefs,
    });
    const rowId = await ctx.db.insert(
      "factEvents",
      withoutUndefined(built.row),
    );
    return { txId: tx._id, rowId, eventId: built.event.id };
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
    const built = buildLifecycleFactEvent<Id<"transactions">, string>({
      tx: txForCore(tx),
      txId: tx._id,
      factId: args.factId,
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
    return { txId: tx._id, rowId, eventId: built.event.id };
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
