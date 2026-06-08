# Vision — Rebasing the Substrate onto Convex

> **MetaCRDT framing →** Convex is one _target_, not the substrate (see [`../docs/targets.md`](../docs/targets.md)). **Reversed cut:** "Effect → Convex validators" is superseded — Effect now lives at a target-neutral runtime-shape tier (Confect-like) above the targets ([`../SPEC.md`](../SPEC.md) §1.2). See [`metacrdt-alignment.md`](./metacrdt-alignment.md) §0, §3.

> Part of the `vision/` set — see [`README.md`](./README.md). The other docs were written assuming a
> **Postgres / Prisma / Kysely + Effect-TS** substrate (the live app's stack). The proof-of-concept in
> [`../PLAN.md`](../PLAN.md) is instead built on **Convex**. This doc reconciles the two: which parts of
> the vision survive unchanged, which need reframing, and which are cut. It is the authoritative source
> for substrate-level technical decisions; where a doc below conflicts with this one, this one wins.

## TL;DR

The **model** is coherent and largely **already proven** on Convex: facts, two-axis bitemporality,
schema-as-facts, a Datalog query engine, reactions/materialization with provenance, and rebuildable
projections all exist today. What changes is the **mechanism**:

- "Datalog AST → **one SQL statement**" → Datalog AST → **indexed Convex reads with nested-loop joins in JS**.
- "promote a hot attribute to a **native column** / **GIN** index" → **separate projection tables** and
  **narrow secondary-index tables**; Convex cannot index arbitrary EAV attribute values.
- "tx log → **NATS/BullMQ** event bus" → **append-only `factEvents` + the Convex scheduler/crons**;
  client reactivity is free, server reactions are not.
- "**Effect** `Schema` / DSLs / `HttpApi` builders" → **Convex validators**, plain TS builders, and
  **components**.
- a bespoke per-integration migration system → **Convex components** (native bounded contexts) + batched
  migration mutations.

And one constraint the vision never mentions because SQL doesn't have it: **a Convex mutation is a single
transaction with hard read/write limits.** Anything that sweeps the store — the compliance reconciler,
config `apply`, projection rebuild, bulk migration — must be **batched and scheduler-driven**, not one
atomic statement. Bake this in from day one.

## What is already built (vision → shipped)

| Vision claim | Status on Convex |
| --- | --- |
| Configurable `EntityType`/`Attribute` registry | **Shipped**, and stronger than written: it's **schema-as-facts** (defs are triples), not a side table. triples.md §4 framed this as "eventually" — it's now the default. |
| Bitemporal by construction | **Shipped** — and *two-axis* (transaction time **and** valid time). The vision often says only `validFrom`/`validTo`; we have both, so "what was true then" vs "what did we believe then" are distinct, queryable axes. |
| Queries are data (Datalog AST) | **Shipped** — patterns, comparison, negation, transitive closure (materialized), aggregation, `explain`. Compiles to indexed Convex reads, not SQL. |
| Tx log as the spine | **Shipped** — append-only `factEvents` is the source of truth; `facts`/`currentFacts`/`derivedFacts` are rebuildable projections (`rebuildProjections`). |
| Reactions over the log | **Partial** — rule materialization + invalidation + provenance (`sourceFactIds`, `explainDerived`) exist. The general `Flow` step-graph does not. |
| Self-describing / meta-circular | **Shipped** — `bootstrapSchema`, attribute lifecycle, `typeSchemaAsOf`, `attributeAsOf`. |
| Hybrid hot paths via projections | **Shipped in shape** — `currentFacts` is the now-projection; the entities browser reads it. |

## The reframes (decided)

### 1. Query model: Datalog-in-JS, not SQL
There is no SQL, no query planner, and no DB-side joins. A clause is an indexed range read; a join is a
nested loop in the function. Consequences that ripple through the other docs:
- **No cost-based projection-vs-raw planner** (performance.md §4). Reads target an explicit projection
  table or are bounded by `LIMITS`; there is no optimizer to lean on.
- **No arbitrary EAV filtering.** You cannot filter/sort by an attribute value unless a declared index or
  projection covers it. Ad-hoc `(attr op value)` over the whole store is **infeasible**; `queryEntities`
  already shows the boundary (it datalog-filters a bounded set, then sorts/pages in memory).
- **Multi-hop / recursive / large joins read many documents** and count against transaction limits. Keep
  live Datalog bounded; **materialize** anything hot or recursive (closures already do this).

### 2. Hot paths: projection tables, not column promotion
Convex indexes are on **declared** fields, so "graduate a hot attribute to a native column" (performance.md
§2) has no analog. The Convex move is a **separate projection table** (per-type, or a narrow
`(type, attr[, value]) → entity` secondary index) maintained on write. "Promote by measurement" becomes
"add a projection table for this access pattern," and the hybrid boundary is explicit, not tunable.

### 3. Event bus: factEvents + scheduler, and a caveat on "reactivity"
Convex reactivity is a **client-read** feature (a subscribed query re-runs when its read set changes); it
does **not** trigger server-side writes. So "a Flow fires when a fact lands" is **not** free — it is driven
by the append-only `factEvents` log + the scheduler/materialization path we already built (the same path
that recomputes rules and closures). Client live-updates (forms resuming, dashboards) *are* free and are a
genuine win over the bespoke NATS/BullMQ path the vision set out to replace.

### 4. Workflows: reconciler first, general Flow runner later
- **Obligations-as-facts, reuse-as-generated-query, forms-as-attribute-projections** map onto what we have
  (facts + Datalog + projections). Restrict reuse scope dimensions to a **finite declared set per form** so
  each lowers to an indexed equality (no GIN containment).
- The **`Flow` step-graph** (`branch/wait/http/collect/…`) has **no native Convex runner**. Build the
  **compliance reconciler** first as a scheduler-driven state machine (one mutation per `(subject, form)`,
  `wait` = a parked doc resumed by cron, external calls in actions). Defer the general DAG executor, or
  adopt the Convex **Workflow component**. Accept eventual consistency (scheduler latency) instead of the
  vision's synchronous inline policy fast-path.

### 5. Integrations & config: components + batched apply
- An integration = a Convex **component**: its own tables, functions, and typed API surface, isolated by
  the platform. This is *cleaner* than the vision's namespace-tag + compiler-guarded join check — isolation
  is structural. The Effect reconciler becomes the component's `schema.ts` + a **batched migration mutation**.
- Config-as-code `plan`/`apply` survives, but `apply` of a large account **cannot be one atomic
  transaction** — it's a batched, resumable, scheduler-driven job with an apply-status fact. Diff/`plan`
  and `import` are fine as queries.

### 6. Effect → Convex
The six Effect `Schema` DSLs and the Effect test harness in dsl.md are **authoring ergonomics**, not the
substrate. Replace with plain TS builder functions over schema-as-facts and Convex test functions. The IR
(fact-AST) and the one-IR/many-front-ends idea stay; the runtime is Convex validators, not Effect.

## Cuts (decided)

- **JIT-compiled per-account `HttpApi`** (api.md) — **cut.** Convex generates types per-*deployment* at
  codegen time, not per-*account* at runtime, and there is no Effect `HttpApi`-builder / `OpenApi.fromApi`.
  Replace with a **single dynamic `httpAction`** that validates against the registry at runtime and dispatches
  to one generic handler over the Datalog engine + projections. (Optionally emit an OpenAPI doc from the
  registry as data for offline client codegen.) You lose compile-time per-account types and "the live API is
  the spec"; you keep runtime validation and per-account routing.
- **Cost-based planner**, **GIN `@>` reuse index**, **column promotion** — cut; replaced by explicit
  projection tables (§1–§2).
- **Multi-hop graph-reachability authorization at request time** — cut for v1; precompute per-principal
  visible-subject projections. Authorization is enforced **in function code** (no row-level security); read
  from per-principal filtered projections rather than a SQL rewrite at a compiler chokepoint.
- **Crypto-shredding as the primary erasure mechanism** — downscope. Convex supports **hard delete**, so
  right-to-erasure is feasible directly (tombstone for normal lifecycle; hard-delete + event-log scrub for
  legal erasure). Reserve crypto-shredding for **file-storage blobs**.
- **Data residency** — defer. A Convex project is a single deployment; residency means separate per-region
  deployments, not a predicate. Revisit only on real demand.
- **Synchronous inline policy evaluation** — cut; obligations are produced asynchronously via the scheduler.

## What stays intact (and maps cleanly)
- Bounded-fact-context integrations → **components** (better, structurally isolated).
- Notifications / reminders / escalations / timers → **scheduler + crons** (the vision's "durable scheduler"
  worry largely dissolves).
- Documents / generated PDFs / e-signature → **Convex file storage** + actions; signatures as provenance facts.
- Generated UIs → a **projection of schema-as-facts**, with client reactivity for free.
- AI as a safe target → AST validation via our engine, LLM calls in actions, agent writes as
  provenance-tagged transactions.
- The migration **discipline** (probe → custom fields → one type → projection → expand by measurement) and the
  permanently-hybrid end state — unchanged, and reinforced by Convex's constraints.

## Net assessment
The vision's bet — *one configurable bitemporal fact substrate, reactions over its log* — is **sound and
already substantially demonstrated on Convex**. The risk it under-weights is not the model but the
**operational contract under Convex's transaction limits**: every store-sweeping operation must be a
batched, resumable, scheduler-driven job. Get that contract right (the reconciler is the proving ground) and
the rest of the set is reachable; the pieces that don't fit Convex (JIT API, SQL planner/GIN, Effect runtime,
residency) are peripheral and cleanly cut.
