import { v } from "convex/values";
import { query } from "./_generated/server";
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
