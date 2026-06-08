# PLAN.md — MetaCRDT Execution Goal

**Current goal:** Goal 55 (event-log base + derived Datalog page/aggregate parity)
has shipped.
The next active goal should be chosen from the remaining TODO candidates:
provider-backed login UI / production auth, live Cloudflare deployment/auth, or
continuing the host read-path migration from projections to direct event-log
folds.

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
- `api.facts.entityFromEventLog` folds a host entity directly from
  protocol-shaped `factEvents` with `@metacrdt/core`, including schema
  cardinality facts from the same log, and redacts through the same read-auth
  path as projection-backed entity reads.
- `api.facts.queryFactsFromEventLog` runs bounded bitemporal fact point queries
  directly over protocol-shaped `factEvents`, preserving `queryFacts`-style
  include-retracted/include-tombstoned semantics without reading the `facts`
  projection.
- `api.datalog.datalogFromEventLog` reuses the normal Datalog solver with an
  injected triple source over protocol-shaped `factEvents`, proving joins,
  compute predicates, and negation can run over the source log for base facts.
- `api.datalog.datalogPageFromEventLog`, `aggregateFromEventLog`, and
  `aggregatePageFromEventLog` extend the same event-log triple source to paged
  projected rows and aggregate group rows for base facts.
- `api.datalog.datalogFromEventLogWithDerived`,
  `datalogPageFromEventLogWithDerived`, `aggregateFromEventLogWithDerived`, and
  `aggregatePageFromEventLogWithDerived` join base facts folded from
  protocol-shaped `factEvents` with the existing materialized `derivedFacts`
  projection, proving production-style base+derived Datalog can drop the base
  `facts` projection first across row, page, aggregate, and aggregate-page read
  shapes.
- Convex backend tests are green: 142 tests at last verification.
- Frontend is a MetaCRDT research-preview UI with datarooms/compliance as the
  live elaboration.
- The shell includes a route-aware guided demo tour:
  - it opens once by default until skipped/finished
  - the header `Tour` button can restart it
  - steps navigate through Overview, Entities, Compliance, Flows, Data model,
    and Transaction log
  - `/collect` remains an isolated magic-link page with no admin chrome or tour
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
  - component-owned DAG run/timeline tables plus `log.recordDagRun` and
    `log.listDagRuns` for persisted process history separate from collection
    capability tokens
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
- Datalog computed predicates exist:
  - `convex/lib/engine.ts` parses
    `{ compute: [op, ...args], as?: term }`
  - arithmetic ops can bind/check computed numbers
  - string ops can normalize/measure text and run boolean string predicates
  - computed clauses are deterministic, bounded, provenance-neutral folds of
    earlier bindings
  - `explainDatalog`, README examples, and the Data model Datalog console show
    the syntax
- Datalog and aggregate result pagination exists:
  - `datalogPage` returns a Convex-style page over deterministic projected
    Datalog rows
  - `aggregatePage` returns the same shape over deterministic aggregate group
    rows
  - both use `paginationOptsValidator`, engine cursors, and the shared
    `LIMITS.maxPageSize` cap
  - this is result pagination over the fully solved bounded query, not a
    database cursor or incremental solver stream
- Cross-entity Datalog rule invalidation is affected-output scoped:
  - entity-local rules still replace only the changed entity's output
  - variable-emitting cross-entity rules discover affected output entities from
    old provenance and current solved bindings
  - those rules replace only the affected output entities instead of deleting
    every derived row for the rule
  - constant-emitting or unsupported rules still fall back to conservative full
    recompute
  - corrections notify materialization as tombstone-old + assert-new so stale
    outputs and replacement outputs are both visible to the incremental path
- Transitive-closure materialization is counted and deletion-safe:
  - closure-derived rows carry optional `supportCount`
  - full closure recompute reconciles existing rows instead of deleting every row
    first
  - alternate paths keep a reachable pair live when one edge/path is removed
  - incremental add increments support counts when it discovers another path to
    an already-reachable pair
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
  - it issues or reuses a component-owned collection-token run for the
    component-owned entity id, returning the `/collect` URL to the component
    detail page
- Component-owned collection submission exists:
  - `@metacrdt/convex` owns `flowRuns` for component-owned action collection
    links
  - `/collect` dispatches unknown host tokens to the installed component and
    component submission appends submitted field facts plus the
    `submitted.<form>` marker into the component log
  - legacy/host tokens with no target still write host facts
- Component-owned standalone collect runs exist:
  - `api.metacrdtComponent.startOwnedCollect` starts or reuses a component-owned
    collect run for a component-owned entity
  - `api.metacrdtComponent.listOwnedCollections` exposes those component-owned
    run/capability rows
  - `/component/e/:id` shows component-owned collection runs and live links
- Component-owned compliance issue/reuse exists:
  - `api.metacrdtComponent.ownedCompliancePlan` computes `reuse` / `collect`
    decisions for component-owned Workers from configured host `require.*` rules
    plus component-owned Worker/Placement/scope/evidence state
  - `api.metacrdtComponent.issueOwnedOpenCollections` issues or reuses missing
    evidence as component-owned collection-token runs
  - `/component/e/:id` shows a Component compliance card for Worker entities and
    can issue open collection links
  - host compliance and host `flowRuns` remain unchanged
- Component-owned compliance materialization exists:
  - `api.metacrdtComponent.materializeOwnedCompliance` writes component-owned
    `requires.<form>` facts for all currently required evidence and
    `task.<form>` facts for open collection decisions
  - stale component-owned `requires.*` / `task.*` facts are retracted through
    protocol lifecycle events when the live plan no longer wants them
  - `/component/e/:id` exposes a Materialize facts action for Worker entities
- Component-owned form definitions exist:
  - `defineOwnedForm` writes `type = Form` and `formDef` into the component log
  - `collectionByToken` reads component-target form metadata from component-owned
    current state
  - host-target tokens still read host `formDef` facts
- Component-owned collection reminder/escalation/expiry timers exist:
  - component-owned collection run rows store bounded timer state
  - app wrappers schedule reminder/escalation ticks for newly issued component
    collection tokens and an expiry tick when an explicit expiry is requested
  - scheduled ticks no-op once a run is completed, expired, or otherwise no
    longer waiting

### Not Yet True

- Legacy `factEvents` may still lack core `eventId` / HLC / replica metadata.
- Convex schema still permits the legacy `correction` event kind for historical
  rows, while new corrections write protocol primitives.
- `facts` and `currentFacts` are still maintained as imperative projections,
  not folded directly from raw core-shaped events.
- `entityFromEventLog` is intentionally bounded and proof/read-model oriented;
  production Datalog/materialization still read the `facts` projection.
- `queryFactsFromEventLog` is also bounded and proof/read-model oriented; Datalog
  and rules have not moved to direct event-log solving.
- `datalogFromEventLog` is bounded and base-fact-only in this slice; production
  Datalog/rules still include materialized `derivedFacts` through the projection
  path.
- The `*FromEventLogWithDerived` Datalog proof APIs still depend on materialized
  `derivedFacts`; rule/materialization output has not become a direct event-log
  fold.
- `@metacrdt/convex` now has adapter helpers, stateless protocol helpers, a
  component-owned protocol transaction/event log, and component-owned
  `facts`/`currentFacts` projections with opt-in cardinality-one reconciliation
  and event-log rebuild for component-owned writes. The reference app still owns
  its production write path and has not migrated its existing business logic/rules
  onto component-owned state.
- Component-owned action collection, standalone collect runs,
  compliance-issued collection links, and materialized `requires.*` / `task.*`
  facts now live inside the component. A bounded component-owned DAG
  starter/resumer can run host flow definitions over component-owned state,
  including `assert`, `notify`, subject-local `branch`, synchronous `action`, and
  `collect` parking through component collection tokens, and `wait` parking with
  a host-scheduled internal wake. The component now owns persisted DAG
  run/timeline rows for that starter/resumer. Component-owned collection runs now
  support host-scheduled reminder/escalation/explicit-expiry ticks. Host-owned
  DAG flows still use the host `flowRuns` table.
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

- `npm run test:convex-package` passed (32 tests).
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

## Goal 36 — Component-Owned Form Definitions

**Status:** shipped as component-owned form metadata for component-target
collection.

**Objective:** remove the host `formDef` dependency from component-target
collection links. Component-owned actions can issue collection links and
component-token submissions now write component facts; the collection page should
also be able to render form metadata from component-owned current state.

### Scope

Backend:

```text
convex/metacrdtComponent.ts   defineOwnedForm wrapper
convex/forms.ts              component-target collectionByToken form loader
```

Tests:

```text
convex/metacrdtComponent.test.ts
convex/forms.test.ts
convex/appconfig.test.ts
```

### Semantics

- `defineOwnedForm({ form, title, fields })` writes component-owned
  `(form:<name>, type, "Form")` and `(form:<name>, formDef, { title, fields })`
  facts with cardinality-one semantics.
- For host/legacy collection tokens, `forms.collectionByToken` still reads host
  `formDef` facts.
- For `collectionTarget: "component"` tokens, `forms.collectionByToken` reads
  `formDef` from `components.metacrdt.log.getCurrentEntity`.
- Submission routing is unchanged from Goal 35.

### Non-Goals

- Do not move `flowRuns` into the component package.
- Do not add component-owned form registry UI in this slice.
- Do not migrate compliance rules/materialization to component-owned state.
- Do not add provider-backed login UI.

### Acceptance Criteria

- Component-owned forms can be defined through the host wrapper.
- Component-target collection links render fields from component-owned `formDef`
  without a host `forms.defineForm` call.
- Host-target collection links still render from host `formDef` facts.
- Component-target submissions still write component-owned facts.
- Focused tests, backend tests, package tests, typechecks, build, deploy, static
  upload, and live smoke pass.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/appconfig.test.ts`
  passed (29 tests).
- `npm test` passed (17 backend test files, 109 tests).
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

## Goal 37 — Component-Owned Collection Runs and Tokens

**Status:** shipped as component-owned collection capabilities.

**Objective:** finish the component-owned collection seam. Component-owned
configured actions should issue, reuse, read, consume, and submit collection
tokens from `@metacrdt/convex` component-owned tables, not from the host
reference app's `flowRuns` table.

This is deliberately narrower than "component-owned flows." It moves only the
capability/run record needed by action-opened component forms. Host-owned flows
and host-owned action collection remain on the host `flowRuns` table until the
flow runner itself migrates.

### Why This Before Component-Owned Flows / Compliance

The current bridge is asymmetric:

- action definitions can be host-authored;
- component-owned entities and form definitions live in the component;
- submitted field facts fold into component-owned state;
- but the token that authorizes submission is still a host row.

That is acceptable as a transition, but it means the component cannot yet own the
full lifecycle of one simple capability. Moving collection runs first gives
`@metacrdt/convex` one complete, bounded product loop:

```text
component entity → configured action → component token → /collect →
component facts
```

Once that loop is component-owned, larger migrations (flows, compliance rules,
obligation materialization) have a cleaner pattern to follow.

### Scope

Package component:

```text
packages/convex/src/component/schema.ts   component-owned flowRuns table
packages/convex/src/component/log.ts      issue/read/submit collection functions
```

Reference app adapters:

```text
convex/metacrdtComponent.ts   runOwnedAction issues component-owned tokens
convex/forms.ts              public /collect dispatches host vs component tokens
```

Tests:

```text
convex/metacrdtComponent.test.ts
convex/forms.test.ts
convex/appconfig.test.ts
```

Docs:

```text
PLAN.md
TODO.md
README.md if the public architecture description changes
```

### Proposed Component Schema

Add a component-owned `flowRuns` table to
`packages/convex/src/component/schema.ts`:

```ts
flowRuns: defineTable({
  subject: v.string(),
  form: v.string(),
  scope: v.string(),
  status: v.union(
    v.literal("waiting"),
    v.literal("completed"),
    v.literal("expired"),
  ),
  issuedAt: v.number(),
  updatedAt: v.number(),
  token: v.string(),
  tokenExpiresAt: v.optional(v.number()),
  tokenConsumedAt: v.optional(v.number()),
  context: v.optional(value),
})
  .index("by_token", ["token"])
  .index("by_target", ["subject", "form", "scope"])
  .index("by_status", ["status"])
```

This table is a component-owned capability record, not a protocol event. The
submitted facts still enter the component protocol log through
`log.appendAssert`/shared append helpers.

### Semantics

- Component-owned action `opensForm` issues or reuses a live component-owned
  run for `(subject, form, scope)`.
- Reuse is target-local: component-owned tokens never reuse host `flowRuns`
  rows, and host actions never reuse component-owned rows.
- Component-owned tokens remain single-use and expiring:
  - `tokenExpiresAt` rejects expired tokens;
  - `tokenConsumedAt` rejects already submitted tokens;
  - `status !== "waiting"` rejects the run.
- Public `api.forms.collectionByToken` becomes a dispatcher:
  1. check the host `flowRuns` table first for legacy/host tokens;
  2. if no host row exists, ask `components.metacrdt.log.collectionByToken`;
  3. return the same public shape to the React `/collect` page.
- Public `api.forms.submitCollection` uses the same dispatch rule:
  1. host row → existing host submission path;
  2. legacy host row with `collectionTarget: "component"` → keep the Goal 35
     transition path so already-issued dev tokens still work;
  3. no host row → delegate to component-owned `submitCollection`.
- Component-owned `submitCollection` appends each submitted field and the
  `submitted.<form>` marker into component-owned state, then consumes/completes
  the component run.

### Non-Goals

- Do not migrate host-owned flow collect steps in this slice.
- Do not move compliance obligations or requirement materialization into the
  component yet.
- Do not remove the host `flowRuns.collectionTarget` compatibility path; it is
  still needed for tokens already issued by Goals 34-36.
- Do not add provider-backed login UI. `/collect` remains token-authorized.
- Do not create a separate `@metacrdt/platform-convex` layer. The target package
  remains `@metacrdt/convex`; component and lower-level bindings live under that
  one package.

### Acceptance Criteria

- `@metacrdt/convex` owns collection run/token rows for component-owned
  configured actions.
- `runOwnedAction` returns a `/collect?token=...` URL backed by the component
  `flowRuns` table.
- `forms.collectionByToken` renders component-owned form definitions for
  component-owned tokens without a host `flowRuns` row.
- `forms.submitCollection` accepts component-owned tokens and writes submitted
  field facts plus `submitted.<form>` into component-owned current state.
- Component-owned tokens are single-use and expiring.
- Host-owned tokens and legacy component-target host tokens continue to work.
- Tests prove component-owned action tokens are not present in host `flowRuns`
  and do not write submitted fields into host `facts`.
- Focused tests, package tests, full backend tests, typechecks, frontend build,
  backend deploy, static upload, and live smoke pass.

### Work Breakdown

1. **Read Convex guidelines**
   - [x] Read `convex/_generated/ai/guidelines.md`.
   - [x] Confirm component function/schema constraints before editing
     `packages/convex/src/component/*`.

2. **Add component-owned storage**
   - [x] Add `flowRuns` to the component schema.
   - [x] Add indexes for token lookup, target reuse, and status scans.
   - [x] Run Convex codegen so component refs/types update.

3. **Factor component append helpers if needed**
   - [x] Reuse existing component append logic for submitted facts.
   - [x] Avoid routing component `submitCollection` through host mutations.
   - [x] Preserve component transaction/event metadata on submitted facts.

4. **Add component collection functions**
   - [x] `log.issueCollection`: issue/reuse a component token.
   - [x] `log.collectionByToken`: validate token and load component-owned
     `formDef`.
   - [x] `log.submitCollection`: validate, append submitted facts, consume token.

5. **Update host adapters**
   - [x] Change `api.metacrdtComponent.runOwnedAction` to call
     `components.metacrdt.log.issueCollection`.
   - [x] Change `api.forms.collectionByToken` to dispatch to component lookup if
     no host row exists.
   - [x] Change `api.forms.submitCollection` to dispatch to component submit if
     no host row exists.
   - [x] Keep the existing host `collectionTarget: "component"` transition path.

6. **Tests**
   - [x] Focused component-owned action/form test:
     - define component-owned form;
     - run component-owned action;
     - verify no host `flowRuns` row owns that token;
     - render token through `api.forms.collectionByToken`;
     - submit token;
     - verify component state receives facts and host facts do not.
   - [x] Token hardening tests for component-owned consumed and expired tokens.
   - [x] Regression tests for host-owned collection behavior.

7. **Docs / verification / deploy**
   - [x] Update `PLAN.md` and `TODO.md` with the shipped result.
   - [x] Run:

```bash
npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/appconfig.test.ts
npm run test:core
npm run test:convex-package
npm test
npx tsc --noEmit -p convex/tsconfig.json
npx tsc --noEmit -p tsconfig.json
npm run build
npx convex dev --once
npx @convex-dev/static-hosting upload
```

   - [x] Live smoke:
     - `curl -I https://chatty-hare-94.convex.site`
     - create/run a component-owned action collection link if feasible, or verify
       component-owned Worker rows still render.
   - [x] Commit and push.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/appconfig.test.ts`
  passed (29 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npm test` passed (17 backend test files, 109 tests).
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

## Goal 38 — Component-Owned Standalone Collect Runs

**Status:** shipped as the first component-owned flow capability.

**Objective:** turn the component-owned collection capability from action-only
plumbing into a standalone component-owned collect run. The installed
`@metacrdt/convex` component should be able to start/list a collect run for a
component-owned entity, expose it through the same public `/collect` route, and
fold submitted values into component-owned state.

This is intentionally smaller than migrating the host DAG runner. It gives the
component a complete standalone collect flow:

```text
component entity → startOwnedCollect → component flowRuns row → /collect →
component facts + completed component run
```

### Scope

Package component:

```text
packages/convex/src/component/schema.ts   by_subject index for component flowRuns
packages/convex/src/component/log.ts      listCollections query
```

Reference app:

```text
convex/metacrdtComponent.ts     startOwnedCollect / listOwnedCollections wrappers
src/pages/ComponentEntity.tsx   component-owned collection run list
```

Tests:

```text
convex/metacrdtComponent.test.ts
convex/forms.test.ts
convex/appconfig.test.ts
```

### Semantics

- `startOwnedCollect({ subject, form, scope })` requires host write auth, verifies
  the subject exists in component-owned current state, and calls
  `components.metacrdt.log.issueCollection`.
- Reuse is component-local: a live component run for the same
  `(subject, form, scope)` is reused, but host `flowRuns` are never considered.
- `listOwnedCollections({ subject })` reads component-owned collection runs only.
- Public `/collect` behavior is unchanged: host token first, component token if
  no host row exists.
- Submitting the component token appends submitted field facts and
  `submitted.<form>` into component-owned state and marks the component run
  completed.
- The component entity page shows component-owned collection runs and their
  live collection links.

### Non-Goals

- Do not migrate host `flows.startFlow` DAG definitions/runs in this slice.
- Do not migrate scheduler reminders/escalations for host flow collect steps.
- Do not migrate compliance requirement/obligation materialization into the
  component yet.
- Do not remove host `flowRuns` or the legacy component-target host-token bridge.

### Acceptance Criteria

- A component-owned entity can start a standalone collect run without creating a
  host `flowRuns` row.
- A second start for the same subject/form/scope reuses the component-owned run.
- `forms.collectionByToken` renders the component-owned form definition for the
  component run token.
- `forms.submitCollection` completes the component run and writes evidence into
  component-owned current state.
- `listOwnedCollections` returns the waiting/completed component run.
- `/component/e/:id` renders component-owned collection runs.
- Host-owned collect behavior remains unchanged.
- Focused tests, package tests, full backend tests, typechecks, frontend build,
  backend deploy, static upload, and live smoke pass.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/appconfig.test.ts`
  passed (30 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npm test` passed (17 backend test files, 110 tests).
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
  - `npx convex run metacrdtComponent:listOwnedCollections ...` returned from
    the deployed wrapper for a component-owned Worker.

---

## Goal 39 — Component-Owned Compliance Issue/Reuse

**Status:** shipped as the first component-owned compliance workflow.

**Objective:** make component-owned Worker entities useful for the compliance
vertical without migrating the full host DAG runner or rule materializer. The
reference app should compute a compliance plan for a component-owned Worker from
the existing configured requirement rules, decide `reuse` vs `collect` using
component-owned submitted evidence, and issue missing component-owned collection
runs through the component-owned `flowRuns` table.

This goal is the narrow bridge between Goal 38's standalone component collect
capability and a future component-owned flow/compliance engine:

```text
host configured requirements
        +
component-owned Worker / Placement / scope entities
        +
component-owned submitted.<form> evidence
        ↓
component compliance plan: reuse | collect
        ↓
component-owned collection runs for missing evidence
```

### Why This Goal Now

- Goal 38 gave the component durable collection tokens and component-owned form
  submission. The next product-level proof is to decide when to issue those
  tokens from real compliance requirements.
- This is smaller and safer than migrating host DAG flows. It does not need a
  scheduler, parked flow state machine, component-owned rule materializer, or
  host `derivedFacts` replacement.
- It exercises the commercial seam: component-owned operational data can
  participate in the Onboarded/datarooms compliance workflow without writing
  host business rows.

### Scope

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  ownedCompliancePlan
  issueOwnedOpenCollections
```

Frontend:

```text
src/pages/ComponentEntity.tsx
  Component compliance card for Worker entities
  reuse/collect table
  Issue open collections action
```

Tests:

```text
convex/metacrdtComponent.test.ts
convex/forms.test.ts
```

### Data Sources

- **Requirement definitions:** still live in host `rules` rows produced by
  `applyConfig` / staffing blueprint. Goal 39 reads configured `require.<form>`
  rules but does not move rules into the component.
- **Operational state:** Worker, Placement, Employer/Client/etc. scope entities
  live in component-owned current state (`components.metacrdt.log.getCurrentEntity`
  / `listCurrent` / `listCurrentEntities`).
- **Evidence state:** submitted form markers live as component-owned
  `submitted.<form>` facts on the Worker, written by component token submission.
- **Collection capability rows:** new missing-evidence links live in the
  component-owned `flowRuns` table through `components.metacrdt.log.issueCollection`.

### Semantics

`ownedCompliancePlan({ worker })`:

- verifies the component-owned Worker exists;
- loads enabled host requirement rules whose names start with `require.`;
- supports the staffing-style rule shape:
  - placement has `type = "Placement"`;
  - placement points at the Worker;
  - placement points at a scope entity through one scope attribute
    (`employer`, `client`, `job`, `venue`, etc.);
  - optional literal guard on the scope entity is allowed;
- scans component-owned placements for that Worker;
- evaluates each supported requirement against component-owned placement/scope
  facts;
- deduplicates by `(form, scope)`;
- returns `decision: "reuse"` when the Worker already has
  `submitted.<form> = scope` in component-owned current state;
- otherwise returns `decision: "collect"`;
- includes the placements that caused each requirement and a compact summary.

`issueOwnedOpenCollections({ worker })`:

- requires host write auth and derives actor server-side, like other component
  write wrappers;
- computes the same plan inside the mutation;
- for each `collect` item, calls the component's `issueCollection`;
- reuses existing waiting component-owned runs for the same
  `(subject, form, scope)`;
- returns issued/reused token information and does not create host `flowRuns`
  rows.

### Non-Goals

- Do not migrate host compliance `workerCompliance` or host `derivedFacts`.
- Do not move configured requirements/rules into `@metacrdt/convex` yet.
- Do not implement component-owned DAG flow definitions or parked multi-step
  runs.
- Do not implement scheduler reminders/escalations.
- Do not add a generic Datalog interpreter over component-owned state in this
  slice; support the bounded staffing requirement shape first.
- Do not change public `/collect` semantics except to keep dispatching component
  tokens through the existing fallback path.

### Design Rules

1. **Reuse existing configured rules, do not duplicate the blueprint.**
   Requirement semantics should come from host `rules`, not a second hard-coded
   list of forms.
2. **Component state remains the source for component entities.**
   The plan must not inspect host `currentFacts` for component Worker/Placement
   operational facts.
3. **Unsupported rules fail loudly or are explicitly skipped with a reason.**
   Avoid silently pretending arbitrary Datalog is supported.
4. **Write auth stays at the host wrapper.**
   The component remains auth-neutral; the host wrapper passes actor context.
5. **Collection reuse is component-local.**
   Host runs do not satisfy component-owned collect runs, and component runs do
   not mutate host `flowRuns`.
6. **This is an issue/reuse planner, not a materializer.**
   It may compute live decisions on demand; it does not need to write obligation
   facts or component-owned `derivedFacts`.

### Work Breakdown

#### 1. Read Convex Guidelines

- [x] Read `convex/_generated/ai/guidelines.md` before implementation.
- [x] Confirm the component wrapper still follows the project component rules:
  host public functions own auth, component functions own isolated state.

#### 2. Audit Requirement Rule Shape

- [x] Inspect `convex/appconfig.ts` requirement lowering.
- [x] Inspect `confect/compliance.impl.ts` dry-run parsing/planning helpers.
- [x] Inspect current staffing blueprint requirement rules in tests/dev data.
- [x] Decide the minimal supported rule subset for component-owned planning.

#### 3. Add Component-Owned Compliance Planner

- [x] Add validators for plan items and summaries in
  `convex/metacrdtComponent.ts`.
- [x] Add helper to load enabled host `require.*` rules.
- [x] Add helper to parse the supported staffing requirement shape:
  - form name;
  - placement worker attribute;
  - placement scope attribute;
  - optional literal guard on the scope entity.
- [x] Add helper to read component current entity rows and attribute maps.
- [x] Add helper to find component-owned placements for the Worker.
- [x] Add `ownedCompliancePlan({ worker })` query.

#### 4. Add Issue Mutation

- [x] Add `issueOwnedOpenCollections({ worker })` mutation.
- [x] Require authenticated host writer.
- [x] Recompute the plan inside the mutation.
- [x] Issue/reuse component-owned collection runs for `collect` items.
- [x] Return token URLs for issued/reused component runs.
- [x] Prove no host `flowRuns` row is created.

#### 5. Update Component Entity UI

- [x] Show a Component compliance card for component-owned Worker entities.
- [x] Render required forms with form, scope, decision, reason, and triggering
  placements.
- [x] Show existing waiting/completed component collection runs beside the plan.
- [x] Add an Issue open collections button when `collect > 0`.
- [x] Link returned tokens through the existing `/collect?token=...` route.

#### 6. Tests

- [x] Component-owned Worker + component-owned Placement + host requirement rule
  produces `collect` decisions.
- [x] Submitting a component-owned token writes `submitted.<form> = scope` into
  component-owned state.
- [x] The plan changes from `collect` to `reuse` after submission.
- [x] Issuing open collections creates/reuses component-owned `flowRuns` rows.
- [x] Host `flowRuns` remains untouched for component-owned compliance runs.
- [x] Unsupported requirement shapes are reported predictably.
- [x] Existing host compliance and host `/collect` tests still pass.

### Acceptance Criteria

- Component-owned Worker detail can show live compliance requirements from the
  configured staffing rules.
- Missing evidence can be issued as component-owned collection links.
- Completed component-owned submissions satisfy later component-owned compliance
  plans by reuse.
- Host-owned compliance behavior remains unchanged.
- No component-owned compliance operation writes host `flowRuns` rows.
- Focused tests, full backend tests, package tests, Convex typecheck, app
  typecheck, build, backend deploy, static upload, and live smoke pass.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/appconfig.test.ts`
  passed (32 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npm test` passed (17 backend test files, 112 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.

Live smoke:

- `curl -I https://chatty-hare-94.convex.site` returned HTTP 200.
- `npx convex run metacrdtComponent:listOwnedCurrentEntities ...` returned
  deployed component-owned Worker rows.
- `npx convex run metacrdtComponent:ownedCompliancePlan ...` returned the
  deployed component compliance wrapper shape.
- `npx convex run metacrdtComponent:listOwnedCollections ...` returned
  deployed component-owned collection rows.

---

## Goal 40 — Component-Owned Compliance Materialization

**Status:** shipped as component-owned obligation/task facts without a component
DAG runner.

**Objective:** take Goal 39's live `reuse` / `collect` plan and write it into
component-owned current state as ordinary MetaCRDT facts:

- `requires.<form> = scope` for every currently required evidence item.
- `task.<form> = scope` for every item still needing collection.

When a later component-owned submission makes evidence reusable, the materializer
retracts the stale `task.<form>` fact while preserving the `requires.<form>` fact
and the append-only history.

### Scope

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  materializeOwnedCompliance
```

Frontend:

```text
src/pages/ComponentEntity.tsx
  Materialize facts action in the Component compliance card
```

Tests:

```text
convex/metacrdtComponent.test.ts
```

### Semantics

`materializeOwnedCompliance({ worker })`:

- requires host write auth and derives actor server-side;
- recomputes `ownedCompliancePlan({ worker })` inside the mutation;
- refuses to materialize if unsupported requirement rules are present, avoiding
  partial silent compliance state;
- computes desired component-owned facts:
  - one `requires.<form>` fact for each plan item;
  - one `task.<form>` fact for each `collect` decision;
- appends missing desired facts through the component-owned protocol log;
- retracts current component-owned `requires.*` / `task.*` facts for the Worker
  that are no longer desired;
- leaves already-correct current facts untouched and reports `kept` counts.

### Non-Goals

- Do not migrate host compliance `derivedFacts`.
- Do not install component-owned rule definitions.
- Do not implement a component-owned DAG flow runner.
- Do not add reminders/escalations/scheduler behavior.
- Do not replace Goal 39's live planner; materialized facts are a projection
  convenience and can be rebuilt by calling the mutation again.

### Acceptance Criteria

- Initial materialization for a component-owned Worker writes `requires.*` and
  `task.*` current facts into component-owned state.
- Submitting component-owned evidence changes the live plan from `collect` to
  `reuse`.
- Re-materializing after submission retracts the stale `task.*` fact and keeps
  the `requires.*` fact.
- Retraction uses protocol lifecycle events targeting the original component
  assert event.
- The component Worker detail UI exposes the materialization action.
- Host compliance and host `flowRuns` behavior remain unchanged.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/appconfig.test.ts`
  passed (33 tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npm test` passed (17 backend test files, 113 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.

Live smoke:

- `curl -I https://chatty-hare-94.convex.site` returned HTTP 200.
- `npx convex run metacrdtComponent:listOwnedCurrentEntities ...` returned
  deployed component-owned Worker rows.
- `npx convex run metacrdtComponent:ownedCompliancePlan ...` returned the
  deployed component compliance wrapper shape.

---

## Goal 41 — Component-Owned DAG Flow Starter/Resumer

**Status:** shipped as a bounded app-side interpreter over component-owned
state; not yet a persisted component scheduler.

**Objective:** let component-owned entities run configured host flow definitions
without creating host `flowRuns` rows, using component-owned facts and
component-owned collection tokens as the durable state.

### Scope

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  startOwnedFlow
```

Frontend:

```text
src/pages/ComponentEntity.tsx
  Component flows card
```

Tests:

```text
convex/metacrdtComponent.test.ts
```

### Semantics

`startOwnedFlow({ flowDefName, subject, context })`:

- requires host write auth and derives actor server-side;
- loads the host `flowDefs` row by name;
- validates `subjectType` against component-owned current `type` facts;
- executes up to 50 steps synchronously;
- supports:
  - `assert`: append a component-owned fact with host schema cardinality;
  - `notify`: record an in-memory result event only;
  - `branch`: evaluate bounded subject-local fact patterns against
    component-owned current state;
  - `action`: append a synchronous `resultAttr` / `resultValue` fact when the
    step declares one;
  - `collect`: if `submitted.<form> = scope` already exists, skip and continue;
    otherwise issue/reuse a component-owned collection token and return
    `status = "waiting"`;
  - `done`: return `status = "completed"`.
- returns a transient execution summary with status, step events, asserted event
  ids, and any collection link.

The resume model is intentionally simple: after the `/collect` token is
submitted, calling `startOwnedFlow` again sees the component-owned
`submitted.<form>` marker, skips the collect step, and continues the DAG.

### Non-Goals

- Do not add a component-owned `flowRuns` DAG table.
- Do not implement component-owned reminders, waits, delayed actions, or
  scheduler wakeups.
- Do not replace host `flows.startFlow`.
- Do not implement a full component-owned Datalog engine for branches; branches
  support bounded subject-local fact patterns only.
- Do not claim component collection capability rows are full DAG run rows.

### Acceptance Criteria

- A component-owned assert flow writes component-owned current facts and creates
  no host `flowRuns` rows.
- A collect flow parks with a component-owned `/collect` token and creates no
  host `flowRuns` rows.
- Submitting that token through the existing public `/collect` path writes
  component-owned field facts plus `submitted.<form>`.
- Rerunning the same flow after submission skips the satisfied collect step,
  evaluates a subject-local branch, runs a synchronous action step, and completes.
- Component entity pages show runnable configured flows by type and display the
  returned status/link/events.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/flowdag.test.ts`
  passed (26 focused tests).
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (31 tests).
- `npm run test:runtime` passed (18 tests).
- `npm run test:local` passed (13 tests).
- `npm run test:cloudflare` passed (12 tests).
- `npm run test:forma` passed (9 tests).
- `npm test` passed (17 backend test files, 116 tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.

Live smoke:

- `curl -I https://chatty-hare-94.convex.site` returned HTTP 200.
- `npx convex run flows:flowsForType '{"type":"Worker"}'` returned the deployed
  onboarding flow shape used by component-owned Worker pages.

---

## Goal 42 — Persisted Component-Owned DAG Run/Timeline Storage

**Status:** shipped as component-owned operational run rows and child timeline
rows. Scheduler behavior is still explicitly future work.

**Objective:** keep component-owned DAG process history inside the installed
`@metacrdt/convex` component, separate from collection-token capability rows.

### Scope

Component package:

```text
packages/convex/src/component/schema.ts
  flowDagRuns
  flowDagEvents

packages/convex/src/component/log.ts
  recordDagRun
  listDagRuns
```

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  startOwnedFlow persists its execution summary
  listOwnedFlowRuns
```

Frontend:

```text
src/pages/ComponentEntity.tsx
  Component flow runs timeline card
```

Tests:

```text
packages/convex/src/component/log.test.ts
convex/metacrdtComponent.test.ts
```

### Semantics

- `flowDagRuns` stores one bounded operational run row with `flowDefName`,
  `subject`, `status`, `currentStepId`, timestamps, and optional context.
- `flowDagEvents` stores timeline entries as child rows, avoiding unbounded arrays
  on the run document.
- `log.recordDagRun` creates a new run or reuses the newest active
  `waiting`/`running` run for the same `(subject, flowDefName)`, appends timeline
  rows, and updates status/current step.
- `startOwnedFlow` records every completed/waiting/unsupported execution summary
  through `log.recordDagRun` and returns the persisted `runId`.
- Rerunning a flow after collection submission updates the existing waiting
  component DAG run to `completed` rather than creating a host `flowRuns` row.
- `listOwnedFlowRuns` exposes persisted component DAG runs and recent timeline
  events to the component entity page.

### Non-Goals

- Do not implement component-owned `wait` scheduler wakeups.
- Do not implement reminder/escalation timers for component DAG runs.
- Do not migrate host `flows.startFlow` runs.
- Do not store timeline arrays directly on `flowDagRuns`.
- Do not treat collection-token `flowRuns` as DAG run records.

### Acceptance Criteria

- `@metacrdt/convex` owns DAG run/timeline tables and component functions for
  recording/listing them.
- An assert-only component flow produces a completed persisted component DAG run.
- A collect flow produces a waiting persisted component DAG run, then rerunning
  after `/collect` submission updates that same run to completed.
- Component entity pages show persisted component DAG run history separately from
  collection capability rows.
- Host `flowRuns` remain untouched by component-owned DAG execution.

### Verification

- `npm run test:convex-package` passed (32 tests).
- `npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/flowdag.test.ts`
  passed (27 focused tests).
- `npm run test:core` passed (46 tests).
- `npm run test:runtime` passed (18 tests).
- `npm run test:local` passed (13 tests).
- `npm run test:cloudflare` passed (12 tests).
- `npm run test:forma` passed (9 tests).
- `npm test` passed (17 backend test files, 116 tests).
- `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- `npx convex dev --once` deployed backend/component schema and functions to
  `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` deployed the frontend to
  `https://chatty-hare-94.convex.site`.

Live smoke:

- `curl -I https://chatty-hare-94.convex.site` returned HTTP 200.
- `npx convex run metacrdtComponent:listOwnedFlowRuns '{"limit":5}'` returned
  the deployed wrapper shape (`[]` before any live component DAG runs).
- `npx convex run flows:flowsForType '{"type":"Worker"}'` returned the deployed
  onboarding flow definition shape.

---

## Goal 43 — Component-Owned DAG Wait/Scheduler Wakeups

**Status:** shipped for basic `wait` steps.

**Objective:** make component-owned DAG `wait` steps real: a flow can park in a
component-owned DAG run, schedule a host internal wakeup, resume the same
component-owned run at the wait step's `next`, and continue writing
component-owned facts.

### Scope

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  startOwnedFlow
  internal wakeOwnedFlow
```

Component package:

```text
packages/convex/src/component/log.ts
  getDagRun
```

Tests:

```text
convex/metacrdtComponent.test.ts
```

### Semantics

- `startOwnedFlow` still requires host write auth and derives the user actor
  server-side.
- The interpreter now runs through a shared helper used by both the public start
  mutation and the internal wake mutation.
- On a `wait` step:
  - append a `wait` timeline event to the component-owned DAG run;
  - record the run as `status = "waiting"` at that step;
  - schedule `internal.metacrdtComponent.wakeOwnedFlow` after
    `config.seconds ?? 5`;
  - return a waiting result to the caller.
- `wakeOwnedFlow({ runId })`:
  - loads the exact component-owned DAG run by id;
  - no-ops unless it is still waiting at a `wait` step;
  - resumes from that step's `next`;
  - writes any subsequent component-owned fact effects under
    `actorId = system:component-flow-scheduler`;
  - records completion/timeline events on the same component DAG run.

### Non-Goals

- Do not implement delayed external action callbacks.
- Do not migrate host `flows.startFlow`.
- Do not make component functions depend on host auth/env; the host wrapper still
  owns scheduling and actors.

### Acceptance Criteria

- A component-owned `wait -> assert -> done` flow initially returns
  `status = "waiting"`.
- Draining scheduled functions resumes that same component-owned DAG run and
  updates it to `completed`.
- The resumed step writes component-owned current facts.
- The persisted run timeline contains `wait`, `asserted`, and `completed` events.
- No host `flowRuns` rows are created.

### Verification

- `npx vitest run convex/metacrdtComponent.test.ts convex/forms.test.ts convex/flowdag.test.ts`
  passed (27 focused tests).
- `npm run test:convex-package` passed (32 tests).
- Full gate passed:
  - `npm run test:core` passed (46 tests).
  - `npm run test:convex-package` passed (32 tests).
  - `npm test` passed (17 backend test files, 116 tests).
  - `npm run test:runtime` passed (18 tests).
  - `npm run test:local` passed (13 tests).
  - `npm run test:cloudflare` passed (12 tests).
  - `npm run test:forma` passed (9 tests).
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.
- Deployed with `npx convex dev --once` and
  `npx @convex-dev/static-hosting upload`.
- Live smoke passed:
  - `curl -I https://chatty-hare-94.convex.site` returned `HTTP/2 200`.
  - `npx convex run metacrdtComponent:listOwnedFlowRuns '{"limit":5}'`
    returned successfully.
  - `npx convex run flows:flowsForType '{"type":"Worker"}'` returned the
    configured Worker onboarding flow.

---

## Goal 44 — Component-Owned Collect Reminder/Escalation Timers

**Status:** shipped for component-owned collection runs.

**Objective:** make component-owned collection-token runs behave like the host
collect runner's operational timers: newly issued component collection links can
schedule reminder and escalation ticks, optionally schedule an explicit expiry
tick, and no-op once the run is no longer waiting.

### Scope

Component package:

```text
packages/convex/src/component/schema.ts
  flowRuns timer fields

packages/convex/src/component/log.ts
  tickCollection
```

Reference app wrapper:

```text
convex/metacrdtComponent.ts
  startOwnedCollect
  issueOwnedOpenCollections
  runOwnedAction opensForm
  startOwnedFlow collect steps
  internal tickOwnedCollection
```

Tests:

```text
packages/convex/src/component/log.test.ts
convex/metacrdtComponent.test.ts
```

### Semantics

- Component-owned `flowRuns` remain operational component rows, not protocol
  facts.
- `issueCollection` records bounded timer metadata on the run:
  `step`, `reminderSeconds`, `escalateSeconds`, `expireSeconds`, and timestamp
  fields for reminder/escalation/expiry.
- Host wrappers schedule `internal.metacrdtComponent.tickOwnedCollection` for
  new component-owned runs only; reused live tokens do not schedule duplicate
  ticks.
- `tickOwnedCollection` calls the component-owned `log.tickCollection`.
- `tickCollection`:
  - no-ops unless the component run still has `status = "waiting"`;
  - marks reminder ticks as `step = "reminded"`;
  - marks escalation ticks as `step = "escalated"`;
  - marks explicit expiry ticks as `status = "expired"`, `step = "expired"`;
  - updates only bounded scalar fields on the run row.

### Non-Goals

- Do not send email/SMS/push notifications.
- Do not implement multi-recipient escalation routing.
- Do not migrate host-owned collect flows to the component.
- Do not add component-owned rule/materialized projections beyond the existing
  component compliance slice.

### Acceptance Criteria

- A component-owned collection run can record reminder, escalation, and expiry
  ticks in component-owned state.
- Scheduled reminder/escalation ticks fire for a newly issued component-owned
  collection run.
- Ticks no-op after collection submission has completed the run.
- Explicit expiry transitions a still-waiting component run to `expired`, and
  `/collect` refuses the token as expired.
- Component-owned collection runs still do not create host `flowRuns` rows.

### Verification

- `npx vitest run packages/convex/src/component/log.test.ts convex/metacrdtComponent.test.ts convex/forms.test.ts`
  passed (24 focused tests).
- Full gate passed:
  - `npm run test:core` passed (46 tests).
  - `npm run test:convex-package` passed (33 tests).
  - `npm test` passed (17 backend test files, 117 tests).
  - `npm run test:runtime` passed (18 tests).
  - `npm run test:local` passed (13 tests).
  - `npm run test:cloudflare` passed (12 tests).
  - `npm run test:forma` passed (9 tests).
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.
- Deployed with `npx convex dev --once` and
  `npx @convex-dev/static-hosting upload`.
- Live smoke passed:
  - `curl -I https://chatty-hare-94.convex.site` returned `HTTP/2 200`.
  - `npx convex run metacrdtComponent:listOwnedCollections '{"limit":5}'`
    returned successfully.
  - `npx convex run metacrdtComponent:listOwnedFlowRuns '{"limit":5}'`
    returned successfully.

---

## Goal 45 — Datalog Computed Arithmetic/String Predicates

**Status:** shipped in the Convex Datalog engine.

**Objective:** close the Query/Rules backlog item for computed predicates by
letting Datalog clauses deterministically compute values from already-bound
variables. Arithmetic expressions can bind/check derived numeric values; string
expressions can normalize text and run boolean text filters.

### Scope

Engine:

```text
convex/lib/engine.ts
  parseClause
  solveParsedWhere
  describeClauses
```

API docs / UI examples:

```text
convex/datalog.ts
src/pages/DataModel.tsx
README.md
```

Tests:

```text
convex/datalog.test.ts
```

### Semantics

- Syntax:
  - `{ compute: ["+", "?salary", "?bonus"], as: "?total" }`
  - `{ compute: ["lower", "?name"], as: "?lowerName" }`
  - `{ compute: ["contains", "?lowerName", "maria"] }`
- A computed clause is safe only when all input variables are already bound by
  earlier clauses.
- With `as`, the result binds the output variable or checks equality when the
  output term is already bound.
- Without `as`, the computed value must be boolean `true`; this acts as a
  predicate filter.
- Computed clauses add no provenance. They preserve the source facts already
  justifying the binding.
- Supported arithmetic ops:
  `+`, `-`, `*`, `/`, `%`, `add`, `sub`, `mul`, `div`, `mod`, `min`, `max`,
  `abs`, `floor`, `ceil`, `round`.
- Supported string ops:
  `concat`, `lower`, `upper`, `trim`, `length`, `contains`, `startsWith`,
  `endsWith`.
- Data type mismatch drops the binding; unknown operators and invalid arity are
  query errors.

### Non-Goals

- Do not add recursive Datalog.
- Do not add user-defined functions or arbitrary JavaScript execution.
- Do not make computed clauses scan facts; they are only deterministic folds of
  existing bindings.
- Do not add engine-level pagination/streaming in this slice.

### Acceptance Criteria

- Arithmetic computed clauses can bind a value and later comparisons can filter
  on that value.
- Computed output can also be checked against an already-bound variable.
- String transforms can feed boolean string predicates.
- Unsafe computed input variables throw a predictable unsafe-query error.
- `explainDatalog` classifies computed clauses.
- Existing comparison, negation, disjunction, aggregation, and read-auth behavior
  remain unchanged.

### Verification

- `npx vitest run convex/datalog.test.ts convex/aggregate.test.ts` passed
  (21 focused tests).
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- Full gate passed:
  - `npm run test:core` passed (46 tests).
  - `npm run test:convex-package` passed (33 tests).
  - `npm test` passed (17 backend test files, 122 tests).
  - `npm run test:runtime` passed (18 tests).
  - `npm run test:local` passed (13 tests).
  - `npm run test:cloudflare` passed (12 tests).
  - `npm run test:forma` passed (9 tests).
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.
- Deployed with `npx convex dev --once` and
  `npx @convex-dev/static-hosting upload`.
- Live smoke passed:
  - `curl -I https://chatty-hare-94.convex.site` returned `HTTP/2 200`.
  - `npx convex run datalog:explainDatalog ...` returned computed clause
    descriptions for `lower` and `contains`.
  - `npx convex run datalog:datalog ...` returned `worker:maria` via
    deployed `lower` + `contains` computed predicates.

---

## Goal 46 — Datalog / Aggregate Result Pagination

**Status:** shipped in the Convex Datalog API.

**Objective:** close the Query/Rules pagination backlog item by exposing
Convex-style page APIs over deterministic Datalog result rows and aggregate group
rows. This keeps large but bounded reads out of single-response paths while
preserving the existing solver semantics.

### Scope

Engine:

```text
convex/lib/engine.ts
  LIMITS.maxPageSize
  paginateRows
```

API:

```text
convex/datalog.ts
  datalogPage
  aggregatePage
```

Tests:

```text
convex/datalog.test.ts
convex/aggregate.test.ts
```

### Semantics

- `datalogPage` runs the same bounded `where` solver as `datalog`, projects the
  same `select` rows, then returns:
  - `page`
  - `isDone`
  - `continueCursor`
- `aggregatePage` runs the same bounded `where` solver as `aggregate`, computes
  the same deterministic group rows, then returns the same page shape.
- The cursor is an engine cursor over the projected result array, encoded as a
  decimal offset string.
- `null`, `undefined`, and `""` mean the first page.
- Invalid cursors throw `invalid pagination cursor`.
- `numItems` must be positive and finite.
- Page size is capped by `LIMITS.maxPageSize` (`100`) regardless of caller input.
- The original non-paginated `datalog` and `aggregate` APIs remain and still
  enforce `LIMITS.maxResultRows`.

### Non-Goals

- Do not add recursive Datalog.
- Do not add an incremental query solver.
- Do not claim these cursors are stable across data changes; they are for a
  deterministic projected row array at query time.
- Do not replace database pagination for plain table/index reads.

### Acceptance Criteria

- Projected Datalog rows can be fetched across multiple pages.
- Aggregate group rows can be fetched across multiple pages.
- Continuation cursors are deterministic offsets.
- Invalid cursors are rejected.
- Oversized `numItems` requests are capped at `LIMITS.maxPageSize`.
- Existing Datalog, aggregate, computed predicate, disjunction, provenance, and
  read-auth behavior remain unchanged.

### Verification

- `npx vitest run convex/datalog.test.ts convex/aggregate.test.ts` passed
  (24 focused tests).
- Full gate passed:
  - `npm run test:core` passed (46 tests).
  - `npm run test:convex-package` passed.
  - `npm test` passed (17 backend test files, 125 tests).
  - `npm run test:runtime` passed.
  - `npm run test:local` passed.
  - `npm run test:cloudflare` passed.
  - `npm run test:forma` passed.
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.
- Deployed with `npx convex dev --once` and
  `npx @convex-dev/static-hosting upload`.
- Live smoke passed:
  - `curl -I https://chatty-hare-94.convex.site` returned `HTTP/2 200`.
  - `npx convex run datalog:datalogPage ...` returned a first page over Worker
    rows.
  - `npx convex run datalog:aggregatePage ...` returned an aggregate page.

---

## Goal 47 — Cross-Entity Rule Affected-Output Recompute

**Status:** shipped in the Convex materializer.

**Objective:** move cross-entity Datalog rules off the coarse "mark every
derived row stale and recompute the whole rule" fallback when the rule emits a
variable entity. The materializer now identifies which emitted entities could
have changed and replaces only those outputs.

### Scope

Materializer:

```text
convex/materialize.ts
  processFactChange
  recomputeRuleForEntities
  affectedOutputEntitiesForFact
```

Correction notification:

```text
convex/facts.ts
  correctFact
```

Tests:

```text
convex/triples.test.ts
convex/datalog.test.ts
```

### Semantics

- Entity-local Datalog rules keep the existing single-entity path.
- Cross-entity Datalog rules whose `emit.e` is a variable now compute affected
  output entities from two sources:
  - old `derivedFacts.sourceFactIds` containing the changed fact, which catches
    removals and retractions
  - current solved bindings whose provenance contains the changed fact, which
    catches additions
- The scheduled recompute seeds the emitted entity variable for each affected
  output entity, deletes only that entity's derived output for the rule, and
  re-emits current results for that entity.
- Corrections notify the materializer as the protocol primitives they are:
  tombstone-old and assert-new.
- Constant-emitting or unsupported cross-entity rules still use full recompute.
- Closure deletion/correction behavior is unchanged: it remains correct via full
  transitive-closure recompute.

### Non-Goals

- Do not implement DRed/counting for transitive closure deletions in this slice.
- Do not make the Datalog solver recursive.
- Do not remove the conservative full-recompute fallback.
- Do not migrate host-owned rules into the `@metacrdt/convex` component.

### Acceptance Criteria

- A cross-entity rule that emits `?w` from a `Placement` join updates only the
  affected Worker output when a non-output Placement fact changes.
- Corrections remove stale outputs justified by the old fact and add outputs
  justified by the replacement fact.
- Pending invalidations are cleared after affected-output recompute.
- Closure correction still removes stale reachability pairs and adds replacement
  pairs via full recompute.
- Existing entity-local rule materialization, closure incremental-add, closure
  retraction, provenance, and Datalog behavior remain unchanged.

### Verification

- `npx vitest run convex/triples.test.ts convex/datalog.test.ts convex/provenance.test.ts`
  passed (38 focused tests).
- Full gate passed:
  - `npm run test:core` passed (46 tests).
  - `npm run test:convex-package` passed.
  - `npm test` passed (17 backend test files, 127 tests).
  - `npm run test:runtime` passed.
  - `npm run test:local` passed.
  - `npm run test:cloudflare` passed.
  - `npm run test:forma` passed.
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.
- Deployed with `npx convex dev --once` and
  `npx @convex-dev/static-hosting upload`.
- Live smoke passed:
  - `curl -I https://chatty-hare-94.convex.site` returned `HTTP/2 200`.
  - `npx convex run datalog:explainDatalog ...` reached the deployed Datalog
    module after the materializer deploy.

---

## Goal 48 — Counted Closure Deletion Reconciliation

**Status:** shipped in the Convex closure materializer.

**Objective:** close the transitive-closure deletion correctness/efficiency
backlog item by tracking path support counts for closure-derived pairs and
reconciling closure output rows instead of deleting/reinserting every pair on
edge removals or corrections.

### Scope

Schema:

```text
convex/schema.ts
  derivedFacts.supportCount
```

Materializer:

```text
convex/materialize.ts
  recomputeTransitiveClosure
  incrementalClosureAdd
  computeClosureSupports
```

Tests:

```text
convex/datalog.test.ts
```

### Semantics

- Closure-derived rows may carry `supportCount`, the number of currently visible
  bounded simple paths supporting that `(from, closureAttribute, to)` pair.
- Full closure recompute now computes a counted support map and reconciles it
  against existing rows:
  - reachable existing rows are patched with the new representative provenance
    and support count
  - newly reachable rows are inserted
  - no-longer reachable rows are deleted
- Incremental closure add still uses the semi-naive predecessor × successor
  delta, but now increments `supportCount` when the new edge creates another
  path to a pair that was already reachable.
- `sourceFactIds` remains one representative path for provenance/explain UI.
  `supportCount` is the multiplicity signal.
- Fact-change jobs queued before a closure rule is created are ignored for that
  rule on the `assert` path; the rule definition's initial full materialization
  is the source of truth. Later retractions/tombstones/corrections still
  invalidate the rule.

### Non-Goals

- Do not add recursive live Datalog.
- Do not store every support path; keep one representative path plus a count.
- Do not make closure deletion fully semi-naive in this slice. Deletions and
  corrections still recompute the bounded closure support map, but they reconcile
  counted rows instead of wholesale projection replacement.

### Acceptance Criteria

- A closure pair supported by two alternate paths has `supportCount = 2`.
- Removing one supporting edge leaves the pair live with `supportCount = 1`.
- Removing the final supporting edge removes the pair.
- Corrections replace stale closure pairs with replacement pairs.
- Incremental add, provenance explanation, Datalog queries over closure
  attributes, and existing closure retraction behavior remain unchanged.

### Verification

- `npx vitest run convex/datalog.test.ts convex/provenance.test.ts convex/compliance.test.ts convex/triples.test.ts`
  passed (43 focused tests).
- Full gate passed:
  - `npm run test:core` passed (46 tests).
  - `npm run test:convex-package` passed.
  - `npm test` passed (17 backend test files, 128 tests).
  - `npm run test:runtime` passed.
  - `npm run test:local` passed.
  - `npm run test:cloudflare` passed.
  - `npm run test:forma` passed.
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.
- Deployed with `npx convex dev --once` and
  `npx @convex-dev/static-hosting upload`.
- Live smoke passed:
  - `curl -I https://chatty-hare-94.convex.site` returned `HTTP/2 200`.
  - `npx convex run datalog:explainDatalog ...` reached the deployed Datalog
    module after the schema/materializer deploy.

---

## Goal 49 — Guided Demo Tour

**Status:** shipped in the React shell.

**Objective:** close the UX backlog item for a guided demo tour by adding a
route-aware walkthrough of the deployed MetaCRDT research preview. The tour
should explain the substrate through the actual app surfaces without changing
backend behavior.

### Scope

Frontend:

```text
src/GuidedTour.tsx
src/Layout.tsx
```

Docs:

```text
README.md
PLAN.md
TODO.md
```

### Semantics

- The tour is a layout-level overlay, not a route page.
- It has six steps:
  1. Overview — whole account / substrate summary
  2. Entities — folded object state
  3. Compliance — obligations as derived facts
  4. Flows — durable DAGs that park and resume
  5. Data model — config, system processes, Datalog, actions, provenance
  6. Transaction log — audit and time as coordinates
- Each step owns a route. Advancing the tour navigates to that route.
- `Back`, `Next`, step dots, `Skip`, `Finish`, and close controls are available.
- Skip/finish writes `metacrdt.tour.dismissed` in `localStorage` so the tour
  does not auto-open again.
- The header `Tour` button reopens the tour manually.
- The isolated `/collect` page remains outside the shell and does not render the
  tour.

### Non-Goals

- Do not add a browser-tour dependency.
- Do not add DOM-element spotlight positioning in this slice; the route-level
  walkthrough is intentionally stable across responsive layouts.
- Do not change backend writes, auth, or demo data.

### Acceptance Criteria

- The app shell renders a `Tour` button.
- First shell visit opens the tour unless it has been skipped/finished.
- The tour can navigate forward/backward and route to the relevant pages.
- Skip/finish dismisses future auto-open via localStorage.
- Production build succeeds.

### Verification

- `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.
- Full gate passed:
  - `npm run test:core` passed (46 tests).
  - `npm run test:convex-package` passed.
  - `npm test` passed.
  - `npm run test:runtime` passed.
  - `npm run test:local` passed.
  - `npm run test:cloudflare` passed.
  - `npm run test:forma` passed.
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.
- Deployed with `npx @convex-dev/static-hosting upload`.
- Live smoke passed:
  - `curl -I https://chatty-hare-94.convex.site` returned `HTTP/2 200`.

---

## Goal 50 — Host Event-Log Entity Fold

**Status:** shipped as a bounded proof/read-model query in the Convex reference
runtime.

**Objective:** continue retiring the hand-maintained host `facts` /
`currentFacts` projection by adding a direct entity read over the append-only
protocol event log. This proves the host log can reconstruct object state through
`@metacrdt/core` without trusting the current projection.

### Scope

Backend:

```text
convex/facts.ts
  entityFromEventLog
```

Tests:

```text
convex/triples.test.ts
```

Docs:

```text
PLAN.md
TODO.md
```

### Semantics

- `entityFromEventLog` fetches bounded `factEvents` for one entity and converts
  protocol-shaped rows into core `Event`s through `@metacrdt/convex`.
- Legacy/non-verifiable rows are skipped and counted as `skippedLegacyEvents`
  instead of being treated as protocol facts.
- The query fetches schema-as-facts cardinality rows for attributes seen in the
  entity event log and includes them in the same core `Log`.
- The entity is folded with `@metacrdt/core.entity`; cardinality-one attributes
  choose the `≺`-max visible assert, cardinality-many attributes keep all visible
  asserts.
- The resulting attribute map passes through the same read-authorization/redaction
  helper as `getEntity`.

### Non-Goals

- Do not replace production `getEntity`, Datalog, rules, or materialization in
  this slice.
- Do not backfill legacy rows; tolerant skipping is explicit for this proof
  surface.
- Do not scan unbounded logs. The query remains bounded and single-entity.

### Acceptance Criteria

- For normal protocol-shaped writes, `entityFromEventLog` matches the current
  projection returned by `getEntity`.
- If `currentFacts` is corrupted/empty for an entity, `entityFromEventLog` still
  reconstructs the current value from `factEvents`.
- Cardinality-one behavior is derived from schema-as-facts in the event log, not
  from the entity projection row.
- Convex typecheck and focused backend tests pass.

### Verification

- `npx convex codegen` passed.
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx vitest run convex/triples.test.ts` passed (16 tests).
- Broader gate passed:
  - `npm test` passed (17 backend test files, 130 tests).
  - `npm run test:convex-package` passed (33 tests).
  - `npm run test:core` passed (46 tests).
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.

---

## Goal 51 — Host Event-Log Fact Query

**Status:** shipped as a bounded proof/read-model query in the Convex reference
runtime.

**Objective:** continue the host read-path migration by adding a direct
event-log counterpart to `queryFacts`. This proves bitemporal point queries can
be answered from protocol-shaped `factEvents` without reading the folded `facts`
projection.

### Scope

Backend:

```text
convex/facts.ts
  queryFactsFromEventLog
```

Tests:

```text
convex/triples.test.ts
```

Docs:

```text
README.md
PLAN.md
TODO.md
```

### Semantics

- `queryFactsFromEventLog` accepts the same bound terms as `queryFacts` (`e`,
  `a`, optional `value`, bitemporal coordinate, tombstone/retract flags, limit).
- It fetches bounded candidate `factEvents`, reconstructs protocol `Event`s
  through `@metacrdt/convex`, then uses `@metacrdt/core.visibleAsserts`.
- It returns fact-like summaries for visible assert events, not folded current
  values. This preserves `queryFacts` semantics: `includeRetracted` can return
  retracted historical assertions.
- Read authorization is checked per returned `(e, a)` just like `queryFacts`.
- Legacy/non-verifiable rows are skipped and counted as `skippedLegacyEvents`.

### Non-Goals

- Do not move Datalog/rules/materialization to direct event-log reads yet.
- Do not replace `queryFacts` in production call sites in this slice.
- Do not scan unbounded logs or add global query indexes beyond the existing
  event indexes.

### Acceptance Criteria

- For normal protocol-shaped writes, `queryFactsFromEventLog` matches
  `queryFacts` for visible values.
- Attribute/value filtering works over the event-log read path.
- `includeRetracted` returns retracted historical assertions.
- If `facts` is corrupted for an entity, `queryFactsFromEventLog` still returns
  the visible assertion from `factEvents`.
- Convex typecheck and focused backend tests pass.

### Verification

- `npx convex codegen` passed.
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx vitest run convex/triples.test.ts` passed (18 tests).
- Broader gate passed:
  - `npm test` passed (17 backend test files, 132 tests).
  - `npm run test:convex-package` passed (33 tests).
  - `npm run test:core` passed (46 tests).
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.

---

## Goal 52 — Event-Log-Backed Datalog Proof Query

**Status:** shipped as a bounded proof/read-model query in the Convex reference
runtime.

**Objective:** reuse the existing Datalog solver over an injected event-log
triple source, proving the query engine can run joins, filters, compute
predicates, negation, and disjunction over source-log facts without reading the
folded `facts` projection.

### Scope

Backend:

```text
convex/lib/engine.ts
  TripleSource injection for solveWhere/runWhere

convex/datalog.ts
  datalogFromEventLog
```

Tests:

```text
convex/datalog.test.ts
```

Docs:

```text
README.md
PLAN.md
TODO.md
```

### Semantics

- The default Datalog engine behavior is unchanged: production `datalog` still
  reads visible triples from `facts ∪ derivedFacts`.
- The solver now accepts an optional `TripleSource`, so callers can reuse the
  same parser, join scheduler, comparisons, computed predicates, negation,
  disjunction, projection, pagination, and aggregation helpers over another
  source.
- `datalogFromEventLog` supplies a source that fetches bounded candidate
  `factEvents`, reconstructs protocol events through `@metacrdt/convex`, and
  feeds visible assert events from `@metacrdt/core.visibleAsserts` into the
  existing solver.
- Read authorization is enforced through the same attribute-level check.
- `datalogFromEventLog` is base-fact-only in this slice. Materialized
  `derivedFacts` remain a projection-backed concern until rules/materialization
  move to event-log folds.

### Non-Goals

- Do not replace production `datalog`, `aggregate`, rules, or materialization in
  this slice.
- Do not include `derivedFacts` in `datalogFromEventLog`.
- Do not add unbounded scans or new global indexes.

### Acceptance Criteria

- Projection-backed Datalog and event-log-backed Datalog return the same result
  for normal base-fact joins.
- Compute predicates and negation work through the injected source.
- If the `facts` projection is corrupted for an entity, production Datalog
  returns no row while `datalogFromEventLog` still answers from `factEvents`.
- Convex typecheck and focused Datalog tests pass.

### Verification

- `npx convex codegen` passed.
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx vitest run convex/datalog.test.ts` passed (24 tests).
- Broader gate passed:
  - `npm test` passed (17 backend test files, 134 tests).
  - `npm run test:convex-package` passed (33 tests).
  - `npm run test:core` passed (46 tests).
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.

---

## Goal 53 — Event-Log Datalog Page/Aggregate Proof APIs

**Status:** shipped as bounded proof/read-model APIs in the Convex reference
runtime.

**Objective:** extend the event-log Datalog proof surface from single result
sets to the rest of the public Datalog read shapes: paged projected rows,
aggregate rows, and paged aggregate rows.

### Scope

Backend:

```text
convex/datalog.ts
  datalogPageFromEventLog
  aggregateFromEventLog
  aggregatePageFromEventLog
```

Tests:

```text
convex/datalog.test.ts
```

Docs:

```text
README.md
PLAN.md
TODO.md
```

### Semantics

- `datalogPageFromEventLog` is the paginated counterpart to
  `datalogFromEventLog`; it pages deterministic projected rows using the existing
  engine cursor helper.
- `aggregateFromEventLog` runs the existing aggregate helper over bindings
  solved from protocol-shaped `factEvents`.
- `aggregatePageFromEventLog` pages aggregate group rows with the same engine
  cursor helper as `aggregatePage`.
- All three APIs are base-fact-only in this slice and reuse the event-log
  `TripleSource` from Goal 52.

### Non-Goals

- Do not replace production `datalogPage`, `aggregate`, or `aggregatePage`.
- Do not include materialized `derivedFacts` in the event-log proof APIs yet.
- Do not add new aggregate semantics; this only swaps the fact source.

### Acceptance Criteria

- `datalogPageFromEventLog` pages deterministic projected rows.
- `aggregateFromEventLog` matches projection-backed aggregate results for normal
  base facts.
- `aggregatePageFromEventLog` pages deterministic aggregate group rows.
- Convex typecheck and focused Datalog tests pass.

### Verification

- `npx convex codegen` passed.
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx vitest run convex/datalog.test.ts` passed (27 tests).
- Broader gate passed:
  - `npm test` passed (17 backend test files, 137 tests).
  - `npm run test:convex-package` passed (33 tests).
  - `npm run test:core` passed (46 tests).
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
- `npm run build` passed.

---

## Goal 55 — Event-Log Base + Derived Datalog Page/Aggregate Parity

**Status:** shipped as parity proof APIs over the mixed event-log-base +
materialized-derived source.

**Objective:** extend Goal 54 from one-shot projected rows to the same bounded
page and aggregate shapes already available for production Datalog and base-only
event-log Datalog. This keeps the proof surface aligned with the real query API
while base facts stop depending on the `facts` projection.

### Scope

Backend:

- `convex/datalog.ts`
  - `datalogPageFromEventLogWithDerived`
  - `aggregateFromEventLogWithDerived`
  - `aggregatePageFromEventLogWithDerived`

Tests:

- `convex/datalog.test.ts`

Docs:

- `README.md`
- `PLAN.md`
- `TODO.md`

### Semantics

- All three APIs reuse the existing Datalog solver and `paginateRows` /
  `aggregateBindings` helpers.
- Base facts come from protocol-shaped `factEvents` through the shared
  event-log triple source.
- Derived facts come from existing `derivedFacts`, filtered by stale state,
  valid-time, constant value, and read authorization.
- Cursor behavior and aggregate group ordering are the same deterministic engine
  cursor behavior used by the production page/aggregate APIs.
- The APIs remain proof/read-model surfaces; they do not replace production
  `datalog`, and they do not make rule materialization itself projection-free.

### Non-Goals

- Do not move rule materialization to direct event-log folds.
- Do not change production `datalog` / `datalogPage` / `aggregate` behavior.
- Do not rewrite derived provenance; `sourceFactIds` remain projection fact ids.
- Do not add recursive/event-log rule evaluation in this slice.

### Acceptance Criteria

- `datalogPageFromEventLogWithDerived` pages deterministic projected rows for a
  query joining event-log base facts with materialized derived facts.
- `aggregateFromEventLogWithDerived` matches production `aggregate` for a query
  joining event-log base facts with materialized derived facts.
- `aggregatePageFromEventLogWithDerived` pages deterministic aggregate groups
  for the mixed source.
- Base-only event-log Datalog still excludes `derivedFacts`.
- Convex typecheck and focused Datalog tests pass.

### Verification

- `npx convex codegen` passed.
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx vitest run convex/datalog.test.ts` passed (32 tests).
- Broader gate passed:
  - `npm test` passed (17 backend test files, 142 tests).
  - `npm run test:convex-package` passed (33 tests).
  - `npm run test:core` passed (46 tests).
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.

---

## Goal 54 — Event-Log Base + Derived Datalog Proof Query

**Status:** shipped as a bounded proof/read-model query in the Convex reference
runtime.

**Objective:** move the event-log Datalog proof surface closer to production
Datalog by joining source-log base facts with the existing materialized
`derivedFacts` projection. This proves production-style base+derived Datalog can
stop reading the base `facts` projection before rules/materialization themselves
are rewritten.

### Scope

Backend:

- `convex/datalog.ts`
  - `datalogFromEventLogWithDerived`

Tests:

- `convex/datalog.test.ts`

Docs:

- `README.md`
- `PLAN.md`
- `TODO.md`

### Semantics

- `datalogFromEventLogWithDerived` reuses the normal Datalog solver through the
  injected `TripleSource`.
- Base facts come from protocol-shaped `factEvents`, reconstructed through
  `@metacrdt/convex` and folded with `@metacrdt/core.visibleAsserts`.
- Derived facts come from existing `derivedFacts`, filtered for stale/valid-time
  and read authorization.
- It is bounded by existing `LIMITS.maxClauseScan` / `maxResultRows`.
- It intentionally composes source-log base facts with projection-backed derived
  facts; it does not make rule materialization itself projection-free.

### Non-Goals

- Do not replace production `datalog`.
- Do not move rule materialization to direct event-log folds yet.
- Do not include event-log-derived provenance rewrites for `derivedFacts`;
  existing `sourceFactIds` remain fact-row ids.
- Do not add page/aggregate variants for this mixed source in this slice.

### Acceptance Criteria

- For normal rule materialization, production `datalog` and
  `datalogFromEventLogWithDerived` agree for a query joining base and derived
  facts.
- If the base `facts` projection is corrupted, production `datalog` fails to join
  while `datalogFromEventLogWithDerived` still joins base facts from `factEvents`
  with materialized derived facts.
- Base-only `datalogFromEventLog` still excludes `derivedFacts`.
- Convex typecheck and focused Datalog tests pass.

### Verification

- `npx convex codegen` passed.
- `npx tsc --noEmit -p convex/tsconfig.json` passed.
- `npx vitest run convex/datalog.test.ts` passed (29 tests).
- Broader gate passed:
  - `npm test` passed (17 backend test files, 139 tests).
  - `npm run test:convex-package` passed (33 tests).
  - `npm run test:core` passed (46 tests).
  - `npx tsc --noEmit -p convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p packages/convex/tsconfig.json` passed.
  - `npx tsc --noEmit -p tsconfig.json` passed.
  - `npm run build` passed.

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
- [x] Component-owned collection run/token storage.
- [x] Component-owned standalone collect runs.
- [x] Goal 39: component-owned compliance issue/reuse.
- [x] Goal 40: component-owned compliance materialization.
- [x] Goal 41: component-owned DAG flow starter/resumer.
- [x] Goal 42: persisted component-owned DAG run/timeline storage.
- [x] Goal 43: component-owned DAG wait/scheduler wakeups.
- [x] Goal 44: component-owned collect reminder/escalation timers.

### Auth / Privacy

- [x] Backend write authorization for public mutations.
- [ ] Provider-backed login UI / production auth configuration for the live app.
- [x] Collect-token single-use / expiry hardening.

### Query / Rules

- [x] Engine-level result pagination / streaming (cursor page APIs shipped;
  no separate incremental solver stream yet).
- [x] Computed predicates: arithmetic, string ops.
- [x] Disjunction.
- [x] Cross-entity rule incremental recompute for variable-emitting rules
  (affected output entities only; unsupported shapes fall back to full).
- [x] DRed/counting for transitive closure deletions (counted support reconcile;
  deletion/correction still recomputes the bounded support map).

### UX

- [x] Search / command menu.
- [x] Guided demo tour.
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

Goal 43 is complete: component-owned DAG wait steps now park component-owned DAG
runs, schedule a host internal wakeup, resume the same run at the wait step's
next step, write component-owned fact effects under a system actor, and preserve
host `flowRuns` behavior.

The next shipped slice should update this section with its own concrete
definition of done before implementation starts.
