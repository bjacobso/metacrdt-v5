# Vision — The Triple Store as the System's Substrate

> **MetaCRDT primitive →** _facts + the bitemporal fold_ — the substrate itself. See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). This is the **foundation** the other
> docs stand on: [`workflows.md`](./workflows.md) and [`integrations.md`](./integrations.md) both
> assume the substrate described here. The concrete proof-of-concept lives in
> [`../../PLAN.md`](../../PLAN.md); this doc is the _why it's the foundation_, in the same voice.

> Status: **vision.** `PLAN.md` is the build spec for the first slice; this captures the end-state the
> slice is reaching toward and the discipline for getting there. "Build now vs. keep the door open"
> applies throughout.

> **Convex update (decided):** this doc assumes a Prisma/SQL substrate. The PoC is on **Convex** — see
> [`convex.md`](./convex.md). Net: the four model elements (§1) and four properties (§2) hold and are
> built; the self-describing meta-schema (§4) is **shipped, not "eventually"**; the query model (§5)
> compiles to **indexed Convex reads, not SQL**; and the hot-path trade-offs (§6) are resolved with
> **projection tables**, since Convex can't promote attributes to native columns. Inline `Convex update`
> notes flag the specifics below.

---

## 0. Thesis: one substrate, not five

Today the application is a constellation of hardcoded tables (`employers`, `employees`, `placements`,
`tasks`), each with its own bespoke machinery bolted on — policies, automations, forms, integration
tables — and each schema change gated on a global Prisma migration. The thesis of this whole vision
set is:

> **A single configurable, bitemporal fact store — whose transaction log is the system's event bus —
> can be the substrate the entire product is built on.** Domain objects, their history, the reactions
> to their changes, and the integrations that feed them all become _the same kind of thing_: facts and
> reactions over facts.

`PLAN.md` proves the storage + query + time-travel mechanics on a thin slice. This doc argues why that
slice is worth generalizing, and what becomes possible once it is.

**Goals of the substrate**

- Customer-configurable object types & fields (Salesforce custom objects / Attio / Airtable), not
  hardcoded tables — see `PLAN.md` §8 north star.
- Bitemporal by construction: every fact has validity, every change is a transaction → audit and
  time-travel for free.
- A queryable transaction log that doubles as the **event bus** for all reactions.
- One query model expressive enough for the joins our list/detail views and reuse logic need.

**Non-goals**

- Replacing every hot read path with raw EAV (it would regress performance — §6). The end state is
  **hybrid**, not pure-triples.
- A bare graph database customers assemble semantics from scratch on. The product ships a rich,
  intrinsic model (see ownership tiers, `workflows.md` §2.5).

---

## 1. What the substrate is

Four model elements (concrete Prisma in `PLAN.md` §1):

- **`EntityType` + `Attribute` registry** — the configurable meta-schema. Attributes are namespaced
  `type/field` (`employer/name`, `placement/employee`), with `valueType`, `cardinality`, `required`,
  and REF targets, validated against the registry.
- **`Triple`** — the core fact: `(subject, attribute, value)`, scoped per tenant (`accountId`), with
  exactly one typed value column per `valueType` (string / number / bool / datetime / REF / …).
- **Bitemporal validity** — `validFrom` / `validTo` tombstones (never a boolean `isDeleted`). Retraction
  closes an interval; nothing is destroyed.
- **`TripleTransaction`** — a first-class, queryable transaction grouping the facts written together
  (`PLAN.md` §13). This is the seed of the event bus (§3).

Everything else in the vision is a _use_ of these four.

---

## 2. The four properties that make it a foundation

Each property is the hook one of the other docs hangs on. They are why this is a substrate and not
just another table.

1. **Configurable schema.** Types and fields are data in a registry, not columns in `schema.prisma`.
   New objects and fields need no migration. → _Unlocks customer-defined domains and integration-owned
   schemas._
2. **Bitemporal facts.** History is intrinsic. `asOf` answers "what was true then?" and "what did we
   believe then?" → _Unlocks audit, compliance time-travel, and free versioning of both data and
   schema._
3. **Transaction log = event bus.** Every write emits a tx; reactions subscribe to tx patterns (§3). →
   _Unlocks the unified `Flow` reaction model (`workflows.md`) and integration inbound/outbound Flows
   (`integrations.md`)._
4. **Homoiconic & queryable.** Definitions are themselves facts (§4); the query model is data (§5). →
   _Unlocks self-describing schema, generated queries (reuse, list views), and a uniform contract for
   modules._

---

## 3. The transaction log is the spine

The single most load-bearing reframe in the whole set: **stop thinking of the tx log as an audit
byproduct and treat it as the system's event bus.**

- Today reactions ride a bespoke `broadcastEvent` → NATS/BullMQ path with hand-rolled event types
  (`task.created`, `placement.updated`).
- In the substrate, _every_ `assertFact`/`retractFact` lands in `TripleTransaction`. A reaction's
  trigger is a **standing pattern over that feed** — "fire when a fact `(any placement,
placement/status, *)` is asserted."

This is what lets `workflows.md` collapse policies + automations into one `Flow` primitive (their
triggers become tx-feed subscriptions) and lets `integrations.md` model upstream/inline/downstream as
inbound/outbound Flows. `PLAN.md` Phase 3 already lists "change feed / subscriptions (tx log →
webhooks)" as a direction — this elevates it to the architectural keystone.

---

## 4. Self-describing & meta-circular (the end-state)

> **Convex update (shipped):** this end-state is **built**, not deferred. `attr:<name>` / `type:<Name>`
> entities carry the schema as facts; `bootstrapSchema` installs the self-describing meta-attributes
> (cardinality is itself a fact, with a hardcoded bootstrap breaking the chicken-and-egg); and
> `attributeLifecycle` / `attributeAsOf` / `typeSchemaAsOf` make schema history and as-of shape queryable.
> The "per-account in-memory cache" is unnecessary — a `currentFacts` lookup resolves cardinality.

`PLAN.md` Phase 3 §23–§26 sketches the destination: **the meta-schema moves into the store.** A type
is an entity of `meta/type`; an attribute is an entity of `meta/attribute` whose facts are
`attribute/valueType`, `attribute/cardinality`, etc. A small bootstrap of primordial facts (the
attributes that describe attributes) resolves the chicken-and-egg, Datomic-style; a per-account
in-memory cache keeps resolution ~free.

Payoffs that the other docs depend on:

- The schema browser becomes _just a query_; UI hints, validation, and descriptions are more facts.
- **Schema versioning = data versioning** (`PLAN.md` §26): a `STRING`→`INTEGER` migration is a
  versioned transaction + a coercion step, with the old schema + data still queryable via `asOf`. This
  is exactly what `integrations.md` §3 builds its per-module migration system on.
- Definitions being data is what lets an integration _own and evolve its schema_ without a global
  migration.

This is "eventually," not the first slice — but the model is shaped now so it stays reachable
(`PLAN.md` §0.5 forward-compat gate).

---

## 5. The query model

> **Convex update (decided):** there is no SQL. A Datalog AST compiles to **indexed Convex reads joined
> by nested loops in JS** (the engine we built: patterns, comparison, negation, transitive closure,
> aggregation). Consequences: **no cost-based planner**, **no DB joins**, and **no arbitrary EAV
> filtering** — a clause must resolve its entity or attribute to a constant (directly or via an earlier
> join), and filter/sort on an attribute value needs a covering projection. Multi-hop/recursive queries
> read many documents and are bounded by transaction limits, so hot/recursive results are **materialized**
> (closures already are). "Compiler is swappable behind one AST→SQL interface" → the join executor is the
> one place reads live; everything else generates ASTs for it. See [`convex.md`](./convex.md) §1.

One model, data all the way down (`PLAN.md` §3, Phase 2 §9–§12):

- **Datalog AST → one SQL statement.** Flat conjunctive queries: each clause a self-join on `triples`;
  variable reuse becomes a join predicate; `asOf` adds the validity predicate. The AST is JSON, so a
  visual builder, a text/EDN syntax, or an LLM can all target it.
- **List Views** compile down to the AST (entity-pivot pagination, flat-AND filters, keyset cursor).
- **Generated queries** are the elegant trick the rest of the set reuses: `generateListQuery(type)` for
  inspect views, and — crucially — the **reuse-match query** in `workflows.md` §7 (`reuseCriteria` is a
  _query pattern_, not data). The compiler is the one place joins live; everything else generates ASTs
  for it.
- Compiler is swappable (Kysely ↔ raw `sql`) behind one AST→SQL interface.

---

## 6. Honest trade-offs (why the end state is _hybrid_)

> **Convex update (decided):** the hybrid conclusion holds, but the mechanism differs. Convex indexes are
> on **declared fields**, so there is **no "promote a hot attribute to a native column"** and **no GIN
> containment index**. The Convex move is a **separate projection table** (per-type, or a narrow
> `(type, attr[, value]) → entity` secondary index) maintained on write — `currentFacts` is the first such
> projection. "Promote by measurement" becomes "add a projection table for this access pattern." See
> [`convex.md`](./convex.md) §2.

Carried from `PLAN.md` §7–§8, because they bound every other doc:

- **Read performance.** A placements list that's one indexed scan today becomes a 6+ way self-join over
  `triples`. Hot paths must read **materialized projections** (promote hot attributes to columns /
  per-type projection tables — `PLAN.md` §8 step 4), not raw triples. Every doc in this set respects
  this: reuse matching hits a GIN projection, integration status badges hit projections, etc.
- **Lost DB-level safety.** No column types, FKs, or Prisma type-safety at the storage layer — the app
  layer (write path + the role/ownership contracts) must re-impose them.
- **Analytics & exports.** Existing Kysely analytics assume native columns; rebuilding them over EAV is
  hard. Keep them on projections.
- **Conclusion:** the realistic end state is **hybrid** — a configurable fact core with native/projected
  hot paths — _not_ pure-EAV. The vision is the model and the reach, not "everything becomes triples."

---

## 7. The migration discipline (how the substrate spreads without a big bang)

The method every doc reuses (`PLAN.md` §8): **prove the model, then expand by measurement, never
lift-and-shift.**

1. **Probe** (`PLAN.md` PR) — storage + config + query + time-travel at `/triples`, no real data.
2. **Custom fields first** — let customers add custom attributes to existing native records, stored as
   triples keyed off native ids. High value, zero hot-path risk.
3. **One type end-to-end** — lowest-traffic object, modeled fully, run shadow / dual-read behind a flag;
   compare correctness + latency before trusting it.
4. **Promote hot attributes** — any query-hot EAV attribute gets a materialized native column /
   projection.
5. **Expand by measurement** — migrate further only where the flexibility win beats the measured
   read-path cost.

`workflows.md` §4 and `integrations.md` §5 are this discipline applied to their domains: façade first,
shadow-validate, converge, flag-gate.

---

## 8. What builds on this

- [`workflows.md`](./workflows.md) — policies, automations, and forms collapse into one reactive `Flow`
  over the tx feed (§3); reuse criteria becomes a generated query (§5); ownership tiers & role-binding
  keep the configurable domain elegant.
- [`integrations.md`](./integrations.md) — each integration becomes a bounded fact context that owns a
  namespace of entities/attributes (§4 self-describing + §7 migration discipline), reacting via inbound
  / outbound Flows (§3).

---

## Decisions (resolved)

- ✅ **On Convex, not SQL.** Substrate is Convex; queries compile to indexed reads (JS joins), projections
  are separate tables, and **every store-sweeping op must be a batched, scheduler-driven job** (Convex
  mutations are single transactions with hard limits). See [`convex.md`](./convex.md). (NEW)
- ✅ **Self-describing schema is built**, not eventual — schema-as-facts shipped. (§4)
- ✅ **Two-axis bitemporality** (transaction time + valid time), not just `validFrom`/`validTo`. (§2)
- ✅ **One substrate.** A configurable bitemporal fact store is the intended foundation; the product is
  hybrid (fact core + projected hot paths), not pure-EAV. (§0, §6)
- ✅ **Tx log is the event bus.** Reactions are standing patterns over `TripleTransaction`, not a
  separate bespoke event system. (§3)
- ✅ **Definitions become data (eventually).** Meta-circular self-description is the end-state; the
  PoC keeps it reachable via the forward-compat gate. (§4, `PLAN.md` §0.5/§23)
- ✅ **Queries are data.** Datalog AST / List Views compile to SQL; generated queries (reuse, inspect)
  are the reuse mechanism across the set. (§5)
- ✅ **Expand by measurement.** Probe → custom fields → one type → promote hot → measure; never
  lift-and-shift. (§7, `PLAN.md` §8)

## Open (deferred to the consumers)

- ❓ Promotion mechanics: when/how an EAV attribute graduates to a materialized column or projection
  table (the hybrid boundary). (§6)
- ❓ Bridge key: custom-field triples off native record ids vs. generic `TripleEntity` (`PLAN.md` §949;
  recommended native ids for the bridge phase).
