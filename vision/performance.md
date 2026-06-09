# Vision — The Hybrid Read Path: Projections & Promotion

> **MetaCRDT primitive →** _derived coherence_ — projections are bounded folds; the compiler chooses which to materialize. See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). The concrete answer to the loudest
> objection raised in [`triples.md`](./triples.md) §6. Builds on `../PLAN.md` §1 (indexes) and §8
> (promotion), and connects to [`workflows.md`](./workflows.md) (the reuse `@>` index) and
> [`library.md`](./library.md) (the executable-definition projection).

> **Convex update (decided — reframe):** the hybrid conclusion stands, but the SQL-specific mechanics do
> not. On Convex there is **no native-column promotion** and **no GIN `@>` index**; indexes are on declared
> fields only, so **arbitrary EAV attribute filtering is infeasible** without a covering index. The Convex
> answer: hot reads hit **separate projection tables** (`currentFacts` is the first) or **narrow
> `(type, attr[, value]) → entity` secondary-index tables**, maintained on write and rebuildable from the
> log. "Promote by measurement" → "add a projection table for this access pattern" (explicit, not a
> cost-based planner — there is none). Erasure/erasability and pagination also differ; see
> [`convex.md`](./convex.md) §§1–2.

A placements list that is one indexed scan today becomes a 6+ way self-join over `triples`. That is a
real regression on hot paths, and it is the reason the end state is **hybrid, not pure-EAV**. This doc
makes the hybrid concrete: **facts are the source of truth; hot reads hit derived projections; the
compiler chooses.**

> Status: **design depth.** End-state and migration path kept separate.

---

## 0. The thesis

> Store as facts. Read from projections. Choose at the compiler. Promote by measurement.

Every other doc in the set leans on this sentence — it is what lets "everything is a fact" coexist with
sub-100ms list views. A projection is **derived, rebuildable, droppable** state materialized from the
fact/transaction log; the raw triples remain the authority.

---

## 1. Projections are the core technique

A projection materializes hot facts into a shape the database is fast at. Three forms, in increasing
specificity:

- **Per-type wide-row tables** — one row per entity, columns = that type's hot attributes (e.g.
  `employee_projection(uid, name, email, status, …)`). List/detail reads hit this like a normal table;
  it _is_ the native table we have today, but **derived from facts** instead of being the source.
- **Attribute/value indexes** — the account-scoped composite EAV indexes from `PLAN.md` §1 (E→A,
  reverse-REF, AV-string, AV-number) for queries that stay on raw triples.
- **Purpose-built indexes** — e.g. the reuse-match `p.facts @> t.reuse_criteria` GIN index
  (`workflows.md` §6.2), or rollup tables for analytics (§7).

The vision already relies on several projections without always naming them: the reuse `@>` index, the
compiled executable Flow/form (`library.md` §1), and the Phase 3 per-account schema cache. They are all
the same idea.

---

## 2. Promotion: what graduates to a projection

Not every attribute earns a column. **Promotion is by measurement** (`PLAN.md` §8 step 4):

- **Promote**: attributes that are filtered, sorted, displayed in list views, or aggregated in
  analytics — the query-hot set per type.
- **Leave as raw triples**: cold/rare attributes, long-tail custom fields, history.

Promotion is reversible and observable: a hot attribute graduates to a projection column; a cold one can
be demoted. The list of promoted attributes per type is itself config (and could be facts), so the
hybrid boundary is _tunable_, not hard-coded.

---

## 3. Maintenance: projections are updated from the transaction log

A projection is a function of the fact log, so maintaining it is **a system Flow** (the reconciler
pattern, `workflows.md` §6.4) subscribed to the relevant tx patterns. Two modes, chosen per projection:

- **Synchronous** — the write transaction also updates the projection, atomically. Consistent, at the
  cost of write amplification. Required where reads must never be stale (e.g. the obligation hot path).
- **Asynchronous** — eventually-consistent with a bounded staleness budget. Fine for analytics, search,
  dashboards.

Because the log is bitemporal and complete, any projection is **deterministically rebuildable** from it
— the repair story for drift (§8) and the bootstrap story for a newly-promoted attribute (replay the log
to backfill the column).

---

## 4. The planner chooses — at the one compiler

Every read is an AST (`triples.md` §5) compiled at one place, so projection-vs-raw is a **single, central
optimization**, not scattered query-tuning:

- If all referenced attributes are projected for the type → compile to a projection-table query (fast
  path).
- If some are cold → self-join raw triples for those, optionally joined to the projection for the rest.
- The principal's authorization predicates (`authorization.md` §4) are injected here too — so authz and
  performance share the rewrite stage.

One chokepoint means one place to make the cost decision well, and one place to test it.

---

## 5. Indexing & the bitemporal hot case

- **Account-first composite indexes** (`PLAN.md` §1) so a tenant's working set stays contiguous and no
  query scans across tenants.
- **Partial indexes for current facts** (`WHERE valid_to IS NULL`) — the 99% case is "current state,"
  and it should be cheap.
- **GIN** for JSON/containment (reuse match, JSON attributes).
- **Keyset/entity-pivot pagination** (`PLAN.md` Phase 2 §12) so "20 employees" means 20 entities under
  fan-out, with a total cursor.
- **Bitemporal cost is opt-in.** Current-fact reads ride the partial index; `asOf`/history is colder and
  can be slower — by design, you don't pay temporal cost on the hot path.

---

## 6. Analytics & exports

Existing Kysely analytics (`getTrends`, distributions) assume native columns and would be painful over
raw EAV. They run over **per-type projection tables and rollups**, not triples — aggregations
(`count/sum/avg/group-by`, `PLAN.md` Phase 3+ menu) target the projected columns. Exports and reporting
consume the same stable projected shapes, insulating downstream consumers from the EAV core.

---

## 7. Honest trade-offs & sharp edges

- **Projections are derived state that can drift.** Bugs, missed events, or async lag make a projection
  disagree with the facts. You need drift **monitoring** and a **rebuild-from-log** repair path — and to
  treat the facts, never the projection, as truth in any dispute.
- **Write amplification.** Synchronous projections multiply write cost; choose sync only where staleness
  is unacceptable.
- **The hybrid boundary is a maintenance burden and a bug surface.** Two representations of the same data
  is exactly the kind of duplication that rots; the discipline is "projection is a pure function of the
  log," enforced and tested, not hand-maintained.
- **Analytics over EAV is genuinely hard** — projection tables make it tractable but add ETL-like
  machinery.
- **The planner adds complexity.** A cost model that picks projection vs. raw is real engineering; start
  with simple "all-referenced-attrs-projected → fast path, else raw" and refine by measurement.

The conclusion is the set's recurring one: **hybrid by necessity, not by compromise.** A pure-EAV product
would be elegant and slow; a pure-native product is what we have and is rigid. The projection layer is
how we get the configurability without the regression.

---

## 8. Tactical path (conservative)

- **Stage P0 — Measure.** Instrument the candidate hot paths (placements/employees list, placement
  progress) on the real query shapes before promoting anything.
- **Stage P1 — First projections.** The two the vision already needs: the reuse `@>` index
  (`workflows.md` §6) and a per-type wide-row projection for one list view. Maintain synchronously from
  the tx log; diff against the native-table results.
- **Stage P2 — Planner fast path.** Teach the compiler the "all-referenced-attrs-projected → projection
  query" rule; fall back to raw triples otherwise.
- **Stage P3 — Analytics rollups + async maintenance** for the reporting paths, with a staleness budget
  and rebuild-from-log repair.

---

## Decisions (resolved)

- ✅ **Facts are truth; projections are derived; the compiler chooses; promote by measurement.** (§0–§4)
- ✅ **Projections maintained from the tx log** (sync where staleness is unacceptable, async otherwise),
  deterministically rebuildable. (§3)
- ✅ **Current-fact reads on partial indexes are the hot path; `asOf` is colder by design.** (§5)
- ✅ **Analytics run over projection tables/rollups, not raw EAV.** (§6)
- ✅ **Hybrid is the intended end state**, not a transitional compromise. (§7)

## Open (non-blocking)

- ❓ Projection definition: hand-authored vs. derived from the promoted-attribute list vs. fully
  declarative (a projection is a saved query materialized).
- ❓ Sync vs. async per projection — what's the staleness budget for each read path?
- ❓ Planner cost model sophistication — heuristic vs. statistics-driven.
- ❓ Interaction with `authorization.md` §4: does the visible-subjects sub-join run against projections
  too, or only raw triples?
