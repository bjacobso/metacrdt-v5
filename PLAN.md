# PLAN.md — MetaCRDT Execution Goal

**Current goal:** Goal 35 (component-owned collection submission) has shipped.
The next active goal should be chosen from the remaining TODO candidates:
provider-backed login UI / production auth, live Cloudflare deployment/auth,
component-owned forms/flows/compliance, or another parked Query/Rules item.

This plan is the operational goal file. Read it with:

- [README.md](./README.md) — first-principles project overview
- [SPEC.md](./SPEC.md) — normative protocol
- [TODO.md](./TODO.md) — running worklog and open-item pulse
- [docs/architecture.md](./docs/architecture.md) — package/layer map
- [docs/package-consolidation.md](./docs/package-consolidation.md) — Open
  Ontology fold plan
- [docs/confect.md](./docs/confect.md) — Confect/Effect direction

When changing Convex code, read
[`convex/_generated/ai/guidelines.md`](./convex/_generated/ai/guidelines.md)
first. Those generated Convex guidelines override prior assumptions.

---

## North Star

MetaCRDT names a primitive:

> a convergent graph of facts, constraints, intentions, and effects.

The repository should make that statement true in code:

1. `@metacrdt/core` defines the pure deterministic protocol kernel.
2. The Convex reference runtime writes core-shaped events.
3. Read projections are rebuildable deterministic folds of those events.
4. Later runtime targets (Cloudflare Durable Objects, browser/local-first, Node)
   can import the same core and converge to the same projections.
5. Confect/Effect improves the Convex target's schema, error, and service
   boundaries without becoming the protocol or infecting `@metacrdt/core`.

The immediate technical gap is now choosing the next runtime/product slice. The
protocol kernel is extracted, the Convex write/read paths are core-shaped enough
for the centralized reference runtime, the package graph has `core`, `convex`,
`forma`, `runtime`, `cloudflare`, and `local`, config reconciliation works, PII
read authorization is enforced, the entity UI is schema-driven, Confect has now
been adopted narrowly for a real read/planning domain, config changes are
inspectable as manifest diffs, and configured actions can now take small typed
arguments.

---

## Current State

### Shipped

- `@metacrdt/core` exists in [`packages/core`](./packages/core):
  - SHA-256
  - base32 EventIds
  - canonical values
  - HLC helpers
  - immutable events
  - `≺` total order
  - G-Set log merge
  - bitemporal fold / visibility
- Core has 46 tests proving:
  - CRDT merge laws
  - content addressing
  - fold determinism under insertion-order shuffle
  - cardinality-one supersession by `≺`-max
  - bitemporal visibility quadrants
- Convex read path delegates visibility to core via
  [`convex/lib/visibility.ts`](./convex/lib/visibility.ts).
- New Convex writes stamp protocol metadata on `factEvents`:
  `eventId`, HLC, `replicaId`, `targetEventId`, and `causalRefs` where
  applicable.
- `facts.assertEventId` stores the protocol assert event id for lifecycle
  targeting.
- `correctFact` is represented in new event history as tombstone-old + assert-new
  with causal refs, not as a new core event kind.
- Cardinality-one current projection reconciles candidates by `@metacrdt/core`
  `≺` order and retracts projection losers.
- Convex backend tests are green: 103 tests at last verification.
- Frontend is a MetaCRDT research-preview UI with datarooms/compliance as the
  live elaboration.
- Open Ontology is a pinned submodule under
  [`.context/open-ontology`](./.context/open-ontology).
- `@metacrdt/convex` exists in [`packages/convex`](./packages/convex) as the
  first reusable Convex target package:
  - package-owned Convex/core event adapters
  - package-owned bitemporal visibility adapter
  - protocol metadata validators
  - event-row verification/summarization helpers used by the Confect sidecar
  - helper factories for building/appending protocol fact-event rows through a
    host-provided inserter
  - helper for summarizing/verifying rows through a host-provided transaction
    lookup
  - a stateless registered Convex component surface
    (`@metacrdt/convex/convex.config.js`) with protocol row build/summarize
    functions that operate on values passed across the component boundary
  - component-owned `transactions` and `factEvents` tables plus append/list/get
    functions for a durable protocol log
  - component-owned `facts` and `currentFacts` projections maintained by the
    component append/lifecycle functions
  - opt-in component-owned cardinality-one reconciliation for component writes,
    using the shared `≺` order and protocol retract events for losers
  - component-owned projection rebuild via `log.rebuildProjections`, replaying
    component-owned `factEvents` into disposable `facts` / `currentFacts`
  - component-owned entity current-state reads via `log.getCurrentEntity`,
    grouping current facts by attribute over the component projection
  - component-owned typed entity discovery via `log.listCurrentEntities`,
    listing entities from current `type` facts and attaching current names
  - a reference-app wrapper, `api.metacrdtComponent.verifyEvents`, that mounts
    the component as `components.metacrdt` while keeping table ownership and
    public API naming in the host app
  - reference-app wrappers for app-auth-derived writes into the component-owned
    protocol log, current projection/entity reads, typed entity lists, rebuild,
    bounded component-owned entity creation, and component-owned Worker status
    actions
  - a component-owned configured-action runner that loads host action definitions,
    validates `appliesTo` against component-owned current `type` facts, resolves
    action args through shared action-definition helpers, resolves host schema
    cardinality, and writes action asserts into the component-owned log
  - an explicit Confect sidecar warning/helper documenting the manual-mount
    lesson from Goal 2
  - package-local tests for deterministic event reconstruction, legacy fallback
    behavior, registered component functions, component-owned log writes,
    component-owned current projection lifecycle, component-owned entity reads,
    and component-owned cardinality-one reconciliation, plus event-log projection
    rebuild
- `@metacrdt/forma` exists in [`packages/forma`](./packages/forma):
  - runtime-neutral Lisp / S-expression authoring language
  - parser, formatter, evaluator, VM, type inference, and language-owned
    elaboration utilities
  - selected Open Ontology Lisp fixtures copied into package-local tests
  - no source imports from `.context/open-ontology`
- `@metacrdt/runtime` exists in [`packages/runtime`](./packages/runtime):
  - target-neutral service contracts (`EventStore`, `RuntimeClock`, `Scheduler`,
    `Transport`, optional `RuntimeSequencer`)
  - capability metadata and operation helpers over `@metacrdt/core`
  - an in-memory target/harness for proving convergence across runtimes
  - a localStorage-compatible browser/local-first target seed with durable event
    log, HLC, and per-replica sequence storage
  - a BroadcastChannel-compatible transport seed for same-origin browser
    anti-entropy
  - a DataChannel-compatible p2p transport for peer-to-peer anti-entropy and
    multi-hop gossip
  - version-vector delta calculation and one-round anti-entropy exchange helpers
  - package-local tests for HLC injection, per-replica sequencing, G-Set exchange
    convergence, version-vector deltas, persisted local state, BroadcastChannel
    publish/hello/delta behavior, DataChannel p2p publish/catch-up/gossip
    behavior, lifecycle events, and capability checks
- `@metacrdt/cloudflare` exists in
  [`packages/cloudflare`](./packages/cloudflare):
  - Durable Object storage-backed `EventStore`
  - Durable Object storage-backed HLC clock
  - Durable Object storage-backed per-replica sequencer
  - async `createDurableObjectRuntime` target services over `@metacrdt/runtime`
  - structural Durable Object WebSocket relay shell for hello/delta sync and
    event fan-out
  - Worker-facing router + Durable Object class shell and example Wrangler config
  - package-local tests proving restart durability, G-Set convergence, version
    vectors, stored event verification, WebSocket publish/catch-up, and protocol
    filtering, Worker routing, and WebSocket upgrade wiring
- `@metacrdt/local` exists in [`packages/local`](./packages/local):
  - browser-facing local-first target package
  - composes the `@metacrdt/runtime` localStorage-backed event/HLC/seq services
    with the `BroadcastChannelTransport`
  - exposes browser defaults (`browserStorage`, `browserBroadcastChannel`),
    `createLocalFirstRuntime`, and `startLocalFirstRuntime`
  - includes async local runtime services and an `IndexedDbRuntimeStorage` adapter
    for IndexedDB-compatible browser persistence
  - exposes `createIndexedDbLocalFirstRuntime` and
    `startIndexedDbLocalFirstRuntime`
  - includes a dependency-free structural `SqliteRuntimeStorage` adapter for
    prepare/get/run-style SQLite clients
  - exposes `createSqliteLocalFirstRuntime` and
    `startSqliteLocalFirstRuntime`
  - package-local tests prove peer convergence over a BroadcastChannel-compatible
    bus, hello/delta catch-up for late replicas, restart durability,
    broadcast-disabled local persistence, and async IndexedDB-compatible
    persistence, plus SQLite-backed persistence and convergence
- `applyConfig` now behaves as a true section-scoped reconciler:
  - configured artifact ownership is tracked on `config:default`
  - explicitly supplied config sections compute desired sets
  - dropped owned types/attributes/forms/actions are retracted through facts
  - dropped requirements deactivate their rules and remove stale derived facts
  - dropped flows remove their definitions
  - runtime data and system/meta facts are not deleted
- Attribute-level PII read authorization exists in the Convex reference runtime:
  - form fields can carry `pii: true` / `sensitive: true`
  - the staffing blueprint marks `i9/ssn` as PII
  - readers are derived from `ctx.auth.getUserIdentity().tokenIdentifier`
  - read grants are ordinary facts on the principal (`grants.read`)
  - public entity, bitemporal, Datalog, and timeline projections omit/redact
    ungranted PII and report `Denied` markers where appropriate
- Schema-driven entity UI exists:
  - `typeSchemaAsOf` returns both the compatibility `attributes` list and richer
    `columns` with attribute definitions
  - the Entities route renders declared type columns via `queryEntities`
  - entity detail orders state by the primary type's declared schema, then appends
    extra runtime facts
  - collection forms were already rendered from form definitions
- A bounded component-backed New Entity path exists:
  - the header button opens a creation form
  - the host wrapper writes initial facts into `@metacrdt/convex`
    component-owned state
  - `/component/e/:id` reads grouped current state and event history from the
    component
- A component-owned entity browser surface exists:
  - `@metacrdt/convex` exposes `log.listCurrentEntities`
  - the host wrapper exposes `api.metacrdtComponent.listOwnedCurrentEntities`
  - the Entities route shows component-owned entities separately and links them
    to `/component/e/:id`
- Component-owned Worker status actions exist:
  - `api.metacrdtComponent.setOwnedWorkerStatus` writes `worker.status` through
    the component-owned protocol log with `cardinality: "one"`
  - `/component/e/:id` surfaces Reactivate / Terminate buttons for
    component-owned Worker entities
- Component-owned configured actions exist:
  - `convex/lib/actionDefs.ts` centralizes action definition loading and
    placeholder/field resolution for both host-owned and component-owned action
    runners
  - `api.metacrdtComponent.runOwnedAction` runs configured action asserts against
    component-owned entities
  - `/component/e/:id` now renders configured actions for the entity's primary
    type instead of hard-coded Worker status buttons
- Datalog disjunction exists:
  - `convex/lib/engine.ts` parses bounded `{ or: [[...clauses], ...] }`
    clauses
  - branches evaluate as normal `where` bodies from the current binding and are
    unioned/deduped with provenance preserved
  - `explainDatalog` describes nested branch clauses
  - the Data model Datalog console and README examples include `or`
- Config history/diff exists:
  - `configHistory.currentManifest` reconstructs the current owned-artifact
    manifest from `config:default`
  - `configHistory.history` diffs the manifest before/after config-authored
    transactions so idempotent re-applies report no manifest change
  - the Data model page surfaces current manifest counts and recent config diffs
- Arg-taking actions exist:
  - action definitions can declare bounded input fields
  - `runAction` accepts args and resolves `$arg.<name>` / `$entity`
    placeholders in asserted facts
  - entity detail renders action inputs for configured fields
- Actions can open forms:
  - action definitions can declare `opensForm`
  - `runAction` issues or reuses the same waiting collection run/token used by
    flow collect steps
  - entity detail surfaces the returned `/collect` link immediately
- Collection links are single-use and expiring:
  - new `flowRuns` collection tokens carry `tokenExpiresAt`
  - successful submission stamps `tokenConsumedAt`
  - token lookup refuses consumed/expired/not-waiting runs before exposing form
    definitions
- Backend write authorization exists:
  - public app write mutations require `ctx.auth.getUserIdentity()`
  - raw public fact writes ignore spoofable `actorId` args and record the
    server-derived `tokenIdentifier`
  - component-owned write wrappers require the same authenticated principal
    before passing actor context across the component boundary
  - `/collect` submission remains token-authorized rather than login-authorized
- Component-owned configured actions can open forms:
  - `runOwnedAction` no longer rejects `opensForm` definitions
  - it resolves `opensForm.form` / `opensForm.scope` with the same action arg
    semantics as host-owned actions
  - it issues or reuses the host collection-token run for the component-owned
    entity id, returning the `/collect` URL to the component detail page
- Component-owned collection submission exists:
  - action-issued `flowRuns` can be marked `collectionTarget: "component"`
  - `/collect` submission for those tokens appends submitted field facts and the
    `submitted.<form>` marker into the installed `@metacrdt/convex` component log
  - legacy/host tokens with no target still write host facts

### Not Yet True

- Legacy `factEvents` may still lack core `eventId` / HLC / replica metadata.
- Convex schema still permits the legacy `correction` event kind for historical
  rows, while new corrections write protocol primitives.
- `facts` and `currentFacts` are still maintained as imperative projections,
  not folded directly from raw core-shaped events.
- `@metacrdt/convex` now has adapter helpers, stateless protocol helpers, a
  component-owned protocol transaction/event log, and component-owned
  `facts`/`currentFacts` projections with opt-in cardinality-one reconciliation
  and event-log rebuild for component-owned writes. The reference app still owns
  its production write path and has not migrated its existing business logic/rules
  onto component-owned state.
- Component-owned collection now writes submitted evidence into component-owned
  state for component-target tokens, but the collection run/token row itself
  still lives in the host `flowRuns` table. Component-owned forms/flows/compliance
  remain future work.
- `@metacrdt/runtime` is harness-first. It is not yet used by the Convex
  reference runtime.
- Multi-replica sync is specified and now implemented as in-memory
  version-vector anti-entropy, and the localStorage target persists event/HLC/seq
  state. A BroadcastChannel transport now handles same-origin browser publish and
  hello/delta catch-up. `@metacrdt/local` now packages those browser defaults as a
  local-first target. `@metacrdt/cloudflare` now provides Durable Object
  storage-backed runtime services, a structural WebSocket relay shell, and a
  Worker-facing router/DO class example, but not a live deployed service or auth.
- Full app login/provider UI is not configured; unauthenticated callers are
  treated as `anonymous` for reads, PII is denied by default, and general public
  writes now fail with `Not authenticated`. The hardened collection-token path
  remains the intentional anonymous write surface.
- Confect is integrated as a narrow sidecar spike:
  - `confect/` defines a typed Effect Schema function group.
  - `convex/metacrdtConfect.ts` manually mounts the generated registered
    function beside the existing hand-written Convex backend.
  - `api.metacrdtConfect.verifyEvents` verifies protocol-shaped `factEvents`
    with `@metacrdt/core`.
  - The spike result is recorded in [docs/confect.md](./docs/confect.md).

---

## Goal 1 — Core-Shaped Convex Write Path

**Status:** shipped in the Convex reference runtime.

**Objective:** Convex mutations must append events shaped like MetaCRDT protocol
events, and cardinality-one semantics must use the core `≺` order.

This was the protocol-correctness prerequisite for every later runtime and
Confect step.

### Acceptance Criteria

- `factEvents` include enough data to reconstruct a core `Event`:
  - `eventId`
  - `kind`
  - `e`, `a`, `v`
  - `validFrom`, `validTo`
  - HLC timestamp
  - `actor`, `actorType`
  - causal references / target IDs for lifecycle events
  - replica ID and per-replica sequence where appropriate
- Event IDs are deterministic and verified with `@metacrdt/core.verifyId` or an
  equivalent adapter.
- Cardinality-one attributes choose the surviving visible value by core `≺`,
  not by write arrival order.
- Existing public behavior is preserved for normal single-writer Convex use.
- Tests cover same-coordinate / concurrent-like writes in shuffled order and
  prove the same winner.
- The current `correctFact` behavior is represented as protocol primitives:
  tombstone the old assertion and assert the replacement, linked by causal
  metadata. Any retained Convex `correction` row is compatibility/audit sugar,
  not an event that `@metacrdt/core` must understand.
- `rebuildProjections` can rebuild from the event log without hidden dependency
  on prior `facts` state.
- `npm test`, `npm run test:core`, and Convex typecheck pass.

### Design Rules

1. **Do not make Confect part of this step.**
   This goal is protocol correction, not framework migration.
2. **Keep `@metacrdt/core` dependency-free.**
   Any Convex adaptation belongs in `convex/` for now, later
   `@metacrdt/convex`.
3. **Keep projections for now.**
   `facts`, `currentFacts`, and `derivedFacts` remain read models until the fold
   path is proven and migration risk is lower.
4. **Prefer additive schema migration.**
   Add event fields; do not break existing rows before a backfill/rebuild path is
   available.
5. **Make old events readable.**
   Adapters should tolerate missing `eventId` / HLC fields for existing dev data
   until `rebuildProjections` or a migration stamps them.
6. **Treat `correction` as an operation, not a core event.**
   `correctFact` may remain a public Convex mutation, but the protocol log should
   express it as tombstone-old + assert-new with causal links. A Convex-only
   `correction` row can remain only as legacy compatibility or audit summary.
7. **Centralized Convex will not naturally exercise concurrency.**
   With one authoritative writer, HLC logical counters will usually be `0` and
   observed writes will still look sequential. `≺`-supersession is a correctness
   property we prove with tests and need for future replicas, not a user-visible
   behavior change in normal centralized operation.

### Work Breakdown

#### 1. Read Convex Guidelines

- [x] Read `convex/_generated/ai/guidelines.md`.
- [x] Note any generated rules that affect schema, indexes, validators, or
  scheduler usage.

#### 2. Audit Existing Write Path

- [x] Inspect:
  - `convex/schema.ts`
  - `convex/facts.ts`
  - `convex/lib/visibility.ts`
  - `convex/internal/materialize.ts`
  - tests that assert/retract/tombstone/correct facts
- [x] Identify where each event kind is appended.
- [x] Identify where `facts` and `currentFacts` are patched.
- [x] Identify where cardinality-one supersession is decided.
- [x] Identify how `correctFact` currently records `correction` and patches
  `supersedes` / `supersededBy`, then decide which fields become causal metadata
  on the protocol tombstone/assert pair.

#### 3. Define Convex ↔ Core Adapters

Create local Convex adapters first; extract to `@metacrdt/convex` later.

- [x] Add adapter module, likely `convex/lib/coreEvent.ts`.
- [x] Implement:
  - Convex event row → core `Event`
  - core `Event` → Convex event row fields
  - transaction actor/source → core actor fields
  - timestamp → HLC fallback
  - missing legacy metadata fallback
- [x] Keep conversion deterministic and testable.

Recommended shape:

```ts
toCoreEvent(row): Event
eventBodyFromAssert(args, tx, hlc): EventBody
sealEventForConvex(body, seq): { eventId, hlc, ...rowFields }
```

#### 4. Extend Schema

- [x] Add fields to `factEvents`:
  - `eventId?: string`
  - `hlc?: { pt: number; l: number; r: string }` or flattened fields
  - `replicaId?: string`
  - `seq?: number`
  - `targetEventId?: string` / lifecycle refs if needed
  - `causes?: string[]`
- [x] Add indexes only if needed by the implementation:
  - by `eventId`
  - by `replicaId, seq` only after a real `seq` source exists
- [x] Keep old fields in place for compatibility with current tests and UI.

#### 5. Stamp New Events

- [x] In `assertFact`, build a core assert event body and seal it.
- [x] In `retractFact`, build a core retract event targeting the asserted event.
- [x] In `tombstoneFact`, build a core tombstone event.
- [x] In `correctFact`, express correction as tombstone-old + assert-new, linked
  by causal metadata.
- [x] Decide whether the existing Convex `correction` event row remains:
  - preferred: stop writing new `correction` rows once the protocol pair is in
    place, and derive "correction" for UI/audit from causal links;
  - acceptable transition: continue writing a `correction` summary row, but mark
    it Convex-only and ensure the core adapter ignores or expands it.
- [x] Preserve transaction rows and existing event semantics.

#### 6. Implement HLC / Replica Metadata

For the centralized Convex runtime, this can be minimal but protocol-shaped.

- [x] Define a stable replica ID for the deployment / runtime.
  - Initial pragmatic value can be `"convex:<deployment>"` or `"convex:dev"`.
  - Avoid reading browser/client state.
- [x] Do **not** add a global transactional counter in this phase.
  - A single counter row would serialize every write and create avoidable
    contention.
  - For the centralized Convex runtime, leave `seq` optional or derive a
    compatibility sequence from existing transaction/event ordering only for
    export/sync adapters.
  - Add a real per-replica monotonic `seq` when building the multi-replica sync
    runtime, where it can be owned by the replica/target (for example a Durable
    Object or local replica), not by one global Convex document.
- [x] HLC physical time starts from transaction time.
- [x] HLC logical component is derived from Convex transaction document
  `_creationTime`, preserving rapid same-millisecond centralized write order
  without a global counter.
- [x] Tests freeze wall-clock time to exercise `≺` conflict resolution in the
  Convex projection.

#### 7. Switch Cardinality-One Supersession

- [x] Replace "current arrival-order prior fact wins/loses" logic with a
  core-order comparison among visible candidate assertions for `(e, a)`.
- [x] Surviving value for `cardinality: "one"` is the `≺`-max visible assert.
- [x] Non-surviving visible asserts should be represented as superseded/retracted
  in the projection without pretending their events never existed.
- [x] Preserve user-facing current state for ordinary sequential writes.

Important distinction:

- The event log should keep all concurrent assertions.
- The projection chooses one current value for cardinality-one.
- The losing event remains explainable/auditable.
- In today's centralized runtime, ordinary user behavior should remain
  sequential. The point of this change is to make projection semantics
  replica-independent before a second replica exists.

#### 8. Rebuild From Event Log

- [x] Update `rebuildProjections` to prefer core-shaped events when present.
- [x] Keep compatibility with legacy event rows.
- [x] Prove rebuild produces the same `facts` / `currentFacts` result as live
  writes.
- [x] Ensure derived-rule materialization still runs from rebuilt facts.

#### 8.5. Legacy Metadata Policy

- [x] Choose and document one policy before deployment:
  - **Permanent tolerant adapter:** legacy `factEvents` without `eventId` / HLC
    remain readable forever; only new events are protocol-shaped.
  - **Backfill mutation:** add an internal one-shot/self-continuing migration that
    stamps deterministic compatibility metadata onto existing events in
    `chatty-hare-94`.
- [x] Preferred initial policy: permanent tolerant adapter. It is lower risk for
  the dev deployment, avoids rewriting audit history, and still lets all new
  writes be protocol-shaped. A backfill can be added later if sync/export needs
  every historical row stamped.

#### 9. Tests

Add focused tests before broader refactors.

- [x] Core adapter tests:
  - [x] New event rows carry metadata that reconstructs a core event whose
    `eventId` verifies.
  - [x] Legacy event row can still be adapted explicitly.
- [x] Write-path tests:
  - `assertFact` writes `eventId` and HLC metadata.
  - retract/tombstone/correct events reference the target event/fact correctly.
  - `correctFact` either emits tombstone+assert protocol events or its Convex-only
    summary row expands/ignores cleanly in the adapter.
- [x] Cardinality tests:
  - two same-coordinate cardinality-one assertions converge to the `≺`-max.
  - insertion order does not change final `currentFacts`.
  - losing assertion remains in history/provenance.
- [x] Rebuild tests:
  - live projection equals rebuilt projection.
  - derived facts still rebuild.

#### 10. Verification

Run:

```bash
npm run test:core
npm test
npx tsc --noEmit -p convex/tsconfig.json
npx tsc --noEmit -p tsconfig.json
npx convex dev --once
```

If frontend-visible behavior changes:

```bash
npm run build
npx @convex-dev/static-hosting upload
```

Then verify the live site at `chatty-hare-94`.

---

## Goal 2 — Confect Spike for the Convex Target

**Status:** shipped as a sidecar spike; adopted narrowly.

**Objective:** evaluate whether Confect should become the authoring/runtime style
for `@metacrdt/convex`, after core write semantics are correct.

This was an evaluation, not a migration. The output was a working sidecar slice
plus the written decision captured in [docs/confect.md](./docs/confect.md).

### Why After Goal 1

Confect improves schema, service, and error boundaries. It does not define the
MetaCRDT protocol. Converting to Confect before the write path is protocol-shaped
would move complexity sideways while preserving the central correctness gap.

Goal 1 is now shipped: new writes carry protocol metadata, corrections expand to
tombstone+assert protocol events, cardinality-one projection uses core `≺`, and
`rebuildProjections` prefers protocol order. That makes Confect a framework
question rather than a correctness substitute.

### Current Confect API Baseline

Verified against current Confect docs / npm on 2026-06-07:

- Packages are `@confect/core`, `@confect/server`, `@confect/cli`, and
  `@confect/react`; current npm version is `8.0.0`.
- Confect projects define:
  - `confect/schema.ts` with `DatabaseSchema.make().addTable(...)`
  - `confect/*.spec.ts` with `GroupSpec` / `FunctionSpec`
  - `confect/*.impl.ts` with `GroupImpl` / `FunctionImpl`
  - `confect/impl.ts` finalized with `Impl.finalize`
- `confect codegen` generates Confect API refs, services, and registered Convex
  functions.
- Confect functions can coexist with plain Convex functions. That is mandatory
  for this repo; do not try to port the whole backend in one step.
- Database access is through generated services such as `DatabaseReader` and
  `DatabaseWriter`.
- Confect docs explicitly cover incremental migration and plain Convex function
  integration; the spike should use that path.

### Decision Question

The spike answers one question:

> Should `@metacrdt/convex` be authored in Confect/Effect, or should Confect
> remain an optional app-level integration on top of plain Convex bindings?

The decision must be based on code, not preference.

### Spike Scope

Build one sidecar vertical slice only. Do **not** rewrite `convex/facts.ts` in
place during the first spike.

Recommended slice:

- A `confect/` sidecar group that can read protocol-shaped fact events and expose
  one small MetaCRDT-facing function, for example:
  - `metacrdt.events.byEntityAttr`
  - `metacrdt.events.verify`
  - `metacrdt.entity.current`
- It should call or mirror only enough logic to test Confect's shape:
  - Effect Schema args/returns
  - generated database services
  - typed errors
  - interop with plain Convex tables/functions
  - convex-test or Confect test harness ergonomics
- It must not become the production write path until the spike decision is
  recorded.

Explicit non-scope:

- Do not port flows, compliance, forms, Datalog, or the frontend.
- Do not replace `convex/schema.ts` globally.
- Do not move `@metacrdt/core` behind Effect services.
- Do not introduce `@metacrdt/runtime` yet; one runtime target is not enough
  evidence for the harness boundary.

### Acceptance Criteria

- Dependencies are installed intentionally:
  - `effect`
  - `@confect/core`
  - `@confect/server`
  - `@confect/cli`
  - optionally `@confect/react` only if a frontend call is part of the spike
- Confect codegen runs and generated files coexist cleanly with
  `convex/_generated`.
- One query or mutation group is expressed through Confect/Effect without
  changing existing public API behavior.
- Args and returns use Effect Schema.
- At least two typed errors are modeled, for example:
  - `UnknownEntity`
  - `UnknownEvent`
  - `InvalidProtocolEvent`
  - `Denied`
- The function can import and use `@metacrdt/core`.
- Existing plain Convex functions keep working.
- Tests or a documented harness run prove:
  - the Confect function executes locally
  - generated refs typecheck
  - typed errors are representable at the boundary
- `npm test`, `npm run test:core`, Convex typecheck, app typecheck, and
  Confect codegen/typecheck pass or any failure is clearly documented as a
  blocker.
- Decision recorded in `docs/confect.md`:
  - adopt broadly
  - adopt only for `@metacrdt/convex`
  - adopt only for app-level functions
  - defer
  - reject

### Spike Tasks

#### 1. Re-read project and Convex constraints

- [x] Read `convex/_generated/ai/guidelines.md`.
- [x] Re-read this Goal 2 section.
- [x] Confirm the working tree is clean before installing dependencies.

#### 2. Verify Confect current API

- [x] Check npm versions for Confect packages.
- [x] Read current Confect docs for:
  - packages
  - quickstart / project structure
  - functions
  - database schema
  - services
  - testing
  - incremental migration
  - plain Convex function interop
- [x] Capture any API differences from `docs/confect.md` before coding.

#### 3. Install and generate

- [x] Install the minimal Confect dependencies.
- [x] Add npm scripts:
  - `confect:codegen`
  - `test:confect`
  - `confect:dev` intentionally omitted; this repo should not let Confect watch
    and rewrite the existing hand-written `convex/` tree.
- [x] Create the minimal Confect file tree:

```text
confect/
  schema.ts
  spec.ts
  impl.ts
  metacrdt.spec.ts
  metacrdt.impl.ts
```

- [x] Run Confect codegen.
- [x] Inspect generated files and commit only source/generated files that Confect
  expects to be checked in.
- [x] Add a safe sidecar codegen wrapper:
  `scripts/confect-codegen-sidecar.mjs` temporarily points Confect at a throwaway
  functions target so codegen can update `confect/_generated/*` without
  overwriting this repo's real `convex/` tree.

#### 4. Sidecar function group

- [x] Define a small Effect Schema for protocol event output:
  - `eventId`
  - `kind`
  - `e`, `a`, `v`
  - `validFrom`, `validTo`
  - `hlc`
  - `actor`, `actorType`
  - `targetEventId`, `causalRefs`
- [x] Implement one Confect public query that reads existing Convex tables.
- [x] Keep it read-only unless the first query proves too small to evaluate the
  write ergonomics.
- [x] If adding a write, use a separate probe table or a no-op validation write;
  do not route production `assertFact` through Confect in this spike.
- [x] Import `@metacrdt/core.verifyId` and expose a validation result for events
  with metadata.

#### 5. Typed errors

- [x] Define at least two Effect tagged errors.
- [x] Verify how Confect serializes or exposes those errors to callers.
- [x] Decide whether the error surface is appropriate for:
  - Datalog `QueryTooComplex`
  - PII/auth `Denied`
  - protocol `InvalidEvent`

#### 6. Testing and deploy compatibility

- [x] Add a focused test for the Confect sidecar function, using whichever harness
  Confect recommends.
- [x] Keep existing `convex-test` tests green.
- [x] Run:

```bash
npm run confect:codegen
npm run test:core
npm test
npx tsc --noEmit -p convex/tsconfig.json
npx tsc --noEmit -p tsconfig.json
npx convex dev --once
```

- [x] If Confect generates Convex functions under `convex/`, verify they deploy
  alongside the existing functions without changing current API refs.

#### 7. Decision record

- [x] Update `docs/confect.md` with a dated "Spike Result" section.
- [x] Record:
  - exact versions installed
  - generated file layout
  - what worked
  - what broke
  - bundle/codegen/deploy friction
  - test friction
  - recommendation
- [x] Update `TODO.md` with the decision and the next action.

### Spike Result

**Decision:** adopt Confect narrowly for `@metacrdt/convex` internals and typed
boundary experiments; do **not** convert the current reference app wholesale.

Evidence:

- Confect/Effect functions run inside the Convex isolate.
- Effect Schema args/returns work for a real protocol function.
- Typed errors are transported as `ConvexError.data` and are visible through
  `convex-test`.
- The generated registered function can be manually mounted beside the existing
  plain Convex backend.
- Confect's CLI is not sidecar-safe by default: `confect codegen` treats
  `convex/` as a generated target, rewrites `schema.ts`, and removes function
  modules not represented in the Confect spec. The safe wrapper avoids this for
  the spike, but a reusable package should not depend on that workaround forever.

Recommendation:

- Use the Confect source/spec/impl style as an option inside `@metacrdt/convex`.
- Keep `@metacrdt/core` pure and Effect-free.
- Keep the current reference app's production API in plain Convex until
  `@metacrdt/convex` has a clean package boundary.
- Do not run raw `confect dev` in this repo unless the entire `convex/` tree has
  been intentionally moved under Confect ownership.

### Decision Gates

Adopt Confect for `@metacrdt/convex` only if all are true:

- Generated Convex functions coexist cleanly with plain Convex functions.
- Effect Schema actually reduces duplication at the function boundary.
- Typed errors survive the Convex/client boundary in a way the app can use.
- The test story is no worse than current `convex-test`, or the improvement is
  large enough to justify a new harness.
- The code remains easy to understand for someone who knows Convex but not
  Effect.

Defer Confect if:

- codegen layout fights the current repo structure;
- generated refs are awkward to call from the existing React/Convex client;
- Effect boilerplate obscures a simple Convex function;
- tests require rewriting most of the suite before proving value.

Reject Confect for the core target if:

- it cannot deploy cleanly with Convex in this repo;
- typed errors collapse into opaque server errors;
- database service ergonomics make indexed reads/writes harder to audit;
- it forces `@metacrdt/core` or protocol semantics to depend on Effect.

---

## Goal 3 — Extract `@metacrdt/convex`

**Objective:** turn the proven Convex reference code into a reusable Convex target
package.

Do this only after Goal 1, and preferably after the Confect spike.

### Target Shape

One package:

```text
packages/convex/
  package.json        # @metacrdt/convex
  src/
    component/        # Convex component surface, if used
    bindings/         # lower-level function/schema factories
    adapters/         # Convex row ↔ core event
    confect/          # optional Confect mounting helpers, informed by Goal 2
```

### Surfaces

- Convex component for drop-in use.
- Lower-level bindings for apps that want to own their own tables.
- Schema fragments / validators.
- Rebuild/materialization helpers.
- Testkit utilities.
- Optional Confect adapter helpers that expose generated registered functions
  without requiring Confect to own a host app's entire `convex/` tree.

### Goal 3 Work Breakdown

#### 1. Package boundary

- [x] Create `packages/convex` as `@metacrdt/convex`.
- [x] Keep it dependent on `@metacrdt/core`.
- [x] Do not depend on app `convex/_generated/*` types.
- [x] Keep Confect optional unless the package boundary proves it should be a
  peer dependency.

#### 2. Move adapters first

- [x] Move or duplicate the stable adapter logic from:
  - `convex/lib/coreEvent.ts`
  - `convex/lib/visibility.ts`
  - Confect spike reconstruction helpers in `confect/metacrdt.impl.ts`
- [x] Expose pure Convex-row adapter helpers:
  - assert row → core `Event`
  - lifecycle row → core `Event`
  - core event → Convex insert patch
  - legacy fallback event
- [x] Add package-local tests with fixtures, not live Convex tables.

#### 3. Schema and function bindings

- [x] Export validators/schema fragments for protocol metadata fields.
- [x] Export pure cardinality-one reconcile selection by `≺`.
- [x] Export host-mounted helper factories for:
  - append protocol assert event
  - append lifecycle event
  - verify event rows
- [x] Export registered Convex component/functions for the same stateless
  protocol helpers once the component API is clear:
  - build protocol assert row
  - build protocol lifecycle row
  - summarize one or many protocol rows
- [x] Keep host apps free to mount functions under their own names: the reference
  app installs the package as `components.metacrdt` and exposes
  `api.metacrdtComponent.verifyEvents` as its own wrapper.

Deferred rationale: Goal 3 ships reusable, target-shaped helpers plus a
stateless registered component surface. A state-owning component that owns
tables/projection writes is still deferred; shipping that now would fossilize the
current reference app's projection choices as public API.

#### 4. Confect integration decision

- [x] Extract the safe parts of the spike:
  - Effect Schema event summary
  - typed protocol errors
  - generated-function manual mount pattern
- [x] Do not expose a helper that runs raw `confect codegen` against a host app's
  `convex/` tree.
- [x] Decide whether Confect support is:
  - `@metacrdt/convex/confect`
  - docs-only recipe
  - deferred until Confect supports a true sidecar target.

Decision: `@metacrdt/convex` exposes a small `confectSidecarWarning()` helper and
keeps Confect optional/docs-first. The package does not run codegen for host apps.

#### 5. Verification

- [x] Package tests pass.
- [x] Existing Convex reference tests pass after importing from package.
- [x] `npx convex dev --once` still deploys the reference app.
- [x] Docs/TODO updated with the extraction result.

### Non-Goals

- Do not include Cloudflare or local-first code.
- Do not include Forma compiler code.
- Do not include product UI.

---

## Goal 4 — Extract `@metacrdt/forma`

**Objective:** fold the durable Open Ontology Lisp language layer into the
MetaCRDT package graph as the formal authoring language.

Use [docs/package-consolidation.md](./docs/package-consolidation.md) as the
source map.

### Source Material

- `.context/open-ontology/packages/language-ts`
- `.context/open-ontology/packages/language-host`
- `.context/open-ontology/packages/language-editor`
- `.context/open-ontology/specs/language/*`
- `.context/open-ontology/docs/lisp/*`
- selected language tests

### Acceptance Criteria

- [x] `packages/forma` exists as `@metacrdt/forma`.
- [x] README states what Forma owns and does not own.
- [x] No runtime/target dependencies.
- [x] No imports from `.context/open-ontology`.
- [x] Selected Lisp fixtures parse/evaluate/typecheck.
- [x] Any old Onlang naming is either removed or documented as legacy alias.

---

## Goal 5 — True `applyConfig` Reconcile

**Status:** shipped in the reference runtime.

**Objective:** make config-as-code behave like a reconciler, not just an
idempotent upsert. If a configured type, attribute, form, flow, requirement, or
action is removed from the blueprint and `applyConfig` runs again, the old
configured shape must be retracted or deactivated through the same fact/history
model instead of lingering.

### Implementation Notes

- Reconcile is **section-scoped**. A partial config such as
  `{ actions: [...] }` reconciles only actions; omitted sections are treated as
  untouched overlays, not empty desired sets. An explicit empty array means
  "remove every artifact previously owned by this section."
- Ownership is tracked as facts on `config:default`:
  `owns.attribute`, `owns.entityType`, `owns.form`, `owns.flow`,
  `owns.requirement`, and `owns.action`. This prevents config cleanup from
  guessing whether an unrelated system/data artifact belongs to the tenant
  blueprint.
- Fact-backed carriers (`attr:*`, `type:*`, `form:*`, `action:*`) are removed by
  retracting their current facts in a new `actorId: "config"` transaction.
- Requirement cleanup disables `require.<form>` / `task.<form>` rules and deletes
  their derived facts; flow cleanup deletes the owned `flowDefs` row. These rows
  are not currently modeled as full retractable protocol events, so this is the
  documented imperative edge for now.

### Acceptance Criteria

- `applyConfig` computes a stable desired set for every configured artifact it
  owns.
- Previously configured facts that are no longer desired are retracted in a new
  transaction with `actorId: "config"` and an explicit reconcile reason.
- Runtime data facts are not retracted by config reconcile.
- System/meta facts are not retracted by tenant config reconcile.
- Existing imperative rows that are not fact-backed enough to retract safely
  (for example flow/action definitions, if applicable) have a clear inactive or
  superseded state, or the plan records why they remain append-only for now.
- Tests prove removal:
  - removing a requirement removes the derived obligation on the next reconcile
  - removing an action makes it disappear from `actionsForType` / entity detail
  - removing a configured type/attribute affects configured-type discovery
    without deleting runtime entities
- Existing behavior for repeated identical `setupStaffing` / `applyConfig` stays
  idempotent.
- Convex tests, package tests, typechecks, and `npx convex dev --once` pass.

---

## Goal 6 — Attribute-Level PII Read Authorization

**Status:** shipped in the Convex reference runtime.

**Objective:** make PII fields readable only to principals with explicit
attribute grants. Ungranted projections must omit the value and report a
`Denied` marker instead of relying on frontend hiding.

### Implementation Notes

- The read principal is derived server-side from
  `ctx.auth.getUserIdentity()?.tokenIdentifier`; unauthenticated callers are the
  `anonymous` principal. No read API accepts a caller-provided user id.
- Sensitive attributes are detected from form definitions (`pii: true` or
  `sensitive: true`) and from schema-as-facts escape-hatch metadata on
  `attr:<name>` (`pii` / `sensitive`).
- Grants are facts on the principal:
  `(principal, "grants.read", { e, a })`, with `*` supported for entity or
  attribute wildcards.
- Public read surfaces enforce redaction:
  - `facts.getEntity`
  - `facts.queryFacts`
  - `facts.entityAsOf`
  - `facts.compareFacts`
  - `facts.entityFactsAsOf`
  - `facts.history`
  - `facts.entityTimeline`
  - `entities.entityDetail`
  - `entities.queryEntities`
  - public Datalog / aggregate queries
- Internal folds/materializers continue to evaluate raw facts. The Datalog engine
  takes an explicit `enforceReadAuth` option so public queries are protected
  without changing rule/materialization semantics.
- The UI displays denied rows on the entity detail and time-travel pages.

### Acceptance Criteria

- I-9 SSN is marked as PII in the staffing blueprint.
- Unauthenticated reads omit `i9/ssn` and include a `Denied` marker.
- An authenticated principal without a grant is also denied.
- Granting `(principal, "grants.read", { e, a })` reveals the value to that
  principal.
- Public Datalog cannot bind ungranted PII values.
- Tests prove denial and grant behavior through entity reads, as-of reads,
  `queryFacts`, and Datalog.
- Full Convex tests, package tests, typechecks, build, and `npx convex dev
  --once` pass.

---

## Goal 7 — Schema-Driven Entity UI

**Status:** shipped in the Convex reference runtime.

**Objective:** make the user-facing entity browser/rendering follow configured
type schema instead of opportunistically discovering whatever facts happen to be
present on current data rows.

### Implementation Notes

- `attributes.typeSchemaAsOf` now returns:
  - `attributes`: the existing compatibility list of declared attribute names
  - `columns`: UI-ready attribute definition objects (`valueType`, `cardinality`,
    description, etc.) reconstructed from schema-as-facts where present
- `src/pages/Entities.tsx` uses `typeSchemaAsOf(...).columns` as the table
  columns and `entities.queryEntities` as the paginated row source.
- `src/pages/EntityDetail.tsx` orders the state table by the entity's primary
  declared type schema first, then appends extra runtime facts not in the schema.
- The collection page already renders from `forms.collectionByToken` /
  `formDef`, so form rendering remains schema-driven.
- PII `Denied` markers continue to flow through list/detail rows.

### Acceptance Criteria

- Configured type schema exposes declared column definitions from facts.
- Entity list rows render declared columns rather than only id/name rows or
  discovered columns.
- Entity detail state is ordered by declared schema.
- Tests prove `typeSchemaAsOf` includes column definitions and that configured
  staffing rows expose declared Placement attributes.
- Full Convex tests, package tests, typechecks, build, static upload, and
  `npx convex dev --once` pass.

---

## Goal 8 — Confect-First Compliance Planning

**Status:** shipped in the Convex reference runtime.

**Objective:** answer the question "should we first convert current Convex logic
to Confect/Effect?" by converting one real production domain boundary, not the
whole backend. The target domain is compliance read/planning:

- preserve the existing plain Convex `api.compliance.workerCompliance` behavior;
- add a no-write dry-run compliance planner;
- implement the new planning logic through Confect/Effect schemas, services, and
  typed errors;
- keep `@metacrdt/core` and existing protocol write-path code Effect-free.

The intended result is a reusable pattern for future `@metacrdt/convex` work:
Confect owns typed boundary logic and domain services where it pays rent, while
the protocol kernel and low-level Convex projections remain plain, auditable
code.

### Decision

Yes, Confect should be next, **but not as a wholesale conversion of `convex/`**.

The earlier Confect spike proved:

- Confect can run inside the Convex isolate.
- Effect Schema args/returns work.
- tagged errors cross the Convex boundary as structured `ConvexError.data`.
- generated registered functions can be mounted manually beside plain Convex
  modules.
- raw `confect codegen` is not safe to run directly against this repo's real
  `convex/` directory.

Therefore the next step is a **sidecar production slice**:

```text
confect/compliance.spec.ts       # typed args / returns / errors
confect/compliance.impl.ts       # Effect implementation over generated services
convex/complianceConfect.ts      # manual mount of generated functions
convex/compliance.ts             # stable existing public API remains plain Convex
```

This slice is clear enough to adopt Confect narrowly for read/planning domains.
It does **not** justify a wholesale rewrite or converting protocol writes yet.

### Why Compliance Planning

Compliance planning is the right next conversion target because it exercises real
business logic without touching the highest-risk protocol write path.

It uses:

- schema/config facts (`form:*`, configured requirements, placement attrs);
- current runtime facts (`submitted.<form>`, worker placements);
- derived obligations (`requires.*`, `task.*`) as a compatibility check;
- redaction-safe public reads;
- a user-facing UI where "collect vs reuse" is immediately visible.

It avoids:

- mutating `factEvents`;
- rewriting `facts.ts`;
- changing cardinality-one projection semantics;
- making `@metacrdt/core` depend on Effect;
- handing the whole `convex/` tree to Confect codegen.

### Feature Scope

Add a dry-run planner that answers:

> For this worker and a hypothetical placement context, which forms would be
> required, which existing submissions would be reused, and which forms would
> need collection?

Representative input:

```ts
{
  worker: "worker:maria",
  placement: {
    employer: "employer:acme",
    client: "client:globex",
    job: "job:forklift",
    venue: "venue:stadium7"
  }
}
```

Representative output:

```ts
{
  worker: "worker:maria",
  items: [
    { form: "i9", scope: "employer:acme", decision: "reuse" },
    { form: "handbook", scope: "client:globex", decision: "collect" },
    { form: "forklift", scope: "job:forklift", decision: "collect" },
    { form: "venue_disclosure", scope: "venue:stadium7", decision: "reuse" }
  ],
  summary: { reuse: 2, collect: 2, total: 4 }
}
```

The query must not write transactions, facts, derived facts, flow runs, or
tokens. It is a planning projection only.

### Acceptance Criteria

- `confect/compliance.spec.ts` defines Effect Schema args, returns, and at least
  these typed errors:
  - `UnknownWorker`
  - `InvalidPlacement`
  - `UnknownRequirementShape` or `UnsupportedRequirement`
- `confect/compliance.impl.ts` implements the dry-run query using generated
  Confect `DatabaseReader` services and ordinary Effect programs.
- `convex/complianceConfect.ts` manually mounts the generated function, matching
  the safe sidecar pattern from `convex/metacrdtConfect.ts`.
- Existing `api.compliance.workerCompliance` behavior remains unchanged.
- A public dry-run API exists. Acceptable mount options:
  - preferred: `api.compliance.dryRunWorkerCompliance` as a plain Convex wrapper
    around shared logic or a stable exported function;
  - acceptable: `api.complianceConfect.dryRunWorkerCompliance` if wrapping the
    generated function cleanly creates circularity or type issues.
- The dry-run planner is backed by the same configured requirement source the
  live compliance engine uses, not a hard-coded UI list.
- The planner handles at least:
  - existing worker with existing placement;
  - existing worker with hypothetical placement;
  - new/unsubmitted form => `collect`;
  - current matching submission for same `(worker, form, scope)` => `reuse`;
  - conditional forklift requirement based on job role.
- Tests prove the query is read-only by checking relevant table counts before
  and after.
- Tests prove decisions are stable regardless of row order.
- Existing Convex compliance tests continue to pass.
- Docs record the decision:
  - Confect adopted for compliance planning sidecar;
  - not yet adopted for protocol writes;
  - next expansion criteria.

### Work Breakdown

#### 1. Read and Audit

- [x] Read `convex/_generated/ai/guidelines.md`.
- [x] Inspect:
  - `convex/compliance.ts`
  - `convex/appconfig.ts`
  - `convex/rules.ts`
  - `convex/entities.ts`
  - existing compliance/appconfig tests
  - `confect/metacrdt.*`
  - `confect/schema.ts`
  - `confect/tables/*`
- [x] Confirm working tree is clean before changing the Confect sidecar.

#### 2. Define Requirement Source

The planner must not drift from configured requirements.

Choose one source:

- **Preferred:** derive requirements from configured/enabled rules:
  - parse `rules` rows named `require.<form>`;
  - infer scope from the placement clause, e.g. `["?p", "employer", "?s"]`;
  - infer simple guards, e.g. job role equals `forklift`;
  - treat unknown shapes as typed `UnsupportedRequirement`, not silent success.
- **Fallback:** factor staffing requirements into a shared constant used by both
  `appconfig` and the dry-run planner. This is simpler but less general.

Do not duplicate requirement literals directly in the UI.

#### 3. Extend Confect Schema

- [x] Add Confect table definitions needed by the planner:
  - `currentFacts`
  - `rules`
  - optionally `derivedFacts`
  - any table required for read-only verification
- [x] Preserve the safe codegen wrapper:
  - use `npm run confect:codegen`;
  - do not run raw `confect codegen` against the real `convex/` tree.
- [x] Regenerate `confect/_generated/*` and confirm no hand-written Convex files
  are removed or rewritten.

#### 4. Write the Confect Spec

- [x] Create `confect/compliance.spec.ts`.
- [x] Add `dryRunWorkerCompliance` public query spec:
  - args: worker id and optional hypothetical placement object.
  - returns: typed result with item list and summary.
  - errors: `UnknownWorker`, `InvalidPlacement`, `UnsupportedRequirement`.
- [x] Use exact optional fields correctly; Confect/Effect Schema should omit
  absent fields rather than return `undefined`.

#### 5. Implement the Effect Program

- [x] Create `confect/compliance.impl.ts`.
- [x] Read current facts through `DatabaseReader`.
- [x] Build a placement context from:
  - existing `Placement` facts for the worker;
  - optional hypothetical placement args.
- [x] Read and parse configured requirement rules.
- [x] For each requirement:
  - resolve the scope entity;
  - evaluate supported guards;
  - check existing `submitted.<form>` facts for `(worker, scope)`;
  - return `reuse` or `collect`.
- [x] Deduplicate by `(form, scope)`.
- [x] Produce deterministic ordering by `(form, scope, decision)`.
- [x] Make absence/error cases typed, not thrown strings.

#### 6. Mount Safely

- [x] Add the new group to `confect/spec.ts` and `confect/impl.ts`.
- [x] Export the registered function from `convex/complianceConfect.ts`.
- [x] Decide whether `convex/compliance.ts` should expose a wrapper:
  - if yes, document how the wrapper avoids generated-reference circularity;
  - if no, document why clients should call `api.complianceConfect.*` directly.
- [x] Keep existing `api.compliance.workerCompliance` unchanged.

#### 7. Tests

- [x] Add Confect/Convex tests proving:
  - dry-run for a fully seeded worker returns expected `reuse`/`collect`;
  - dry-run with a hypothetical forklift placement includes forklift form;
  - non-forklift job omits forklift form;
  - existing current submissions are reused;
  - missing submissions are collected;
  - unsupported rule shapes fail with a typed error;
  - no rows are inserted/updated/deleted by the query.
- [x] Reuse existing appconfig/staffing bootstrap helpers where possible.
- [x] Avoid asserting UI copy in backend tests.

#### 8. Frontend

- [x] Add a dry-run panel to `src/pages/Compliance.tsx`.
- [x] Inputs:
  - worker
  - employer
  - client
  - job
  - venue
- [x] Render a compact table:
  - form
  - scope
  - decision (`Reuse` / `Collect`)
  - reason/source if returned
- [x] Do not add explanatory marketing copy in-app.
- [x] Preserve the existing compliance panel and bootstrap behavior.

#### 9. Documentation

- [x] Update `docs/confect.md` with the Goal 8 result:
  - what became easier;
  - what remained awkward;
  - whether Confect should expand beyond compliance planning.
- [x] Update `TODO.md`:
  - mark dry-run compliance shipped if complete;
  - record any next Confect conversion candidate.
- [x] Update `README.md` only if public API or first-principles positioning
  changes.

#### 10. Verification

Run:

```bash
npm run confect:codegen
npm run test:core
npm run test:convex-package
npm run test:forma
npm run test:confect
npm test
npx tsc --noEmit -p packages/core/tsconfig.json
npx tsc --noEmit -p packages/convex/tsconfig.json
npx tsc --noEmit -p packages/forma/tsconfig.json
npx tsc --noEmit -p convex/tsconfig.json
npx tsc --noEmit -p tsconfig.json
npm run build
npx convex dev --once
npx @convex-dev/static-hosting upload
```

Result for shipped Goal 8:

- `npm run confect:codegen` passed.
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (9 tests).
- `npm run test:forma` passed (9 tests).
- `npm run test:confect` passed (2 tests).
- `npm test` passed (80 Convex tests).
- Package, Convex, and app typechecks passed.
- `npm run build` passed.
- `npx convex dev --once` pushed functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` pushed the static UI.
- Live `complianceConfect:dryRunWorkerCompliance` returned a dry-run plan for
  `worker:maria`.

If browser tooling is available, verify:

- `/compliance` renders the dry-run panel;
- a seeded worker shows both `Reuse` and `Collect` decisions;
- no admin/sidebar chrome appears on `/collect`.

### Non-Goals

- Do not convert `convex/facts.ts` to Confect in this goal.
- Do not convert Datalog, flows, forms, or appconfig wholesale.
- Do not introduce `@metacrdt/runtime`.
- Do not move `@metacrdt/core` behind Effect services.
- Do not make Confect codegen own the real `convex/` tree.
- Do not add auth provider configuration as part of this goal.

### Expansion Criteria

After Goal 8, Confect can expand only if all are true:

- the compliance planner is easier to test than the equivalent plain Convex
  implementation would be;
- typed errors are visible and useful to callers;
- codegen remains sidecar-safe;
- the domain logic reads as an Effect service boundary rather than boilerplate;
- the public API stays stable.

Likely next Confect candidates if Goal 8 succeeds:

1. `@metacrdt/convex` function factories for read-only event verification and
   append helpers.
2. Config diff/history read model.
3. Arg-taking action planning.
4. Only later: protocol writes.

---

## Goal 9 — Config History / Diff Read Model

**Status:** shipped in the Convex reference runtime.

**Objective:** make config-as-code changes inspectable. `applyConfig` already
lowers declarations into facts and rows; this goal adds a read model and UI
surface that show the current configured ownership manifest and the manifest
diff for recent config-authored transactions.

### Implementation Notes

- `convex/configHistory.ts` introduces:
  - `currentManifest`: current owned artifacts grouped by
    `attribute/entityType/form/flow/requirement/action`;
  - `history`: recent `actorId="config"` transactions annotated with the
    manifest before/after the transaction, `added`, `removed`, counts, and direct
    fact events.
- The diff is computed from `config:default` ownership facts, not from raw
  `assert` events alone. This matters because idempotent re-applies reassert
  desired ownership; the history must report no manifest diff when the owned set
  is unchanged.
- The Data model page now includes a "Config history" card with current manifest
  counts and recent added/removed artifacts.

### Acceptance Criteria

- Current manifest query reconstructs owned config artifacts from facts.
- History query shows additions on first setup.
- Removing a requirement shows a removed requirement in the latest diff.
- Reapplying the same desired config reports no manifest diff.
- Runtime data is not confused with config ownership.
- UI surfaces manifest counts and recent diffs under Data model.
- Full tests/typechecks/build/deploy pass.

### Verification

- `npx convex codegen` passed.
- Focused `npx vitest run appconfig` passed (10 tests).
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 10 — Arg-Taking Actions

**Status:** shipped in the Convex reference runtime.

**Objective:** extend configured actions from fixed assertions only to small
parameterized commands. An action can declare input fields and reference them in
its `asserts` map; running the action resolves those placeholders and asserts
the resulting facts in one transaction.

### Scope

Backward-compatible action definition:

```ts
{
  name: "set_status",
  label: "Set status",
  appliesTo: "Worker",
  fields: [
    { name: "status", label: "Status", type: "select", options: ["active", "terminated"] }
  ],
  asserts: { "worker.status": "$arg.status" }
}
```

Supported placeholder values:

- `"$arg.<name>"` — value supplied when the action runs.
- `"$entity"` — target entity id.
- all other values are literal.

This goal does **not** implement actions that open forms or run flow steps. It is
the narrow parameterized-assert slice.

### Acceptance Criteria

- `defineAction` accepts optional `fields` and stores them as schema-as-facts on
  `action:<name>`.
- `actionsForType` / `listActions` return `fields`.
- `runAction` accepts optional `args` and resolves placeholders.
- Missing required args fail clearly.
- Unknown arg placeholders fail clearly.
- Existing fixed actions still work unchanged.
- Entity detail renders action inputs for actions with fields and sends them to
  `runAction`.
- Tests cover fixed action compatibility, parameterized action success, missing
  args, and unknown placeholders.
- Full tests/typechecks/build/deploy pass.

### Verification

- Focused `npx vitest run appconfig` passed (12 tests).
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 11 — Actions That Open Forms

**Status:** shipped in the Convex reference runtime.

**Objective:** extend configured actions from "assert facts now" to "issue a
collection form now" while reusing the existing `/collect?token=...` flow-run
path. This keeps collection semantics in one place: action-opened forms,
standalone compliance collects, and flow collect steps all park on `flowRuns`
and submit through `forms.submitCollection`.

### Scope

Backward-compatible action definition:

```ts
{
  name: "collect_i9",
  label: "Collect I-9",
  appliesTo: "Worker",
  fields: [{ name: "scope", label: "Employer", type: "string" }],
  opensForm: { form: "i9", scope: "$arg.scope" },
  asserts: {}
}
```

`opensForm.form` and `opensForm.scope` use the same resolver as action asserts:

- `"$arg.<name>"` — value supplied when the action runs.
- `"$entity"` — target entity id.
- all other values are literal.

### Acceptance Criteria

- `defineAction` accepts optional `opensForm` and stores it as a fact on
  `action:<name>`.
- `actionsForType` / `listActions` / `entityDetail` return `opensForm`.
- `runAction` resolves `opensForm` values and creates a waiting collection run
  for the action target entity.
- Re-running the same form/scope action reuses the existing waiting run rather
  than issuing duplicate links.
- The returned mutation payload includes the collection URL/token.
- Entity detail displays the returned `/collect` link immediately after the
  action runs.
- Data model action registry shows form-opening behavior.
- Tests cover configured form-open success and idempotent reuse.
- Full tests/typechecks/build/deploy pass.

### Verification

- Focused `npx vitest run appconfig` passed (13 tests).
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 12 — Collection-Token Hardening

**Status:** shipped in the Convex reference runtime.

**Objective:** make `/collect?token=...` links single-use and expiring without
changing the existing collection flow path. Flow collect steps, standalone
compliance collections, and form-opening actions still park on `flowRuns`; the
token now controls whether the public collection page can reveal and submit the
form.

### Acceptance Criteria

- `flowRuns` stores optional `tokenExpiresAt` and `tokenConsumedAt`.
- New collection tokens get an expiry timestamp:
  - explicit `expireSeconds` uses that shorter window;
  - otherwise a default 7-day TTL is applied.
- `forms.collectionByToken` does not reveal form metadata for:
  - consumed tokens;
  - expired tokens;
  - runs that are no longer waiting.
- `forms.submitCollection` rejects consumed/expired tokens and marks expired
  waiting runs as expired.
- Successful collection submission stamps `tokenConsumedAt` before the event path
  resumes the run.
- Collection issuance idempotence reuses only waiting runs whose token is still
  live; expired/consumed waiting runs can be reissued.
- Existing legacy runs without `tokenExpiresAt` remain tolerated until used.
- Tests cover single-use behavior and pre-submit expiry.
- Full tests/typechecks/build/deploy pass.

### Verification

- Focused `npx vitest run forms flows flowdag appconfig` passed (24 tests).
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 13 — `@metacrdt/runtime` Harness Groundwork

**Status:** shipped as a pure workspace package.

**Objective:** introduce the portable runtime harness boundary without migrating
the Convex reference app. The goal is to make the "one feature set → many
targets" architecture concrete: service contracts, capability metadata, operation
helpers over `@metacrdt/core`, and a memory target that proves convergence
without Convex.

### Scope

Package:

```text
packages/runtime/
  src/types.ts       # EventStore, Clock, Sequencer, Scheduler, Transport, caps
  src/operations.ts  # applyOperation, mergeFrom, capability checks
  src/memory.ts      # in-memory store/clock/scheduler/transport target
  src/sync.ts        # version vectors, deltas, anti-entropy exchange
  src/index.ts       # public API
```

This is **not** a Convex migration and **not** a durable transport target. Convex
remains the reference target; the memory harness exists so future Convex /
Cloudflare / local targets can share one contract and one set of convergence
tests. The harness now implements SPEC §8's version-vector anti-entropy shape in
memory.

### Acceptance Criteria

- Add `@metacrdt/runtime` as an npm workspace package.
- Define target-neutral service interfaces:
  - `EventStore`
  - `RuntimeClock`
  - optional `RuntimeSequencer`
  - `Scheduler`
  - `Transport`
  - `RuntimeProfile` / capabilities
- Add operation helpers that:
  - author core assert/retract/tombstone/untombstone events through an injected
    clock;
  - append through the injected store;
  - optionally publish through transport;
  - check required capabilities explicitly.
- Add an in-memory runtime target:
  - verified event-id append;
  - HLC clock with injected wall time;
  - per-replica sequencer;
  - scheduler/transport fakes for tests.
- Add version-vector sync helpers:
  - `versionVector`
  - `deltaSince`
  - `exchangeDeltas`
- Add tests proving:
  - injected HLC behavior;
  - per-replica sequence stamping;
  - append/publish path;
  - two runtimes converge after exchanging G-Set events;
  - version-vector deltas send only unseen sequenced events;
  - repeated anti-entropy exchange is idempotent;
  - legacy unsequenced events remain compatibility deltas;
  - lifecycle target operations fold correctly;
  - capability checks fail clearly.
- Add root `npm run test:runtime`.
- Do **not** move `convex/` onto runtime yet.
- Full tests/typechecks/build pass.

### Verification

- `npm run test:runtime` passed (7 tests).
- Runtime package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 14 — `@metacrdt/runtime` localStorage Target Seed

**Status:** shipped as a durable local runtime target inside
`@metacrdt/runtime`.

**Objective:** prove the next runtime target shape after memory without creating
a premature `@metacrdt/local` package. The target persists the pieces required
for a browser/local-first replica to survive restart: the G-Set event log, HLC,
and per-replica sequence. It reuses the existing runtime operation helpers and
version-vector anti-entropy functions.

### Scope

Package additions:

```text
packages/runtime/
  src/local.ts       # localStorage-compatible event store, clock, sequencer
  src/local.test.ts  # restart/convergence/content-addressing tests
```

This is **not** a network transport and **not** the final
`@metacrdt/local` package. It is the target seed that proves the browser/local
storage boundary before adding BroadcastChannel, IndexedDB, SQLite, or a peer /
relay transport.

### Acceptance Criteria

- Add a `LocalRuntimeStorage` interface matching the sync subset of
  `window.localStorage`.
- Add `LocalEventStore`:
  - persists core events by namespace;
  - verifies event IDs on append/load;
  - preserves G-Set/idempotent merge semantics;
  - upgrades legacy duplicate events when the duplicate carries missing `seq`
    metadata;
  - round-trips byte values without breaking content addressing.
- Add `LocalClock`:
  - persists HLC per namespace + replica;
  - accepts wall time as an injected function;
  - never reads ambient time from core.
- Add `LocalSequencer`:
  - persists per-replica `seq`;
  - continues after runtime recreation.
- Export `createLocalRuntime` and local target classes from
  `@metacrdt/runtime`.
- Add tests proving:
  - event log, HLC, and sequence survive recreated runtimes;
  - same-wall-clock restart increments HLC logical time;
  - two local runtimes exchange deltas, converge, restart, and remain converged;
  - repeated exchange is idempotent after restart;
  - byte values survive storage round-trip and still verify by content address.
- Do **not** create `@metacrdt/local` yet.
- Do **not** bind Convex or Cloudflare to runtime yet.

### Verification

- `npm run test:runtime` passed (10 tests).
- Runtime package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 15 — `@metacrdt/runtime` BroadcastChannel Transport Seed

**Status:** shipped as an attachable browser-style anti-entropy transport inside
`@metacrdt/runtime`.

**Objective:** prove the first runtime network transport without committing to a
relay or Durable Object target. The transport is composable: it can attach to the
memory target, the localStorage target, or future targets that implement the same
`RuntimeServices` contract.

### Scope

Package additions:

```text
packages/runtime/
  src/broadcast.ts       # BroadcastChannel-compatible anti-entropy transport
  src/broadcast.test.ts  # publish, hello/delta, protocol isolation tests
```

This is the same-origin browser transport seed. It is **not** the final
Cloudflare/relay/p2p transport and **not** a full `@metacrdt/local` package.

### Acceptance Criteria

- Add a `BroadcastChannelLike` interface so tests and non-browser targets can
  provide the browser message-channel semantics.
- Add `BroadcastChannelTransport` implementing `Transport`:
  - publishes local events from `applyOperation`;
  - sends `hello` messages containing version vectors;
  - answers peer hellos with `delta` messages computed via `deltaSince`;
  - merges incoming `events` / directed `delta` messages via `mergeFrom`;
  - ignores self messages, foreign protocol messages, and deltas directed at
    other replicas.
- Add `attachBroadcastTransport`:
  - composes the transport onto any `RuntimeServices`;
  - advertises the `transport` capability on the runtime profile.
- Add tests proving:
  - local operations publish to peers and fold correctly on receipt;
  - hello/delta catch-up sends only missing events and is idempotent afterward;
  - protocol isolation and directed-delta filtering work;
  - capability checks observe the attached `transport` capability.
- Do **not** introduce Cloudflare, relay, p2p, or browser storage changes in this
  slice.

### Verification

- `npm run test:runtime` passed (13 tests).
- Runtime package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 16 — `@metacrdt/cloudflare` Durable Object Runtime Services

**Status:** shipped as the first Cloudflare target package.

**Objective:** make the Durable Object target concrete without yet building a
Worker fetch/WebSocket relay. The package owns Cloudflare-shaped storage
services for the same runtime contract used by memory/local targets: event log,
HLC clock, and per-replica sequence.

### Scope

Package additions:

```text
packages/cloudflare/
  src/durableObject.ts       # DO storage-backed runtime services
  src/durableObject.test.ts  # fake DO storage tests
  src/index.ts               # public API
```

This is **not** a deployed Worker app. It deliberately uses a structural
`DurableObjectStorageLike` interface rather than importing Cloudflare Worker
types, so the package stays testable and the eventual Worker shell can bind the
real `state.storage` object with no protocol logic.

### Acceptance Criteria

- Add `@metacrdt/cloudflare` as an npm workspace package.
- Add `DurableObjectStorageLike` for the async subset of Durable Object storage
  used by the target.
- Add `DurableObjectEventStore`:
  - stores each event under a stable namespace key;
  - maintains an event-id index;
  - verifies event IDs on read/write;
  - preserves G-Set/idempotent merge semantics;
  - upgrades legacy duplicate events when the duplicate carries missing `seq`
    metadata.
- Add `DurableObjectClock`:
  - loads/persists HLC per namespace + replica;
  - takes wall time as an injected function.
- Add `DurableObjectSequencer`:
  - loads/persists per-replica sequence.
- Add async `createDurableObjectRuntime` returning `RuntimeServices` compatible
  with `@metacrdt/runtime` operation and sync helpers.
- Add root `npm run test:cloudflare`.
- Add tests proving:
  - event log, HLC, and `seq` survive runtime recreation;
  - same-wall-clock recreation increments HLC logical time;
  - two DO runtimes exchange deltas and persist convergence;
  - repeated exchange is idempotent after restart;
  - invalid stored events are rejected on read.
- Do **not** implement the Worker fetch/WebSocket relay in this slice.

### Verification

- `npm run test:cloudflare` passed (3 tests).
- Cloudflare package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 17 — `@metacrdt/cloudflare` Durable Object WebSocket Relay Shell

**Status:** shipped as a structural WebSocket relay inside the Cloudflare target
package.

**Objective:** put the relay protocol logic next to the Durable Object runtime
services without yet committing to Wrangler config, deployment shape, or a
specific app worker. The class accepts Cloudflare-like server WebSockets,
answers version-vector hellos with deltas, merges incoming client events through
the DO runtime, and fans out accepted events to connected peers.

### Scope

Package additions:

```text
packages/cloudflare/
  src/relay.ts       # structural WebSocket relay shell
  src/relay.test.ts  # fake socket tests
```

The relay is structural: it depends on a `WebSocketLike` interface and
`RuntimeServices`, not on Workers type packages. A future Worker/DO class can
instantiate `createDurableObjectRuntime(state.storage)`, attach this relay, and
return the accepted WebSocket response.

### Acceptance Criteria

- Add `WebSocketLike`, `RelayOptions`, and `RelayConnection` types.
- Add `DurableObjectWebSocketRelay`:
  - accepts server sockets and tracks connections;
  - optionally sends an initial `hello` with the DO runtime version vector;
  - implements `Transport.publish` so local DO operations fan out to sockets;
  - handles client `hello` messages by sending `delta` responses computed with
    `deltaSince`;
  - handles client `events` / directed `delta` messages by merging through
    `mergeFrom`;
  - fans out accepted client events to other connected sockets;
  - ignores foreign protocol messages and self messages;
  - closes invalid JSON sockets with a protocol error.
- Add `attachDurableObjectRelay`:
  - composes the relay onto any runtime target;
  - advertises the `transport` capability on the runtime profile.
- Add tests proving:
  - sockets are accepted and initial hellos are sent;
  - local operations publish over the relay;
  - client hellos receive deltas and are idempotent once caught up;
  - client events merge into the DO runtime and fan out to other sockets;
  - foreign protocols are ignored;
  - invalid JSON closes and disconnects the socket.
- Do **not** add Wrangler config, Worker routing, auth, or deployment scripts in
  this slice.

### Verification

- `npm run test:cloudflare` passed (7 tests).
- Cloudflare package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 18 — `@metacrdt/cloudflare` Worker/DO Example Shell

**Status:** shipped as Worker-facing package exports and example Wrangler config.

**Objective:** make the Cloudflare target deploy-shape legible without requiring
a live deployment in this repo. The package now exposes a Worker `fetch` router,
a Durable Object class shell, and an example Wrangler configuration that binds
the relay Durable Object. Protocol logic remains in the previously shipped
runtime and relay helpers.

### Scope

Package additions:

```text
packages/cloudflare/
  src/worker.ts             # Worker router + DO class shell
  src/worker.test.ts        # fake namespace/socket tests
  wrangler.example.toml     # binding/migration example
```

### Acceptance Criteria

- Add `MetaCrdtRelayDurableObject`:
  - constructs `createDurableObjectRuntime(state.storage)`;
  - attaches `DurableObjectWebSocketRelay`;
  - handles WebSocket upgrade requests by creating a WebSocket pair, connecting
    the server socket, and returning the client socket in a Worker-style response;
  - exposes a JSON `/health` endpoint with replica id, connection count, and
    version vector;
  - rejects non-WebSocket sync requests with `426`.
- Add `createRelayWorker`:
  - exposes a Worker-style `fetch(request, env)` entrypoint;
  - serves Worker health at `/health`;
  - routes `?room=<name>` or `/rooms/<name>` requests to a configured Durable
    Object namespace binding;
  - reports missing binding and missing room errors clearly.
- Add `relayWorker` default exportable instance.
- Add structural types for Worker/DO bindings (`DurableObjectNamespaceLike`,
  `DurableObjectStubLike`, `DurableObjectStateLike`, `WebSocketPairFactory`).
- Add `wrangler.example.toml` showing the `METACRDT_RELAY` Durable Object binding
  and migration entry.
- Add tests proving:
  - Worker routes by query and path room names;
  - Worker health/missing-binding/missing-room responses are clear;
  - Durable Object health response includes replica/connections/version vector;
  - WebSocket upgrade path connects the server socket and sends the initial relay
    hello;
  - non-WebSocket sync requests return `426`.
- Do **not** require Wrangler, Cloudflare Workers types, or a live deployment in
  this slice.

### Verification

- `npm run test:cloudflare` passed (12 tests).
- Cloudflare package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 19 — `@metacrdt/local` Browser Local-First Package

**Status:** shipped as the browser-facing local target package.

**Objective:** turn the proven localStorage and BroadcastChannel runtime seeds
into a real `@metacrdt/local` package boundary without duplicating runtime
internals. The package is the ergonomic browser/local-first target: it supplies
browser defaults and lifecycle helpers over `@metacrdt/runtime`.

### Scope

Package additions:

```text
packages/local/
  src/index.ts       # browser defaults + create/start local-first runtime
  src/index.test.ts  # fake storage/channel convergence and lifecycle tests
```

### Acceptance Criteria

- Add `@metacrdt/local` as an npm workspace package.
- Export:
  - `browserStorage()` for `globalThis.localStorage`;
  - `browserBroadcastChannel(name)` for `globalThis.BroadcastChannel`;
  - `createLocalFirstRuntime(options)`;
  - `startLocalFirstRuntime(options)`;
  - concrete runtime/transport types re-exported from `@metacrdt/runtime`.
- `createLocalFirstRuntime`:
  - creates a `createLocalRuntime` with storage, namespace, replica id, wall
    clock, and capability options;
  - attaches `BroadcastChannelTransport` by default;
  - supports `broadcast: false` for purely local durable operation;
  - exposes `start()` / `stop()` lifecycle methods.
- Add tests proving:
  - local operations publish to same-origin peers and converge through the G-Set
    merge path;
  - late-starting replicas catch up via hello/version-vector/delta exchange;
  - storage restart preserves event log and local sequence;
  - `broadcast:false` works without a channel;
  - browser-global helpers fail clearly when a host lacks required APIs.
- Do **not** introduce IndexedDB/SQLite or p2p networking in this slice.

### Verification

- `npm run test:local` passed (4 tests).
- Local package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 20 — `@metacrdt/local` IndexedDB-Compatible Async Persistence

**Status:** shipped as async local runtime services plus an IndexedDB adapter.

**Objective:** make `@metacrdt/local` capable of real async browser persistence,
not only synchronous `localStorage`. The sync localStorage path remains the small
seed; the async path is the shape IndexedDB and future local database backends
use.

### Scope

Package additions:

```text
packages/local/
  src/async.ts        # async event store, clock, sequencer, IndexedDB runtime
  src/indexedDb.ts    # IndexedDB key/value storage adapter
  src/async.test.ts   # async storage + BroadcastChannel convergence tests
```

Small runtime export additions:

```text
packages/runtime/src/local.ts
  # exports local encoding helpers and storage keys for adapter reuse
```

### Acceptance Criteria

- Export reusable async local services:
  - `AsyncLocalRuntimeStorage`;
  - `AsyncLocalEventStore`;
  - `AsyncLocalClock`;
  - `AsyncLocalSequencer`;
  - `createAsyncLocalRuntime`.
- Export IndexedDB/browser target helpers:
  - `IndexedDbRuntimeStorage`;
  - `indexedDbStorage`;
  - `createIndexedDbLocalFirstRuntime`;
  - `startIndexedDbLocalFirstRuntime`.
- Keep event serialization shared with the runtime local target by exporting and
  reusing `encodeLocalEvent`, `decodeLocalEvent`, and local storage key helpers.
- Preserve the same local-first lifecycle:
  - BroadcastChannel transport attached by default;
  - `broadcast:false` works without a channel;
  - `start()` / `stop()` lifecycle methods.
- Add tests proving:
  - async storage preserves event log, HLC, and per-replica `seq`;
  - IndexedDB-compatible local-first runtimes converge over BroadcastChannel;
  - late replicas catch up via hello/version-vector/delta;
  - `broadcast:false` works over async storage;
  - missing host `indexedDB` fails clearly.
- Do **not** add SQLite, p2p, or live Cloudflare deployment in this slice.

### Verification

- `npm run test:local` passed (9 tests).
- Local and runtime package typechecks passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 21 — `@metacrdt/local` SQLite-Compatible Persistence

**Status:** shipped as a dependency-free structural SQLite adapter.

**Objective:** make local persistence work for SQLite-backed local/node-like
targets without adding a native database dependency to this repo. The adapter
targets the common `prepare()` + `get()` / `run()` shape and plugs into the same
async local runtime services used by IndexedDB.

### Scope

Package additions:

```text
packages/local/
  src/sqlite.ts       # structural SQLite key/value storage adapter
  src/sqlite.test.ts  # fake SQLite persistence + local-first tests
```

### Acceptance Criteria

- Export structural SQLite types:
  - `SqliteDatabaseLike`;
  - `SqliteStatementLike`;
  - `SqliteStorageOptions`.
- Export storage/runtime helpers:
  - `SqliteRuntimeStorage`;
  - `sqliteStorage`;
  - `createSqliteLocalFirstRuntime`;
  - `startSqliteLocalFirstRuntime`.
- Keep the package native-dependency-free:
  - no SQLite package dependency;
  - adapter accepts a host-provided database client.
- Initialize a key/value table by default using a validated table name.
- Support:
  - `getItem`;
  - `setItem`;
  - `removeItem`.
- Add tests proving:
  - SQLite key/value get/set/remove behavior;
  - unsafe table names are rejected;
  - runtime event log, HLC, and `seq` persist over SQLite storage;
  - SQLite local-first runtimes converge over BroadcastChannel.
- Do **not** add p2p or live Cloudflare deployment/auth in this slice.

### Verification

- `npm run test:local` passed (13 tests).
- Local package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 22 — `@metacrdt/runtime` p2p DataChannel Transport

**Status:** shipped as a structural WebRTC/DataChannel-compatible transport.

**Objective:** add a peer-to-peer transport shape that does not assume a shared
same-origin bus. The transport manages one or more point-to-point channels,
serializes protocol messages as JSON, handles hello/delta catch-up, and gossips
newly inserted remote events onward so multi-hop peer graphs converge.

### Scope

Package additions:

```text
packages/runtime/
  src/p2p.ts       # DataChannel-compatible anti-entropy transport
  src/p2p.test.ts  # fake DataChannel publish/catch-up/gossip tests
```

### Acceptance Criteria

- Export:
  - `DataChannelLike`;
  - `PeerMessage`;
  - `PeerDataChannelTransportOptions`;
  - `PeerDataChannelTransport`;
  - `attachPeerDataChannelTransport`.
- Use a structural DataChannel interface:
  - `send(string)`;
  - message/open/close listeners or `onmessage`/`onopen`/`onclose`;
  - optional `readyState`;
  - optional `close`.
- Encode wire messages as JSON strings.
- Support:
  - local event publish to connected peers;
  - `hello` version-vector announcements;
  - directed `delta` replies;
  - foreign protocol filtering;
  - directed-delta filtering;
  - listener cleanup;
  - optional channel close on stop.
- For multi-peer p2p graphs, gossip newly inserted remote events to other
  connected peers so non-fully-connected graphs can converge.
- Add tests proving:
  - direct p2p publish/merge;
  - hello/delta catch-up;
  - three-node multi-hop gossip;
  - protocol and directed-delta filtering;
  - stop/disconnect lifecycle behavior.
- Do **not** add WebRTC signaling, STUN/TURN, auth, or live Cloudflare deployment
  in this slice.

### Verification

- `npm run test:runtime` passed (18 tests).
- Runtime package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 23 — `@metacrdt/convex` State-Owned Protocol Log Component

**Status:** shipped as the first component-owned durable state slice.

**Objective:** move `@metacrdt/convex` beyond stateless helper functions by
letting the packaged component own a protocol transaction/event log. Host apps
can still bring their own projections, auth, and public API wrappers, but the
component now proves it can own durable MetaCRDT state across the component
boundary.

### Scope

Package additions:

```text
packages/convex/src/component/
  schema.ts     # component-owned transactions + factEvents
  log.ts        # append/get/list component-owned protocol events
  log.test.ts   # packaged component state tests
```

Reference app additions:

```text
convex/metacrdtComponent.ts
  appendOwnedAssert
  appendOwnedLifecycle
  listOwnedEvents
```

### Acceptance Criteria

- Component schema owns:
  - `transactions`;
  - append-only protocol `factEvents`;
  - indexes for event id, entity, entity+attribute+transaction time, and
    transaction time.
- Component functions expose:
  - `log.appendAssert`;
  - `log.appendLifecycle`;
  - `log.getEvent`;
  - `log.listEvents`.
- App wrappers:
  - do not expose component functions directly to clients;
  - derive actor identity server-side via `ctx.auth.getUserIdentity()`;
  - pass explicit actor/source context across the component boundary;
  - keep host projections and existing host-owned `factEvents` untouched.
- Tests prove:
  - component-owned assert events are durable, verifiable, and listable;
  - lifecycle events target component-owned assert event ids;
  - entity/attribute filters work through component indexes;
  - the reference app can append/list component-owned events through wrappers.

### Non-Goals

- Do not migrate the production reference write path into component-owned tables.
- Do not make the component own `facts`, `currentFacts`, or rule projections yet.
- Do not add auth provider configuration; wrappers derive identity when present
  and otherwise remain demo-grade `anonymous` writers like the current app.

### Verification

- `npm run test:convex-package` passed (25 tests).
- `npx vitest run convex/metacrdtComponent.test.ts` passed (2 tests).
- Convex package typecheck passed.
- App Convex typecheck passed.

---

## Goal 24 — `@metacrdt/convex` Component-Owned Projections

**Status:** shipped as the first projection-owning component slice.

**Objective:** make the packaged Convex component maintain its own read models
for component-owned writes. The component log remains the source of truth, but
`facts` and `currentFacts` now live inside the component too, proving the package
can own both protocol events and current-state projection state.

### Scope

Package additions:

```text
packages/convex/src/component/schema.ts
  facts
  currentFacts

packages/convex/src/component/log.ts
  listCurrent
  assert/retract/tombstone/untombstone projection maintenance
```

Reference app additions:

```text
convex/metacrdtComponent.ts
  listOwnedCurrent
```

### Acceptance Criteria

- Component schema owns:
  - bitemporal `facts` projection rows;
  - disposable `currentFacts` now-projection rows;
  - indexes for target event lookup, entity/attribute current lookup, and rebuild
    viability.
- `log.appendAssert`:
  - writes a protocol assert event;
  - creates a component-owned fact projection row;
  - inserts a current projection row when the fact is visible at the write time.
- `log.appendLifecycle`:
  - finds the target component-owned fact by `assertEventId`;
  - `retract` patches `retractedAt` and removes current state;
  - `tombstone` patches tombstone metadata and removes current state;
  - `untombstone` clears tombstone metadata and restores current state if still
    visible.
- `log.listCurrent` exposes component-owned current state by optional entity and
  attribute filters.
- Reference app wrapper `listOwnedCurrent` proves host apps can expose the
  component-owned projection without direct component calls from clients.

### Non-Goals

- Do not import host-app schema/cardinality rules into the component projection.
- Do not migrate the reference app's production `facts`, `currentFacts`, Datalog
  materialization, or compliance logic into the component yet.
- Do not implement component-owned rule/materialized projections in this slice.

### Verification

- `npm run test:convex-package` passed (26 tests).
- `npx vitest run convex/metacrdtComponent.test.ts` passed (3 tests).
- Convex package typecheck passed.
- App Convex typecheck passed.

---

## Goal 25 — `@metacrdt/convex` Component-Owned Cardinality-One Semantics

**Status:** shipped as opt-in component-owned projection logic.

**Objective:** bring the component-owned current projection closer to the
reference runtime's protocol semantics. Host apps can opt a component write into
`cardinality: "one"`; the component then keeps all assertions in the event log
but reconciles current state by the shared `≺` order and appends protocol
retract events for projection losers.

### Scope

Package changes:

```text
packages/convex/src/component/log.ts
  appendAssert({ cardinality?: "many" | "one" })
  reconcileCardinalityOneCurrent(...)
```

Reference app changes:

```text
convex/metacrdtComponent.ts
  appendOwnedAssert({ cardinality?: "many" | "one" })
```

### Acceptance Criteria

- Component `appendAssert` accepts optional `cardinality`.
- Default behavior remains many-valued.
- When `cardinality: "one"`:
  - visible component-owned candidates for `(e, a)` are reconstructed as core
    assert events;
  - the winner is selected by `@metacrdt/core` `≺` through the shared
    `reconcileCardinalityOneCandidates` helper;
  - losing facts are marked `retractedAt`;
  - losing current rows are removed;
  - protocol retract events are appended for losers, with causal refs pointing to
    the winning event.
- The app wrapper passes the cardinality option across the component boundary
  while still deriving actor identity server-side.

### Non-Goals

- Do not import host app schema/cardinality facts into the component.
- Do not migrate reference app `assertInTx` onto the component yet.
- Do not implement component-owned derived/rule materialization in this slice.

### Verification

- `npm run test:convex-package` passed (27 tests).
- `npx vitest run convex/metacrdtComponent.test.ts` passed (4 tests).
- Convex package typecheck passed.
- App Convex typecheck passed.

---

## Goal 26 — `@metacrdt/convex` Component-Owned Projection Rebuild

**Status:** shipped as component-owned disposable projection recovery.

**Objective:** prove the packaged component's `facts` and `currentFacts`
tables are true read models of the component-owned protocol event log. Component
writes already maintained those projections incrementally; this goal adds a
bounded rebuild mutation that deletes the projections and replays the append-only
`factEvents` log to reconstruct them.

### Scope

Package changes:

```text
packages/convex/src/component/log.ts
  rebuildProjections()
  replayAssert(...)
  replayLifecycle(...)
```

Reference app changes:

```text
convex/metacrdtComponent.ts
  rebuildOwnedProjections()
```

### Acceptance Criteria

- `log.rebuildProjections`:
  - reads component-owned `factEvents` in deterministic transaction-time order;
  - clears component-owned `currentFacts` and `facts`;
  - replays assert rows into new `facts` projection rows;
  - replays retract/tombstone/untombstone rows through `targetEventId`;
  - rebuilds `currentFacts` from replayed fact lifecycle state;
  - returns explicit counts for events, facts, and current facts.
- Rebuild does **not** mutate append-only `factEvents`.
- Event-row `factId` remains projection convenience only. After rebuild, old
  event rows may still point at deleted projection row ids; lifecycle linkage is
  by protocol `targetEventId`.
- The app wrapper exposes rebuild through the host app API instead of exposing
  the component function directly to clients.
- Tests prove:
  - cardinality-one state survives rebuild (`assert`, `assert`, protocol
    loser-`retract` → one current winner);
  - tombstone/untombstone/retract lifecycle state survives rebuild;
  - the app wrapper can trigger rebuild and still read the winning current fact.

### Non-Goals

- Do not migrate the reference app production write path into component-owned
  tables.
- Do not implement component-owned rule/materialized projections in this slice.
- Do not patch old component event rows' `factId` fields during rebuild; that
  would violate the append-only event-log discipline.
- Do not add a self-continuing large-table rebuild yet. This first component
  rebuild is bounded and meant to prove semantics before bulk operations.

### Verification

- `npm run test:convex-package` passed (29 tests).
- `npx vitest run convex/metacrdtComponent.test.ts` passed (5 tests).
- Convex package typecheck passed.
- App Convex typecheck passed.

---

## Goal 27 — `@metacrdt/convex` Component-Owned Entity Read Surface

**Status:** shipped as the first object-level component read API.

**Objective:** make component-owned state useful as application state, not only
as event/current-row plumbing. The component already owns `currentFacts`; this
goal adds a bounded object-level read that groups an entity's current component
facts by attribute and exposes it through the host app wrapper.

### Scope

Package changes:

```text
packages/convex/src/component/log.ts
  getCurrentEntity({ e, limit? })
```

Reference app changes:

```text
convex/metacrdtComponent.ts
  getOwnedCurrentEntity({ e, limit? })
```

### Acceptance Criteria

- `log.getCurrentEntity`:
  - reads component-owned `currentFacts` by `e` using the existing `by_e` index;
  - returns `null` when no current component state exists for the entity;
  - resolves each current row to its underlying `facts` projection summary;
  - groups facts by attribute in deterministic attribute-name order;
  - keeps the raw current fact summaries available for audit/detail views.
- The app wrapper exposes this as `api.metacrdtComponent.getOwnedCurrentEntity`
  instead of exposing the component function directly.
- Tests prove:
  - grouped attributes include current values from multiple component-owned facts;
  - retracted facts are absent from the current entity;
  - a missing component-owned entity returns `null`;
  - the mounted app wrapper can read the grouped entity state.

### Non-Goals

- Do not migrate the production reference app entity UI to component-owned state
  yet.
- Do not add component-owned Datalog/rule/materialized projections in this slice.
- Do not add broad unbounded entity scans. This is an indexed single-entity read.

### Verification

- `npm run test:convex-package` passed (30 tests).
- `npx vitest run convex/metacrdtComponent.test.ts` passed (7 tests).
- Convex package typecheck passed.
- App Convex typecheck passed.

---

## Goal 28 — Component-Backed New Entity Path

**Status:** shipped as the first frontend path writing and reading
component-owned state end-to-end.

**Objective:** stop treating `@metacrdt/convex` component-owned state as only a
backend demo surface. The app header's New Entity control now creates a bounded
component-owned entity, then routes to a component-owned detail page that reads
the component projection and protocol event log.

### Scope

Backend wrapper:

```text
convex/metacrdtComponent.ts
  createOwnedEntity({ e, type, name?, attributes? })
```

Frontend:

```text
src/Layout.tsx
  New entity modal

src/pages/ComponentEntity.tsx
  /component/e/:id
```

### Acceptance Criteria

- `api.metacrdtComponent.createOwnedEntity`:
  - derives actor identity server-side;
  - writes `type` with `cardinality: "one"`;
  - optionally writes `name` with `cardinality: "one"`;
  - writes a bounded list of initial attributes into component-owned state;
  - returns the entity id and append results.
- The header "New entity" button:
  - opens a modal form;
  - calls the wrapper, not component functions directly;
  - navigates to `/component/e/:id` after creation.
- `/component/e/:id`:
  - reads current grouped component-owned state via
    `api.metacrdtComponent.getOwnedCurrentEntity`;
  - reads component-owned protocol events via
    `api.metacrdtComponent.listOwnedEvents`;
  - labels the route clearly as component-owned so it is not confused with the
    host-owned Entities page.
- Tests prove backend wrapper creation produces current grouped component state.

### Non-Goals

- Do not migrate the host-owned Entities list/detail pages yet.
- Do not make component-created entities participate in host-owned compliance
  rules or Datalog projections yet.
- Do not add full auth/write authorization in this slice.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts` passed (8 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run test:convex-package` passed (30 tests).
- `npm test` passed (94 Convex/backend tests).
- `npm run test:core` passed (46 tests).
- `npm run build` passed.
- `npx convex dev --once` deployed the backend to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.
- Live Chrome smoke passed:
  - custom-name create produced `worker:goal-28-smoke-0707`, routed to
    `/component/e/...`, rendered component-owned
    `type`/`name`/`worker.status`/`worker.role`, and showed four append-only
    component event rows;
  - default-name create after the timestamp-suffix fix produced a fresh
    `worker:ava-reed-...` id and rendered the same component-owned state/event
    log shape.

---

## Goal 29 — Component-Owned Entity Browser Surface

**Status:** shipped as the first list/browser surface over component-owned
state.

**Objective:** make component-owned entities discoverable after creation. Goal 28
could create and open `/component/e/:id`, but a user needed the route URL to get
back to that component-owned object. Goal 29 adds a bounded typed list over the
component-owned current projection and renders it in the app's Entities page.

### Scope

Component package:

```text
packages/convex/src/component/schema.ts
  currentFacts indexes for type discovery

packages/convex/src/component/log.ts
  listCurrentEntities({ type?, limit? })
```

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  listOwnedCurrentEntities({ type?, limit? })
```

Frontend:

```text
src/pages/Entities.tsx
  Component-owned entities section
```

### Acceptance Criteria

- `log.listCurrentEntities`:
  - discovers entities from current `type` facts;
  - optionally filters by type;
  - attaches current `name` when present;
  - is bounded and index-backed.
- `api.metacrdtComponent.listOwnedCurrentEntities` wraps the component query so
  the frontend never calls component functions directly.
- The Entities route:
  - shows host-owned entities exactly as before;
  - adds a clearly labeled component-owned section;
  - filters component-owned rows by the selected host type when a type is
    selected;
  - links rows to `/component/e/:id`.

### Non-Goals

- Do not merge component-owned rows into host-owned `queryEntities` yet.
- Do not make component-owned rows participate in host-owned rules/compliance
  yet.
- Do not migrate the production host write path in this slice.

### Verification

- `npm run test:convex-package` passed (31 tests).
- `npx vitest run convex/metacrdtComponent.test.ts` passed (9 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm test` passed (95 Convex/backend tests).
- `npm run test:core` passed (46 tests).
- `npm run build` passed.
- `npx convex dev --once` deployed the backend to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.
- Live Chrome smoke passed: `/entities` → `Worker` shows the
  `Component-owned entities` section with `Ava Reed` and
  `Goal 28 Smoke 0707`; clicking `Ava Reed` routes to
  `/component/e/worker:ava-reed-...` and renders the component-owned detail page
  with current state and event log.

---

## Goal 30 — Component-Owned Worker Status Actions

**Status:** shipped as the first component-owned object mutation after creation.

**Objective:** move one real object-level business behavior from the host-owned
runtime shape onto component-owned state. Component-owned Workers can now be
created, discovered, read, and have their `worker.status` changed through the
component log from the component detail page.

### Scope

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  setOwnedWorkerStatus({ e, status })
```

Frontend:

```text
src/pages/ComponentEntity.tsx
  Component actions card for Worker status
```

### Acceptance Criteria

- `api.metacrdtComponent.setOwnedWorkerStatus`:
  - derives actor identity server-side;
  - accepts only `"active"` or `"terminated"`;
  - writes `worker.status` into component-owned state;
  - uses component-owned cardinality-one reconciliation.
- `/component/e/:id`:
  - detects component-owned `Worker` type;
  - shows current status;
  - exposes Reactivate / Terminate buttons;
  - writes through the wrapper, not component functions directly;
  - updates current state and append-only event history.

### Non-Goals

- Do not generalize configured host actions onto component-owned state yet.
- Do not make component-owned status changes trigger host-owned compliance/rules
  yet.
- Do not merge component-owned and host-owned entity detail pages.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts` passed (10 tests).
- `npm test` passed (16 backend test files, 96 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.
- Live smoke on
  `/component/e/worker%3Aava-reed-mq4ph0h7`: Terminate changed
  `worker.status` from `active` to `terminated` and appended a replacement
  assert plus retract; Reactivate changed it back to `active` and appended the
  symmetric replacement/retract chain.

---

## Goal 31 — Component-Owned Configured Action Runner

**Status:** shipped as the first generic component-owned business-action bridge.

**Objective:** stop hard-coding Worker status actions in the component-owned
detail page and reuse the configured action registry. Host-owned action
definitions now drive component-owned state changes through a host wrapper that
adapts schema/cardinality and auth into the component log.

### Scope

Shared action-definition helper:

```text
convex/lib/actionDefs.ts
  loadActionDef / resolveActionValue / validators
```

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  runOwnedAction({ action, entity, args })
```

Frontend:

```text
src/pages/ComponentEntity.tsx
  Configured action cards for the component-owned entity's primary type
```

### Acceptance Criteria

- Host-owned `api.actions.runAction` and component-owned
  `api.metacrdtComponent.runOwnedAction` share action definition loading and arg
  placeholder semantics.
- `runOwnedAction`:
  - derives actor identity server-side;
  - loads the configured action by name;
  - rejects unknown actions;
  - rejects actions that open forms for now, before writing partial asserts;
  - reads the component-owned current entity and validates the action's
    `appliesTo` type against current `type` facts;
  - resolves `$arg.<name>` placeholders and select-field validation;
  - resolves host schema cardinality for each asserted attribute;
  - appends configured action asserts into component-owned state through
    `components.metacrdt.log.appendAssert`.
- `/component/e/:id`:
  - queries `api.actions.actionsForType` for the component-owned entity's primary
    type;
  - renders configured action labels, asserted facts, and input fields;
  - writes through `runOwnedAction`, not through component functions directly;
  - no longer relies on hard-coded Worker status buttons.

### Non-Goals

- Do not support component-owned collection/form submission yet. Goal 34 adds a
  host collection-run bridge for `opensForm`, but `/collect` submission still
  writes host facts.
- Do not migrate host-owned compliance/rules onto component-owned state yet.
- Do not remove the narrower `setOwnedWorkerStatus` wrapper yet; it remains a
  simple direct mutation path from Goal 30.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts` passed (12 tests).
- `npm test` passed (16 backend test files, 98 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.
- Live smoke on
  `/component/e/worker%3Aava-reed-mq4ph0h7`: the page rendered configured
  `Reactivate worker` / `Terminate worker` actions from the host registry;
  `Terminate worker` changed component-owned `worker.status` to `terminated`;
  `Reactivate worker` changed it back to `active`.

---

## Goal 32 — Datalog Disjunction

**Status:** shipped as a bounded non-recursive `or` clause in the Datalog engine.

**Objective:** close the explicit Query / Rules backlog item for disjunction
without changing the existing fact-pattern, comparison, negation, derivation, or
aggregation semantics. A Datalog `where` body can now express a union of branch
bodies and continue joining from the variables those branches bind.

### Syntax

```ts
{
  or: [
    [["?e", "worker.status", "active"]],
    [["?e", "worker.status", "pending"]],
  ],
}
```

Branches are normal non-recursive `where` bodies evaluated from the current
binding. Nested `or` clauses are intentionally rejected for now.

### Scope

Engine:

```text
convex/lib/engine.ts
  parseClause / parseClauses
  solveWhere branch union
  describeClauses
  isEntityLocalRule
```

API / UI docs:

```text
convex/datalog.ts
README.md
src/pages/DataModel.tsx
```

### Acceptance Criteria

- `{ or: [...] }` is accepted anywhere a clause is accepted.
- Each branch is an array of ordinary clauses.
- Branches are evaluated from the incoming binding.
- Branch results are unioned and deduped by binding, with provenance merged.
- Branches can bind variables used by later joins.
- Branches can contain comparisons and safe negation.
- Unsafe branches still throw an `unsafe` error instead of scanning
  unboundedly.
- `explainDatalog` reports `or` branches.
- Limits remain bounded: branch count is capped by `LIMITS.maxOrBranches`, and
  nested disjunction is rejected.

### Verification

- `npx vitest run convex/datalog.test.ts` passed (12 tests).
- `npx vitest run convex/datalog.test.ts convex/triples.test.ts` passed
  (25 tests).
- `npm test` passed (16 backend test files, 103 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.
- Live smoke:
  - `npx convex run datalog:explainDatalog ...` returned an `or` clause with
    two pattern branches and `maxOrBranches` in limits.
  - `npx convex run datalog:datalog ...` with active-or-pending Worker status
    returned `worker:maria` on the dev deployment.

---

## Goal 33 — Backend Write Authorization

**Status:** shipped as server-side write gates over the Convex reference app.

**Objective:** close the explicit live-site gap where unauthenticated callers
could invoke public write mutations. General app writes now require Convex auth
identity derived server-side; the isolated collection page remains governed by
single-use/expiring collection tokens.

### Scope

Protected public mutation groups:

```text
convex/facts.ts              raw fact assert/retract/tombstone/correct
convex/attributes.ts         schema-as-facts definitions
convex/rules.ts              rule definitions / manual recompute
convex/forms.ts              form definition
convex/flows.ts              flow issue/start/cancel/definition/setup
convex/compliance.ts         setup/seed/manual submission/recompute
convex/actions.ts            action definition/execution
convex/appconfig.ts          applyConfig/setupStaffing
convex/metacrdtComponent.ts  host wrappers for component-owned writes/rebuild
```

Explicit non-scope:

- Do not choose or install a provider in this slice. The repo has no existing
  Clerk/Auth0/WorkOS/Convex Auth signal, and provider selection should be a
  product/deployment decision.
- Do not require login for `/collect`: possession of an unexpired, unconsumed
  token is the capability for that isolated write path.
- Do not add an `actorId` / `userId` argument escape hatch. Actor identity must
  be derived from `ctx.auth.getUserIdentity().tokenIdentifier`.

### Implementation Notes

- `convex/lib/writeAuth.ts` exposes `requireWritePrincipal(ctx)`.
- Public raw fact writes now record the authenticated `tokenIdentifier` as the
  transaction actor, ignoring spoofable `actorId` args.
- Config/bootstrap mutations are caller-authorized first, then continue to
  record config/system semantics in the transaction log where appropriate.
- Component-owned write wrappers require auth before passing actor context into
  the `@metacrdt/convex` component.
- Test harnesses now use authenticated Convex-test handles for setup/write
  paths; `readAuth.test.ts` keeps a separate anonymous handle to prove PII
  redaction still works without identity.

### Acceptance Criteria

- Anonymous callers cannot use general public write mutations.
- Authenticated callers can write.
- Public raw fact writes record the server-derived principal, not a caller
  supplied `actorId`.
- Component-owned write wrappers are also protected.
- `/collect` submission still succeeds anonymously when the token is valid.
- Existing public read behavior remains unchanged.
- Convex tests, package tests, typechecks, build, backend deploy, static upload,
  and live smoke pass.

### Verification

- `npx vitest run convex/writeAuth.test.ts` passed (4 tests).
- `npm test` passed (17 backend test files, 107 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` pushed the backend to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` uploaded the rebuilt static app.
- Live smoke: `npx convex run facts:assertFact ...` fails with
  `Not authenticated` at `requireWritePrincipal`.

---

## Goal 34 — Component-Owned Actions Open Collection Forms

**Status:** shipped as a host collection bridge for component-owned actions.

**Objective:** move one more real business workflow onto component-owned entity
state. Configured actions already run their assert semantics through
`@metacrdt/convex` component-owned facts; actions that declare `opensForm` should
now be usable on component-owned entities too, returning the same `/collect`
token link that host-owned actions return.

### Scope

Backend:

```text
convex/lib/collectRuns.ts       shared action collect-run issuer/reuser
convex/actions.ts               host action path uses the shared helper
convex/metacrdtComponent.ts     component-owned runOwnedAction supports opensForm
```

Frontend:

```text
src/pages/ComponentEntity.tsx   renders collection links returned by component actions
```

Tests:

```text
convex/metacrdtComponent.test.ts
```

### Semantics

- `runOwnedAction` still validates the target entity from component-owned current
  state and enforces `appliesTo` against component-owned `type` facts.
- Action `asserts` still write into component-owned `factEvents` / projections.
- If `opensForm` is present, `form` and `scope` are resolved with the same
  `$entity` / `$arg.<name>` semantics as host `runAction`.
- The collection run is issued or reused in the host `flowRuns` table and returns
  `{ token, collectUrl, reused }`.
- This is intentionally a bridge: `/collect` submission still writes host facts
  for the subject id. Component-owned collection submission is a later slice.

### Non-Goals

- Do not migrate `flowRuns` into the component package in this slice.
- Do not change `/collect` submission storage to component-owned facts yet.
- Do not migrate compliance obligations/rules to component-owned state yet.
- Do not choose a provider or add login UI.

### Acceptance Criteria

- A component-owned action with `opensForm` no longer throws.
- It issues a collection token for the component-owned entity id.
- Re-running the action reuses an existing live token for the same
  subject/form/scope.
- The component detail page displays the returned collection link.
- Submitting the token still succeeds through the existing `/collect` path and
  records host facts for that subject id.
- Component-owned current state remains unchanged by the host collection
  submission until component-owned collection storage exists.
- Component wrapper tests, backend tests, package tests, typechecks, build,
  backend deploy, static upload, and live smoke pass.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts` passed (13 tests).
- `npm test` passed (17 backend test files, 108 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.
- Live smoke:
  - `curl -I https://chatty-hare-94.convex.site` returned HTTP 200.
  - `npx convex run metacrdtComponent:listOwnedCurrentEntities ...` returned
    deployed component-owned Worker rows.

---

## Goal 35 — Component-Owned Collection Submission

**Status:** shipped as target-routed collection submission.

**Objective:** finish the Goal 34 bridge. Component-owned configured actions can
issue collection links; now those submitted field values should fold into
component-owned state rather than leaking into host-owned `facts`.

### Scope

Backend:

```text
convex/schema.ts              flowRuns.collectionTarget
convex/lib/collectRuns.ts     collection-target-aware issue/reuse helper
convex/metacrdtComponent.ts   component actions issue component-target tokens
convex/forms.ts              submitCollection dispatches host vs component writes
```

Tests:

```text
convex/metacrdtComponent.test.ts
convex/appconfig.test.ts
convex/forms.test.ts
```

### Semantics

- Missing `flowRuns.collectionTarget` means legacy/host-owned.
- Host-owned actions and flow collection continue to write submitted values to
  host `facts` through `assertInTx`.
- Component-owned action tokens set `collectionTarget: "component"`.
- `submitCollection` for component-target tokens appends submitted field facts
  and the `submitted.<form>` marker via `components.metacrdt.log.appendAssert`.
- Component-target submissions still consume the same host token and keep the
  collected payload in `flowRuns.context`.
- Component-owned collection submission does not require login; the token remains
  the capability, matching the hardened host collection path.

### Non-Goals

- Do not move `flowRuns` into the component package in this slice.
- Do not move form definitions into the component package yet.
- Do not implement component-owned compliance/rule materialization yet.
- Do not add provider-backed login UI.

### Acceptance Criteria

- Component-owned action collection tokens are marked as component-targeted.
- Reusing live tokens distinguishes host vs component target, so a host token is
  never reused for a component-owned action with the same subject/form/scope.
- Submitting a component-targeted token writes collected fields and
  `submitted.<form>` into component-owned current state.
- Submitting a component-targeted token does not write those values into host
  `facts`.
- Existing host action collection and ordinary form collection behavior stay
  unchanged.
- Focused tests, backend tests, package tests, typechecks, build, backend deploy,
  static upload, and live smoke pass.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts convex/appconfig.test.ts convex/forms.test.ts`
  passed (28 tests).
- `npm test` passed (17 backend test files, 108 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.
- Live smoke:
  - `curl -I https://chatty-hare-94.convex.site` returned HTTP 200.
  - `npx convex run metacrdtComponent:listOwnedCurrentEntities ...` returned
    deployed component-owned Worker rows.

---

## Parked Product/Engine Backlog

These remain valuable, but they should not interrupt the current goal.

### Product / Config

- [x] Config history/diff UI.
- [x] Arg-taking actions.
- [x] Actions that open forms.
- [x] Dry-run compliance: hypothetical worker + scope, no writes.

### Runtime / Targets

- [x] `@metacrdt/runtime` harness groundwork.
- [x] In-memory version-vector anti-entropy helpers.
- [x] Browser/localStorage runtime target seed (durable event log + HLC + seq).
- [x] BroadcastChannel-compatible anti-entropy transport seed.
- [x] `@metacrdt/cloudflare` Durable Object runtime services.
- [x] `@metacrdt/cloudflare` Durable Object WebSocket relay shell.
- [x] Cloudflare Worker/DO example shell + Wrangler config.
- [x] `@metacrdt/local` browser/local-first package over localStorage +
  BroadcastChannel.
- [x] IndexedDB-compatible async local persistence adapter.
- [x] SQLite-compatible local persistence adapter.
- [x] p2p DataChannel-compatible transport target.
- [ ] Live Cloudflare deployment / auth targets.
- [x] First state-owned `@metacrdt/convex` protocol-log component slice.
- [x] First projection-owning `@metacrdt/convex` component slice.
- [x] Opt-in component-owned cardinality-one projection semantics.
- [x] Component-owned projection rebuild from the component protocol log.
- [x] Component-owned entity current-state read surface.
- [x] First component-backed frontend write/read path (`New entity` →
  `/component/e/:id`).
- [x] Component-owned typed entity browser/list surface.
- [x] Component-owned Worker status mutation/action path.
- [x] Component-owned configured action runner.
- [x] Component-owned actions that open collection forms.
- [x] Component-owned collection submission into component state.
- [ ] Migrate more reference runtime business logic onto component-owned state.

### Auth / Privacy

- [x] Backend write authorization for public mutations.
- [ ] Provider-backed login UI / production auth configuration for the live app.
- [x] Collect-token single-use / expiry hardening.

### Query / Rules

- [ ] Engine-level result pagination / streaming.
- [ ] Computed predicates: arithmetic, string ops.
- [x] Disjunction.
- [ ] Cross-entity rule incremental recompute.
- [ ] DRed/counting for transitive closure deletions.

### UX

- [x] Search / command menu.
- [ ] Guided demo tour.
- [x] "New entity" flow.

### Docs

- [x] `docs/physics.md`: compliance, small-group co-signing, and agent swarms
  as three blueprints over one substrate.

---

## Working Rules

1. **Protocol before framework.**
   Fix MetaCRDT write semantics before Confect migration.
2. **Core stays pure.**
   No Convex, Effect, DOM, `Date.now()`, `Math.random()`, or runtime I/O in
   `@metacrdt/core`.
3. **Adapters live at the edge.**
   Convex row/document adaptation belongs in `convex/` now, later
   `@metacrdt/convex`.
4. **Projection tables are disposable.**
   Keep them for performance, but preserve rebuildability from `factEvents`.
5. **Do not bulk-copy Open Ontology.**
   Extract package by package with tests and a clean owner.
6. **Every convergence claim needs a test.**
   If the README/SPEC says order-independent, write a shuffled-order test.
7. **Docs and TODO move with code.**
   Any shipped phase updates `TODO.md`; any architectural change updates the
   relevant doc.

---

## Definition of Done for the Active Objective

`implement PLAN.md` remains active until the open backlog above is either shipped
or intentionally moved out of this repo's scope. Each shipped slice must update
`PLAN.md` / `TODO.md`, pass the relevant test/typecheck/build gate, and be
committed/pushed with the verification recorded.
- Entity list rows render declared columns from schema-as-facts.
- Entity detail state is ordered by declared schema first.
- Existing form collection remains driven by `formDef`.
- Tests cover declared column definitions and configured data rows.
- `npm run test:forma`, `npm run test:core`, `npm run test:convex-package`,
  `npm test`, typechecks, build, static upload, and `npx convex dev --once` pass.
- `PLAN.md`, `TODO.md`, and relevant docs record the schema-driven UI result.
- The change is committed and pushed.
