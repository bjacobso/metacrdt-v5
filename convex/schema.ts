import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// A triple value can be any Convex value: a scalar, an entity-ref string, or
// structured JSON. Index lookups on `v` rely on Convex's cross-type ordering.
const value = v.any();

export default defineSchema({
  tenants: defineTable({
    slug: v.string(),
    name: v.string(),
    kind: v.optional(
      v.union(v.literal("staffing"), v.literal("legal"), v.literal("custom")),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  tenantMemberships: defineTable({
    tenantId: v.id("tenants"),
    principal: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("editor"),
      v.literal("viewer"),
    ),
    createdAt: v.number(),
  })
    .index("by_principal", ["principal"])
    .index("by_tenant_and_principal", ["tenantId", "principal"]),

  configApplyJobs: defineTable({
    tenantId: v.id("tenants"),
    tenantSlug: v.string(),
    requestedBy: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    config: v.any(),
    plan: v.optional(v.any()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    attempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_tenant_and_createdAt", ["tenantId", "createdAt"])
    .index("by_tenant_and_status", ["tenantId", "status", "createdAt"]),

  accountDeploymentPlans: defineTable({
    tenantId: v.id("tenants"),
    tenantSlug: v.string(),
    requestedBy: v.string(),
    status: v.union(
      v.literal("planned"),
      v.literal("approved"),
      v.literal("applied"),
      v.literal("failed"),
    ),
    sourceDigest: v.string(),
    artifactDigest: v.string(),
    sourceFormat: v.optional(v.string()),
    config: v.any(),
    artifact: v.any(),
    plan: v.any(),
    summary: v.any(),
    review: v.optional(v.any()),
    empty: v.boolean(),
    destructive: v.boolean(),
    baselineActivePlanId: v.optional(v.id("accountDeploymentPlans")),
    baselineArtifactDigest: v.optional(v.string()),
    baselineAppliedAt: v.optional(v.number()),
    draftId: v.optional(v.id("accountConfigDrafts")),
    rollbackOfPlanId: v.optional(v.id("accountDeploymentPlans")),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    applyResult: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
    appliedAt: v.optional(v.number()),
  })
    .index("by_tenant_and_createdAt", ["tenantId", "createdAt"])
    .index("by_tenant_and_status", ["tenantId", "status", "createdAt"])
    .index("by_tenant_and_artifactDigest", ["tenantId", "artifactDigest"]),

  accountDeploymentStates: defineTable({
    tenantId: v.id("tenants"),
    tenantSlug: v.string(),
    activePlanId: v.optional(v.id("accountDeploymentPlans")),
    sourceDigest: v.optional(v.string()),
    artifactDigest: v.optional(v.string()),
    appliedBy: v.optional(v.string()),
    appliedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_tenant", ["tenantId"]),

  accountConfigDrafts: defineTable({
    tenantId: v.id("tenants"),
    tenantSlug: v.string(),
    name: v.string(),
    source: v.string(),
    sourceFormat: v.union(
      v.literal("json"),
      v.literal("yaml"),
      v.literal("forma"),
    ),
    sourceDigest: v.string(),
    checkedInPath: v.optional(v.string()),
    checkedInDigest: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    artifactDigest: v.optional(v.string()),
    diagnostics: v.array(
      v.object({
        message: v.string(),
        loc: v.optional(v.object({ line: v.number(), col: v.number() })),
        path: v.optional(v.string()),
      }),
    ),
    validation: v.optional(
      v.object({
        valid: v.boolean(),
        errors: v.array(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_tenant_and_updatedAt", ["tenantId", "updatedAt"])
    .index("by_tenant_and_name_and_updatedAt", ["tenantId", "name", "updatedAt"]),

  // One document per write. Every mutation creates exactly one transaction.
  transactions: defineTable({
    tenantId: v.id("tenants"),
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
    .index("by_actor", ["actorId", "txTime"])
    .index("by_tenant_and_txTime", ["tenantId", "txTime"])
    .index("by_tenant_and_actor", ["tenantId", "actorId", "txTime"]),

  // Append-only, immutable audit trail. Never patched, never deleted.
  factEvents: defineTable({
    tenantId: v.id("tenants"),
    txId: v.id("transactions"),
    txTime: v.number(),
    // MetaCRDT protocol metadata. Optional while legacy dev data exists; all new
    // writes should stamp it. `eventId` is the content address of the core event.
    eventId: v.optional(v.string()),
    hlc: v.optional(
      v.object({
        pt: v.number(),
        l: v.number(),
        r: v.string(),
      }),
    ),
    replicaId: v.optional(v.string()),
    seq: v.optional(v.number()),
    targetEventId: v.optional(v.string()),
    causalRefs: v.optional(v.array(v.string())),
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
    .index("by_tenant_and_tx", ["tenantId", "txId"])
    .index("by_eventId", ["eventId"])
    .index("by_e", ["e"])
    .index("by_tenant_and_e", ["tenantId", "e"])
    .index("by_e_a_tx", ["e", "a", "txTime"])
    .index("by_tenant_and_e_a_tx", ["tenantId", "e", "a", "txTime"])
    .index("by_a_tx", ["a", "txTime"])
    .index("by_tenant_and_a_tx", ["tenantId", "a", "txTime"]),

  // Bitemporal interval projection of factEvents: one row per logical fact with
  // its folded lifecycle (retractedAt, validTo, tombstone*). Read-optimized so a
  // clause fetch is one indexed range + a single-row visibility check. Fully
  // rebuildable from the event log via convex/rebuild.ts (the log is the source
  // of truth); write-time-only metadata (source, confidence, lineage) lives here.
  facts: defineTable({
    tenantId: v.id("tenants"),
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
    assertEventId: v.optional(v.string()),
    supersededBy: v.optional(v.id("facts")),
    supersedes: v.optional(v.id("facts")),

    source: v.optional(v.string()),
    confidence: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_e", ["e"])
    .index("by_tenant_and_e", ["tenantId", "e"])
    .index("by_e_a", ["e", "a"])
    .index("by_tenant_and_e_a", ["tenantId", "e", "a"])
    .index("by_e_a_validFrom", ["e", "a", "validFrom"])
    .index("by_tenant_and_e_a_validFrom", ["tenantId", "e", "a", "validFrom"])
    .index("by_a", ["a"])
    .index("by_tenant_and_a", ["tenantId", "a"])
    .index("by_a_validFrom", ["a", "validFrom"])
    .index("by_a_v", ["a", "v"])
    .index("by_tenant_and_a_v", ["tenantId", "a", "v"])
    .index("by_a_v_validFrom", ["a", "v", "validFrom"])
    .index("by_assertedAt", ["assertedAt"])
    .index("by_retractedAt", ["retractedAt"])
    .index("by_tombstonedAt", ["tombstonedAt"]),

  // Now-projection of facts: the visible, non-tombstoned facts at current
  // transaction + valid time. Disposable; rebuilt from facts by rebuildProjections.
  currentFacts: defineTable({
    tenantId: v.id("tenants"),
    e: v.string(),
    a: v.string(),
    v: value,
    factId: v.id("facts"),
    validFrom: v.number(),
    txTime: v.number(),
    updatedAt: v.number(),
  })
    .index("by_e", ["e"])
    .index("by_tenant_and_e", ["tenantId", "e"])
    .index("by_e_a", ["e", "a"])
    .index("by_tenant_and_e_a", ["tenantId", "e", "a"])
    .index("by_a", ["a"])
    .index("by_tenant_and_a", ["tenantId", "a"])
    .index("by_a_v", ["a", "v"])
    .index("by_tenant_and_a_v", ["tenantId", "a", "v"])
    .index("by_e_a_v", ["e", "a", "v"])
    .index("by_tenant_and_e_a_v", ["tenantId", "e", "a", "v"]),

  // NOTE: there is intentionally no `attributes` table. The schema (attribute
  // definitions, entity-type definitions, type→attribute membership) is modeled
  // as ordinary bitemporal facts via convex/attributes.ts (schema-as-facts), so
  // it inherits history, tombstoning, and as-of queries. See convex/lib/meta.ts.

  // Datalog rules whose output is materialized into derivedFacts.
  rules: defineTable({
    tenantId: v.id("tenants"),
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
    .index("by_tenant_and_name", ["tenantId", "name"])
    .index("by_enabled", ["enabled"])
    .index("by_tenant_and_enabled", ["tenantId", "enabled"]),

  // Disposable projection: materialized rule output.
  derivedFacts: defineTable({
    tenantId: v.id("tenants"),
    ruleId: v.string(),
    e: v.string(),
    a: v.string(),
    v: value,
    sourceFactIds: v.array(v.id("facts")),
    sourceEventIds: v.optional(v.array(v.string())),
    // For closure-derived facts, number of currently visible path supports for
    // this reachable pair. Datalog-derived rows omit it.
    supportCount: v.optional(v.number()),
    derivedAt: v.number(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    txWatermark: v.number(),
    stale: v.optional(v.boolean()),
  })
    .index("by_rule", ["ruleId"])
    .index("by_tenant_and_rule", ["tenantId", "ruleId"])
    .index("by_rule_e", ["ruleId", "e"])
    .index("by_tenant_and_rule_e", ["tenantId", "ruleId", "e"])
    .index("by_e", ["e"])
    .index("by_tenant_and_e", ["tenantId", "e"])
    .index("by_e_a", ["e", "a"])
    .index("by_tenant_and_e_a", ["tenantId", "e", "a"])
    .index("by_a", ["a"])
    .index("by_tenant_and_a", ["tenantId", "a"])
    .index("by_a_v", ["a", "v"])
    .index("by_tenant_and_a_v", ["tenantId", "a", "v"])
    .index("by_stale", ["stale"]),

  // Durable workflow runs (the `collect` step). Operational, high-churn state —
  // a dedicated table, not triples (per the high-churn-separation guideline).
  // A run parks in `waiting` and is resumed by a matching submission fact (via
  // the event path) or advanced by scheduled timer ticks.
  flowRuns: defineTable({
    tenantId: v.id("tenants"),
    flowName: v.string(),
    subject: v.string(),
    // Set when a run is parked on a collect step; optional for DAG runs that
    // haven't reached one yet.
    form: v.optional(v.string()),
    scope: v.optional(v.string()),
    status: v.union(
      v.literal("running"),
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
    // Magic-link token for the isolated collection page.
    token: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    tokenConsumedAt: v.optional(v.number()),
    // Where submitCollection should write the collected facts. Missing means
    // legacy/host-owned. Component-owned collection runs are still issued from
    // this host table, but their submitted values fold into the installed
    // @metacrdt/convex component log.
    collectionTarget: v.optional(
      v.union(v.literal("host"), v.literal("component")),
    ),
    // Collected field values / flow variables.
    context: v.optional(v.any()),
    // Phase 2 (general DAG): which flow definition + current step.
    flowDefName: v.optional(v.string()),
    currentStepId: v.optional(v.string()),
  })
    .index("by_subject", ["subject"])
    .index("by_tenant_and_subject", ["tenantId", "subject"])
    .index("by_target", ["subject", "form", "scope"])
    .index("by_tenant_and_target", ["tenantId", "subject", "form", "scope"])
    .index("by_status", ["status"])
    .index("by_tenant_and_status", ["tenantId", "status"])
    .index("by_token", ["token"]),

  // Flow definitions (general DAG): a named graph of typed steps. Low-churn
  // config; steps is a small bounded array.
  flowDefs: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    title: v.optional(v.string()),
    // The entity type this flow runs on (e.g. "Worker"). Drives the
    // "available flows" section on an entity's detail page.
    subjectType: v.optional(v.string()),
    // Provenance facet: "configured" (tenant-defined) vs "system" (intrinsic).
    origin: v.optional(v.union(v.literal("configured"), v.literal("system"))),
    startStepId: v.string(),
    steps: v.array(
      v.object({
        id: v.string(),
        type: v.union(
          v.literal("assert"),
          v.literal("collect"),
          v.literal("notify"),
          v.literal("branch"),
          v.literal("action"),
          v.literal("wait"),
          v.literal("done"),
        ),
        config: v.optional(v.any()),
        next: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_tenant_and_name", ["tenantId", "name"]),

  // Append-only step log per flow run (issued / reminder / escalated /
  // submitted / completed / expired / cancelled).
  flowEvents: defineTable({
    tenantId: v.id("tenants"),
    runId: v.id("flowRuns"),
    ts: v.number(),
    kind: v.string(),
    message: v.optional(v.string()),
  })
    .index("by_run", ["runId"])
    .index("by_tenant_and_run", ["tenantId", "runId"]),

  // Work queue for rule recomputation triggered by fact changes.
  ruleInvalidations: defineTable({
    tenantId: v.id("tenants"),
    ruleId: v.id("rules"),
    e: v.optional(v.string()),
    causedByFactId: v.id("facts"),
    txTime: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_rule_processed", ["ruleId", "processedAt"])
    .index("by_tenant_and_rule_processed", ["tenantId", "ruleId", "processedAt"]),
});
