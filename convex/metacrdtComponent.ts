import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

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
  v.literal("correction"),
);

const eventSummaryValidator = v.object({
  eventId: v.optional(v.string()),
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
  hlc: v.optional(hlcValidator),
  targetEventId: v.optional(v.string()),
  causalRefs: v.array(v.string()),
  hasProtocolMetadata: v.boolean(),
  verifiable: v.boolean(),
  validEventId: v.boolean(),
  reason: v.optional(v.string()),
});

const ownedProtocolKind = v.union(
  v.literal("assert"),
  v.literal("retract"),
  v.literal("tombstone"),
  v.literal("untombstone"),
);

const cardinality = v.union(v.literal("many"), v.literal("one"));

const ownedEventSummaryValidator = v.object({
  rowId: v.string(),
  txId: v.string(),
  eventId: v.string(),
  kind: ownedProtocolKind,
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

const appendOwnedResultValidator = v.object({
  txId: v.string(),
  rowId: v.string(),
  eventId: v.string(),
  factId: v.optional(v.string()),
});

const ownedCurrentFactValidator = v.object({
  factId: v.string(),
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

const ownedCurrentAttributeValidator = v.object({
  a: v.string(),
  values: v.array(v.any()),
  facts: v.array(ownedCurrentFactValidator),
});

const ownedCurrentEntityValidator = v.object({
  e: v.string(),
  facts: v.array(ownedCurrentFactValidator),
  attributes: v.array(ownedCurrentAttributeValidator),
});

const rebuildOwnedResultValidator = v.object({
  events: v.number(),
  facts: v.number(),
  currentFacts: v.number(),
});

async function actorContext(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return {
    actorId: identity?.tokenIdentifier ?? "anonymous",
    actorType: "user" as const,
  };
}

function withoutUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function componentRow(row: Doc<"factEvents">) {
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

function componentTx(tx: Doc<"transactions">) {
  return {
    _creationTime: tx._creationTime,
    actorId: tx.actorId,
    actorType: tx.actorType,
    txTime: tx.txTime,
    reason: tx.reason,
  };
}

/**
 * App-owned wrapper around the packaged @metacrdt/convex component. The host app
 * owns tables, auth, and row selection; the component owns protocol verification
 * and summary semantics.
 */
export const verifyEvents = query({
  args: {
    e: v.string(),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
    requireValid: v.optional(v.boolean()),
  },
  returns: v.array(eventSummaryValidator),
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));
    const a = args.a;
    const rows =
      a === undefined
        ? await ctx.db
            .query("factEvents")
            .withIndex("by_e", (q) => q.eq("e", args.e))
            .order("desc")
            .take(take)
        : await ctx.db
            .query("factEvents")
            .withIndex("by_e_a_tx", (q) => q.eq("e", args.e).eq("a", a))
            .order("desc")
            .take(take);

    const inputs = [];
    for (const row of rows) {
      const tx = await ctx.db.get(row.txId);
      if (tx === null) continue;
      inputs.push({ row: componentRow(row), tx: componentTx(tx) });
    }

    const summaries = await ctx.runQuery(components.metacrdt.protocol.summarizeRows, {
      inputs,
    });

    if (args.requireValid === true) {
      for (const summary of summaries) {
        if (summary.hasProtocolMetadata && !summary.validEventId) {
          throw new Error(
            `invalid protocol event ${summary.eventId ?? "(missing)"}`,
          );
        }
      }
    }

    return summaries;
  },
});

/**
 * App wrapper for the state-owning @metacrdt/convex component log. The app owns
 * auth and decides what may be written; the component owns the durable protocol
 * transaction/event tables.
 */
export const appendOwnedAssert = mutation({
  args: {
    e: v.string(),
    a: v.string(),
    value: v.any(),
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    source: v.optional(v.string()),
    metadata: v.optional(v.any()),
    cardinality: v.optional(cardinality),
  },
  returns: appendOwnedResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    return await ctx.runMutation(
      components.metacrdt.log.appendAssert,
      withoutUndefined({
        ...actor,
        e: args.e,
        a: args.a,
        v: args.value,
        validFrom: args.validFrom,
        validTo: args.validTo,
        reason: args.reason,
        source: args.source,
        eventMetadata: args.metadata,
        cardinality: args.cardinality,
      }),
    );
  },
});

export const appendOwnedLifecycle = mutation({
  args: {
    kind: v.union(
      v.literal("retract"),
      v.literal("tombstone"),
      v.literal("untombstone"),
    ),
    targetEventId: v.string(),
    e: v.string(),
    a: v.string(),
    value: v.any(),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    source: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: appendOwnedResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    return await ctx.runMutation(
      components.metacrdt.log.appendLifecycle,
      withoutUndefined({
        ...actor,
        kind: args.kind,
        targetEventId: args.targetEventId,
        e: args.e,
        a: args.a,
        v: args.value,
        validTo: args.validTo,
        reason: args.reason,
        source: args.source,
        eventMetadata: args.metadata,
      }),
    );
  },
});

export const listOwnedEvents = query({
  args: {
    e: v.optional(v.string()),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(ownedEventSummaryValidator),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.metacrdt.log.listEvents,
      withoutUndefined(args),
    ),
});

export const listOwnedCurrent = query({
  args: {
    e: v.optional(v.string()),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(ownedCurrentFactValidator),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.metacrdt.log.listCurrent,
      withoutUndefined(args),
    ),
});

export const getOwnedCurrentEntity = query({
  args: {
    e: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.union(ownedCurrentEntityValidator, v.null()),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.metacrdt.log.getCurrentEntity,
      withoutUndefined(args),
    ),
});

export const rebuildOwnedProjections = mutation({
  args: {},
  returns: rebuildOwnedResultValidator,
  handler: async (ctx) =>
    await ctx.runMutation(components.metacrdt.log.rebuildProjections, {}),
});
