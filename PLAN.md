# PLAN.md — Convex Bitemporal Triple Store + Datalog Engine

Implementation plan. Read alongside [README.md](./README.md) for concepts.

## Feature backlog

Running checklist — check items as they ship, add freely. `[x]` done, `[ ]` planned.
Grouped by theme; ordering within a group is rough priority.

### Core store (shipped)

- [x] Bitemporal fact model (transaction time + valid time)
- [x] Append-only `factEvents` as source of truth; `facts`/`currentFacts`/`derivedFacts` as projections
- [x] `rebuildProjections` — fold the log to regenerate facts/currentFacts/derived; replay property test
- [x] assert / retract / tombstone / correct, each producing a transaction
- [x] `defineAttribute` + cardinality-one enforcement
- [x] `getEntity`, bitemporal `queryFacts`, `history`
- [x] `entityAsOf` + `compareFacts` (M6)
- [x] Tests (vitest + convex-test); deployed to `chatty-hare-94`

### Datalog engine (shipped)

- [x] Indexed nested-loop joins, dynamic selectivity planning
- [x] Comparison predicates (`> < >= <= == !=`)
- [x] Negation (`{ not: [...] }`) with safety check
- [x] Query facts ∪ materialized derived facts
- [x] `explainDatalog`; LIMITS guardrails
- [x] Aggregation: `count` / `countDistinct` / `sum` / `avg` / `min` / `max` with group-by
- [ ] General recursion (stratified rules, fixpoint over `derivedFacts`)
- [ ] Computed/built-in predicates: arithmetic, string ops (`contains`, `startsWith`)
- [ ] Disjunction (`or`) within a query
- [ ] Engine-level result pagination / streaming (true cursor)
- [ ] `select` with computed/bound expressions

### Compliance engine (first vision slice — shipped)

- [x] Obligations-as-facts: requirement rules emit `requires.<form>` keyed by scope entity
- [x] Reuse-as-scope-key: one submission satisfies all placements sharing a scope (dedup + provenance merge)
- [x] Tasks via negation: `requirement ∧ ¬submitted` → `task.<form>`, with provenance ("why open")
- [x] Guarded requirements (forklift quiz only for forklift jobs)
- [x] Valid-time expiry: submissions carry `validTo`; a **cron** re-materializes lapsed obligations
- [x] Demo domain (staffing: worker/employer/client/job/venue + placements) + reactive Compliance UI
- [x] Collect-step Flow runner: issue → park (`waiting`) → resume on the matching
  submission fact (event path) → complete; reminder/escalate/expire **scheduler timer
  ticks**; durable `flowRuns` + append-only `flowEvents`; reactive Flows UI
- [x] External collection: `defineForm` (fields as a fact) → **isolated magic-link page**
  (`/collect?token=`) renders the fields → submit saves field facts + the submission
  marker → the event path resumes the flow & clears the obligation
- [x] General Flow **DAG** runner: `defineFlow`/`startFlow`/`advanceFlow` interpreter with
  step types assert / collect / notify / branch / action / wait / done; parking steps resumed
  by the event path, scheduler ticks, or an action callback; onboarding demo flow + reactive UI graph
- [x] **action** step = external boundary (mock E-Verify; would `fetch` a vendor) → result fact → resume
- [ ] Reify obligations into entities for per-obligation status/assignment (only if needed)
- [ ] Real external integration (live `fetch` in an action step) as a Convex component
- [ ] Rule→rule cascade (task rules currently re-derive over base facts to avoid chaining)

### Rules & materialization (shipped + next)

- [x] `defineRule` → derived facts; entity-local incremental recompute
- [x] `ruleInvalidations` queue
- [x] Transitive-closure rules (`defineTransitiveRule`)
- [x] Semi-naive closure delta on edge **addition**
- [ ] Semi-naive closure **deletions** (DRed / counting) instead of full recompute
- [x] Provenance: `sourceFactIds` populated for rules + closures; `explainDerived`
  lineage query (source facts + asserting transaction) + "why?" UI
- [ ] True `sync` (in-transaction) materialization
- [ ] Cross-entity datalog rules recompute incrementally (dependency graph)

### Schema as facts / meta-circularity (shipped)

- [x] Model attribute definitions as bitemporal triples (the `attributes` table is gone)
- [x] Model type definitions / type shape as facts (`defineType`, `hasAttribute`)
- [x] `typeSchemaAsOf(txTime, validTime)` — historical entity-type shape
- [x] Attribute lifecycle queries — when an attribute was added / removed / redefined
- [x] Schema-change audit via the fact log (`attributeLifecycle`, `retireAttribute`)
- [x] Self-describing meta-attributes (`bootstrapSchema`); cardinality is itself a fact
- [ ] Enforce a type's declared `hasAttribute` shape on assert (strict mode)
- [ ] Surface schema history in the demo UI

### Bitemporal UX / demo

- [x] Hosted demo via `@convex-dev/static-hosting`
- [x] Entities browser: type list, dynamic query builder → Datalog, cursor pagination, sort/filter
- [x] Two-axis time-travel UI (txTime + validTime) + as-of state with per-fact provenance
- [x] Fact-history timeline view for an entity (`entityTimeline`)
- [x] `entityFactsAsOf` — as-of state annotated with asserting transaction
- [ ] Thread `(txTime, validTime)` through `getEntity` / `typeAttributes` / `queryEntities` too
- [ ] `compareFacts` "now vs then" diff in the UI
- [ ] Seed-data loader + guided demo tour

### Integrity / correctness

- [ ] Schema enforcement on assert (validate value vs `valueType`; enforce `unique`; strict-mode unknown-attribute rejection)
- [ ] Inverse attributes (auto-maintain reverse edges; `inverseAttribute` field already exists)
- [ ] Referential integrity for `entityRef` values
- [ ] Constraints/invariants as first-class rules with severity
- [ ] Value normalization so `by_a_v` is sound for all value types (objects, dates)

### Scale / performance

- [ ] Denormalized counts (avoid `collect().length` scans, e.g. `listEntityTypes`)
- [ ] Batched/self-continuing materialization for large rules
- [ ] DB-cursor pagination for `queryEntities` (stop re-running per page)

### Operational / product

- [ ] **Auth + write authorization** (live site currently accepts public writes)
- [ ] Branching (`branchId` exists, unused): what-if worlds + merge
- [ ] Full-text search on string values (Convex search index)
- [ ] Bulk import / export

## Guiding design rules

1. Never physically delete source facts by default.
2. `factEvents` is the append-only **source of truth**.
3. `facts` is a **rebuildable projection** of the log (bitemporal interval state,
   read-optimized); patched in place with lifecycle fields, but reconstructable
   via `rebuildProjections`. Write-time-only metadata (source, lineage) lives here.
4. Treat `currentFacts` as a disposable projection (now-view of `facts`).
5. Treat `derivedFacts` as a disposable projection (fold of `facts` + rules).
6. Keep live Datalog **bounded**; never run recursion in a reactive query.
7. Materialize expensive / recursive logic asynchronously.
8. Separate valid time from transaction time everywhere.
9. Tombstone assertions — don't pretend they never existed.
10. Every mutation produces a `transactions` row.

## Convex constraints that shape the design

- Reactive queries must read through declared indexes (`withIndex`) for performance, not scans.
- A query's reactivity tracks the documents it reads — keep live Datalog result sets bounded so re-execution stays cheap.
- Mutations are transactional: append to log + update projections atomically in one handler.
- Use `ctx.scheduler.runAfter` + internal mutations for async materialization.
- `v.any()` for values is pragmatic now; tighten per-attribute typing later via `attributes`.

## Repository layout (target)

```
convex/
  schema.ts
  facts.ts        # assertFact, retractFact, tombstoneFact, correctFact,
                  # queryFacts, getEntity, history
  datalog.ts      # datalog, explainDatalog, compileQuery
  rules.ts        # defineRule, recomputeRule, recomputeEntityRules
  lib/
    visibility.ts # isVisible() predicate, shared by queries
    planner.ts    # normalize + plan + clause selectivity
    join.ts       # in-memory binding join + projection
  internal/
    materialize.ts # processRuleInvalidation, recomputeDerivedFacts, processFactChange
PLAN.md
README.md
```

## Status (2026-06-03)

M1–M6 are implemented, deployed to `chatty-hare-94`, and covered by tests
(`npm test`, 25 passing). Done: full schema; assert/retract/tombstone/correct;
currentFacts projection; `defineAttribute` (cardinality-one now enforced);
getEntity / queryFacts / history; bounded non-recursive Datalog + explain;
rules with **incremental, entity-scoped** materialization (full recompute for
cross-entity rules) driven by the `ruleInvalidations` queue; and M6
`entityAsOf` / `compareFacts`. Remaining: see "Still open" below.

## Milestones

### M0 — Scaffold
- [ ] `npm create convex@latest` (or init in place), `npx convex ai-files install`.
- [ ] `npx convex dev --once` to provision a local backend.
- [ ] Commit baseline.

### M1 — Schema (`convex/schema.ts`)
Define all tables with indexes:
- [ ] `transactions` — `by_txTime`, `by_actor`.
- [ ] `factEvents` — `by_tx`, `by_e_a_tx`, `by_a_tx`.
- [ ] `facts` — `by_e_a`, `by_e_a_validFrom`, `by_a`, `by_a_validFrom`, `by_a_v`, `by_a_v_validFrom`, `by_assertedAt`, `by_retractedAt`, `by_tombstonedAt`.
- [ ] `currentFacts` — `by_e`, `by_e_a`, `by_a`, `by_a_v`, `by_e_a_v`.
- [ ] `attributes` — `by_name`.
- [ ] `rules` — `by_name`, `by_enabled`.
- [ ] `derivedFacts` — `by_rule`, `by_e_a`, `by_a_v`, `by_stale`.
- [ ] `ruleInvalidations` — `by_rule_processed`.

### M2 — Write path (`convex/facts.ts`)
- [ ] `assertFact` — create tx, append event, insert interval, upsert `currentFacts`.
- [ ] Cardinality-one handling: when `e+a` has a current visible fact, retract it (set `retractedAt`, optionally `validTo`) before inserting the new one.
- [ ] `retractFact` — append event, patch `retractedAt` (+ optional `validTo`), remove/update `currentFacts`, mark affected `derivedFacts` stale.
- [ ] `tombstoneFact` — append event, patch `tombstonedAt`/`tombstoneTxId`/reason, remove from `currentFacts`, mark dependents stale.
- [ ] `correctFact` — tombstone old + assert new + link `supersedes`/`supersededBy`.

### M3 — Read path
- [ ] `lib/visibility.ts` — `isVisible(fact, txTime, validTime, opts)`.
- [ ] `getEntity({ e })` — collect `currentFacts` by `by_e`, group into attribute map (respect cardinality).
- [ ] `queryFacts({ e?, a?, v?, txTime?, validTime?, includeTombstoned? })` — pick the most selective index from the bound terms, filter with `isVisible`.
- [ ] `history({ e, a? })` — walk `facts` / `factEvents` for an entity's timeline.

### M4 — Datalog (bounded, non-recursive)
- [ ] `lib/planner.ts`:
  - normalize: parse `?vars`, validate attributes, classify const vs var.
  - plan: order clauses by selectivity — `[e,a,v]` > `[e,a,?]` > `[?,a,v]` > `[?,a,?]` > `[e,?,?]`.
  - reject recursion / unsupported clauses on the live path.
- [ ] `lib/join.ts` — fetch candidates per clause via the chosen index, unify bindings, project `select`.
- [ ] `datalog` query — drive plan → fetch → join, enforce limits (`maxClauses`, `maxIntermediateRows`, etc.).
- [ ] `explainDatalog` — return the chosen plan without executing.

### M5 — Rules & materialization
- [ ] `rules.ts: defineRule` — persist a rule (`where`, `emit`, `dependsOnAttributes`, `materialization`).
- [ ] Invalidation: on fact change, find rules depending on the changed attribute, enqueue `ruleInvalidations`, mark prior `derivedFacts` stale.
- [ ] `internal/materialize.ts: processFactChange` / `recomputeDerivedFacts` — scheduled recompute via `ctx.scheduler.runAfter(0, ...)`.
- [ ] Wire `assertFact`/`retractFact`/`tombstoneFact` to schedule materialization.

### M6 — Bitemporal ergonomics
- [ ] `compareFacts({ e, a, before, after })` — diff beliefs across two bitemporal coordinates.
- [ ] `asOfTx` / `asOfValid` / `asOfBoth` helpers.

## MVP cut (build in this order)

1. `schema.ts`
2. `assertFact`
3. `retractFact`
4. `tombstoneFact`
5. `currentFacts` projection
6. `getEntity`
7. `queryFacts` with `txTime` + `validTime`
8. tiny non-recursive Datalog
9. rule materialization
10. correction / supersession

**Deferred (not in MVP):** branching/`branchId`, recursive Datalog, query cache,
advanced planner/cost model, inverse attributes, distributed partitions.

## Testing strategy

- Unit-test `isVisible` against the four-quadrant bitemporal matrix (asserted/retracted × valid/invalid).
- Property test: replaying `factEvents` reconstructs `facts` and `currentFacts`.
- Datalog: golden tests on `explainDatalog` plans + result correctness on a fixed fixture graph.
- Limit tests: queries exceeding `maxIntermediateRows` throw cleanly.

## Datalog capabilities (2026-06-03)

The engine now supports, in bounded live queries:

- **Fact patterns** `[e, a, v]` joined via indexed nested loops.
- **Comparison predicates** `[term, op, term]` for `> < >= <= == !=`.
- **Negation** `{ not: [e, a, v] }` (safe: negated vars must be bound first).
- **facts ∪ derivedFacts** — materialized rule output (incl. transitive
  closures) is transparently queryable as ordinary attributes.
- **Transitive closure rules** via `defineTransitiveRule`, materialized async by
  a bounded BFS fixpoint and recomputed on base-attribute changes.

Join order is dynamic (selectivity-driven); filters run as soon as their
variables bind. `explainDatalog` classifies clauses without executing.

## Still open

- **Incremental recompute is entity-local only.** Cross-entity datalog rules
  and all closure rules still trigger a full recompute on any dependency
  change. A dependency graph keyed by the joined entity would let those
  recompute incrementally too.
- **Closure deletions are still full recompute.** Edge additions now take a
  semi-naive delta, but retraction/tombstone/correction of a base edge rebuilds
  the whole closure (deletions can invalidate arbitrary pairs). A
  counting/provenance scheme (e.g. DRed) would make deletions incremental too.
- **`queryEntities` re-runs per page.** Cursor pagination recomputes the full
  (bounded) result set each page and slices it, rather than streaming from a
  DB-level cursor — fine at demo scale, not for large types.
- **Valid-time succession for cardinality-one** is caller-driven: auto-replace
  only supersedes in transaction time. A `validFrom`-aware assert that closes
  the prior interval in valid time would be a useful convenience.
- **`sync` materialization** is treated like `async` (always scheduled). True
  synchronous, in-transaction derivation isn't wired up yet.

## Vision alignment & Convex feasibility (2026-06-04)

Findings from reviewing [`vision/`](./vision) against what we've built. Full technical rebasing in
[`vision/convex.md`](./vision/convex.md); this is the decision record.

**Verdict.** The vision's *model* is coherent and **already substantially demonstrated** here: facts,
two-axis bitemporality, schema-as-facts, a Datalog query engine, reactions/materialization with
provenance, and rebuildable projections all exist. The vision's *substrate assumptions* — Postgres /
Prisma / Kysely (SQL), Effect-TS DSLs, and a NATS/BullMQ event bus — do **not** match Convex and are
rebased, not adopted. The model survives; the mechanism changes.

**Already shipped (vision called several of these "eventually"):**
- Configurable type/attribute registry → **schema-as-facts** (defs are triples, not a side table).
- Bitemporal → **two-axis** (transaction time *and* valid time); richer than the docs' `validFrom`/`validTo`.
- Queries-are-data → Datalog AST over **indexed Convex reads**; tx log → append-only `factEvents` source of
  truth with rebuildable projections; provenance via `sourceFactIds`/`explainDerived`.

**Reframes (decided — see convex.md):**
- "Datalog AST → one SQL statement" → **nested-loop joins in JS over declared indexes**. No planner, no
  DB joins, **no arbitrary EAV filtering** (filter/sort needs a covering index/projection).
- "Promote hot attribute to a native column / GIN" → **separate projection tables / narrow secondary
  indexes**; Convex can't index dynamic attribute values.
- "tx log = live event bus" → server reactions run off **`factEvents` + scheduler/materialization**;
  Convex reactivity is free only for **client reads** (a real win for generated UIs), not server triggers.
- Effect `Schema`/DSLs/`HttpApi` → **Convex validators, TS builders, components**.
- Integration = bounded context → **Convex component** (structurally isolated; cleaner than namespace
  tags + a compiler join-guard). Effect migration → component schema + **batched migration mutation**.

**The constraint the vision omits.** A Convex mutation is a **single transaction with hard read/write
limits**. Every store-sweeping operation — the compliance **reconciler**, config **`apply`**, projection
**rebuild**, bulk migration — must be a **batched, resumable, scheduler-driven job**, never one atomic
statement. This is the operational contract to get right first (the reconciler is the proving ground), and
it's the risk the vision most under-weights.

**Cuts (decided):**
- **JIT-compiled per-account `HttpApi`** (`api.md`) — cut. Convex types are per-deployment at codegen time,
  not per-account at runtime. Replace with one **dynamic `httpAction`** validating against the registry at
  runtime; optionally emit OpenAPI from the registry as data for offline codegen.
- **Cost-based projection planner**, **GIN `@>` reuse-match index**, **column promotion** — cut; explicit
  projection tables instead.
- **Request-time multi-hop graph authorization** — cut for v1; precompute per-principal visible-subject
  projections. Authz enforced in function code (no row-level security).
- **Crypto-shredding as primary erasure** — downscope; Convex **hard-delete** makes erasure feasible
  directly. Keep crypto-shred for file blobs only.
- **Data residency** — defer (a Convex project is one deployment; residency = separate per-region deploys).
- **General `Flow` DAG runner first** — defer; ship the **reconciler** as a scheduler-driven state machine,
  or adopt the Convex Workflow component. Accept async (scheduler-latency) obligation production.

**Maps cleanly, keep:** notifications/timers → scheduler+crons; documents/e-sign → file storage+actions;
generated UIs → projection of schema-as-facts (reactive for free); AI → AST validation + actions + provenance
facts; the migration discipline and permanently-hybrid end state.

**Suggested next slice (highest leverage):** ~~the compliance reconciler~~ **— SHIPPED.** The compliance
engine slice is built (obligations-as-facts, reuse-as-scope-key, tasks-via-negation with provenance,
guarded requirements, valid-time expiry via cron, reactive UI). Next: the **async collection step**
(send-form-link / E-Verify) is the natural pull into a general **Flow runner** (scheduler-driven step
graph) — the deferred-hard piece this slice intentionally stopped short of.

## Open questions

- Value normalization for index keys (entity refs vs scalars vs JSON) — needed for stable `by_a_v` lookups.
- Cardinality-many retraction semantics when only one of several values should end.
- How `currentFacts` tracks valid-time "now" as wall-clock advances (future-dated `validFrom`).
- Whether `derivedFacts` should themselves be queryable via Datalog (stratification).
