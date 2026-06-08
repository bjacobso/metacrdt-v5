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

  // Component-owned bitemporal fact projection. This is a read model of the
  // component log, not a second source of truth.
  facts: defineTable({
    e: v.string(),
    a: v.string(),
    v: value,
    firstTxId: v.id("transactions"),
    lastTxId: v.optional(v.id("transactions")),
    assertedAt: v.number(),
    retractedAt: v.optional(v.number()),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    tombstonedAt: v.optional(v.number()),
    tombstoneTxId: v.optional(v.id("transactions")),
    tombstoneReason: v.optional(v.string()),
    assertEventId: v.string(),
    metadata: v.optional(value),
  })
    .index("by_assertEventId", ["assertEventId"])
    .index("by_e", ["e"])
    .index("by_e_and_a", ["e", "a"])
    .index("by_assertedAt", ["assertedAt"]),

  // Component-owned now projection. Disposable; it can be rebuilt from `facts`.
  currentFacts: defineTable({
    e: v.string(),
    a: v.string(),
    v: value,
    factId: v.id("facts"),
    validFrom: v.number(),
    txTime: v.number(),
    updatedAt: v.number(),
  })
    .index("by_factId", ["factId"])
    .index("by_e", ["e"])
    .index("by_e_and_a", ["e", "a"])
    .index("by_a_and_v", ["a", "v"])
    .index("by_a_and_v_and_updatedAt", ["a", "v", "updatedAt"])
    .index("by_a_and_updatedAt", ["a", "updatedAt"])
    .index("by_updatedAt", ["updatedAt"]),

  // Component-owned collection capabilities. These are operational run/token
  // records, not protocol facts; submitted values enter the protocol log through
  // component mutations in log.ts.
  flowRuns: defineTable({
    subject: v.string(),
    form: v.string(),
    scope: v.string(),
    status: v.union(
      v.literal("waiting"),
      v.literal("completed"),
      v.literal("expired"),
    ),
    issuedAt: v.number(),
    updatedAt: v.number(),
    token: v.string(),
    tokenExpiresAt: v.optional(v.number()),
    tokenConsumedAt: v.optional(v.number()),
    context: v.optional(value),
  })
    .index("by_token", ["token"])
    .index("by_target", ["subject", "form", "scope"])
    .index("by_status", ["status"]),
});
