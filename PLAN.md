# PLAN.md — Convex Bitemporal Triple Store + Datalog Engine

Implementation plan. Read alongside [README.md](./README.md) for concepts.

## Guiding design rules

1. Never physically delete source facts by default.
2. Keep `factEvents` append-only.
3. Treat `facts` as canonical interval records (only patched with lifecycle fields).
4. Treat `currentFacts` as a disposable projection.
5. Treat `derivedFacts` as a disposable projection.
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

## Still open

- **Incremental recompute is entity-local only.** Cross-entity rules (a clause
  whose subject is a variable other than the emitted entity) still trigger a
  full recompute on any dependency change. A dependency graph keyed by the
  joined entity would let those recompute incrementally too.
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
