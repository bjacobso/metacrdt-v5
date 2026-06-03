import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// A triple value can be any Convex value: a scalar, an entity-ref string, or
// structured JSON. Index lookups on `v` rely on Convex's cross-type ordering.
const value = v.any();

export default defineSchema({
  // One document per write. Every mutation creates exactly one transaction.
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
    // Millisecond wall-clock timestamp the system recorded this write.
    txTime: v.number(),
    requestId: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    branchId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_txTime", ["txTime"])
    .index("by_actor", ["actorId", "txTime"]),

  // Append-only, immutable audit trail. Never patched, never deleted.
  factEvents: defineTable({
    txId: v.id("transactions"),
    txTime: v.number(),
    kind: v.union(
      v.literal("assert"),
      v.literal("retract"),
      v.literal("tombstone"),
      v.literal("untombstone"),
      v.literal("correction"),
    ),
    factId: v.optional(v.id("facts")),
    e: v.string(),
    a: v.string(),
    v: value,
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_tx", ["txId"])
    .index("by_e_a_tx", ["e", "a", "txTime"])
    .index("by_a_tx", ["a", "txTime"]),

  // Canonical bitemporal interval records. Patched in place with lifecycle
  // fields (retractedAt, validTo, tombstone*) but never structurally rewritten.
  facts: defineTable({
    e: v.string(),
    a: v.string(),
    v: value,

    firstTxId: v.id("transactions"),
    lastTxId: v.optional(v.id("transactions")),

    // Transaction time.
    assertedAt: v.number(),
    retractedAt: v.optional(v.number()),

    // Valid time.
    validFrom: v.number(),
    validTo: v.optional(v.number()),

    // Tombstone: the assertion itself was invalid (distinct from retraction).
    tombstonedAt: v.optional(v.number()),
    tombstoneTxId: v.optional(v.id("transactions")),
    tombstoneReason: v.optional(v.string()),

    // Correction lineage.
    supersededBy: v.optional(v.id("facts")),
    supersedes: v.optional(v.id("facts")),

    source: v.optional(v.string()),
    confidence: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_e", ["e"])
    .index("by_e_a", ["e", "a"])
    .index("by_e_a_validFrom", ["e", "a", "validFrom"])
    .index("by_a", ["a"])
    .index("by_a_validFrom", ["a", "validFrom"])
    .index("by_a_v", ["a", "v"])
    .index("by_a_v_validFrom", ["a", "v", "validFrom"])
    .index("by_assertedAt", ["assertedAt"])
    .index("by_retractedAt", ["retractedAt"])
    .index("by_tombstonedAt", ["tombstonedAt"]),

  // Disposable fast read model: the latest visible, non-tombstoned fact per
  // (e, a) at current transaction time and current valid time.
  currentFacts: defineTable({
    e: v.string(),
    a: v.string(),
    v: value,
    factId: v.id("facts"),
    validFrom: v.number(),
    txTime: v.number(),
    updatedAt: v.number(),
  })
    .index("by_e", ["e"])
    .index("by_e_a", ["e", "a"])
    .index("by_a", ["a"])
    .index("by_a_v", ["a", "v"])
    .index("by_e_a_v", ["e", "a", "v"]),

  // Typed schema for predicates.
  attributes: defineTable({
    name: v.string(),
    valueType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("boolean"),
      v.literal("entityRef"),
      v.literal("date"),
      v.literal("json"),
    ),
    cardinality: v.union(v.literal("one"), v.literal("many")),
    unique: v.optional(v.boolean()),
    indexed: v.optional(v.boolean()),
    materialized: v.optional(v.boolean()),
    inverseAttribute: v.optional(v.string()),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  }).index("by_name", ["name"]),

  // Datalog rules whose output is materialized into derivedFacts.
  rules: defineTable({
    name: v.string(),
    where: v.array(v.any()),
    emit: v.object({
      e: v.string(),
      a: v.string(),
      v: value,
    }),
    enabled: v.boolean(),
    materialization: v.union(
      v.literal("sync"),
      v.literal("async"),
      v.literal("manual"),
    ),
    dependsOnAttributes: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_enabled", ["enabled"]),

  // Disposable projection: materialized rule output.
  derivedFacts: defineTable({
    ruleId: v.string(),
    e: v.string(),
    a: v.string(),
    v: value,
    sourceFactIds: v.array(v.id("facts")),
    derivedAt: v.number(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    txWatermark: v.number(),
    stale: v.optional(v.boolean()),
  })
    .index("by_rule", ["ruleId"])
    .index("by_rule_e", ["ruleId", "e"])
    .index("by_e_a", ["e", "a"])
    .index("by_a_v", ["a", "v"])
    .index("by_stale", ["stale"]),

  // Work queue for rule recomputation triggered by fact changes.
  ruleInvalidations: defineTable({
    ruleId: v.id("rules"),
    e: v.optional(v.string()),
    causedByFactId: v.id("facts"),
    txTime: v.number(),
    processedAt: v.optional(v.number()),
  }).index("by_rule_processed", ["ruleId", "processedAt"]),
});
