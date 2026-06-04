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
    .index("by_e", ["e"])
    .index("by_e_a_tx", ["e", "a", "txTime"])
    .index("by_a_tx", ["a", "txTime"]),

  // Bitemporal interval projection of factEvents: one row per logical fact with
  // its folded lifecycle (retractedAt, validTo, tombstone*). Read-optimized so a
  // clause fetch is one indexed range + a single-row visibility check. Fully
  // rebuildable from the event log via convex/rebuild.ts (the log is the source
  // of truth); write-time-only metadata (source, confidence, lineage) lives here.
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

  // Now-projection of facts: the visible, non-tombstoned facts at current
  // transaction + valid time. Disposable; rebuilt from facts by rebuildProjections.
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

  // NOTE: there is intentionally no `attributes` table. The schema (attribute
  // definitions, entity-type definitions, type→attribute membership) is modeled
  // as ordinary bitemporal facts via convex/attributes.ts (schema-as-facts), so
  // it inherits history, tombstoning, and as-of queries. See convex/lib/meta.ts.

  // Datalog rules whose output is materialized into derivedFacts.
  rules: defineTable({
    name: v.string(),
    // "datalog" rules join fact patterns and emit a derived fact per binding.
    // "closure" rules materialize the transitive closure of a base attribute.
    kind: v.optional(v.union(v.literal("datalog"), v.literal("closure"))),
    where: v.optional(v.array(v.any())),
    emit: v.optional(
      v.object({
        e: v.string(),
        a: v.string(),
        v: value,
      }),
    ),
    closure: v.optional(
      v.object({
        baseAttribute: v.string(),
        closureAttribute: v.string(),
        maxDepth: v.number(),
        reflexive: v.optional(v.boolean()),
      }),
    ),
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
    .index("by_e", ["e"])
    .index("by_e_a", ["e", "a"])
    .index("by_a", ["a"])
    .index("by_a_v", ["a", "v"])
    .index("by_stale", ["stale"]),

  // Durable workflow runs (the `collect` step). Operational, high-churn state —
  // a dedicated table, not triples (per the high-churn-separation guideline).
  // A run parks in `waiting` and is resumed by a matching submission fact (via
  // the event path) or advanced by scheduled timer ticks.
  flowRuns: defineTable({
    flowName: v.string(),
    subject: v.string(),
    form: v.string(),
    scope: v.string(),
    status: v.union(
      v.literal("waiting"),
      v.literal("completed"),
      v.literal("expired"),
      v.literal("cancelled"),
    ),
    step: v.string(),
    issuedAt: v.number(),
    updatedAt: v.number(),
    reminderSeconds: v.optional(v.number()),
    escalateSeconds: v.optional(v.number()),
    expireSeconds: v.optional(v.number()),
  })
    .index("by_subject", ["subject"])
    .index("by_target", ["subject", "form", "scope"])
    .index("by_status", ["status"]),

  // Append-only step log per flow run (issued / reminder / escalated /
  // submitted / completed / expired / cancelled).
  flowEvents: defineTable({
    runId: v.id("flowRuns"),
    ts: v.number(),
    kind: v.string(),
    message: v.optional(v.string()),
  }).index("by_run", ["runId"]),

  // Work queue for rule recomputation triggered by fact changes.
  ruleInvalidations: defineTable({
    ruleId: v.id("rules"),
    e: v.optional(v.string()),
    causedByFactId: v.id("facts"),
    txTime: v.number(),
    processedAt: v.optional(v.number()),
  }).index("by_rule_processed", ["ruleId", "processedAt"]),
});
