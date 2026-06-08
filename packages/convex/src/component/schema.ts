import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const value = v.any();

export default defineSchema({
  // Component-owned protocol transaction log. Host apps pass actor/source context
  // explicitly because Convex components do not own app auth or environment.
  transactions: defineTable({
    actorId: v.string(),
    actorType: v.union(
      v.literal("user"),
      v.literal("system"),
      v.literal("agent"),
      v.literal("migration"),
    ),
    reason: v.optional(v.string()),
    source: v.optional(v.string()),
    txTime: v.number(),
    requestId: v.optional(v.string()),
    metadata: v.optional(value),
  })
    .index("by_txTime", ["txTime"])
    .index("by_actorId_and_txTime", ["actorId", "txTime"]),

  // Component-owned append-only event log. This is intentionally just the
  // protocol log; host apps still decide whether/how to maintain projections.
  factEvents: defineTable({
    txId: v.id("transactions"),
    txTime: v.number(),
    eventId: v.string(),
    hlc: v.object({
      pt: v.number(),
      l: v.number(),
      r: v.string(),
    }),
    replicaId: v.string(),
    seq: v.optional(v.number()),
    targetEventId: v.optional(v.string()),
    causalRefs: v.optional(v.array(v.string())),
    kind: v.union(
      v.literal("assert"),
      v.literal("retract"),
      v.literal("tombstone"),
      v.literal("untombstone"),
    ),
    factId: v.optional(v.string()),
    e: v.string(),
    a: v.string(),
    v: value,
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    metadata: v.optional(value),
  })
    .index("by_txId", ["txId"])
    .index("by_eventId", ["eventId"])
    .index("by_e", ["e"])
    .index("by_e_and_a_and_txTime", ["e", "a", "txTime"])
    .index("by_txTime", ["txTime"]),
});
