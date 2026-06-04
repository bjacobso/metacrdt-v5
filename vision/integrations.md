# Vision — Integrations as Self-Describing Modules on the Triple Store

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on the substrate in
> [`triples.md`](./triples.md) and on [`workflows.md`](./workflows.md) (the `Flow` primitive,
> tx-feed-as-event-bus, ownership tiers & role-binding). Grounded in `../PLAN.md` (the triple-store
> PoC).

> **Convex update (decided — better fit):** "bounded fact context that owns and evolves its own schema"
> maps directly onto **Convex components** — own tables, own functions, typed API surface, **isolated by
> the platform** (not by a namespace tag + a compiler-enforced join guard, which becomes unnecessary). The
> Effect-based per-module migration reconciler becomes the component's `schema.ts` + a **batched, scheduler
> -driven migration mutation** (diff/`plan` stays a query; imperative apply must batch under transaction
> limits). The §6 physical-isolation fork largely dissolves — components already give module isolation in
> one deployment. See [`convex.md`](./convex.md) §5.

Can the triple store give every integration a uniform way to **define its own internally-managed
entities and attributes** (with an Effect-based migration system), so that upstream (ATS), inline
(E-Verify / Checkr / Persona), and downstream (ADP / UKG / HRIS) integrations are each **isolated
modules** that register their own schema and expose logic to the rest of the system through one
contract?

> Status: **brainstorm.** End-state and migration path kept separate, per the set's convention.

---

## 0. The central realization

**The integration framework already encodes the hard part — isolation — and is already a half-built
triple store.** Three facts from the current code (`apps/web/app/inline_integrations/`):

1. **The boundary already exists.** Integrations are "separate worlds," bridged _only_ by
   `PlatformClient` (`framework/server/PlatformClient/types.ts`), with `Live` (direct DB today) and a
   future `HttpLive` (HTTP to the main app from a dedicated server) interchangeable to callers. The
   stated principle — _"models live only in their own domain"_ — is exactly the ownership boundary
   `workflows.md` §2.5 formalizes.
2. **Integration config is already EAV.** `IntegrationAttribute`
   (`framework/server/IntegrationData/types.ts`) stores typed value columns
   (`stringValue`/`intValue`/`booleanValue`/`datetimeValue`) keyed by `name` + `groupKey` per
   integration. That _is_ a triple, namespaced and typed — a triple store waiting to be named one.
3. **Inline reactions are already Flows.** `IntegrationSubscriptions` registers handlers that
   `match` platform events (`events: ["task.updated"]`, `match: { tags, updatedProperties }`) and run
   in retrying background jobs (`everify/server/subscriptions/i9Subscription.server.ts`). That is a
   `Flow` (`workflows.md` §2): a trigger pattern over the event feed + a reaction. Today's feed is
   `broadcastEvent`; the unified feed is the transaction log.

So integration-owned models (`everify_cases`, `tavio_field_configs`) are bespoke per-integration
Prisma tables _because there was no other way to let a module own schema._ The triple store gives that
way. The integrations we have are all **inline / verification** (certn, everify, experian, persona,
socure, tavio, tazworks); **upstream (ATS)** and **downstream (HRIS)** are greenfield — the model
should make all three the _same shape_.

---

## 1. The unifying abstraction: an integration is a _bounded fact context_

One module shape covers all three topologies. An integration is:

- **A private namespace of entity types + attributes it owns** — `everify/case`, `checkr/report`,
  `bullhorn/placement`, `adp/worker`. Stored as facts in the shared store, but owned and evolved by
  that module alone (the new ownership tier, §2).
- **A contract surface to the shared, role-bound domain** — `PlatformClient`, generalized to
  read/write/query facts on the shared entities (`compliance/subject`, `compliance/principal`, etc.
  from `workflows.md` §2.5.1). The integration never touches another module's namespace directly.
- **A set of Flows over the transaction feed** — inbound Flows that assert facts from the outside
  world; outbound Flows that react to internal fact changes and push to the outside world.

The three topologies are **the same machinery, differing only in the direction data flows** across the
boundary:

```
UPSTREAM (ATS)      external system ──▶ [inbound Flow asserts] ──▶ integration facts
  e.g. Bullhorn                                                         │ [map Flow]
                                                                        ▼
                                                          shared facts (subject / principal)

INLINE (E-Verify)   shared facts ──▶ [Flow on task event] ──▶ external call
  Checkr / Persona                                              │ (webhook)
                                                                ▼
                    shared facts ◀── [map Flow] ◀── integration facts ◀── [inbound Flow asserts]

DOWNSTREAM (HRIS)   shared facts ──▶ [outbound Flow on "task completed"] ──▶ map to external schema
  ADP / UKG                                                                    │
                                                                               ▼
                                                          external system + integration "delivery" facts
```

- **Upstream** mirrors an external source-of-truth _into_ facts. Bitemporality (`PLAN.md` §24) makes
  the sync history queryable: "what did Bullhorn say this placement's start date was, as of last
  week?"
- **Inline** is the round-trip we already do: trigger mid-onboarding, call out, ingest the webhook,
  assert the result. `everify_cases` / `VerifiedIdentity` / `RiskEvent` become integration-owned
  entities; the `IntegrationSubscription` becomes the inbound Flow.
- **Downstream** reacts to completion facts, maps internal attributes to the external schema, pushes,
  and records a "delivery" fact (idempotency + audit).

Each direction is a Flow whose trigger is a tx-feed pattern and whose steps are `assert` (ingest),
`http` (push), and `collect`/`notify` as needed — the exact step vocabulary from `workflows.md` §2.

---

## 2. Ownership: the integration-owned tier (extends `workflows.md` §2.5)

`workflows.md` §2.5 defined three tiers (kernel / system-process / customer). Integrations add a
**fourth owner**, enforced by namespace:

| `owner` on `EntityType` / `Attribute` | Namespace                               | Who evolves the schema                         | Cross-namespace access    |
| ------------------------------------- | --------------------------------------- | ---------------------------------------------- | ------------------------- |
| `system`                              | `meta/`, `entity/`, `task/`, `form/`, … | the product                                    | n/a (intrinsic)           |
| `customer`                            | the customer's type slugs               | the customer (config UI)                       | their own + shared        |
| `integration:<name>`                  | `<name>/…` (`everify/`, `adp/`)         | **that integration's migration manifest only** | **only via the contract** |

The rule mirrors today's boundary doc exactly: _"never touch another module's models."_ In the store
it becomes a **compiler-enforced** rule — the query compiler refuses a join that crosses an
`integration:` namespace except through shared role-bound entities. This is the homoiconic version of
"only `PlatformClient` bridges the worlds": the bridge is _querying shared facts_, never reaching into
`everify/*` from `checkr/*`.

> This is the load-bearing design choice. Get it right and integrations stay genuinely isolated while
> living in one store; get it wrong and "everything is queryable facts" quietly re-couples every
> module to every other. See the physical-isolation fork in §6.

---

## 3. The Effect-based migration system

The point: **an integration evolves its own schema without a main-app Prisma migration.** Each module
declares its schema as code; a reconciler applies it as a transaction scoped to the module's namespace.
Because definitions are facts (`PLAN.md` Phase 3 §23), a "migration" _is_ a transaction — versioned and
bitemporal like any other data.

### 3.1 Declarative schema manifest (per integration)

```ts
// inline_integrations/everify/schema.ts
export const everifySchema = defineIntegrationSchema(
  "everify",
  { version: 3 },
  (s) => {
    const c = s.entity("everify/case", { label: "E-Verify Case" });
    c.attr("everify/case/status", "STRING", { required: true });
    c.attr("everify/case/caseNumber", "STRING", { unique: true });
    c.attr("everify/case/openedAt", "DATETIME");
    c.ref("everify/case/principal", { role: "compliance/principal" }); // links into shared domain
  }
);
```

- `defineIntegrationSchema(namespace, …)` can only declare types/attributes **inside its own
  namespace** — a compile-time + reconcile-time guard. `ref(… { role })` is the _only_ way it touches
  the shared domain, and it binds to a **role** (`workflows.md` §2.5.1), not a concrete customer type —
  so the integration works whether the customer's principal is `employee` or `contractor`.
- It is pure data describing the schema; the Effect runtime is in the _reconciler_, not the manifest.

### 3.2 The reconciler (Effect program)

```
reconcile(manifest) := Effect.gen(function* () {
  const current = yield* readRegisteredSchema(manifest.namespace, accountScope) // from the store (facts)
  const diff    = computeDiff(current, manifest)        // add type | add attr | widen type | …
  yield* assertGuard(diff)                              // refuse lossy changes w/o explicit coercion
  yield* transact(diff.ops, { meta: { migration: manifest.namespace, to: manifest.version } })
})
```

- **Namespace-scoped:** the reconciler can only emit ops within the manifest's namespace; an attempt to
  touch `task/*` or another integration's namespace fails (the §2 boundary, enforced).
- **Diff, not imperative steps:** declare the desired schema; the reconciler computes the delta. Adds
  are free; type widenings allowed; narrowings/renames require an explicit coercion op (ties to
  `PLAN.md` §26 "schema migration = versioned tx + coercion"). Lossy changes are _flagged_, never
  silent.
- **Versioned + bitemporal for free:** the migration is a transaction, so "what was the `everify/case`
  schema at v2?" is an `asOf` query; rollback is a reverse transaction (`PLAN.md` §25 `revert`).
- **Decoupled cadence — the headline win:** shipping an integration schema change is _running its
  reconciler_, not deploying a global Prisma migration. And when the integration moves to its own
  server (the framework's stated goal), **its schema travels with it** because the schema is data the
  module owns, not rows in a shared `schema.prisma`.

### 3.3 Where it runs

At integration module load (dev) and as a deploy step (prod), the same way `IntegrationSubscriptions`
register at load time today. The reconciler is itself reachable through the framework — it does not
reach into main-app migration tooling (boundary preserved).

---

## 4. Exposing logic to the rest of the system

An integration exposes three things, all through the contract — never by other modules importing it:

1. **Queryable facts.** Its entities are facts in the shared store, namespaced + `owner`-tagged. The
   rest of the system reads them _only_ via the contract / shared role-bound entities (e.g. a UI shows
   "E-Verify status" by reading the `compliance/principal`'s linked `everify/case/status`, resolved
   through the contract — not by querying `everify/*` directly).
2. **Reactions (Flows).** Inbound/outbound Flows are registered by the module (like subscriptions
   today) and run on the shared engine. Other modules don't call the integration; they assert facts,
   and the integration's Flows react.
3. **Contract methods.** `PlatformClient` generalizes from REST-shaped convenience
   (`getTaskFacts`, `updateEmployeeCustomAttrs`) toward **fact operations on shared entities**
   (`assert`/`retract`/`query` over role-bound types), still transport-agnostic so `Live`↔`HttpLive`
   keeps integration code process-portable.

The result: an integration is a sealed module that _publishes facts and reactions_, and the rest of the
system depends on the **shape of the shared facts**, never on the integration's internals.

---

## 5. Tactical migration path (conservative — don't rip out what works)

Mirrors `workflows.md` §4: façade first, shadow-validate, converge. The framework boundary means most
of this is _additive behind existing services_.

- **Stage I0 — Integration config to facts (lowest risk).** `IntegrationAttribute` is already EAV
  (§0). Back `IntegrationData` with the triple store while keeping its service API identical. No
  integration code changes; pure storage swap behind the framework.
- **Stage I1 — One owned model as facts.** Pick `everify_cases`. Declare it via a schema manifest
  (§3); run the reconciler; **dual-write** facts alongside the prefixed table; diff. Proves the
  migration system and the owned-namespace tier on a real model.
- **Stage I2 — One subscription as a Flow.** Re-express the E-Verify I-9 `IntegrationSubscription` as a
  Flow over the tx feed (trigger + handler already exist). Shadow-run against the existing subscription
  dispatch; diff side effects. Proves inline = Flow.
- **Stage I3 — Greenfield the new directions.** Build the first **upstream (ATS)** and **downstream
  (HRIS)** integrations natively on the model — no legacy to migrate, so they validate the inbound /
  outbound Flow directions and the external-id mapping with zero risk to existing flows.
- **Throughout:** `PlatformClient` stays the bridge; it _gains_ fact methods but the `Live`/`HttpLive`
  split is preserved, so nothing forecloses the move-to-own-server goal.

---

## 6. Honest trade-offs & sharp edges

- **Logical vs. physical isolation (the load-bearing fork).** One store with namespace + `owner` tags
  is a _logical_ boundary; the framework's end-goal is integrations on _separate servers_. Either (a)
  integration-owned facts stay central and `PlatformClient.HttpLive` proxies all fact ops (keeps
  unified query, but the boundary is only logical), or (b) each integration carries _its own_ triple
  store and only shared role-bound facts are central (true isolation, but you lose cross-integration
  unified query and must sync). This is the single biggest decision; flagged in §7.
- **Cross-namespace queries re-couple silently.** "Everything is queryable facts" is exactly what the
  §2 compiler guard must _prevent_ across `integration:` namespaces — otherwise the boundary the
  framework fought for dissolves the moment someone writes a convenient join.
- **External-id mapping & idempotency.** Every upstream/downstream integration needs a stable map from
  external id ↔ internal entity uid (e.g. `bullhorn/placement/externalId`). Inbound sync must be
  idempotent against it (re-deliveries, replays). Model as facts, but the uniqueness/lookup is hot —
  likely a projection.
- **PII & retention on mirrored upstream data.** ATS sync mirrors candidate PII into facts;
  bitemporality _retains_ it by design. Right-to-erasure needs a real hard-delete path —
  retraction (`validTo`) is not deletion. Design erasure before the first upstream integration ingests
  real data.
- **Source-of-truth conflicts.** When an ATS _and_ a user both write the same shared fact, who wins?
  Provenance + bitemporality record _what_ happened, but a precedence policy (per attribute? per
  integration?) is a product decision, not a free consequence of the store.
- **Read-perf.** Same EAV caveat as everywhere — hot integration reads (status badges, sync lookups)
  hit projections, not raw triples (`PLAN.md` §8 step 4).

---

## 7. Open questions (non-blocking)

- ❓ **Physical isolation (§6).** Central store + logical namespaces (HttpLive proxies facts) vs.
  per-integration store + shared core. Decide before any integration moves to its own server.
- ❓ **Contract shape.** Does `PlatformClient` become a generic fact API (`assert`/`query` over shared
  entities), or stay REST-shaped convenience methods _implemented over_ facts? Affects how much
  integration code changes.
- ❓ **Migration conflict model.** Two integrations — or an integration and a customer — both want an
  attribute in a namespace they could collide on. What arbitrates? (Namespacing should prevent it by
  construction; confirm.)
- ❓ **Inbound write precedence (§6 source-of-truth).** Per-attribute or per-integration precedence
  when external sync and user edits conflict.
- ❓ **Erasure.** The hard-delete / retention story for mirrored upstream PII, given bitemporal
  retention is the default.
- ❓ **Role coverage.** Are `subject`/`principal` (+ scope dims) enough for ATS/HRIS, or do downstream
  systems need a new role (e.g. `payroll/worker-account`)? Keep the reserved vocabulary minimal.
