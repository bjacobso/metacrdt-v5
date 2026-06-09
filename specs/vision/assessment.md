# Vision — Holistic Assessment: Value, Gaps & Alternatives

> Part of the `vision/` set — see [`README.md`](./README.md). This is a reference memo, not a new
> subsystem design. It compares the direction across `vision/*` against the current Onboarded product,
> captures the strongest and weakest cases for the architecture, and names the decision points that
> should govern whether the work expands.

> Status: **assessment.** The recommendation is deliberately conditional: pursue the direction through
> measured, reversible slices; do not treat the triple store as a mandate to rewrite the product.

---

## 0. Executive take

The direction is worth pursuing as a staged platform strategy, not as a product rewrite.

The strongest near-term value is not "everything becomes triples." It is:

1. Custom fields and eventually custom objects without global migrations.
2. One reaction engine for policies and automations.
3. Better compliance audit, provenance, reuse, and "why did this happen?" explanations.
4. Cleaner integration-owned data and schema evolution.
5. A future authoring surface where UI, config-as-code, and AI all target the same IR.

The current product is clearly table/subsystem-heavy: hardcoded entities and routes for clients,
employees, employers, jobs, placements, tasks, policies, forms, integrations, automations, authz, and
more. The vision is reacting to real complexity, not inventing it. But the cost is also real: EAV loses
database safety and easy read performance, the hybrid projection layer becomes operationally critical,
and a universal substrate can easily become an internal-platform project detached from customer value.

So the correct posture is:

> **Keep the vision as a north star. Prove the smallest value-bearing claims. Expand only where measured
> correctness, latency, product value, and maintainability justify it.**

---

## 1. Where the current product already points this way

The direction is not greenfield. The existing product already contains partial versions of the proposed
primitives:

- **Configurable facts already exist locally.** `CustomProperty` / `CustomValue`, `Placement.facts`,
  `Task.data`, form field paths, and `IntegrationAttribute` are all EAV-ish shapes.
- **Policies and automations already overlap.** They share rule-like JSON and evaluator machinery, and
  automations already have actions that create tasks or suggested tasks.
- **Forms already behave like projections over data paths.** A form field collects a value at a path;
  submissions merge those values into task/entity data with audit rows alongside them.
- **Compliance already uses fact-like rows.** `SuggestedTask` is a requirement, `PlacementReqSource` is
  provenance, `Task.reuseCriteria` is a snapshotted match pattern, and `TaskUpgrade` is a bespoke
  re-materialization machine.
- **Integrations already have a boundary.** `PlatformClient`, `IntegrationData`, and
  `IntegrationSubscriptions` encode the isolation and event-reaction shape that the vision names as
  bounded fact contexts and Flows.
- **The worktree already has the seed of the substrate.** `EntityType`, `TripleAttribute`,
  `TripleEntity`, `TripleTransaction`, `Triple`, `TripleFlowRun`, `TriplesApi`, the preview route, query
  compiler, transaction helpers, early Flow matching, reuse query, and reconciler tests exist.

This matters because the best version of the architecture finishes a convergence already latent in the
codebase. The worst version ignores that practical route and tries to lift-and-shift the app into a new
model.

---

## 2. What the vision gives us

### 2.1 Configurability

The product can move from "we model your domain for you, one migration at a time" toward "you can model
your own domain inside guardrails." That is valuable if Onboarded is becoming a configurable compliance
workflow platform rather than a fixed staffing/onboarding application.

The near-term version is custom fields on native records. The farther version is customer-defined
objects with role bindings into intrinsic process machinery.

### 2.2 Compliance provenance

Compliance is unusually well-suited to a bitemporal fact model. The product needs to answer:

- What was required?
- Why was it required?
- What satisfied it?
- Who/what asserted the satisfying evidence?
- What did we believe at the relevant time?

Today those answers are reconstructed from subsystem tables. In the vision, obligations, satisfactions,
submissions, integration results, and policy firings are all transactions with provenance.

### 2.3 Workflow unification

Policies and automations are not fundamentally different products. They are both "when facts change, if
a rule matches, do something." Collapsing them into one Flow engine could reduce product and engineering
surface area.

This is likely the highest-leverage first bet because it can be proven mostly at the app layer before
real data moves into triples.

### 2.4 Integration modularity

Integrations currently need bespoke storage and wiring. Letting an integration own a namespace of facts
and a schema manifest gives it a cleaner module boundary, especially for upstream ATS and downstream
HRIS integrations where the current inline-integration model will otherwise keep growing new table
shapes.

### 2.5 Authoring and AI

If definitions are data and queries are data, then the UI, config-as-code, and AI assistants can target
the same IR. That is the credible AI story: the model proposes ASTs or definition facts; validators,
authorization, plan/preview, and human approval decide whether they apply.

---

## 3. Biggest gaps

### 3.1 Product proof

The docs assert that customers need configurable domains, but the set should eventually quantify:

- Which customers or segments need custom objects, not just custom fields.
- Which migrations or bespoke builds this would eliminate.
- Which deals or workflows are blocked today.
- Which support/debugging pain this reduces.
- Which revenue or retention upside justifies the platform tax.

Without that, the architecture risks being correct but overbuilt.

### 3.2 Operational semantics for the tx log as event bus

"Transaction log as event bus" is the keystone, but the operational contract needs to be exact:

- ordering and partitioning;
- retries and idempotency;
- side-effect dedupe;
- poison transactions and dead-lettering;
- replay and backfill;
- scheduled waits;
- observability and run tracing;
- migration from `broadcastEvent`;
- how synchronous UX-critical reactions avoid visible lag.

Without this, Flow becomes another workflow engine with a more elegant input.

### 3.3 Projection discipline

The vision correctly rejects raw EAV for hot paths. That moves complexity into projections:

- what gets promoted;
- sync vs. async maintenance;
- staleness budgets;
- rebuilds and drift detection;
- query-planner behavior;
- analytics/export rollups;
- debugging when projected state disagrees with facts.

The hybrid boundary is not an implementation detail. It is the architecture.

### 3.4 Migration economics

Every migration candidate needs an explicit scorecard:

- mismatch rate in shadow mode;
- p50/p95/p99 latency delta;
- write amplification;
- rollback plan;
- operational burden;
- legacy-code deletion path;
- customer-visible value.

The failure mode is running native tables, triples, projections, and shadow paths forever.

### 3.5 Privacy and erasure

Bitemporality is excellent for audit and awkward for erasure. The privacy doc is right to make
crypto-shredding and byte erasure central. This must be solved before real upstream integrations mirror
large amounts of candidate/worker PII into facts.

### 3.6 UX quality

Generated UI is useful for coverage and consistency, but worker onboarding cannot feel generic when it
collects SSNs, signatures, IDs, and compliance attestations. The schema renderer needs escape hatches for
polished, trust-critical flows.

---

## 4. Steelman

The strongest version of this direction:

Onboarded is becoming a configurable compliance workflow platform. Staffing is the first domain, but the
underlying need is broader: define the parties, collect facts, evaluate obligations, reuse prior
evidence, call external systems, notify people, and preserve a defensible audit trail.

In that world, hardcoded `employee` / `placement` / `client` / `job` tables are a ceiling. Customers
will need different nouns, fields, reuse dimensions, integrations, authorization boundaries, and policy
logic. A bitemporal fact substrate gives the product a coherent core where every submission, requirement,
integration result, document signature, and workflow transition is queryable with provenance.

The architecture is also unusually compatible with safe AI. The model never writes SQL or mutates state
directly. It emits query ASTs or proposed definition facts; the compiler, validator, authorization layer,
plan/preview, and human approval gate the result.

The practical path is not heroic: collapse policy into automation semantics first, add custom fields on
native records, shadow reuse, then migrate one low-risk slice with projections. If each step proves value,
the platform grows. If not, the product still gained useful pieces.

---

## 5. Strawman

The weakest version of this direction:

The team spends quarters implementing an elegant internal substrate while customers mostly need faster,
clearer onboarding workflows. EAV erodes database-level safety, Prisma ergonomics, query simplicity, and
performance. Projections reintroduce bespoke tables. The transaction log needs a full workflow runtime.
Generated UIs feel worse than hand-built flows. Bitemporality makes privacy and deletion harder.

Instead of replacing complexity, the product accumulates another layer: legacy tables remain the source
of truth, triples power demos and edge cases, projections power hot paths, and shadow code never goes
away. Debugging requires understanding all of them.

In that version, the main win is architectural aesthetics, and the cost is product velocity.

---

## 6. Recommendation

Greenlight the direction as a sequence of measured bets:

1. Keep `/preview/triples` as a sandbox and validation surface, not a product-critical dependency.
2. Use triples for custom fields on native records before moving any native type fully.
3. Build `policyToFlow()` and shadow policy evaluation against the existing compliance path.
4. Shadow the generated reuse query against `getDuplicateTask` and `Task.reuseCriteria`.
5. Move one integration-owned EAV/config model behind the existing integration service API.
6. Add projection drift checks before projections become correctness-critical.
7. Require every expansion to ship with a deletion plan for the old path.

Do not greenlight a broad migration of employees, placements, tasks, or forms into triples until these
slices prove correctness, latency, and product value.

---

## 7. Alternatives

### 7.1 Native tables + stronger custom fields

Keep core entities native. Build a typed custom-field system with audit, validation, indexing, and
projections. This solves much of the configurability problem without making facts the substrate.

Best when the product mostly needs custom fields, not customer-defined object graphs.

### 7.2 Unified Flow engine without storage migration

Collapse policies and automations into one Flow-like engine while keeping existing tables. This is likely
the best first move because it targets duplicated business logic without taking on EAV performance and
migration risk.

Best when workflow complexity is the acute pain.

### 7.3 Config IR over existing tables

Create a shared IR for forms, policies, automations, library items, and account config. Persist compiled
projections into existing tables. This gets config-as-code, plan/apply, AI authoring, and better upgrade
semantics without universal triples.

Best when authoring and upgrade workflows are the main opportunity.

### 7.4 Integration module manifests over current storage

Let integrations declare schema/config manifests and migrations while keeping their current storage
model. Gradually move selected integration-owned data into facts only where it helps.

Best while the logical-vs-physical isolation decision is still open.

### 7.5 Event bus standardization first

Standardize `broadcastEvent`, integration subscriptions, and future `TripleTransaction` triggers behind
one event envelope. This prepares the Flow direction without forcing immediate storage changes.

Best when operational reliability and trigger consistency are the main constraints.

---

## 8. Decision criteria

The direction should expand only when the next slice can answer "yes" to most of these:

- Does it remove a real customer or engineering bottleneck?
- Can it run in shadow before it becomes source-of-truth?
- Is there a narrow correctness oracle against the current product?
- Is the hot read path projected or measured safe?
- Is authorization enforced at the compiler/write-path chokepoint?
- Is PII retention/erasure understood for the data involved?
- Does the slice delete or simplify existing code after cutover?
- Would the product still be better if the broader triple-store vision stopped here?

The last question is the guardrail. Each step should be independently worth shipping.

---

## Decisions (resolved)

- ✅ **The vision is directionally valuable**, especially for configurability, compliance provenance,
  workflow unification, integration-owned schema, and safe AI authoring.
- ✅ **The end state must remain hybrid**: facts for flexibility and history; projections/native tables
  for hot reads and analytics.
- ✅ **The first useful bets should avoid storage migration** where possible: policy-as-Flow, event
  surface unification, reuse shadowing, and custom fields on native records.
- ✅ **No broad lift-and-shift.** Existing tables stay source-of-truth until a slice is shadowed,
  measured, flag-gated, and has a deletion path for the old implementation.

## Open

- ❓ Which customer segment most needs custom objects rather than custom fields?
- ❓ What is the exact operational contract for transaction-log-driven Flows?
- ❓ What projection drift tooling is required before compliance/status reads depend on facts?
- ❓ What is the default source-of-truth stance for config-as-code vs. dashboard edits?
- ❓ Should integration-owned facts live centrally behind logical namespaces, or physically inside
  integration-owned stores?
