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

## Open questions

- Value normalization for index keys (entity refs vs scalars vs JSON) — needed for stable `by_a_v` lookups.
- Cardinality-many retraction semantics when only one of several values should end.
- How `currentFacts` tracks valid-time "now" as wall-clock advances (future-dated `validFrom`).
- Whether `derivedFacts` should themselves be queryable via Datalog (stratification).
