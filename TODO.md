# TODO

Running worklog for **MetaCRDT** (this repo). Open items up top; dated log below,
newest first. See [PLAN.md](./PLAN.md) for the full backlog and
[docs/metacrdt.md](./docs/metacrdt.md) for what's *built* vs *frontier*.

## Now / up next

### Current pulse

- [x] Goal 138 shipped: Cloudflare SQLite live-query write publish route seed.
- [ ] Choose the next active slice from remaining Cloudflare parity (full flow
  interpreter/action execution, frontend SDK/live-query reconnect protocol
  integration, or broader historical SQL query-provider parity/performance
  hardening), Node production hardening, provider-specific auth/UI wrapping, or
  a scoped Confect/domain wrapper.

### Handoff: continue MetaCRDT on `main` from commit `c6c4379`

**TASK:** Start the next Cloudflare target parity slice: add the first
operational collection capability surface to the Durable Object + SQLite target.

Context:

- MetaCRDT is now an Effect-native monorepo.
- `@metacrdt/core` owns deterministic protocol semantics.
- `@metacrdt/runtime` exposes Effect v3 services/Layers.
- `@metacrdt/cloudflare` already has DO SQLite EventStore/ProjectionStore/HLC/seq
  services, current projection maintenance, EventStore-backed historical Datalog
  reads, projection-backed current Datalog reads, scoped current-coordinate
  reconcile, and target-indexed lifecycle lookup.
- Latest shipped goal: Goal 122, target-indexed lifecycle lookup for coordinate
  folds.
- Remaining Cloudflare parity from PLAN/TODO: historical SQL-indexed query
  optimization, operational collection/flow surface, DO alarm multiplexing, and
  live-query fanout.

**GOAL:** Implement a narrow, additive Cloudflare Phase D seed: collection
capability rows over DO SQLite.

Recommended scope:

1. Add a DO SQLite collection store/table in `packages/cloudflare`.
2. Expose collection methods on the existing
   `createDurableObjectSqliteCurrentSurface` or a closely related facade:
   `issueCollection`, `collectionByToken`, `listCollections`, and
   `submitCollection`.
3. Keep tokens deterministic/injected:
   - Do not use `Math.random()`.
   - Prefer caller-provided token for this first slice.
   - Do not consume EventStore `seq` for non-event token generation unless you
     deliberately document why.
4. `submitCollection` should at minimum persist submitted data/status.
   - If feasible, allow optional submitted assertions to append protocol events
     for the subject through the existing append/reconcile path.
   - If that is too large, explicitly document that field-to-fact lowering is
     the next slice.
5. Add tests using the existing Cloudflare SQLite fake/test support.
6. Update PLAN.md / TODO.md / docs/cloudflare-target.md to mark exactly what
   shipped and what remains.

Hard constraints:

- Stay on `effect@3`; do not import or install Effect v4.
- `@metacrdt/core` stays pure/Schema-only; do not wrap core folds in Effect.
- New runtime/package boundaries should use Effect services/Layers where
  applicable, `effect/Schema`, and tagged errors in the Effect error channel.
- Keep this additive and green after the slice.
- Do not touch root `convex/` unless necessary. If touching Convex code, first
  read `convex/_generated/ai/guidelines.md`.
- Do not claim full collection/flow parity, alarm multiplexing, live fanout, or
  historical SQL query-provider parity unless actually implemented.

Start by reading:

- `PLAN.md` current goal section
- `TODO.md` Now / up next
- `docs/cloudflare-target.md`
- `docs/targets.md`
- `packages/cloudflare/src/durableObjectSqlite.ts`
- `packages/cloudflare/src/sqliteCurrent.ts`
- `packages/cloudflare/src/sqliteFake.test-support.ts`
- `packages/cloudflare/src/durableObjectSqlite.test.ts`
- For parity reference only: `packages/convex/src/component/log.ts` and
  `packages/convex/src/component/schema.ts`

Suggested implementation shape:

- Add a `collections` table to the DO SQLite lifecycle plan:
  - `token TEXT PRIMARY KEY`
  - `subject TEXT NOT NULL`
  - `form TEXT NOT NULL`
  - `status TEXT NOT NULL` (`issued` / `submitted` / `expired`)
  - `issued_at REAL NOT NULL`
  - `expires_at REAL NULL`
  - `submitted_at REAL NULL`
  - `data_json TEXT NULL`
  - optional `run_id`, `step_id`, `scope`
- Add indexes by `subject`, `status`, and optionally `expires_at`.
- Add a `DurableObjectSqliteCollectionStore` or similarly scoped helper.
- Wire it into `createDurableObjectSqliteRuntime` if it belongs with the runtime
  substrate, or into the current facade if it is only an operational facade for
  now. Prefer the smallest clear boundary.
- If `submitCollection` appends facts, route through existing append/reconcile
  helpers so projection invalidation summaries remain correct.

Definition of done:

- Focused Cloudflare tests prove:
  - collection issue persists and is readable by token
  - list by subject/status works
  - submit consumes/updates a token and stores submitted payload
  - expired/submitted tokens behave intentionally
  - optional assertion submission, if implemented, creates protocol events and
    updates current projection
- Existing conformance remains green.
- Docs explicitly distinguish this from full operational flow/DAG/alarm parity.

Verification commands:

- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run test:packages`
- `npm run pack:packages`
- `git diff --check`

After implementation:

- Commit with a focused message, for example
  `feat(cloudflare): add DO SQLite collection capability surface`
- Push to `origin main`.

### Cloudflare Phase D operational surface

- [x] **Goal 123 shipped: DO SQLite collection capability rows** —
  `@metacrdt/cloudflare` now has a `DurableObjectSqliteCollectionStore`, a
  `collections` table indexed by subject/status/expiry, and current-surface
  methods `issueCollection`, `collectionByToken`, `listCollections`, and
  `submitCollection`. Tokens are caller-provided, submitted payload/status is
  persisted, and already-submitted or expired tokens are rejected intentionally.
- [x] **Goal 124 shipped: collection field-to-fact lowering** —
  `submitCollection` now accepts optional submitted assertions, appends them as
  protocol events for the collection subject through the existing
  append/reconcile path, and returns event/projection summaries for those
  lowered assertions. Simple payload-only submissions still persist data/status
  with an empty assertion result list.
- [x] **Goal 125 shipped: collection ticks/reminders over DO SQLite** —
  `@metacrdt/cloudflare` now has a deterministic `timers` table/store plus
  current-surface methods to schedule, read, list, and fire collection reminder,
  escalation, and expiry ticks. Ticks update only operational collection rows and
  no-op/skips once the collection is submitted or expired.
- [x] **Goal 126 shipped: DAG run/timeline rows over DO SQLite** —
  `@metacrdt/cloudflare` now has `flow_dag_runs` and `flow_dag_events`
  tables/stores plus current-surface methods `recordDagRun`, `getDagRun`, and
  `listDagRuns`. New run/event ids are caller-provided; no `Math.random()` or
  EventStore `seq` is consumed for operational ids.
- [x] **Goal 127 shipped: collection alarm multiplexing over DO alarms** —
  `@metacrdt/cloudflare` now exports a structural alarm multiplexer that arms
  `ctx.storage.setAlarm` to the earliest pending collection timer row, drains
  due ticks through `fireCollectionTick`, and re-arms or deletes the host alarm.
- [x] **Goal 128 shipped: flow-wait timer rows over DO alarms** —
  `@metacrdt/cloudflare` now has caller-identified `flow_wait_timers` rows plus
  current-surface methods to schedule, read, list, and fire flow-wait ticks.
  Firing a still-waiting DAG run records a deterministic wakeup timeline event,
  moves the run back to `running`, and the alarm multiplexer now chooses the
  earliest pending collection or flow-wait timer row.
- [x] **Goal 129 shipped: SQL-indexed historical Datalog provider seed** —
  Cloudflare historical `query` / `page` / `aggregate` / `derivedRows` now use a
  target-specific `DatalogQueryService` source that keeps the shared runtime
  solver and core visibility semantics while fetching bounded assertion
  candidates through indexed SQLite `e` / `a` scans and lifecycle rows through
  the existing `target` index.
- [x] **Goal 130 shipped: DAG resume surface seed** —
  `listDagRuns` can now filter by `flowDefName`, and `resumeDagRun` terminally
  transitions an existing `running` DAG row to `completed` or `unsupported`
  with caller-provided timeline events. This is operational row/timeline
  plumbing only, not a Cloudflare DAG interpreter or action executor.
- [x] **Goal 131 shipped: live invalidation fanout seed** —
  `DurableObjectSqliteLiveInvalidationFanout` accepts bounded coordinate
  subscriptions over structural WebSocket sockets and publishes deterministic
  invalidation messages from current-projection change summaries. This is
  invalidation transport only, not query execution, result caching, persisted
  subscriptions, or a Worker route.
- [x] **Goal 132 shipped: live current-query result seed** —
  `DurableObjectSqliteLiveCurrentQueryFanout` accepts bounded projection-backed
  current Datalog query subscriptions, sends initial `query.subscribed`
  snapshots, and refreshes matching subscriptions with `query.updated` results
  when changed `(e, a)` coordinates overlap derived static dependencies. This is
  snapshot/update plumbing only, not persisted subscriptions, auth, Worker
  routing, reconnects, result diffs, or a frontend SDK.
- [x] **Goal 133 shipped: indexed historical query-provider coverage** —
  the Cloudflare indexed historical Datalog provider now has conformance-style
  tests for joins, `or`, `not`, compare/compute, pagination, aggregation,
  derived-row shaping, lifecycle visibility, and bounded SQLite `e` / `a` /
  `(e, a)` / `target` scans without unrelated full event-log scans.
- [x] **Goal 134 shipped: persisted live current-query subscription registry** —
  `@metacrdt/cloudflare` now has `live_query_subscriptions` and
  `live_query_dependencies` tables/stores over DO SQLite. `runtime.liveQueries`
  can persist/list/close bounded current-query subscription rows across runtime
  recreation, and `DurableObjectSqliteLiveCurrentQueryFanout` can optionally
  persist subscribe/unsubscribe state through that registry.
- [x] **Goal 135 shipped: live current-query reconnect hydration seed** —
  `DurableObjectSqliteLiveCurrentQueryFanout` can hydrate active persisted
  current-query rows for a connected socket, filter by protocol and optional
  scope, reattach them to in-memory fanout state, send fresh `query.subscribed`
  snapshots, and accept socket `query.hydrate` messages.
- [x] **Goal 136 shipped: authenticated live-query Worker route seed** —
  `createRelayWorker` now routes `/live-query/<room>` through the same
  token-protected Durable Object binding as relay rooms, and
  `attachDurableObjectSqliteLiveQueryWebSocket` attaches upgraded DO requests to
  an existing structural live current-query fanout.
- [x] **Goal 137 shipped: SQLite live-query Durable Object assembly seed** —
  `MetaCrdtSqliteLiveQueryDurableObject` now constructs the DO SQLite runtime,
  current-query surface, persisted live-query registry, and structural fanout for
  upgraded live current-query WebSocket requests.
- [x] **Goal 138 shipped: SQLite live-query write publish route seed** —
  `createRelayWorker` now forwards `/write/<room>/<operation>` requests through
  the same authenticated Durable Object binding, and
  `MetaCrdtSqliteLiveQueryDurableObject` exposes POST JSON write routes for
  append assert, append lifecycle, and collection submit that publish returned
  projection-change summaries to live current-query subscribers.
- [ ] **Remaining Cloudflare Phase D parity** — full flow interpreter/action
  execution, frontend SDK/live-query reconnect protocol integration, and broader
  historical SQL query-provider parity/performance hardening remain open; do not
  claim full parity until those are implemented.

**Substrate frontier (cashes the name)** — specified in [SPEC.md](./SPEC.md)
- [x] Commutative supersession — centralized Convex writes now stamp
  event/HLC metadata, and cardinality-one current projection reconciles by the
  `≺` total order (`hlc → actorId → eventId`, SPEC §5.1), not arrival order.
- [x] Runtime harness sequencing + version-vector anti-entropy — memory runtimes
  stamp local events with per-replica `seq`, compute version vectors, exchange
  deltas, and converge idempotently (SPEC §8 shape, not durable transport yet).
- [x] Browser/localStorage runtime seed — durable event log + HLC + per-replica
  `seq` inside `@metacrdt/runtime`, with version-vector exchange surviving
  restart. This is local durability, not network transport.
- [x] BroadcastChannel transport seed — same-origin browser anti-entropy:
  publish local events, announce version vectors, answer hellos with deltas, and
  merge incoming events through the G-Set/HLC path.
- [x] Cloudflare Durable Object runtime services — storage-backed event log, HLC,
  and per-replica `seq` in `@metacrdt/cloudflare`.
- [x] Cloudflare Durable Object WebSocket relay shell — structural server-socket
  relay for hello/delta sync and event fan-out in `@metacrdt/cloudflare`.
- [x] Cloudflare Worker/DO example shell + Wrangler config — package-level
  Worker router, DO class shell, and `wrangler.example.toml`.
- [x] Cloudflare relay auth boundary — `createRelayWorker` enforces Bearer/
  header/query token auth when `METACRDT_RELAY_TOKEN` (or configured token) is
  present; health stays public by default and can be protected.
- [x] Cloudflare Durable Object SQLite runtime seed — structural `sql.exec`
  event/projection/HLC/seq services with Effect Layer, runtime conformance,
  projection-store conformance, and restart-persistence conformance.
- [x] Cloudflare Durable Object SQLite log/current/query surface —
  append helpers, event get/list, EventStore-backed bitemporal Datalog reads,
  projection-backed current Datalog reads, full-recovery rebuild, current-row,
  current-entity, and typed current-entity reads over SQLite event/projection
  stores with Effect helpers and a Promise facade.
- [x] Cloudflare Durable Object SQLite projection invalidation summaries —
  `rebuildCurrent` and append/lifecycle facade results report changed `(e, a)`
  coordinates with before/after event ids, giving the live-query transport its
  first concrete invalidation key.
- [x] Cloudflare Durable Object SQLite incremental current-coordinate reconcile —
  append/lifecycle helpers replace only the touched current projection coordinate
  through `ProjectionStoreService.replaceMatching`; explicit `rebuildCurrent`
  remains the full recovery path.
- [x] Cloudflare Durable Object SQLite target-indexed coordinate fold —
  `EventFilter.target` is now part of the runtime contract, SQL event stores
  persist/index lifecycle targets, shared conformance proves `scan({ target })`,
  and Cloudflare append/lifecycle reconcile folds only the touched coordinate's
  assertions plus lifecycle events targeting those assertions.
- [x] Cloudflare Durable Object SQLite collection capability seed —
  `collections` rows persist caller-provided tokens with subject/form/status,
  timestamps, submitted payload JSON, and optional run/step/scope; the current
  facade exposes issue/read/list/submit methods for the operational surface.
- [x] Cloudflare Durable Object SQLite collection field-to-fact lowering —
  `submitCollection` can lower submitted assertions into protocol events for
  the collection subject and reconcile touched current coordinates through the
  same projection invalidation path as ordinary appends.
- [x] Cloudflare Durable Object SQLite collection ticks/reminders —
  `timers` rows persist caller-provided tick ids for collection reminder,
  escalation, and expiry phases; the current facade can schedule/list/fire them,
  and firing updates bounded operational collection timestamps or skips after
  submission/expiry.
- [x] Cloudflare Durable Object SQLite DAG run/timeline rows —
  `flow_dag_runs` and `flow_dag_events` rows persist bounded operational process
  history; the current facade can record/reuse active runs and read/list runs
  with their timeline events.
- [x] Cloudflare Durable Object SQLite collection alarm multiplexing —
  `createDurableObjectSqliteAlarmMultiplexer` uses the earliest pending
  collection timer row as the single DO alarm, drains due ticks through the
  existing collection tick firing path, then re-arms or deletes the alarm.
- [x] Cloudflare Durable Object SQLite flow-wait alarm plumbing —
  `flow_wait_timers` rows persist caller-provided wait tick and wakeup event ids;
  the current facade can schedule/list/fire them, firing a waiting DAG run
  records a `timer` / `flow-wait` timeline event and returns the run to
  `running`, and the DO alarm multiplexer now drains collection and flow-wait
  ticks in earliest-fire order.
- [x] Cloudflare Durable Object SQLite indexed historical query seed —
  historical facade queries now use a Cloudflare-specific Datalog candidate
  source over indexed SQLite `e` / `a` and lifecycle `target` scans, preserving
  shared `@metacrdt/query` solving and `@metacrdt/core` visibility semantics.
- [x] Cloudflare Durable Object SQLite DAG resume surface seed —
  `listDagRuns` filters by `flowDefName`, and `resumeDagRun` records
  deterministic terminal `completed` / `unsupported` decisions for existing
  `running` rows with caller-provided timeline events.
- [x] Cloudflare Durable Object SQLite live invalidation fanout seed —
  `DurableObjectSqliteLiveInvalidationFanout` broadcasts current-projection
  `(e, a)` change summaries to matching bounded WebSocket subscriptions.
- [x] Cloudflare Durable Object SQLite live current-query result seed —
  `DurableObjectSqliteLiveCurrentQueryFanout` sends bounded current Datalog
  query snapshots and refreshes matching subscriptions from projection-change
  summaries.
- [x] Cloudflare Durable Object SQLite indexed historical query coverage —
  conformance-style tests now exercise the target-specific indexed provider
  across joins, disjunction, negation, compare/compute, pagination, aggregation,
  derived rows, lifecycle visibility, and bounded index scan counters.
- [x] Cloudflare Durable Object SQLite persisted live current-query registry —
  `live_query_subscriptions` rows plus indexed dependency rows persist bounded
  current-query subscription metadata, and the structural live-query fanout can
  optionally write active/closed rows while keeping auth, routes, and frontend
  SDK behavior open.
- [x] Cloudflare Durable Object SQLite live current-query reconnect hydration —
  `hydrateConnection` and socket `query.hydrate` reattach active persisted
  current-query rows for connected sockets and send fresh snapshots while
  leaving durable client session tokens, result diffs, frontend SDK behavior,
  and write-route publish orchestration open at the time.
- [x] Cloudflare Durable Object SQLite authenticated live-query route seed —
  `createRelayWorker` forwards `/live-query/<room>` through the existing token
  auth boundary, and `attachDurableObjectSqliteLiveQueryWebSocket` connects
  upgraded DO requests to a live current-query fanout.
- [x] Cloudflare Durable Object SQLite live-query DO assembly seed —
  `MetaCrdtSqliteLiveQueryDurableObject` assembles the SQLite runtime, current
  surface, persisted live-query registry, and structural fanout for upgraded
  live current-query sockets while leaving frontend/session behavior open.
- [x] Cloudflare Durable Object SQLite live-query write publish route seed —
  authenticated Worker-compatible `/write/<room>/<operation>` POST routes can
  append asserts, append lifecycle events, or submit collection assertions
  through the current surface and publish changed `(e, a)` summaries to live
  current-query subscribers.
- [x] Browser local-first package — `@metacrdt/local` composes the localStorage
  runtime target seed with BroadcastChannel anti-entropy and browser defaults.
- [x] IndexedDB-compatible async local persistence — `@metacrdt/local` now has
  async event/HLC/seq services plus an IndexedDB key/value adapter.
- [x] SQLite-compatible local persistence — `@metacrdt/local` now has a
  dependency-free structural SQLite key/value adapter and local-first runtime.
- [x] p2p DataChannel transport — `@metacrdt/runtime` now has a structural
  DataChannel anti-entropy transport with multi-hop gossip.
- [ ] Cloudflare remaining component-equivalent SQLite surface — full
  SQL-indexed query-provider parity/performance hardening, full flow
  interpreter/action execution, frontend SDK/live-query reconnect protocol
  integration, and broader production hardening on top of the persisted registry
  (see [docs/cloudflare-target.md](./docs/cloudflare-target.md)).
- [ ] Live Cloudflare deployment (see
  [foldkit.md](./docs/foldkit.md), [alchemy.md](./docs/alchemy.md)).

**Packaging / monorepo (map, not migration — see [docs/architecture.md](./docs/architecture.md))**
- [x] **Goal 111 step 1 started: runtime Effect services** —
  `@metacrdt/runtime` now exports Effect v3 `Context.Tag` services + `Layer`
  helpers for `EventStore`, `RuntimeClock`, `RuntimeSequencer`, `Scheduler`,
  `Transport`, and `RuntimeProfile`; Effect-native operation helpers return
  tagged errors in the Effect channel; the memory target provides
  `createMemoryRuntimeLayer`.
- [x] **Goal 111 target Layer providers started** — `@metacrdt/node` exposes
  memory/SQLite/Postgres Layers, `@metacrdt/local` exposes localStorage/async/
  IndexedDB/SQLite-compatible Layers, and `@metacrdt/cloudflare` exposes a
  Durable Object Layer. Tests execute Effect programs through each target Layer.
- [x] **Goal 111 testkit conformance over Layers** — `@metacrdt/testkit` now
  accepts `RuntimeLayerConformanceTarget` (`createLayer`) and runs EventStore /
  anti-entropy / deterministic-fold conformance over service tags. Compatibility
  `RuntimeServices` factories still adapt through `runtimeServicesLayer`.
- [x] **Goal 111 Convex target Layer** — `@metacrdt/convex` now exposes raw
  component-owned protocol EventStore functions (`appendRaw`, `getRawEvent`,
  `listRawEvents`) and `createConvexComponentRuntimeLayer`; the component-owned
  log passes Layer-backed `@metacrdt/testkit` conformance.
- [x] **Goal 111 persistence conformance started** — `@metacrdt/testkit` now has
  `runRuntimePersistenceConformance`, proving event-log/HLC/seq continuity across
  Layer re-creation. It is wired into the runtime localStorage target, Node
  SQLite/Postgres, and local async.
- [x] **Goal 111 scheduler service conformance started** —
  `@metacrdt/testkit` now has `runRuntimeSchedulerConformance`, proving
  payload-preserving `SchedulerService.after` submission for observable
  schedulers. Wired into testkit memory and Node memory targets. Durable host
  wakeup execution remains target-specific for now.
- [x] **Goal 111 transport publish conformance started** —
  `@metacrdt/testkit` now has `runRuntimeTransportConformance`, proving
  batch- and order-preserving `TransportService.publish` submission for
  observable transports. Wired into testkit memory and Node memory targets.
  Network delivery/relay behavior remains target-specific for now.
- [x] **Goal 111 network transport conformance started** —
  `@metacrdt/testkit` now has `runRuntimeNetworkTransportConformance`, proving
  peer delivery, late-peer version-vector catch-up, and idempotent post-catch-up
  sync for target-provided network harnesses. Proven against runtime
  BroadcastChannel, p2p DataChannel, and Cloudflare Durable Object WebSocket
  relay harnesses.
- [x] **Goal 111 projection conformance started** —
  `@metacrdt/testkit` now has `runRuntimeProjectionConformance`, proving shared
  core projection semantics over target-returned EventStore logs: cardinality-one
  `≺` winners, cardinality-many sets, bitemporal coordinates, audit flags, entity
  maps, and filtered-source point projection.
- [x] **Goal 111 Datalog/query conformance started** —
  `@metacrdt/testkit` now has `runRuntimeQueryConformance`, proving
  EventStore-backed Datalog/query semantics over target-returned logs through the
  pure `@metacrdt/query` helpers: joins, `or`, `not`, compare/compute,
  provenance, pagination, aggregation, and derived-row shaping.
- [x] **Goal 111 production query-service contract** —
  `@metacrdt/runtime` now exposes `DatalogQueryService` as an Effect service
  backed by `EventStoreService`, with Schema-validated query/page/aggregate/
  derived-row APIs, tagged runtime errors, stable pagination, and testkit
  conformance routed through the service.
- [x] **Goal 111 materialized current-query provider started** —
  `@metacrdt/runtime` now exposes `projectionDatalogQueryLayer()` /
  `projectionDatalogQueryService()`, providing the same `DatalogQueryService`
  contract over `ProjectionStoreService` rows for current-state query surfaces.
  `@metacrdt/cloudflare` uses it for `queryCurrent`, `pageCurrent`,
  `aggregateCurrent`, and `derivedRowsCurrent` on the DO SQLite facade.
- [x] **Goal 111 materialized projection-store boundary started** —
  `@metacrdt/runtime` now defines `ProjectionStoreService`, `ProjectionRow`,
  `ProjectionStore`, and `projectionRowsFromLog`; memory/localStorage, Node
  memory/SQLite/Postgres, local-first localStorage, and Cloudflare Durable Object
  storage now provide the service and run `runRuntimeProjectionStoreConformance`.
- [x] **Goal 111 Convex projection-store adoption** — `@metacrdt/convex` now owns
  a component `projectionRows` table and `replace`/`scan`/`clear` component
  functions; `createConvexComponentRuntimeLayer` provides
  `ProjectionStoreService` and passes shared projection-store conformance.
- [ ] **Goal 111 next: target-specific historical query providers** — when a
  target exposes a query implementation beyond the shared EventStore-backed
  `DatalogQueryService` Layer and the projection-backed current provider, add
  provider-specific conformance proving it matches the production service
  contract for its claimed coordinate range. Current `ProjectionStoreService`
  rows are a current-state read model; full bitemporal SQL query parity still
  needs an indexed historical provider.
- [x] **Package build/release tooling** — Turbo now orchestrates package
  `build`/`typecheck`/`test`; tsdown/Rolldown emits `dist` ESM + declarations
  for every `@metacrdt/*` package; exports point at `dist`; package payloads are
  `dist`-only (Cloudflare keeps `wrangler.example.toml`); Vite remains the app
  builder.
- [x] **Central package-build config** — root `tsdown.config.ts` owns package
  entries/targets, package `build` scripts call it, Turbo treats it as a global
  dependency, and `npm run pack:packages` runs dry-run payload checks as a Turbo
  task.
- [x] **`@metacrdt/core` extracted** — `packages/core`, pure & dependency-free
  (sha256, base32, canonical encoding, HLC, Event + content addressing, the `≺`
  order, G-Set log/merge, the bitemporal fold; SPEC §4–5). 46 tests: CRDT laws,
  fold determinism, ≺-max supersession, visibility quadrants. No I/O, no
  `Date.now()`/`Math.random()` (HLC takes wallclock as a param).
- [x] **Open Ontology fold proposal** — `docs/package-consolidation.md` maps the
  submodule package graph into the canonical `@metacrdt/*` monorepo:
  `@metacrdt/forma` (Lisp), `schema/query/workflow/forms/views/agent`, runtime
  harness, and target packages. It explicitly rejects early `triplestore` /
  `database` package names in favor of core + query + targets.
- [x] **Read path on `@metacrdt/core`** — `lib/visibility.ts` is now a thin
  adapter that folds each `facts` row through core's `visible` (SPEC §5.3); every
  read query + `rebuildProjections` uses it. Confirmed Convex's esbuild bundles
  the workspace `.ts` directly (no dist build needed). All 66 convex + 46 core
  tests green; verified live.
- [ ] **Write path on core** — partially shipped: new `factEvents` now carry
  `eventId` + HLC + target/causal metadata, `facts.assertEventId` stores the core
  assert id, `correctFact` writes tombstone+assert protocol events, and
  cardinality-one current projection reconciles by `≺`-max; `rebuildProjections`
  now prefers HLC/eventId ordering while retaining legacy fallback.
  `api.facts.entityFromEventLog` now folds a single host entity directly from
  protocol-shaped `factEvents` + schema cardinality events, and
  `api.facts.queryFactsFromEventLog` answers bounded bitemporal point queries
  directly from protocol-shaped `factEvents`. `api.datalog.datalogFromEventLog`
  now reuses the Datalog solver with an injected event-log source for base facts,
  the event-log proof surface includes paged Datalog and aggregate variants, and
  `api.datalog.datalogFromEventLogWithDerived` now joins event-log base facts with
  materialized `derivedFacts`; mixed-source page/aggregate variants are shipped as
  `datalogPageFromEventLogWithDerived`, `aggregateFromEventLogWithDerived`, and
  `aggregatePageFromEventLogWithDerived`. `api.datalog.deriveFromEventLog` now
  computes read-only rule output directly from the event log for a supplied
  `where` + `emit`. Production non-closure Datalog rule materialization now solves
  base facts through the shared event-log-base + derived source while preserving
  `sourceFactIds` from assertion `factEvents.factId`. Full transitive-closure
  recompute now reads base edges through the shared event-log source too,
  preserving path provenance through compatibility `factId`s. Production
  `datalog`, `datalogPage`, `aggregate`, and `aggregatePage` now use the shared
  event-log-base + materialized-derived source for base facts. Production
  `api.facts.queryFacts` now uses the event-log point-query path while preserving
  its existing return shape and read-auth behavior. Production
  `api.facts.getEntity` now folds current object state from protocol-shaped
  `factEvents` instead of reading `currentFacts`. Production `entityAsOf` and
  `entityFactsAsOf` now fold bitemporal entity state from protocol-shaped
  `factEvents` instead of reading `facts`. Production `compareFacts` now runs the
  event-log point fold at both requested coordinates. Production
  `api.entities.queryEntities` now uses event-log-backed Datalog for
  membership/filters and event-log base folds for row attributes + sort values.
  Production type discovery / picker / type-attribute discovery
  (`listEntityTypes`, `listEntities`, `typeAttributes`) now read current
  type/name/attribute facts from `factEvents`. Configured action registry reads
  (`actionsForType`, `listActions`, `entityDetail.actions`, and `runAction`
  definition loading) now read action definition facts from `factEvents`.
  Overview dashboard base-fact summary counts now read current facts from
  `factEvents` too. Config history/diff now folds config ownership snapshots
  from `factEvents` instead of the `facts` projection. Read authorization policy
  now folds form/attribute PII markers and principal `grants.read` facts from
  `factEvents` instead of `currentFacts`. System process compliance-obligation
  counts now derive enabled requirement/task output from `factEvents` instead of
  materialized `derivedFacts`. Closure semi-naive add now receives the changed
  assertion `eventId` and resolves compatibility provenance through `factEvents`.
  Host flow-run status transitions are now mirrored into `flow.run.status` facts,
  and System flow-resumer counts read waiting runs from `factEvents` instead of
  host `flowRuns`. Materialized derived rows now carry protocol
  `sourceEventIds` alongside compatibility `sourceFactIds`, and
  `explainDerived` resolves event ids first for protocol-backed explanations.
  The Confect `metacrdt` sidecar now also exposes
  `api.metacrdtConfect.explainDerived` as a typed protocol-inspection wrapper
  over those event-backed derived explanations. The Confect compliance dry-run
  sidecar now folds current planning state from protocol-shaped `factEvents`
  instead of reading `currentFacts`, and `npm run test:confect` covers both
  Confect sidecar test files.
  User-facing compliance obligation reads (`workerCompliance`,
  `entityDetail.obligations`, Overview required/open counts, and
  `flows.issueAllOpen`) now derive enabled `require.*` / `task.*` rule output
  from protocol-shaped `factEvents` instead of reading materialized
  `derivedFacts`. Remaining: derived rows are still stored in `derivedFacts`.
- [x] **`@metacrdt/schema` first slice extracted** — `packages/schema` owns pure
  schema-as-facts conventions (`attr:` / `type:` carrier ids, builtin
  cardinalities, value/cardinality guards, and meta-attribute bootstrap
  definitions). `convex/lib/meta.ts` re-exports the package for compatibility.
- [x] **`@metacrdt/schema` definition lowering extracted** — the package now owns
  pure attribute/type/meta-schema fact lowering and attribute-shape reconstruction
  from visible schema rows; `convex/attributes.ts` keeps storage, transactions,
  authorization, validators, and query execution.
- [x] **`@metacrdt/query` first slice extracted** — `packages/query` owns pure
  clause/term types, bounded Datalog parser, operator sets, compute/comparison
  helpers, pattern unification, projection, pagination, aggregation, explain
  descriptions, value keys, and entity-local rule analysis. `convex/lib/engine.ts`
  imports/re-exports those helpers while keeping triple fetching, read auth,
  provenance, and async join scheduling.
- [x] **`@metacrdt/query` rule emit shaping extracted** — the package now owns
  read-only rule emit-term resolution and deterministic derived-row shaping
  (`EmitSpec`, `DerivedRow`, `resolveEmitTerm`, `derivedRowsFromBindings`):
  placeholder resolution, null/undefined entity skipping, entity string coercion,
  typed-value dedupe, and stable sort. `deriveFromEventLog` consumes it through
  `convex/lib/engine.ts`; Convex still owns solving, triple sources, read auth,
  provenance, and materialized derived storage.
- [x] **`@metacrdt/query` clause planner extracted** — the package now owns
  `chooseNextClausePosition`, the pure scheduling decision used by the Convex
  Datalog solver: runnable non-pattern filters first, otherwise the most
  selective pattern, with the same unsafe-query error when no clause can advance.
  Convex still owns async execution, triple fetching, read auth, provenance, and
  branch recursion.
- [x] **`@metacrdt/query` provenanced binding dedupe extracted** — the package now
  owns typed binding keys, generic source-list merging, and
  `dedupeProvenancedBindings` for disjunction branch output. Duplicate bindings
  collapse while preserving fact/event provenance; Convex still owns branch
  recursion, source fetching, read auth, and provenance interpretation.
- [x] **`@metacrdt/query` pattern input construction extracted** — the package now
  owns `PatternInput` and `patternInputForBinding`, resolving parsed pattern
  terms against the current binding into source constants. Convex still owns
  `TripleSource` lookup, indexes, read auth, provenance, and async execution.
- [x] **`@metacrdt/query` provenanced pattern extension extracted** — the package
  now owns `QueryTriple` and `extendProvenancedBinding`, unifying matched triples
  with solved states and merging fact/event provenance for positive joins. Convex
  still owns candidate fetching, negation checks, read auth, and async scheduling.
- [x] **`@metacrdt/query` pattern candidate expansion extracted** — the package
  now owns `extendPatternCandidates`, expanding one solved state across
  already-fetched positive-pattern candidates while preserving fact/event
  provenance. Convex still owns candidate fetching, read auth, intermediate-row
  limits, async scheduling, and source semantics.
- [x] **`@metacrdt/query` negation candidate check extracted** — the package now
  owns `passesNegationCandidates`, applying typed pattern unification to
  already-fetched candidate triples. Convex still owns candidate fetching, read
  auth, and source semantics.
- [x] **`@metacrdt/query` local state transitions extracted** — the package now
  owns `filterCompareStates` and `applyComputeStates`, applying compare/compute
  clauses to provenanced solved bindings while preserving source/event
  provenance. Convex still owns the async solver loop, source fetching, read auth,
  negation IO, and branch recursion.
- [x] **`@metacrdt/query` intermediate row guard extracted** — the package now
  owns `assertIntermediateRowsWithinLimit`, the shared `maxIntermediateRows`
  comparison and error text. Convex still owns when the guard runs in the
  positive-pattern and disjunction branches.
- [x] **`@metacrdt/query` bound-variable advancement extracted** — the package now
  owns `advanceBoundVars`, returning the next scheduler bound-var set after a
  pattern, compute, or disjunction clause. Convex still owns clause execution,
  source IO, read auth, and branch recursion.
- [x] **`@metacrdt/query` solver-frame initialization extracted** — the package
  now owns `initialSolverFrame`, creating the initial remaining-clause index list,
  bound-var set, and cloned seeded provenanced state. Convex still owns parsing,
  source/auth setup, async execution, and recursion.
- [x] **`@metacrdt/query` solver work-list selection extracted** — the package
  now owns `selectNextClause`, which chooses the next runnable parsed clause,
  returns the selected clause/index, and returns a cloned remaining work list
  without mutating caller state. Convex still owns clause execution, source IO,
  read auth, row-limit placement, and branch recursion.
- [x] **`@metacrdt/query` guarded pattern extension extracted** — the package now
  owns `extendPatternCandidatesWithinLimit`, extending one solved state across
  already-fetched positive-pattern candidates and checking the accumulated
  intermediate-row limit. Convex still owns candidate fetching, fetch order,
  source IO, read auth, and recursion.
- [ ] Then peel off, as they stabilize: more `@metacrdt/query` solver/rule AST
  seams, then `@metacrdt/workflow`, `@metacrdt/forms`, `@metacrdt/views`, and
  `@metacrdt/agent`.
- [x] **`@metacrdt/forma` extracted** from Open Ontology's language packages
  (`language-ts`, selected `language-host` / docs / tests). Forma owns the Lisp
  authoring language; runtime lowering stays out until the IR boundary proves it.
- [x] **`@metacrdt/convex` adapter package extracted** — `packages/convex` owns
  Convex/core event construction, row reconstruction/verification summaries,
  visibility mapping, protocol metadata validators, pure cardinality-one
  reconcile selection by `≺`, host-mounted append/verify helper factories, and
  the Confect sidecar warning. It also exposes a first stateless registered
  component surface (`@metacrdt/convex/convex.config.js`) for building and
  summarizing protocol rows; the reference app installs it as `components.metacrdt`
  and wraps it as `api.metacrdtComponent.verifyEvents`. The reference app
  consumes the package from `convex/lib/coreEvent.ts`, `convex/lib/visibility.ts`,
  `confect/metacrdt.impl.ts`, and the mounted component wrapper.
- [x] **`@metacrdt/convex` state-owned protocol log slice** — the packaged
  component now owns `transactions` + append-only protocol `factEvents`, exposes
  `log.appendAssert` / `log.appendLifecycle` / `log.getEvent` / `log.listEvents`,
  and the reference app wraps those functions with server-derived actor context.
- [x] **`@metacrdt/convex` projection-owned slice** — component-owned writes now
  maintain component-owned `facts` and `currentFacts`; `log.listCurrent` and
  `api.metacrdtComponent.listOwnedCurrent` expose current component state.
- [x] **`@metacrdt/convex` component-owned cardinality-one semantics** —
  component-owned assert writes can opt into `cardinality: "one"`; current state
  reconciles by `≺`, losers are retracted through protocol events, and audit
  history keeps every assertion.
- [x] **`@metacrdt/convex` component-owned projection rebuild** —
  `log.rebuildProjections` deletes component-owned `facts` / `currentFacts` and
  replays the component-owned append-only `factEvents` log into fresh projections.
  Lifecycle linkage is by protocol `targetEventId`; event-row `factId` remains
  projection convenience and is not rewritten during rebuild.
- [x] **`@metacrdt/convex` component-owned entity reads** —
  `log.getCurrentEntity` and `api.metacrdtComponent.getOwnedCurrentEntity` group
  component-owned current facts by attribute for a single entity. This is the
  first object-level read API over component-owned state.
- [x] **Component-backed New Entity path** — the app header now creates bounded
  component-owned entities through `api.metacrdtComponent.createOwnedEntity` and
  routes to `/component/e/:id`, which reads current state + event history from
  `@metacrdt/convex` component-owned tables.
- [x] **Component-owned typed entity browser** — `@metacrdt/convex` now lists
  typed component-owned entities from current `type` facts, the host wrapper
  exposes that list, and the Entities page shows component-owned rows separately
  with links to `/component/e/:id`.
- [x] **Component-owned Worker status actions** — the reference app now changes
  component-owned `worker.status` through `api.metacrdtComponent.setOwnedWorkerStatus`,
  preserving component-owned cardinality-one reconciliation and append-only event
  history.
- [x] **Component-owned configured action runner** — component-owned detail pages
  now render configured host actions by type and run their assert semantics
  through `api.metacrdtComponent.runOwnedAction`, with host schema cardinality
  adapted into component-owned writes.
- [x] **Component-owned actions can open collection forms** — `runOwnedAction`
  supports `opensForm`, resolves `$entity` / `$arg.*` placeholders, issues or
  reuses the collection token for the component-owned entity id, and the
  component detail page renders the returned `/collect` link.
- [x] **Component-owned collection submission** — `/collect` submission dispatches
  component-owned tokens into component state, writing submitted field facts plus
  `submitted.<form>` into component-owned current state while legacy/host tokens
  continue to write host facts. The old host `collectionTarget: "component"`
  bridge remains only for transition tokens.
- [x] **Component-owned form definitions** — `api.metacrdtComponent.defineOwnedForm`
  writes `type = Form` and `formDef` facts into component-owned state, and
  component-target collection links render from that component-owned `formDef`
  without a host `forms.defineForm` row.
- [x] **Component-owned collection run/token storage** — component-owned
  action-issued collection capability rows now live in the installed
  `@metacrdt/convex` component; public `/collect` dispatches host tokens first,
  then component tokens, preserving legacy host-token behavior.
- [x] **Component-owned standalone collect runs** — `startOwnedCollect` starts or
  reuses component-owned collection runs for component-owned entities,
  `listOwnedCollections` exposes those runs, `/collect` submits them into
  component-owned state, and `/component/e/:id` shows the component-owned run
  list.
- [x] **Goal 39: component-owned compliance issue/reuse** — compute
  `reuse`/`collect` decisions for component-owned Workers from host configured
  `require.*` rules plus component-owned placement/scope/evidence state, then
  issue missing evidence as component-owned collection runs without creating host
  `flowRuns` rows.
- [x] **Goal 40: component-owned compliance materialization** — materialize the
  live component compliance plan into component-owned `requires.<form>` and open
  `task.<form>` facts, and retract stale task facts when submitted evidence turns
  a collection into reuse.
- [x] **Goal 41: component-owned DAG flow starter/resumer** — run configured host
  flow definitions over component-owned state, support assert/notify/subject-local
  branch/synchronous action/collect/done, park at component-owned collection
  tokens, and resume by rerunning after submission without host `flowRuns`.
- [x] **Goal 42: persisted component-owned DAG run/timeline storage** —
  `@metacrdt/convex` owns `flowDagRuns` and `flowDagEvents`; `startOwnedFlow`
  records each execution into component-owned process history, reusing a waiting
  run when a rerun resumes after collection submission.
- [x] **Goal 43: component-owned DAG wait/scheduler wakeups** — `wait` steps now
  park the component-owned DAG run, schedule `internal.metacrdtComponent.wakeOwnedFlow`,
  resume the same run at the wait step's `next`, and continue writing
  component-owned fact effects under a system actor.
- [x] **Goal 44: component-owned collect reminder/escalation timers** —
  component-owned collection runs now record bounded timer state, host wrappers
  schedule reminder/escalation ticks for newly issued component-owned collection
  tokens, explicit expiry can mark still-waiting runs `expired`, and ticks no-op
  after submission completes a run.
- [x] **Datalog disjunction** — Datalog `where` bodies now support bounded
  `{ or: [[...clauses], ...] }` branches. Branches run from the current binding,
  union/dedupe their bindings with provenance merged, and continue into later
  joins.
- [x] **Datalog computed predicates** — Datalog `where` bodies now support
  `{ compute: [op, ...args], as?: term }` for deterministic arithmetic/string
  folds over already-bound variables. Arithmetic clauses can bind/check computed
  numbers; string clauses can normalize/measure text and run boolean predicates.
  Computed clauses preserve existing provenance and add no fact sources.
- [x] **Datalog / aggregate result pagination** — `datalogPage` and
  `aggregatePage` expose Convex-style `{ page, isDone, continueCursor }` results
  over deterministic projected Datalog rows and aggregate group rows. Cursors are
  engine offsets, not database cursors; `LIMITS.maxPageSize` caps oversized page
  requests.
- [x] **Cross-entity rule affected-output recompute** — variable-emitting
  cross-entity Datalog rules now replace only output entities affected by a
  changed source fact, discovered from prior provenance and current solved
  bindings. Corrections notify materialization as tombstone-old + assert-new.
  Unsupported/constant-emitting rules still fall back to full recompute.
- [x] **Counted transitive-closure deletion reconciliation** — closure-derived
  rows now carry `supportCount`; recompute reconciles counted support rows rather
  than replacing the whole projection, and incremental add increments support
  counts for newly discovered alternate paths.
- [x] **`@metacrdt/runtime` harness groundwork** — `packages/runtime` owns
  target-neutral service contracts (`EventStore`, `RuntimeClock`, `Scheduler`,
  `Transport`), capability metadata, operation helpers over `@metacrdt/core`, and
  a memory target/harness proving G-Set exchange convergence and version-vector
  anti-entropy. It does not yet own Convex or durable transport.
- [x] **Browser/localStorage target seed** — `packages/runtime/src/local.ts`
  provides localStorage-compatible `LocalEventStore`, `LocalClock`, and
  `LocalSequencer`, plus `createLocalRuntime`. It remains the shared runtime
  primitive that `@metacrdt/local` composes rather than duplicating.
- [x] **BroadcastChannel transport seed** — `packages/runtime/src/broadcast.ts`
  adds `BroadcastChannelTransport` and `attachBroadcastTransport` for
  same-origin browser anti-entropy over any runtime target.
- [x] **`@metacrdt/cloudflare` Durable Object runtime services** —
  `packages/cloudflare` provides storage-backed event log, HLC, and per-replica
  sequencer services plus `createDurableObjectRuntime`.
- [x] **`@metacrdt/cloudflare` Durable Object WebSocket relay shell** —
  `packages/cloudflare/src/relay.ts` accepts server sockets, answers version
  vector hellos with deltas, merges client events, and fans out accepted events.
- [x] **Cloudflare Worker/DO example shell** — `packages/cloudflare/src/worker.ts`
  exposes `MetaCrdtRelayDurableObject`, `createRelayWorker`, and `relayWorker`;
  `wrangler.example.toml` documents the Durable Object binding/migration.
- [x] **`@metacrdt/local` browser target package** — `packages/local` exposes
  browser defaults and lifecycle helpers over the runtime localStorage +
  BroadcastChannel seeds.
- [x] **IndexedDB-compatible async local persistence** — `packages/local` adds
  async local runtime services and an `IndexedDbRuntimeStorage` adapter while
  reusing the runtime local event encoding/key helpers.
- [x] **SQLite-compatible local persistence** — `packages/local` adds a
  native-dependency-free structural SQLite adapter plus SQLite local-first
  runtime helpers over the async local runtime path.
- [x] **p2p DataChannel transport** — `packages/runtime/src/p2p.ts` adds a
  structural WebRTC/DataChannel-compatible transport with JSON wire messages,
  hello/delta catch-up, directed deltas, lifecycle cleanup, and multi-hop gossip.
- [ ] Targets: live Cloudflare deployment and migrating more reference
  runtime business logic onto `@metacrdt/convex` component-owned state
  (component-owned collect reminder/escalation/expiry timers now shipped).
- [x] Query/rules: DRed/counting for transitive closure deletions (counted
  support reconcile shipped; deletion/correction still computes the bounded
  support map before reconciling rows).

**Goal 5 — true `applyConfig` reconcile**
- [x] Make `applyConfig` compute stable desired sets for explicitly supplied
  config sections.
- [x] Retract or deactivate previously configured facts/rows dropped from the
  blueprint, without touching runtime data or system/meta facts.
- [x] Add tests proving requirement/action/type-or-attribute removal and repeated
  identical apply idempotence.

**Goal 6 — attribute-level PII read authorization**
- [x] Mark PII at the form-schema layer (`i9/ssn`).
- [x] Derive the read principal server-side from Convex auth identity
  (`tokenIdentifier`), defaulting unauthenticated callers to `anonymous`.
- [x] Express grants as facts on the principal (`grants.read`) and make public
  read projections omit/redact ungranted values with `Denied` markers.
- [x] Protect public Datalog while leaving internal rule/materialization folds
  unfiltered.

**Goal 7 — schema-driven entity UI**
- [x] Extend `typeSchemaAsOf` with UI-ready column definitions reconstructed
  from schema-as-facts.
- [x] Render the Entities table from declared type columns via `queryEntities`.
- [x] Order entity detail state by the primary type's declared schema, then
  append extra runtime facts.

**Goal 8 — Confect-first compliance planning**
- [x] Convert one real production domain boundary to Confect/Effect without a
  wholesale backend rewrite.
- [x] Ship dry-run compliance: hypothetical worker/placement → required forms,
  `reuse` vs `collect`, no writes.
- [x] Keep existing `api.compliance.workerCompliance` behavior stable while
  adding a Confect sidecar mount for the planner.
- [x] Record the Confect decision after the slice: expand, keep narrow, or
  defer.

**Product / engine**
- [x] Attribute-level PII authorization — read grants; query layer omits
  ungranted attrs (the i9 SSN) and reports `Denied`.
- [x] Dry-run compliance — Confect sidecar planner with reuse/collect decisions,
  no writes.
- [x] Schema-driven forms / list views — render columns + collection fields from a
  type's declared attributes (`typeSchemaAsOf`), not ad-hoc.
- [x] Config history/diff — current config ownership manifest + recent
  config-authored manifest diffs surfaced under Data model.
- [x] Arg-taking actions — action definitions can declare fields, and
  `runAction` resolves `$arg.<name>` / `$entity` placeholders before asserting
  facts.
- [x] Actions that open forms — action definitions can declare `opensForm`;
  `runAction` issues/reuses a waiting collect run and returns the `/collect`
  token link for the entity page.
- [x] Collect-token single-use / expiry hardening — new `/collect` links expire,
  successful submissions consume their token, and token lookup refuses consumed /
  expired / no-longer-waiting runs before exposing form definitions.
- [x] Backend write authorization — general public write mutations now require
  Convex auth identity and derive actors server-side; `/collect` remains
  token-authorized.
- [x] Backend auth config seam — `convex/auth.config.ts` exists and exports a
  fail-closed empty provider list. Production provider activation is documented
  but intentionally not checked in until the provider is chosen.
- [x] Auth-aware frontend write gates — admin routes now have Convex auth-state
  context and protected controls open a shared auth-required modal instead of
  firing anonymous writes.
- [ ] Choose and wire the production frontend auth provider wrapper/JWT flow.

**Next goal candidates**
- [x] Choose the next active goal: Goal 39, component-owned compliance
  issue/reuse.
- [x] After Goal 40, choose component-owned DAG flow starter/resumer.
- [x] After Goal 41, choose persisted component-owned DAG run/timeline storage.
- [x] After Goal 42, choose component-owned wait/scheduler support.
- [x] After Goal 43, choose component-owned collect reminder/escalation timers.
- [x] After Goal 44, choose Datalog computed predicates.
- [x] Choose the next target-planning goal: formalize target vs storage adapter
  vs transport and write the Cloudflare parity plan.
- [x] Choose the next target-runtime slice: first `@metacrdt/testkit`
  conformance package.
- [x] Wire the shared `@metacrdt/testkit` suite into existing Cloudflare and
  local runtime targets.
- [x] Choose the next target-runtime slice: first `@metacrdt/node` package.
- [x] Choose the next Node slice: structural HTTP/SSE sync handler.
- [x] Choose the next Node slice: native-style HTTP listener adapter.
- [x] Choose the next Node slice: packaged dev-server CLI.
- [x] Choose the next Node slice: Postgres runtime services.
- [x] Choose the next Node slice: shared SQL lifecycle plan.
- [x] Choose the next Node slice: sync SDK client over the shipped HTTP/SSE
  surface.
- [x] Choose the next Node slice: framework-neutral production assembly helper.
- [x] Choose the next Node slice: concrete deployment recipes over real
  drivers/process managers.
- [ ] Choose between production provider wiring, Node production hardening
  (auth/retry/observability examples), Cloudflare DO+SQLite
  component-equivalent parity, or
  another parked Query/Rules item.

**Docs**
- [x] `docs/physics.md` — the capstone: compliance / small-group coordination &
  co-signing / agent swarms as three blueprints over one substrate.

**Polish / loose threads**
- [x] ⌘K search / command menu — header search opens a real command palette with
  page, entity, type, and flow commands.
- [x] Guided demo tour — route-aware shell walkthrough across Overview,
  Entities, Compliance, Flows, Data model, and Transaction log with one-time
  localStorage dismissal and a restartable header button.
- [x] Wire the remaining decorative bit from the mockup: "Describe account" now
  opens a live account-summary modal in the app shell.
- [x] Action/config diff-history polish — config-history rows now include
  changed-kind summaries, manifest-change totals, and event-kind counts; Data
  model renders expandable direct event details and per-action last config
  provenance.
- [x] Root-cause the `staticHosting:getCurrentDeployment` error over the WS path
  — the public query works, but the upstream `useDeploymentUpdates` helper wraps
  it in throwing `useQuery`; the app banner now uses object-form
  `useQuery_experimental({ throwOnError: false })` and no longer needs an error
  boundary.

## Notes / gotchas

- **Deploy:** `npx convex codegen` generates types but does **not** fully push
  functions — use `npx convex dev --once`. Static: `npx @convex-dev/static-hosting
  upload` (defaults to **dev**); the `deploy` subcommand forces prod.
- Live dev deployment: `chatty-hare-94` (project `triple-store`).

---

## Log

### 2026-06-09 — Cloudflare SQLite live-query write publish route seed
- [x] **Authenticated write route forwarding.** `createRelayWorker` now includes
  a `/write/<room>/<operation>` prefix that routes through the same Durable
  Object binding and token auth boundary as relay and live-query room paths.
- [x] **DO write-and-publish paths.**
  `MetaCrdtSqliteLiveQueryDurableObject` can POST append assert, append
  lifecycle, and collection submit writes through the existing current surface
  and publish the returned changed `(e, a)` summaries through
  `DurableObjectSqliteLiveCurrentQueryFanout`.
- [x] **Still scoped.** This is write publish orchestration only; frontend SDK
  behavior, durable session tokens, result diffs, reconnect retry policy, full
  flow execution, and broader SQL query-provider hardening remain open.

### 2026-06-08 — Cloudflare SQLite live-query Durable Object assembly seed
- [x] **DO assembly class.** `MetaCrdtSqliteLiveQueryDurableObject` now
  constructs the DO SQLite runtime, current-query surface, persisted
  live-query registry, and structural fanout over `ctx.storage.sql`.
- [x] **Upgraded socket path.** The class uses
  `attachDurableObjectSqliteLiveQueryWebSocket` for upgraded requests and exposes
  health metadata for the replica, in-memory live-query counts, and version
  vector.
- [x] **Still scoped.** This is Durable Object assembly only; application
  write-route publish orchestration, frontend SDK behavior, durable session
  tokens, result diffs, full reconnect protocol, flow execution, and broader SQL
  query-provider hardening remain open.

### 2026-06-08 — Cloudflare live-query Worker route seed
- [x] **Worker route is authenticated.** `createRelayWorker` now forwards
  `/live-query/<room>` to the configured Durable Object binding through the
  same Bearer/header/query-token auth boundary used for relay rooms.
- [x] **DO attach helper.** `attachDurableObjectSqliteLiveQueryWebSocket`
  accepts upgraded requests, derives a connection id from `?client=` or
  `Sec-WebSocket-Key`, and connects the server socket to an existing
  `DurableObjectSqliteLiveCurrentQueryFanout`.
- [x] **Still scoped.** This is route/attachment plumbing only; production
  SQLite DO assembly, frontend SDK behavior, durable session tokens, result
  diffs, full reconnect protocol, flow execution, and broader SQL query-provider
  hardening remain open.

### 2026-06-08 — Cloudflare DO SQLite live-query reconnect hydration
- [x] **Hydration API for persisted subscriptions.**
  `DurableObjectSqliteLiveCurrentQueryFanout.hydrateConnection` now loads active
  persisted current-query rows for a connected socket, filters them by protocol
  and optional scope, reattaches them to in-memory fanout state, reruns current
  queries, and sends fresh `query.subscribed` snapshots.
- [x] **Socket protocol seed.** Structural live-query sockets now accept
  `query.hydrate` messages for the same hydration path.
- [x] **Still scoped.** This is reconnect hydration plumbing over the existing
  persisted registry only; authenticated Worker routes, durable client session
  tokens, result diffs, frontend SDK behavior, full flow execution, and broader
  SQL query-provider hardening remain open.

### 2026-06-08 — Cloudflare DO SQLite target-indexed coordinate fold
- [x] **Runtime target lookup is now contractual.** `EventFilter.target` lets
  targets scan lifecycle events by the assertion event they affect; memory,
  localStorage, async local persistence, Cloudflare KV/SQLite, Node
  SQLite/Postgres, and the Convex component raw-log bridge implement it.
- [x] **SQL stores persist and index lifecycle targets.** Cloudflare DO SQLite
  and Node SQLite/Postgres event tables now include nullable `target` plus a
  target index, and the shared Node SQL lifecycle plan exposes that DDL.
- [x] **Cloudflare scoped reconcile no longer folds the full log.**
  Append/lifecycle current-coordinate reconcile folds matching `(e, a)` asserts
  plus `scan({ target })` lifecycle rows for those asserts; explicit
  `rebuildCurrent` remains the full-log recovery path.
- [x] **Tests prove the path.** `@metacrdt/testkit` EventStore conformance now
  requires `scan({ target })`; Cloudflare fake SQLite counts target scans versus
  full scans and lifecycle reconcile exercises the target-index path.

### 2026-06-08 — Cloudflare DO SQLite scoped current reconcile
- [x] **Added `ProjectionStoreService.replaceMatching`.** Runtime now has an
  Effect-native scoped projection replacement contract, with a compatibility
  `ProjectionStore.replaceMatching` hook and a fallback that preserves all rows
  outside the supplied filter.
- [x] **Cloudflare SQLite implements targeted projection replacement.**
  `DurableObjectSqliteProjectionStore.replaceMatching` clears only matching
  rows for exact `{ e, a }` filters and deletes broader matches by row id.
- [x] **Append/lifecycle helpers now reconcile one current coordinate.**
  `reconcileDurableObjectSqliteCurrentEventEffect` derives the touched `(e, a)`
  from the appended assert or lifecycle target assert, computes before/after
  rows for that coordinate, calls `replaceMatching`, and returns the same
  deterministic changed-coordinate summaries used by live-query invalidation.
- [x] **Tests prove scoped writes.** Testkit projection-store conformance now
  verifies replacing one coordinate preserves unrelated rows; Cloudflare tests
  prove append/lifecycle paths do not full-clear the projection while explicit
  `rebuildCurrent` still does. This was projection-write-side incremental; the
  following target-indexed coordinate-fold slice removed the remaining full-log
  scan from append/lifecycle reconcile.

### 2026-06-08 — Cloudflare DO SQLite projection invalidation summaries
- [x] **Made the current projection report what changed.**
  `@metacrdt/cloudflare` now exports `DurableObjectSqliteProjectionChange`, and
  `rebuildCurrent` returns `changed` summaries keyed by `(e, a)` with sorted
  before/after event ids. `appendAssert` / `appendLifecycle` inherit the same
  projection result through the facade.
- [x] **Tests cover the live-query invalidation seed.** Cloudflare tests prove a
  cardinality-one replacement reports the old and winning event ids, lifecycle
  retraction reports removal, and a no-op rebuild reports `changed: []`.
- [x] **Docs updated the parity line.** Invalidation reporting is shipped as a
  deterministic return value; incremental reconcile and WebSocket fanout remain
  the future transport/operational work.

### 2026-06-08 — projection-backed current Datalog provider
- [x] **Added runtime's materialized current-query provider.**
  `@metacrdt/runtime` now exposes `projectionDatalogQueryService()` and
  `projectionDatalogQueryLayer()`, reusing the same parser/solver/projection/
  pagination/aggregate/derived-row pipeline as the EventStore-backed
  `DatalogQueryService` while sourcing candidates from `ProjectionStoreService`
  rows.
- [x] **Cloudflare DO SQLite facade now has opt-in current Datalog reads.**
  `createDurableObjectSqliteCurrentSurface` exposes `queryCurrent`,
  `pageCurrent`, `aggregateCurrent`, and `derivedRowsCurrent`; these run through
  the projection-backed provider over the SQLite projection table, separate from
  the existing EventStore-backed bitemporal `query`/`page`/`aggregate`/
  `derivedRows` methods.
- [x] **Tests and docs.** Runtime tests prove the projection provider supports
  query/page/aggregate/derivedRows over materialized rows; Cloudflare tests prove
  the current provider matches the existing fixture. Remaining Cloudflare parity
  is historical SQL-indexed query optimization, richer reconcile/invalidation,
  collection/flow, alarms, and live-query plumbing.

### 2026-06-08 — @metacrdt/cloudflare SQLite bitemporal query surface
- [x] **Added EventStore-backed Datalog reads to the DO SQLite facade.**
  `createDurableObjectSqliteCurrentSurface` now exposes `query`, `page`,
  `aggregate`, and `derivedRows` alongside append/event/current reads; the
  Effect helpers depend on `DatalogQueryService`, and the runtime Layer is
  composed with `datalogQueryLayer()` so query semantics stay shared.
- [x] **Kept this as default-provider parity, not SQL optimization.** No
  Cloudflare-specific planner/index provider was added; future work can replace
  the provider behind the same query contract and prove equivalence with
  provider-specific conformance.
- [x] **Tests and docs.** Cloudflare tests now prove query, pagination,
  aggregation, and derived-row shaping through the SQLite event table. PLAN,
  TODO, README, `docs/cloudflare-target.md`, and `docs/targets.md` now describe
  the shipped surface as log/current/query and leave SQL-indexed optimization,
  operational flow/collection, alarms, and live-query plumbing as remaining.

### 2026-06-08 — @metacrdt/cloudflare SQLite event read surface
- [x] **Added protocol event reads to the DO SQLite facade.**
  `createDurableObjectSqliteCurrentSurface` now exposes `getEvent` and
  `listEvents` alongside append/rebuild/current reads; the Effect helpers read
  through `EventStoreService` with `effect/Schema`-validated `id`, `e`, `a`,
  `ids`, and `limit` arguments.
- [x] **Kept the storage boundary single.** No new SQL table/schema was added;
  the surface delegates to the existing `DurableObjectSqliteEventStore` and its
  entity/attribute/id scan paths.
- [x] **Tests and docs.** Cloudflare tests now prove single-event reads,
  entity/attribute event filters, id filters, and limits over the facade. PLAN,
  TODO, README, `docs/cloudflare-target.md`, and `docs/targets.md` now list
  remaining Cloudflare parity as SQL-indexed query optimization,
  reconcile/invalidation, operational flow/collection, alarms, and live-query
  plumbing.

### 2026-06-08 — @metacrdt/cloudflare SQLite current-state surface
- [x] **Started Cloudflare Phase C.** `@metacrdt/cloudflare` now exports
  `createDurableObjectSqliteCurrentSurface` plus Effect-native helpers for
  append-and-rebuild, `rebuildCurrent`, `listCurrent`, `getCurrentEntity`, and
  `listCurrentEntities` over the structural DO SQLite runtime.
- [x] **Shared fold semantics, SQLite read model.** The surface rebuilds neutral
  `ProjectionRow`s from the protocol log with `projectionRowsFromLog` /
  `@metacrdt/core` visibility/cardinality semantics, replaces the SQLite
  `ProjectionStoreService` rows, and serves current reads from that projection
  table.
- [x] **Tests and docs.** Cloudflare package tests now prove append/rebuild/read
  behavior and lifecycle retraction over the current surface (28/28). README,
  PLAN, `docs/cloudflare-target.md`, and `docs/targets.md` now separate the
  shipped current-state seed from remaining bitemporal query / operational /
  live-query parity work.

### 2026-06-08 — @metacrdt/node deployment recipes
- [x] **Added concrete Node deployment recipes.**
  `packages/node/DEPLOYMENT.md` shows native `node:http` + Postgres (`pg`
  `query(sql, params)`), native `node:http` + SQLite (`better-sqlite3`-style
  `prepare().get/all/run`), framework adapter shape over `handleSync`, explicit
  SQL lifecycle usage with `initialize: false`, one-shot peer sync through the
  optional client, and an operational checklist.
- [x] **Kept package dependency-free.** The recipes name real drivers/process
  hosts as host-app choices but do not add dependencies or change runtime APIs.
  Remaining Node production work is hardening: auth middleware examples,
  retry/backoff loops, observability hooks, and process-manager/provider
  templates when actual deployments demand them.

### 2026-06-08 — @metacrdt/node production assembly helper
- [x] **Added framework-neutral production assembly.** `@metacrdt/node` now
  exports `createNodeProductionRuntimeEffect` and `createNodeProductionRuntime`:
  choose `memory | sqlite | postgres`, initialize the corresponding runtime,
  return the Effect Layer, structural HTTP/SSE handler, native-style listener,
  SQL lifecycle metadata for durable stores, and optional sync SDK client wiring
  for a remote base URL.
- [x] **Typed boundary.** Initialization failures are
  `NodeProductionRuntimeError` values in the Effect error channel; the Promise
  facade is just `Effect.runPromise` for ordinary Node consumers.
- [x] **Tests and docs.** Node package tests are now 29/29, covering memory
  runtime/listener/client/Layer wiring, Postgres lifecycle metadata, and typed
  init errors. `packages/node/README.md`, `docs/targets.md`, `PLAN.md`, and the
  top-level README now describe the production assembly path. Concrete
  deployment recipes over real drivers/process managers remain the next Node
  documentation slice.

### 2026-06-08 — @metacrdt/cloudflare Durable Object SQLite runtime seed
- [x] **Started Cloudflare Phase A.** `@metacrdt/cloudflare` now exports
  `createDurableObjectSqliteRuntime` / `createDurableObjectSqliteRuntimeLayer`
  plus structural `DurableObjectSqlStorageLike` bindings for Cloudflare's
  `ctx.storage.sql.exec(query, ...bindings)` API.
- [x] **SQLite-backed runtime services:** `DurableObjectSqliteEventStore`,
  `DurableObjectSqliteProjectionStore`, `DurableObjectSqliteClock`, and
  `DurableObjectSqliteSequencer` persist events, materialized projection rows,
  HLC, and per-replica `seq` through `events` / `projection` / `meta` tables
  with entity/attribute/source-event indexes.
- [x] **Conformance:** Cloudflare package tests now include a narrow fake SQL
  driver and prove Layer use, restart persistence, two-replica convergence,
  invalid event-id rejection, shared runtime conformance, shared
  projection-store conformance, and shared restart-persistence conformance.
- [x] Still ahead after this seed: bitemporal query/index surface (later started
  by the EventStore-backed query facade; SQL-indexed optimization remains),
  incremental projection reconcile/live fanout, collection/flow surface, DO alarm
  multiplexing, live query subscriptions, and live Cloudflare deployment.

### 2026-06-08 — @metacrdt/node sync SDK client
- [x] **Added the Node sync client.** `@metacrdt/node` now exports
  `createNodeSyncClientEffect` (Effect-native, `effect/Schema`-validated
  response boundaries, tagged `NodeSyncClientError`) and `createNodeSyncClient`
  (Promise facade over the same client).
- [x] **Client methods map directly to the existing sync protocol.** `health`
  reads `/health`, `pull` reads `/events?vv=...`, `push` posts `{ events }`, and
  `syncFrom(runtime)` performs one bidirectional version-vector exchange with a
  local runtime.
- [x] Tests cover health/pull, bidirectional sync through the structural handler,
  and the Effect tagged-error path. The slice deliberately avoids retries,
  auth, long-lived SSE state, and a premature cross-target `@metacrdt/sdk`
  package.

### 2026-06-08 — Cloudflare relay auth boundary
- [x] **Added optional token auth to the Cloudflare Worker relay.**
  `createRelayWorker` now enforces a configured token for room/WebSocket relay
  routes when `METACRDT_RELAY_TOKEN` is present in Worker env (or when
  `auth.token` is supplied). It accepts `Authorization: Bearer <token>`, a
  configured header, or a configured query parameter.
- [x] **Health stays deploy-friendly.** Worker `/health` remains public by
  default for load balancers and can be protected with `auth.requireHealth`.
  `auth: false` explicitly disables the boundary for Workers already protected
  by a private network or another gateway.
- [x] `@metacrdt/cloudflare` package tests now cover unauthorized requests,
  Bearer/header/query token forwarding, and protected health. Live Cloudflare
  deployment remains open.

### 2026-06-08 — Goal 111 materialized projection-store boundary
- [x] **Started the shared projection-store service.** `@metacrdt/runtime` now
  exports `ProjectionStoreService`, `projectionStoreLayer`,
  `projectionStoreService`, `ProjectionRow`, `ProjectionStore`, and
  `ProjectionFilter`; `runtimeServicesLayer` provides the service when a target
  supplies a projection store.
- [x] **Added deterministic projection rows.** `projectionRowsFromLog` folds a
  protocol log through `@metacrdt/core` visibility/cardinality semantics and
  produces stable materialized current rows. Targets own storage and indexing;
  they do not own fold semantics.
- [x] **Memory and durable targets prove the contract.**
  `MemoryProjectionStore`, `LocalProjectionStore`, Node SQLite/Postgres
  projection tables, and `DurableObjectProjectionStore` all run
  `runRuntimeProjectionStoreConformance`: replace from fold,
  entity/attribute/id/event-id scans, rebuild-style replacement, and clear.
- [x] **Convex component target adopted the same boundary.** The component now owns
  a neutral `projectionRows` read-model table separate from `facts`/`currentFacts`
  and exposes `replaceProjectionRows`, `scanProjectionRows`, and
  `clearMaterializedProjection`; `createConvexComponentRuntimeLayer` wires those
  refs into `ProjectionStoreService` and passes the shared projection-store suite.

### 2026-06-08 — Goal 111 production Datalog query service
- [x] **Added `DatalogQueryService` to `@metacrdt/runtime`.** The service is an
  Effect v3 `Context.Tag` with an EventStore-backed Layer provider:
  `query`, `page`, `aggregate`, and `derivedRows` all validate args with
  `effect/Schema`, return tagged `RuntimeOperationError` /
  `RuntimeServiceError` values in the Effect error channel, and reuse the pure
  `@metacrdt/query` planner/row helpers over target-returned protocol events.
- [x] **Made pagination stable by contract.** The service sorts projected rows by
  canonical value keys before `paginateRows`, matching the previous conformance
  helper but moving the determinism into the production API boundary.
- [x] **Routed testkit through the service.** `runRuntimeQueryConformance` now
  provides `datalogQueryLayer()` over each target's Layer and exercises the
  production service API instead of a private testkit-only adapter.
- [x] **Added runtime-owned boundary tests.** `@metacrdt/runtime` now directly
  tests Layer-provided `DatalogQueryService` pagination stability and proves
  Schema/parser failures return tagged `RuntimeOperationError`s through the
  Effect error channel.
- [x] Verification: focused runtime typecheck/test passed; full gates passed
  (`test:packages`, `typecheck`, `pack:packages`, `build`, root `test`,
  `git diff --check`).

### 2026-06-08 — Goal 111 EventStore-backed query conformance
- [x] **Added `runRuntimeQueryConformance` to `@metacrdt/testkit`.** The suite
  builds a small target-owned protocol log through `EventStoreService`, then runs
  a testkit-only EventStore-backed Datalog adapter that delegates planning,
  pattern extension, `not`, `or`, compare/compute, projection, pagination,
  aggregation, provenance merging, and derived-row shaping to `@metacrdt/query`.
- [x] **Included query checks in `runRuntimeConformance`.** Memory/testkit,
  `@metacrdt/local`, `@metacrdt/cloudflare`, and `@metacrdt/convex` now prove the
  same EventStore-backed query semantics over their Layer-provided logs.
- [x] **Historical scope.** This slice was the precursor to the production
  `DatalogQueryService`: it proved target logs could feed the shared pure query
  planner and row semantics before the service boundary moved into
  `@metacrdt/runtime`.

### 2026-06-08 — Goal 111 EventStore projection conformance
- [x] **Added `runRuntimeProjectionConformance`.** The shared runtime suite now
  appends protocol events through a target's `EventStoreService`, scans them back
  through the target, and folds them with `@metacrdt/core` to prove
  cardinality-one `≺` winners, cardinality-many values, bitemporal valid-time
  coordinates, entity-map projection, audit flags for retracted/tombstoned
  values, and filtered-source point projection.
- [x] **Included projection in `runRuntimeConformance`.** Memory/testkit,
  Convex component, local async, Cloudflare Durable Object, and Node
  memory/SQLite/Postgres targets now inherit the projection checks through their
  existing Layer conformance. This is event-log projection conformance, not yet a
  full Datalog/query-service or materialized projection-store conformance.

### 2026-06-08 — Goal 111 Cloudflare relay network conformance
- [x] **Wired Cloudflare relay into shared network conformance.** The
  `@metacrdt/cloudflare` conformance suite now uses
  `runRuntimeNetworkTransportConformance` against a Durable Object WebSocket
  relay harness whose fake client socket merges relay messages into a client
  runtime.
- [x] **Relay behavior now shares the same proof shape as BroadcastChannel/p2p:**
  local DO events reach a client replica, late clients catch up via
  hello/version-vector delta, and post-catch-up sync is idempotent. This is still
  harness-level relay delivery/catch-up, not live deployment auth/retry/durable
  production behavior.

### 2026-06-08 — Goal 111 network transport conformance
- [x] **Expanded `@metacrdt/testkit` with
  `runRuntimeNetworkTransportConformance`.** Target-provided network harnesses now
  prove local event delivery between peers, late-peer version-vector catch-up via
  announce/delta, and idempotent second sync after catch-up.
- [x] **Wired runtime network styles:** BroadcastChannel and p2p DataChannel
  harnesses both pass the same shared checks. This intentionally proves peer
  delivery/catch-up only; Cloudflare relay auth, retry behavior, and relay
  durability remain target-specific until the relay exposes a conformance
  harness.

### 2026-06-08 — Goal 111 restart-persistence conformance
- [x] **Expanded `@metacrdt/testkit` with
  `runRuntimePersistenceConformance`.** Durable Layer targets now prove event log
  persistence, version-vector continuity, sequencer continuity, HLC continuity,
  and post-restart version-vector advancement across runtime re-creation over
  the same backing store.
- [x] **Wired durable targets:** the runtime localStorage target self-test, Node
  SQLite/Postgres, and local async all run the shared restart-persistence suite.
  Existing target-specific persistence tests remain for storage-adapter details.

### 2026-06-08 — Goal 111 scheduler service conformance
- [x] **Expanded `@metacrdt/testkit` with
  `runRuntimeSchedulerConformance`.** Observable scheduler targets now prove that
  `SchedulerService.after` accepts operations and preserves requested delay,
  submission order, and payload shape through the Effect service boundary.
- [x] **Wired scheduler targets:** testkit's memory scheduler self-test and the
  Node memory target run the shared suite. This intentionally proves scheduler
  submission only; durable wakeup execution is still target-specific until a
  second durable scheduler host exists.

### 2026-06-08 — Goal 111 transport publish conformance
- [x] **Expanded `@metacrdt/testkit` with
  `runRuntimeTransportConformance`.** Observable transport targets now prove that
  `TransportService.publish` accepts event batches and preserves batch
  boundaries plus event order through the Effect service boundary.
- [x] **Wired transport targets:** testkit's memory transport self-test and the
  Node memory target run the shared suite. This intentionally proves transport
  publication only; network delivery, peer discovery, retry, and relay behavior
  remain target-specific until a shared transport harness is worth extracting.

### 2026-06-08 — Goal 111 Convex target Layer
- [x] **`@metacrdt/convex` now exposes a runtime Layer.** Added component-owned
  raw protocol EventStore functions (`log.appendRaw`, `log.getRawEvent`,
  `log.listRawEvents`) and package-side `createConvexComponentRuntimeLayer`,
  which adapts a host Convex query/mutation runner + component refs into the
  runtime service tags.
- [x] **Convex joins shared conformance:** the component-owned raw protocol log
  passes `@metacrdt/testkit` EventStore / anti-entropy / deterministic-fold
  conformance through that Layer. Direct component tests also prove exact raw
  append idempotency, raw get/list, and current projection maintenance for raw
  assert events.

### 2026-06-08 — Goal 111 Layer-backed conformance
- [x] **`@metacrdt/testkit` now runs conformance over Effect Layers.** Added
  `RuntimeLayerConformanceTarget` (`createLayer`) and rewired the EventStore /
  anti-entropy / deterministic-fold checks to execute through `Context.Tag`
  services (`RuntimeProfileService`, `EventStoreService`, `RuntimeClockService`,
  `RuntimeSequencerService`, `TransportService`) rather than direct
  `RuntimeServices` object calls.
- [x] **Compatibility preserved:** existing `RuntimeConformanceTarget`
  (`createRuntime` / optional `disposeRuntime`) still works by adapting through
  `runtimeServicesLayer`, but new targets should provide Layers.
- [x] **Target suites moved:** testkit's memory proof, Node memory/SQLite/
  Postgres conformance, local async conformance, and Cloudflare Durable Object
  conformance all use Layer factories.

### 2026-06-08 — Goal 111 target Layer providers
- [x] **Node target Layers:** `@metacrdt/node` now exposes
  `createNodeMemoryRuntimeLayer`, `createNodeSqliteRuntimeLayer`, and
  `createNodePostgresRuntimeLayer`. Async SQL initialization is wrapped in
  Effect v3 `Layer.unwrapEffect` and initialization failures become
  `RuntimeServiceError`s.
- [x] **Local target Layers:** `@metacrdt/runtime` exposes
  `createLocalRuntimeLayer`; `@metacrdt/local` exposes
  `createLocalFirstRuntimeLayer`, `createAsyncLocalRuntimeLayer`,
  `createIndexedDbLocalFirstRuntimeLayer`, and
  `createSqliteLocalFirstRuntimeLayer`.
- [x] **Cloudflare target Layer:** `@metacrdt/cloudflare` now exposes
  `createDurableObjectRuntimeLayer` over the existing Durable Object storage
  services, mapping initialization failure into the Effect error channel.
- [x] **Layer tests:** Node memory/SQLite/Postgres, localStorage/async/
  IndexedDB/SQLite-compatible local, and Cloudflare Durable Object targets all
  run `applyOperationEffect` through their Layer providers and verify persisted
  events/version vectors.

### 2026-06-08 — Goal 111 runtime Effect service boundary
- [x] **Started Goal 111 step 1:** `@metacrdt/runtime` now has an Effect-native
  service boundary on Effect v3: `RuntimeProfileService`, `EventStoreService`,
  `RuntimeClockService`, `RuntimeSequencerService`, `SchedulerService`, and
  `TransportService` as `Context.Tag`s, with `Layer` helpers adapting existing
  target-provided stores/clocks/sequencers/schedulers/transports.
- [x] **Effect-native runtime operations:** added `applyOperationEffect`,
  `mergeFromEffect`, and `requireCapabilityEffect`; new runtime errors are
  `Data.TaggedError` values (`RuntimeServiceError`, `RuntimeCapabilityError`,
  `RuntimeOperationError`) carried in the Effect error channel. Compatibility
  Promise helpers remain for already-shipped targets.
- [x] **Memory Layer provider:** `createMemoryRuntimeLayer` proves the new shape
  without touching core or introducing ambient nondeterminism. Tests run Effect
  programs through `Effect.provide(...)` and validate tagged capability errors.
- [x] **Runner constraint documented:** `@effect/vitest@0.29` is the Effect v3
  line but peers on Vitest 3; `@effect/vitest@4` supports Vitest 4 but requires
  Effect v4. Because Confect holds the repo on Effect v3, this slice keeps Effect
  tests under current Vitest 4 and leaves the dedicated runner migration for the
  Confect/v4 gate.

### 2026-06-08 — package build tooling
- [x] **Goal 107 shipped:** centralized package build config. Added root
  `tsdown.config.ts`, moved all package build scripts to
  `tsdown --config ../../tsdown.config.ts`, made Turbo treat the config and
  lockfile as global dependencies, and added `pack:check` / `npm run
  pack:packages` so payload dry-runs are first-class Turbo tasks. Policy:
  tsdown/Rolldown for packages, Vite for the app.
- [x] **Goal 99 shipped:** Turbo + tsdown/Rolldown package builds. Added
  `turbo.json`, root `build:packages` / `typecheck:packages` / `test:packages`
  scripts, and per-package `build` scripts. Root `npm run build` now builds
  packages before the Vite app; root `npm test` builds packages before running
  the Convex backend suite.
- [x] **Package exports now target built artifacts.** `@metacrdt/core`, `schema`,
  `query`, `runtime`, `local`, `cloudflare`, `convex`, and `forma` publish
  `dist` JS + declarations instead of raw `src/*.ts`. Forma uses Node-platform
  `.mjs` / `.d.mts` output for its Node-facing language bootstrap; the other
  packages use neutral ESM.
- [x] **Package payloads tightened.** `files` is `dist`-only for packages, with
  `wrangler.example.toml` retained for `@metacrdt/cloudflare`; npm pack dry-run
  verified every package has `src=0` and `tests=0`.
- [x] Verification: `npm test` (17 Convex files / 156 tests), `npm run build`,
  `npx convex dev --once`, public import smoke across all package entry points,
  `npm pack --dry-run --workspaces --json`, and a live `datalog:datalog` smoke
  against `chatty-hare-94` all passed.

### 2026-06-08 — backend auth config seam
- [x] **Goal 100 shipped:** added `convex/auth.config.ts` as the backend JWT
  config file, checked in fail-closed (`providers: []`). Convex requires any env
  var referenced by `auth.config.ts` to exist in the deployment, so optional-env
  provider activation is documented as the future provider step rather than
  living in the default config.
- [x] **Frontend copy and docs now match the split.** The auth-required modal no
  longer says the backend config is missing; README documents the provider shape
  and env-var caveat. Remaining work is provider choice plus the React wrapper
  that returns Convex JWTs.
- [x] **Root typecheck hardened:** `npm run typecheck` builds packages before
  package/root typechecking so `dist`-based package exports are always present.

### 2026-06-08 — target/adapters model and Cloudflare parity plan
- [x] **Goal 101 shipped:** added `docs/targets.md` to separate execution
  targets from storage adapters and transports. Targets are hosts (Convex,
  Cloudflare DOs, Node, local/browser); Postgres/SQLite/IndexedDB/DO SQLite are
  storage adapters; WebSockets/BroadcastChannel/p2p/HTTP are transports.
- [x] **Cloudflare parity plan written:** `docs/cloudflare-target.md` defines how
  `@metacrdt/cloudflare` grows from a sync-plane shell into a Durable Object +
  SQLite bitemporal triple store at parity with `@metacrdt/convex`, with live
  frontend queries over DO WebSockets called out as a stretch goal.
- [x] README, `docs/architecture.md`, `docs/package-consolidation.md`, and
  `packages/cloudflare/README.md` now link the target model and Cloudflare plan.
- [x] Next concrete target-runtime candidate chosen: first `@metacrdt/testkit`
  conformance suite.
- [ ] Remaining target-runtime candidates at that point: Node SDK helpers,
  Cloudflare Phase B/C, or expanded testkit persistence/scheduler/transport
  suites once a second target needs them. Node SDK helpers and the expanded
  conformance suites have since shipped; Cloudflare Phase B/C remains open.

### 2026-06-08 — Node shared SQL lifecycle plan
- [x] **Goal 110 shipped:** `@metacrdt/node` now exports
  `createNodeSqlLifecyclePlan`, a narrow SQLite/Postgres lifecycle seam for
  validated table/index names and ordered event/meta initialization DDL.
- [x] Both structural SQL adapters now consume the shared lifecycle plan for
  initialization and table references while keeping query execution in their
  concrete stores (`?` for SQLite, `$n` for Postgres).
- [x] This is deliberately not `@metacrdt/sql` yet. The extraction waits until a
  second SQL consumer (for example DO SQLite) proves the shared DDL/query
  boundary.
- [x] Verification: focused Node tests/typecheck passed; Node package tests are
  now 15/15.

### 2026-06-08 — Node Postgres runtime services
- [x] **Goal 109 shipped:** `@metacrdt/node` now exports structural Postgres
  runtime services over a driver-neutral `query(sql, params)` client interface.
- [x] Added `NodePostgresEventStore`, `NodePostgresMetaStore`,
  `NodePostgresClock`, `NodePostgresSequencer`, and
  `createNodePostgresRuntime`.
- [x] Postgres is treated as a storage adapter under the Node target, not a peer
  target. The package still ships no native database dependency.
- [x] Verification: focused Node tests/typecheck, package build/pack, full package
  tests, root typecheck, and app build passed. Node package tests are now 12/12,
  with shared runtime conformance covering memory, SQLite, and Postgres.

### 2026-06-08 — Node packaged dev-server CLI
- [x] **Goal 108 shipped:** `@metacrdt/node` now ships the
  `metacrdt-node-dev` binary, an in-memory local sync server over native
  `node:http`.
- [x] Added `./dev-server` exports for `parseNodeDevServerArgs`,
  `startNodeDevServer`, and `usage`, so host tooling can start the same server
  programmatically without shelling out.
- [x] The CLI composes `createNodeMemoryRuntime` +
  `createNodeHttpRequestListener`; it does not duplicate sync semantics.
- [x] Verification: focused Node tests/typecheck, package build/pack, full package
  tests, root typecheck, and app build passed; the built binary preserves its
  shebang.

### 2026-06-08 — first @metacrdt/testkit package
- [x] **Goal 102 shipped:** added `packages/testkit` / `@metacrdt/testkit`, a
  framework-neutral conformance package over `@metacrdt/core` +
  `@metacrdt/runtime`.
- [x] Exported `runEventStoreConformance`,
  `runRuntimeConvergenceConformance`, and `runRuntimeConformance`. The checks
  cover append idempotency, scan filters, G-Set merge idempotency, invalid
  content-id rejection, bidirectional version-vector delta exchange,
  deterministic fold equality, and idempotent second sync.
- [x] Self-tests prove the suite passes against `createMemoryRuntime` and fails
  with a target-named error for a deliberately broken store.
- [x] Verification: `npm test --workspace @metacrdt/testkit`,
  package-local typecheck, `npm run test:packages`, `npm run build:packages`,
  and `npm run typecheck` all passed with Turbo picking up the new workspace.

### 2026-06-08 — shared conformance on existing targets
- [x] **Goal 103 shipped:** `@metacrdt/cloudflare` and `@metacrdt/local` now
  consume `@metacrdt/testkit` directly. Added conformance tests for the
  Cloudflare Durable Object runtime over fake DO storage and the local async
  runtime over async memory storage.
- [x] Shared conformance now covers three targets: memory (`@metacrdt/runtime`),
  Cloudflare DO runtime services, and local async runtime services. It proves the
  same EventStore idempotency/filtering/content-id checks, version-vector
  anti-entropy, deterministic fold equality, and idempotent second sync.
- [x] Verification: focused Cloudflare/local package tests, `npm run
  test:packages`, `npm run build:packages`, and `npm run typecheck` all passed.

### 2026-06-08 — Node native-style HTTP listener adapter
- [x] **Goal 106 shipped:** `@metacrdt/node` now exports
  `createNodeHttpRequestListener`, a structural native `node:http`-style adapter
  over `createNodeSyncHttpHandler`.
- [x] The adapter accepts async-iterable request bodies, writes status/headers/body
  to a response object, supports `HEAD` as a bodyless `GET`, and still imports no
  Node API or framework types.
- [x] Verification: focused Node tests/typecheck, `npm run test:packages`,
  `npm run build:packages`, and `npm run typecheck` passed.

### 2026-06-08 — Node HTTP/SSE sync handler
- [x] **Goal 105 shipped:** `@metacrdt/node` now exports
  `createNodeSyncHttpHandler`, a dependency-free structural HTTP/SSE sync surface
  over any `RuntimeServices`.
- [x] Routes shipped: health/profile/version-vector, pull delta by supplied
  version vector, push remote events through `mergeFrom`, and one-shot
  `text/event-stream` delta frames. The handler returns structural
  `{ status, headers, body }` responses so native `node:http`, Express, Fastify,
  Hono, Bun, tests, or the packaged dev server can adapt it without this package
  owning listener lifecycle.
- [x] Verification: focused Node tests/typecheck, `npm run test:packages`,
  `npm run build:packages`, and `npm run typecheck` passed.

### 2026-06-08 — first @metacrdt/node target
- [x] **Goal 104 shipped:** added `packages/node` / `@metacrdt/node`, the open
  server-process host package.
- [x] Exported `createNodeMemoryRuntime` and `createNodeSqliteRuntime` with
  structural server-SQLite runtime services: `NodeSqliteEventStore`,
  `NodeSqliteClock`, `NodeSqliteSequencer`, `NodeSqliteMetaStore`, and the
  `NodeSqliteDatabaseLike` / `NodeSqliteStatementLike` driver shape.
- [x] Node memory and Node SQLite both pass the shared `@metacrdt/testkit`
  runtime conformance suite; SQLite also has a persistence test proving event
  log, HLC, and `seq` survive runtime recreation.
- [x] Verification: focused Node tests/typecheck, `npm run test:packages`, `npm
  run build:packages`, and `npm run typecheck` passed with Turbo picking up the
  new workspace.

### 2026-06-08 — host event-log entity fold
- [x] **Goal 98 shipped:** `@metacrdt/query` guarded positive-pattern extension.
  Added `extendPatternCandidatesWithinLimit`; Convex now asks the package to
  extend already-fetched candidates and enforce the accumulated row guard while
  retaining candidate fetch order, source/auth IO, and recursion.
- [x] **Goal 97 shipped:** `@metacrdt/query` solver work-list selection. Added
  `SelectedClause` / `selectNextClause`; Convex now asks the package to choose
  and remove the next runnable parsed clause while retaining all execution,
  source/auth, row-limit, and branch-recursion responsibilities.
- [x] **Goal 96 shipped:** `@metacrdt/query` solver-frame initialization. Added
  `SolverFrame` / `initialSolverFrame`; Convex now asks the package to create the
  initial remaining indexes, bound set, and cloned seeded provenanced state before
  running the async solver loop.
- [x] **Goal 95 shipped:** `@metacrdt/query` bound-variable advancement. Added
  `advanceBoundVars`; Convex now asks the package to advance scheduler
  bound-vars after pattern, compute, and disjunction clauses while retaining the
  async solver loop and all source/auth/branch execution.
- [x] **Goal 94 shipped:** `@metacrdt/query` intermediate row limit guard. Added
  `assertIntermediateRowsWithinLimit`; Convex pattern/disjunction branches call
  it at the same points as before, preserving the limit and error text while
  moving the target-neutral guard into the package.
- [x] **Goal 93 shipped:** `@metacrdt/query` positive pattern candidate
  expansion. Added `extendPatternCandidates`; Convex positive-pattern branches
  still fetch candidates through the injected source/read-auth path and enforce
  `maxIntermediateRows`, then delegate typed candidate expansion and provenance
  merging to the package.
- [x] **Goal 92 shipped:** `@metacrdt/query` local state transitions. Added
  `filterCompareStates` and `applyComputeStates`; Convex compare/compute solver
  branches now delegate those pure transitions while retaining async scheduling,
  source fetching, read auth, negation IO, disjunction recursion, and source
  semantics.
- [x] **Goal 91 shipped:** `@metacrdt/query` negation candidate check. Added
  `passesNegationCandidates`; Convex `passesNegation` still fetches candidates
  through the injected source and read-auth path, then delegates the typed
  candidate-match check to the package.
- [x] **Goal 90 shipped:** `@metacrdt/query` provenanced pattern extension. Added
  `QueryTriple` and `extendProvenancedBinding`; Convex positive pattern joins now
  ask the package to unify the matched triple with the current state and merge
  fact/event provenance. Candidate fetching, negation checks, read auth, and
  async scheduling remain in Convex.
- [x] **Goal 89 shipped:** `@metacrdt/query` pattern input construction. Added
  `PatternInput` and `patternInputForBinding`; Convex `fetchPattern` now asks the
  package to resolve a parsed pattern + binding into source constants before
  calling the injected `TripleSource`. Target lookup, indexes, read authorization,
  provenance, and async execution remain in Convex.
- [x] **Goal 88 shipped:** `@metacrdt/query` provenanced binding dedupe. Added
  `ProvenancedBinding`, `bindingKey`, `mergeUniqueSources`, and
  `dedupeProvenancedBindings`; Convex now uses them for pattern provenance
  extension and `or` branch dedupe. This preserves typed binding-key semantics
  and merges fact/event source ids without importing Convex `Id` types into the
  package.
- [x] **Goal 87 shipped:** `@metacrdt/query` clause planner. Added
  `chooseNextClausePosition`, the pure scheduler choice from the Convex Datalog
  loop: pick runnable compare/compute/negation/disjunction clauses as soon as
  their required vars are bound; otherwise pick the most selective pattern; throw
  the same unsafe-query error when no clause can progress. `solveParsedWhere`
  now delegates that decision through `convex/lib/engine.ts` while keeping
  Convex-owned async execution, triple fetching, read authorization, provenance,
  and recursive branch solving.
- [x] **Goal 86 shipped:** `@metacrdt/query` rule emit shaping. Added pure
  helpers for resolving emit placeholders and shaping deterministic derived rows
  from solved bindings: skip unbound/null emitted entities, coerce entity ids to
  strings, dedupe by `e`/`a`/typed value key, and sort stably. `deriveFromEventLog`
  now consumes this package helper through `convex/lib/engine.ts` while keeping
  Convex-owned solving, triple-source loading, read authorization, provenance,
  and materialized derived storage. Verified with 10 query-package tests, 156
  backend tests, frontend build, Convex push, and a live `datalog:deriveFromEventLog`
  query on `chatty-hare-94`.
- [x] **Goal 85 shipped:** first `@metacrdt/query` slice. Added `packages/query`
  with pure Datalog/query clause parsing, operators, compute/comparison helpers,
  pattern unification, projection, pagination, aggregation, explain descriptions,
  value keys, and entity-local rule analysis; `convex/lib/engine.ts` now consumes
  and re-exports the package while keeping Convex-owned triple fetching, read
  authorization, provenance, and async join scheduling.
- [x] **Goal 84 shipped:** `@metacrdt/schema` definition lowering. Added pure
  helpers for lowering attribute definitions, entity-type definitions, and
  meta-schema bootstrap definitions into canonical schema facts; added
  `shapeAttributeDefinition` for reconstructing attribute read-model shapes from
  visible schema rows. `convex/attributes.ts` now consumes those helpers while
  retaining Convex-owned storage, auth, transactions, validators, and queries.
- [x] **Goal 83 shipped:** first `@metacrdt/schema` slice. Added
  `packages/schema` with pure schema carrier ids, builtin bootstrap
  cardinalities, value/cardinality guards, and meta-attribute definitions;
  `convex/lib/meta.ts` now re-exports those conventions so the Convex reference
  runtime consumes the package without changing schema write/read behavior.
- [x] **Goal 81 shipped:** action/config diff-history polish. `api.configHistory.history`
  now returns `changedKinds`, `totalManifestChanges`, and `eventCounts`; Data
  model config history rows expand into direct event details, and the Action
  registry shows each action's latest config provenance from the same history
  feed.
- [x] **Goal 82 shipped:** Confect config-history sidecar. `metacrdt.configHistory`
  is now a typed Effect Schema public query mounted as
  `api.metacrdtConfect.configHistory`; it reconstructs manifest diffs from
  `config:default` ownership events in protocol-shaped `factEvents` with
  `@metacrdt/core` visibility, returning typed added/removed items,
  changed-kind summaries, event counts, and direct config events.
- [x] **Goal 80 shipped:** the header's `Describe account` affordance now opens
  a live Acme Staffing account-summary modal backed by existing Overview,
  compliance, and recent-activity queries. It shows configured types, placements,
  reused evidence scopes, obligation status, latest transaction, and a `View log`
  jump to `/transactions`.
- [x] **Goal 79 shipped:** static-hosting live-reload banner is non-throwing.
  `src/App.tsx` no longer imports `@convex-dev/static-hosting/react`; it uses
  Convex's object-form query hook with `throwOnError: false`, suppressing
  cosmetic deployment-query failures instead of catching them with an app-level
  error boundary. Verified the public deployment query and live static site.
- [x] **Goal 77 shipped:** Confect sidecar now wraps derived provenance.
  `confect/tables/DerivedFacts.ts` adds the sidecar table shape;
  `confect/metacrdt.spec.ts` adds `metacrdt.explainDerived` with typed
  `DerivedExplanation` returns and `UnknownDerivedFact` /
  `InvalidProtocolEvent` errors; `confect/metacrdt.impl.ts` resolves
  `sourceEventIds` through `factEvents.by_eventId`.
- [x] **Confect provenance tests.** `convex/confect.test.ts` proves
  `api.metacrdtConfect.explainDerived` returns event-id-backed "because" rows and
  surfaces typed missing-derived errors. This keeps Confect in the
  read/planning/protocol-inspection lane, not the write path.
- [x] **Goal 78 shipped:** `api.complianceConfect.dryRunWorkerCompliance` no
  longer reads `currentFacts`; it folds current worker, placement, guard, and
  submitted-form state from protocol-shaped `factEvents` with shared core
  visibility semantics, retaining a legacy reconstruction fallback for old rows.
- [x] **Confect compliance projection-wipe proof.**
  `convex/complianceConfect.test.ts` now deletes all host `currentFacts` before
  running the dry-run and still gets the expected reuse/collect plan.
  `npm run test:confect` now runs both Confect sidecar test files.
- [x] **Goal 76 shipped:** `api.rules.explainDerived` now resolves
  `derivedFacts.sourceEventIds` through `factEvents.by_eventId` before falling
  back to compatibility `sourceFactIds` for legacy rows. The public "because"
  shape remains compatible and now includes protocol `eventId`s for
  event-backed source assertions.
- [x] **Derived explanation protocol proof.** `convex/provenance.test.ts` patches
  a materialized derived row to clear `sourceFactIds` while preserving
  `sourceEventIds`; `explainDerived` still returns the two source facts. The root
  Convex suite is now 152 tests.
- [x] **Goal 75 shipped:** user-facing compliance obligation reads now derive
  enabled `require.*` / `task.*` output from protocol-shaped `factEvents`.
  `convex/lib/obligations.ts` is the shared read-only resolver; it solves each
  enabled compliance rule through `eventLogTripleSource`, resolves its `emit`
  shape, dedupes, and preserves source `factId` / `eventId` provenance.
- [x] **Obligation projection proofs.** `workerCompliance`,
  `entityDetail.obligations`, Overview `required`/`open` counts, and
  `flows.issueAllOpen` all keep behavior after tests delete every
  `derivedFacts` row. The root Convex suite is now 151 tests.
- [x] **Goal 74 shipped:** materialized `derivedFacts` rows now carry
  `sourceEventIds` in addition to compatibility `sourceFactIds`. The Datalog
  solver propagates event provenance through pattern joins, OR branches, and
  deduped bindings; non-closure rule output, full closure recompute, and
  semi-naive closure add all write protocol source event ids.
- [x] **Derived provenance protocol proof.** `convex/provenance.test.ts` now
  verifies normal Datalog-derived rows store the two source assertion event ids,
  and incremental closure rows include the newly asserted edge's event id while
  preserving existing fact-id explanations.
- [x] **Goal 73 shipped:** host `flowRuns` status transitions are mirrored as
  protocol facts (`flowRun:<runId>`, `flow.run.status`, status). The attribute is
  built-in cardinality-one, and the mirror helper explicitly retracts the prior
  visible status before asserting the next status so same-millisecond/fake-timer
  transitions fold correctly.
- [x] **System flow-resumer projection proof.** `system.listSystemProcesses` now
  counts waiting runs by solving `flow.run.status = waiting` through
  `eventLogTripleSource`; the appconfig test deletes all `flowRuns` rows and the
  count remains unchanged.
- [x] **Goal 72 shipped:** closure semi-naive incremental add no longer receives
  the changed projection `factId`. `processFactChange` schedules the delta worker
  with the edge assertion's protocol `eventId`; `incrementalClosureAdd` resolves
  today's compatibility `sourceFactIds` through `factEvents.by_eventId`.
- [x] **Closure provenance compatibility proof.** `convex/provenance.test.ts`
  now verifies the incrementally added edge has an assertion event row and that
  the resulting closure row still includes the edge in `sourceFactIds`.
- [x] **Goal 71 shipped:** `system.listSystemProcesses` now computes the
  compliance reconciler's `open/required obligations` stat by solving enabled
  `require.*` / `task.*` rules against `eventLogTripleSource` and resolving their
  `emit` shape, instead of sampling materialized `derivedFacts`.
- [x] **System-process derived projection proof.** `convex/appconfig.test.ts`
  now deletes all `derivedFacts` rows and asserts the compliance reconciler
  obligation count remains unchanged.
- [x] **Goal 70 shipped:** read-authorization policy now reads from the event
  log. `convex/lib/readAuth.ts` loads form `formDef` PII markers,
  `attr:<name>` PII/sensitive markers, and principal `grants.read` facts through
  `convex/lib/eventLogCurrent.ts` instead of scanning `currentFacts`.
- [x] **Read-auth projection-corruption proof.** `convex/readAuth.test.ts` now
  wipes `currentFacts` before denied reads and again after granting access,
  proving both PII detection and grants survive from protocol-shaped
  `factEvents`.
- [x] **Goal 69 shipped:** `configHistory.currentManifest` and
  `configHistory.history` now reconstruct the `config:default` ownership
  manifest through `runWhere(..., { source: eventLogTripleSource })` at the
  relevant bitemporal coordinate, instead of scanning the `facts` projection.
  Direct per-transaction event listings remain sourced from `factEvents.by_tx`.
- [x] **Config-history projection-corruption proof.** The appconfig suite now
  deletes all `facts` rows after config changes and asserts both
  `currentManifest` and the latest history diff remain unchanged.
- [x] **Goal 68 shipped:** `overview.summary` now reconstructs current
  type/submission/placement-scope facts through the event-log triple source
  instead of scanning `currentFacts`; obligation counts still summarize
  materialized `derivedFacts`.
- [x] **Overview projection-corruption proof.** `convex/appconfig.test.ts` now
  wipes `currentFacts` and asserts the dashboard summary counts remain identical
  to the pre-wipe result.
- [x] **Goal 67 shipped:** frontend admin routes now run inside Convex's
  auth-aware provider shape with an explicit no-provider hook; `src/auth.tsx`
  centralizes the auth-required modal and `useWriteGate`.
- [x] **Protected write controls now fail before anonymous mutation calls.** The
  global New Entity form, setup/bootstrap buttons, raw assert console, host
  entity actions/flows/submissions/cancel, and component-owned actions/flows/
  compliance writes all route through the shared write gate. `/collect` remains
  token-authorized and intentionally unguarded.
- [x] **Goal 66 shipped:** configured action registry reads now fold action
  definition facts from protocol-shaped `factEvents`: `loadActionDef`,
  `actionsForType`, `listActions`, `entityDetail.actions`, and `runAction`
  definition loading.
- [x] **Action registry projection-corruption proof.** `convex/appconfig.test.ts`
  now wipes `currentFacts` entirely and asserts `actionsForType`, `listActions`,
  and `entityDetail.actions` still find Worker actions; `runAction` still executes
  `terminate` from the event-log-backed action definition.
- [x] **Goal 65 shipped:** production `api.entities.listEntityTypes`,
  `listEntities`, and `typeAttributes` now read current type/name/attribute facts
  from protocol-shaped `factEvents`, not from `currentFacts`.
- [x] **Discovery/picker projection-corruption proof.** `convex/appconfig.test.ts`
  now wipes `currentFacts` entirely and asserts type discovery still reports
  configured/system origins, picker/list rows still return data/system entities
  with names, and type-attribute discovery still finds configured columns.
- [x] **Goal 64 shipped:** production `api.entities.queryEntities` now uses
  `eventLogBaseWithDerivedTripleSource` for typed membership/filters and
  `eventLogTripleSource` for row attributes + sort values, rather than trusting
  `facts` / `currentFacts` for the Entities table.
- [x] **Typed table projection-corruption proof.** `convex/appconfig.test.ts`
  now deletes `currentFacts` for a `Placement` row and asserts
  `queryEntities({ type: "Placement" })` still returns its visible table cells
  from `factEvents`.
- [x] **Typed table read-auth proof.** `convex/readAuth.test.ts` now checks
  `queryEntities({ type: "Worker" })` redacts `i9/ssn` and reports a denied marker
  before a grant, then includes the value after the grant.
- [x] **Goal 63 shipped:** production `api.facts.compareFacts` now compares
  `before` and `after` by folding protocol-shaped `factEvents` at each
  coordinate, not by scanning the `facts` projection. It preserves the existing
  `{ e, a, before, after, changed, denied }` shape and value sorting.
- [x] **Fact comparison projection-corruption proof.** `convex/triples.test.ts`
  now corrupts the `facts` projection for a compared `(e, a)` and asserts
  production `compareFacts` still reconstructs interval-specific values from
  `factEvents`.
- [x] **Fact comparison read-auth proof.** `convex/readAuth.test.ts` now checks
  `compareFacts` returns empty sides + `{ reason: "pii" }` before a read grant and
  returns the sensitive value after the grant.
- [x] **Goal 62 shipped:** production `api.facts.entityAsOf` and
  `api.facts.entityFactsAsOf` now read bitemporal entity state by folding
  protocol-shaped `factEvents`, not by scanning the `facts` projection.
  `entityFactsAsOf` preserves time-travel annotations (`actor`, `reason`,
  asserted/retracted/tombstoned/valid times) and denied-PII reporting.
- [x] **Bitemporal entity projection-corruption proof.** `convex/triples.test.ts`
  now corrupts the `facts` projection for an entity and asserts both
  `entityAsOf` and `entityFactsAsOf` still reconstruct visible state from
  `factEvents`.
- [x] **Goal 61 shipped:** production `api.facts.getEntity` now folds current
  object state from protocol-shaped `factEvents` + schema cardinality facts,
  rather than reading `currentFacts`. It preserves the existing
  `{ id, attributes, denied }` response shape and keeps
  `entityFromEventLog` as the proof/debug wrapper with coordinate and
  skipped-legacy counts.
- [x] **Entity projection-corruption proof.** `convex/triples.test.ts` now wipes
  `currentFacts` for an entity and asserts production `getEntity` still returns
  the visible current state from `factEvents`. `convex/rebuild.test.ts` now
  inspects `currentFacts` directly when proving rebuild restores the disposable
  projection.
- [x] **Goal 60 shipped:** production `api.facts.queryFacts` now answers bounded
  bitemporal fact point queries by folding protocol-shaped `factEvents`, not by
  reading the `facts` projection. It preserves the old array return shape, keeps
  read authorization in the same helper path, and leaves
  `queryFactsFromEventLog` as the explicit proof/debug wrapper with
  `skippedLegacyEvents`.
- [x] **Fact-query projection-corruption proof.** `convex/triples.test.ts` now
  corrupts the `facts` projection for an entity and asserts production
  `queryFacts` still returns the visible assertion from `factEvents`; the proof
  wrapper returns the same row.
- [x] **Goal 59 shipped:** production Datalog row/page/aggregate APIs now use the
  shared event-log-base + materialized-derived triple source. Base facts come
  from protocol-shaped `factEvents`; derived facts still come from `derivedFacts`.
- [x] **Production Datalog projection-corruption proof.** Tests that previously
  only proved explicit event-log proof APIs now prove `datalog` itself survives
  corrupted base `facts` for base joins, derived joins, rule-materialized output,
  and direct closure edges.
- [x] **Goal 58 shipped:** full transitive-closure recompute now builds its base
  edge adjacency through the shared event-log triple source instead of scanning
  `facts.by_a`. Closure output still materializes into `derivedFacts`.
- [x] **Closure projection-corruption proof.** Tests corrupt direct base-edge
  `facts` before the scheduled full closure recompute runs; closure rows still
  materialize from `factEvents`; after Goal 59, production Datalog direct-edge
  reads also survive from `factEvents`, and closure provenance remains populated.
- [x] **Goal 57 shipped:** non-closure rule materialization now solves rule bodies
  through the shared event-log-base + materialized-derived triple source. Base
  facts come from protocol-shaped `factEvents`; existing `derivedFacts` remain
  available for rules that depend on prior materialized output.
- [x] **Materializer projection-corruption proof.** Tests corrupt base `facts`
  before the scheduled materializer runs; the rule still emits a derived row from
  `factEvents` and preserves source fact id provenance. Goal 59 later moved
  production Datalog base reads to the same event-log source.
- [x] **Goal 56 shipped:** `api.datalog.deriveFromEventLog` solves a rule body
  against protocol-shaped `factEvents` and resolves its `emit` shape into deduped
  derived triples without writing `derivedFacts`.
- [x] **Direct rule-output proof.** Tests compare the read-only event-log
  derivation to materialized rule output, then corrupt the base `facts` projection
  and show `deriveFromEventLog` still computes the same derived rows.
- [x] **Goal 55 shipped:** `api.datalog.datalogPageFromEventLogWithDerived`,
  `aggregateFromEventLogWithDerived`, and
  `aggregatePageFromEventLogWithDerived` give the event-log-base +
  materialized-derived proof source the same page and aggregate shapes as the
  production Datalog API.
- [x] **Mixed-source page/aggregate parity.** Tests prove deterministic paging of
  derived joins, aggregate parity with production `aggregate`, aggregate-page
  splitting over deterministic group rows, and continued base-only exclusion of
  `derivedFacts`.
- [x] **Goal 54 shipped:** `api.datalog.datalogFromEventLogWithDerived` composes
  the event-log base fact source with projected `derivedFacts`, so proof Datalog
  can join source-log base facts with materialized rule output.
- [x] **Boundary stays honest.** Derived facts are still projection-backed and keep
  `sourceFactIds`; this does not move rule materialization itself onto direct
  event-log folds.
- [x] **Mixed-source corruption proof.** Tests prove production Datalog and
  mixed-source Datalog agree normally, then corrupt base `facts` and show only the
  mixed event-log+derived source still joins.
- [x] **Goal 53 shipped:** `api.datalog.datalogPageFromEventLog`,
  `aggregateFromEventLog`, and `aggregatePageFromEventLog` extend the Goal 52
  event-log Datalog source to cursor-paged result rows and aggregate group rows.
- [x] **Page/aggregate parity.** Tests prove event-log pagination returns the
  deterministic projected row stream, aggregate rows match projection-backed
  aggregate results for base facts, and aggregate pages split deterministic group
  rows correctly.
- [x] **Goal 52 shipped:** Datalog now has an injectable `TripleSource`, and
  `api.datalog.datalogFromEventLog` runs the existing parser/join scheduler/
  compute/negation path over protocol-shaped `factEvents` for base facts.
- [x] **Solver reuse, not duplication.** Production `datalog` still reads
  `facts ∪ derivedFacts`; the proof query swaps only the triple source and
  deliberately excludes `derivedFacts` until rule/materialization folds move
  over.
- [x] **Datalog projection-corruption proof.** Tests corrupt host `facts`;
  projection-backed Datalog returns no row while event-log-backed Datalog still
  answers from `factEvents`.
- [x] **Goal 51 shipped:** `api.facts.queryFactsFromEventLog` is the event-log
  counterpart to `queryFacts`: it reconstructs protocol rows, applies
  `@metacrdt/core.visibleAsserts`, preserves `includeRetracted` history
  semantics, filters by attribute/value, and redacts through the same read-auth
  checks.
- [x] **Facts projection bypass proof.** Tests deliberately corrupt `facts` for
  an entity; `queryFacts` returns no visible rows while `queryFactsFromEventLog`
  still reconstructs the live assertion from `factEvents`.
- [x] **Goal 50 shipped:** `api.facts.entityFromEventLog` reconstructs one host
  entity directly from protocol-shaped `factEvents` using `@metacrdt/core.entity`
  instead of trusting `currentFacts`.
- [x] **Schema cardinality comes from the log.** The query fetches
  schema-as-facts cardinality rows for the attributes it sees and folds those
  into the same core `Log`, so cardinality-one still resolves by `≺` at read
  time.
- [x] **Projection-corruption proof.** Tests prove the event-log fold matches
  `getEntity` for normal writes and still reconstructs state after the
  `currentFacts` projection is wiped for that entity.

### 2026-06-08 — guided demo tour
- [x] **Goal 49 shipped:** the app shell now has a route-aware guided tour that
  walks the research preview through Overview, Entities, Compliance, Flows, Data
  model, and Transaction log.
- [x] **Dismissal and restart.** The tour auto-opens once until skipped or
  finished, persists dismissal in `localStorage`, and can be restarted from the
  header `Tour` button.
- [x] **No backend coupling.** The tour is frontend-only and leaves `/collect`
  isolated outside the admin shell.

### 2026-06-08 — counted closure deletion reconciliation
- [x] **Goal 48 shipped:** closure-derived rows can carry `supportCount`, the
  number of bounded simple paths currently supporting the reachable pair.
- [x] **Reconcile, don't replace.** Full closure recompute now patches reachable
  rows, inserts new pairs, and deletes unreachable pairs. Removing one of two
  alternate paths keeps the pair live with a decremented support count; removing
  the final support deletes it.
- [x] **Incremental add understands multiplicity.** Semi-naive add still uses
  predecessor × successor deltas, but increments support for already-reachable
  pairs when a new edge creates another path.

### 2026-06-08 — cross-entity rule affected-output recompute
- [x] **Goal 47 shipped:** variable-emitting cross-entity Datalog rules now
  identify affected output entities from old derived provenance plus current
  solved bindings, then replace only those entities' derived output.
- [x] **Correction semantics tightened.** `correctFact` now notifies
  materialization as tombstone-old + assert-new, matching the protocol shape and
  allowing stale outputs justified by the old fact to be removed incrementally.
- [x] **Closure correctness remains conservative.** Added coverage proving a
  corrected edge removes stale closure pairs and adds replacement pairs; DRed /
  counting for closure deletions stays open.

### 2026-06-08 — Datalog / aggregate result pagination
- [x] **Goal 46 shipped:** `datalogPage` and `aggregatePage` return
  Convex-style page objects over deterministic projected Datalog rows and
  aggregate group rows.
- [x] **Engine cursor semantics.** Cursors are decimal offsets over the solved
  result array (`null` / `undefined` / `""` start at page one); invalid cursors
  are rejected and page size is capped at `LIMITS.maxPageSize` (`100`).
- [x] **Tests.** Focused Datalog/aggregate tests cover multi-page reads,
  aggregate-group paging, invalid cursor rejection, and oversized page capping.
  The APIs preserve the existing bounded solver, provenance, computed predicate,
  disjunction, aggregation, and read-auth semantics.

### 2026-06-07 — Datalog computed arithmetic/string predicates
- [x] **Goal 45 shipped:** Datalog clauses can now compute values from
  already-bound variables with `{ compute: [op, ...args], as?: term }`.
- [x] **Arithmetic + string semantics.** Arithmetic ops (`+`, `-`, `*`, `/`,
  `%`, aliases, min/max/rounding) can bind/check computed numbers; string ops
  (`lower`, `upper`, `trim`, `length`, `concat`, `contains`, `startsWith`,
  `endsWith`) support normalization and boolean text filters.
- [x] **Safety/provenance discipline.** Computed inputs must already be bound;
  output variables bind or filter by equality; no-`as` clauses must produce
  boolean true. Computed clauses add no provenance and preserve existing source
  facts.
- [x] Focused tests cover arithmetic binding/filtering, output equality against
  an already-bound variable, string transform + boolean predicate composition,
  unsafe input rejection, and `explainDatalog` classification.

### 2026-06-07 — component-owned collect reminder/escalation timers
- [x] **Goal 44 shipped:** component-owned collection-token runs now store
  bounded timer state (`step`, configured seconds, reminder/escalation/expiry
  timestamps) inside the `@metacrdt/convex` component.
- [x] **Host-owned scheduler boundary preserved.** App wrappers schedule
  `internal.metacrdtComponent.tickOwnedCollection` for newly issued component
  collection runs, while the component owns the durable run row and the
  `log.tickCollection` state transition.
- [x] **Focused regressions:** direct component tests cover reminder,
  escalation, expiry, and post-expiry no-op; mounted wrapper tests prove
  scheduled ticks fire, completed runs ignore later ticks, and expired component
  tokens are refused by `/collect`.

### 2026-06-07 — component-owned DAG wait/scheduler wakeups
- [x] **Goal 43 shipped:** component-owned `wait` steps now persist `waiting`
  run state, schedule `internal.metacrdtComponent.wakeOwnedFlow`, and resume the
  same component DAG run at the wait step's `next`.
- [x] **System actor resume path.** Scheduled wakes load the exact component run
  via `log.getDagRun`, no-op if it is no longer waiting at a wait step, and write
  resumed fact effects under `system:component-flow-scheduler`.
- [x] **Focused regression:** a `wait -> assert -> done` component flow parks,
  scheduled function draining completes the same run, writes component-owned
  state, records `wait`/`asserted`/`completed`, and creates no host `flowRuns`.

### 2026-06-07 — persisted component-owned DAG run/timeline storage
- [x] **Goal 42 shipped:** `@metacrdt/convex` now owns `flowDagRuns` and
  `flowDagEvents` tables plus `log.recordDagRun` / `log.listDagRuns`.
- [x] **Flow starter writes process history.** `api.metacrdtComponent.startOwnedFlow`
  records every waiting/completed/unsupported execution summary into the
  component; rerunning after collection submission updates the existing waiting
  run to completed.
- [x] **UI and tests cover the timeline.** `/component/e/:id` shows Component
  flow runs separately from collection capability rows; package and reference
  tests prove run/timeline persistence and host `flowRuns` isolation.

### 2026-06-07 — component-owned DAG flow starter/resumer
- [x] **Goal 41 shipped:** `api.metacrdtComponent.startOwnedFlow` interprets
  host `flowDefs` over component-owned current state and writes step effects into
  the installed `@metacrdt/convex` component log.
- [x] **Collect parks in component state.** A collect step issues/reuses a
  component-owned collection token; after `/collect` submission, rerunning the
  flow sees `submitted.<form> = scope`, skips the collect step, and continues.
- [x] **UI and tests prove the boundary.** `/component/e/:id` renders configured
  flows by entity type, shows returned status/link/events, and focused tests
  prove assert-only and collect→branch→action flows create no host `flowRuns`.

### 2026-06-07 — component-owned compliance materialization
- [x] **Goal 40 shipped:** `api.metacrdtComponent.materializeOwnedCompliance`
  writes component-owned `requires.<form>` facts for all matching requirements
  and `task.<form>` facts for open collection decisions.
- [x] **Materialized tasks reconcile.** Re-running the materializer after a
  component-owned form submission keeps satisfied `requires.*` facts, retracts
  stale `task.*` facts through component protocol lifecycle events, and leaves
  already-correct facts untouched.
- [x] **UI and tests cover the projection.** `/component/e/:id` exposes
  Materialize facts on Worker compliance cards; focused tests prove initial
  materialization, submission, stale task retraction, and protocol event history.

### 2026-06-07 — component-owned compliance issue/reuse
- [x] **Goal 39 shipped:** `api.metacrdtComponent.ownedCompliancePlan` computes
  `reuse`/`collect` decisions for component-owned Workers from configured host
  `require.*` rules plus component-owned Worker/Placement/scope/evidence state.
- [x] **Missing evidence issues component-owned collection links.**
  `api.metacrdtComponent.issueOwnedOpenCollections` recomputes the plan in a
  host-authenticated mutation, calls the component-owned `issueCollection`, and
  reuses waiting component runs for the same `(worker, form, scope)`.
- [x] **UI and tests prove the seam.** `/component/e/:id` shows the Component
  compliance card for Workers; focused tests prove collect→submit→reuse entirely
  in component-owned state, with no host `flowRuns` row and no host `/collect`
  regression.

### 2026-06-07 — component-owned collection run/token storage
- [x] **Goal 37 shipped:** the installed `@metacrdt/convex` component now owns
  collection run/token rows for component-owned configured actions via its own
  `flowRuns` table.
- [x] **Component collection functions:** `log.issueCollection`,
  `log.collectionByToken`, and `log.submitCollection` issue/reuse tokens, render
  component-owned form definitions, append submitted field facts plus
  `submitted.<form>` into the component protocol log, and consume the component
  token.
- [x] **Public `/collect` stays stable.** `forms.collectionByToken` and
  `forms.submitCollection` check host tokens first, then dispatch unknown tokens
  to the component. The older host `collectionTarget: "component"` bridge remains
  for already-issued dev tokens.

### 2026-06-07 — component-owned standalone collect runs
- [x] **Goal 38 shipped:** `api.metacrdtComponent.startOwnedCollect` starts or
  reuses a component-owned collect run for a component-owned entity without
  creating a host `flowRuns` row.
- [x] **Read/UI surface:** `api.metacrdtComponent.listOwnedCollections` exposes
  component-owned collection runs, and `/component/e/:id` renders their status,
  scope, and live `/collect` link.
- [x] **Focused regression:** a standalone component collect run renders through
  `forms.collectionByToken`, submits through `forms.submitCollection`, completes
  the component run, and appends submitted field facts plus `submitted.<form>`
  into component-owned current state.

### 2026-06-07 — component-owned form definitions
- [x] **Goal 36 shipped:** `api.metacrdtComponent.defineOwnedForm` defines
  component-owned forms by writing `type = Form` and cardinality-one `formDef`
  facts into the installed `@metacrdt/convex` component log.
- [x] **Component-target collection links render component form metadata.**
  `forms.collectionByToken` still reads host `formDef` facts for host/legacy
  tokens, but `collectionTarget: "component"` tokens load `formDef` from
  `components.metacrdt.log.getCurrentEntity`.
- [x] **Focused regression:** the component collection test no longer calls
  `forms.defineForm`; it defines the form through `defineOwnedForm`, renders the
  public collection page from component-owned state, submits the token, and
  verifies submitted values land in component-owned current facts.

### 2026-06-07 — component-owned collection submission
- [x] **Goal 35 shipped:** `flowRuns` now has an optional
  `collectionTarget` marker. Missing/`host` keeps legacy behavior; component
  action tokens set `collectionTarget: "component"`.
- [x] **`/collect` routes writes by target.** Host tokens still assert submitted
  values through `assertInTx`; component tokens append submitted field facts and
  the `submitted.<form>` marker through `components.metacrdt.log.appendAssert`,
  so evidence folds into component-owned current state.
- [x] **Reuse is target-aware.** The shared action collection helper only reuses
  live tokens with the same subject/form/scope *and* collection target, preventing
  host/component token cross-contamination.
- [x] **Focused tests cover the migration boundary:** component action tokens
  submit into component-owned state and do not write host facts; existing host
  action collection and ordinary form collection behavior remain green.

### 2026-06-07 — component-owned actions open collection forms
- [x] **Goal 34 shipped:** `api.metacrdtComponent.runOwnedAction` now supports
  configured actions with `opensForm`. It still validates `appliesTo` from
  component-owned current `type` facts and writes action assertions into the
  component-owned protocol log, but it can also resolve `$entity` / `$arg.*`
  form/scope placeholders and issue or reuse the host collection-token run.
- [x] **Shared action collection bridge:** `convex/lib/collectRuns.ts` now owns
  the lightweight action collect-run issuer/reuser used by both host
  `actions.runAction` and component-owned `runOwnedAction`.
- [x] **UI support:** `/component/e/:id` displays returned `/collect` links,
  including reused-token status, matching the host entity detail behavior.
- [x] **Boundary remains explicit:** Goal 34 only issued/reused the token; Goal 35
  moved token submission into component-owned state for component-target tokens.

### 2026-06-07 — backend write authorization
- [x] **General public writes require Convex auth identity.** Added
  `convex/lib/writeAuth.ts` and gated public mutations in facts, attributes,
  rules, forms, flows, compliance, actions, appconfig, and the
  `metacrdtComponent` host wrappers with `ctx.auth.getUserIdentity()`.
- [x] **Actors are server-derived.** Public raw fact writes ignore spoofable
  caller-supplied `actorId` values and record the authenticated
  `tokenIdentifier`; component-owned write wrappers derive the same principal
  before crossing the component boundary.
- [x] **Collection links remain the intentional anonymous write surface.**
  `/collect` still succeeds with a valid unexpired/unconsumed token, without a
  login requirement.
- [x] **Tests cover the boundary.** `convex/writeAuth.test.ts` proves anonymous
  general writes fail, authenticated writes succeed with the server-derived
  principal, component wrappers are protected, and token collection still works.

### 2026-06-07 — @metacrdt/convex state-owned protocol log component
- [x] **Packaged component now owns durable protocol state.**
  `packages/convex/src/component/schema.ts` defines component-owned
  `transactions` and append-only protocol `factEvents` tables; `log.ts` exposes
  append/get/list functions over that state.
- [x] **Host apps still own auth and projection decisions.** The reference app
  wraps the component as `api.metacrdtComponent.appendOwnedAssert`,
  `appendOwnedLifecycle`, and `listOwnedEvents`; actor identity is derived
  server-side and passed explicitly across the component boundary.
- [x] **Boundary tests cover both package and mounted app usage.** Component tests
  prove assert/lifecycle writes, event verification, and entity/attribute filters;
  the app wrapper test proves the installed component can own events while the
  host app keeps its existing tables and public API names.
- [x] Follow-up shipped: the next slice moved `facts` / `currentFacts` into the
  component-owned surface for component-owned writes.
- [ ] Still deferred: materialized/rule projections inside the component,
  migrating the reference app's production write path, and live app write
  authorization.

### 2026-06-07 — @metacrdt/convex component-owned current projections
- [x] **Component now owns its first read models.**
  `packages/convex/src/component/schema.ts` adds `facts` and `currentFacts`;
  `appendAssert` creates fact/current rows and `appendLifecycle` folds retract,
  tombstone, and untombstone into those projections.
- [x] **Current-state API shipped.** `log.listCurrent` filters component-owned
  current state by entity/attribute, and the reference app exposes
  `api.metacrdtComponent.listOwnedCurrent` as the app-owned wrapper.
- [x] Tests prove assert creates current state, tombstone removes it,
  untombstone restores it, retract removes it permanently, and mounted app
  wrappers can read the component-owned projection.

### 2026-06-07 — @metacrdt/convex component-owned cardinality-one semantics
- [x] **Opt-in cardinality landed inside the packaged component.**
  `log.appendAssert` accepts `cardinality?: "many" | "one"`; many remains the
  default, while one-valued writes reconcile visible component-owned candidates by
  the shared `≺` order.
- [x] **Losers remain auditable.** The component marks losing fact projections as
  retracted, removes losing current rows, and appends protocol `retract` events
  with causal refs to the winning assertion.
- [x] **Reference wrapper passes the option through.**
  `api.metacrdtComponent.appendOwnedAssert` exposes the cardinality option while
  still deriving actor identity server-side.
- [x] Tests cover package-level cardinality behavior and mounted app wrapper
  behavior: two assertions produce two assert events plus one retract event, and
  current state points at the winner.

### 2026-06-07 — @metacrdt/convex component-owned projection rebuild
- [x] **Component projections are now disposable.** `log.rebuildProjections`
  clears component-owned `facts` / `currentFacts`, replays component-owned
  `factEvents` in transaction-time order, and returns event/fact/current counts.
- [x] **Append-only events stay untouched.** Rebuild does not patch old
  `factEvents`; lifecycle events target assertions through `targetEventId`, so
  stale projection `factId` values in event rows are non-canonical convenience.
- [x] **App wrapper shipped.** `api.metacrdtComponent.rebuildOwnedProjections`
  exposes rebuild through the host app boundary rather than direct component
  calls.
- [x] Tests prove cardinality-one and tombstone/untombstone/retract lifecycle
  state survive rebuild; mounted app wrapper test proves the host can rebuild and
  still read the current winner.

### 2026-06-07 — @metacrdt/convex component-owned entity reads
- [x] **Added the first object-level read over component-owned state.**
  `log.getCurrentEntity({ e })` reads `currentFacts` by indexed entity, resolves
  projection summaries, and groups them into deterministic attribute buckets.
- [x] **Host wrapper shipped.** `api.metacrdtComponent.getOwnedCurrentEntity`
  exposes the grouped entity read through the reference app boundary.
- [x] Tests prove grouped multi-attribute reads, retracted-current exclusion,
  missing-entity `null`, and mounted app wrapper behavior.

### 2026-06-07 — component-backed New Entity path
- [x] **Reference app now has an end-to-end component-owned write/read path.**
  The header `New entity` button opens a modal, calls
  `api.metacrdtComponent.createOwnedEntity`, then navigates to
  `/component/e/:id`.
- [x] **Component-created entities have their own detail route.**
  `src/pages/ComponentEntity.tsx` reads grouped component current state and the
  component protocol event log, clearly labeled as component-owned.
- [x] Backend wrapper test proves `type`, `name`, and initial attributes are
  written into component-owned state and read back through
  `getOwnedCurrentEntity`.

### 2026-06-07 — component-owned entity browser surface
- [x] **Component-owned entities are now discoverable.**
  `packages/convex/src/component/log.ts` exposes `listCurrentEntities`, backed by
  current `type` facts and component-owned indexes, with optional type filtering
  and current-name attachment.
- [x] **Reference app wrapper and UI consume it.**
  `api.metacrdtComponent.listOwnedCurrentEntities` wraps the component query, and
  the Entities route renders a separate component-owned section linked to
  `/component/e/:id`.
- [x] Tests cover the package query and mounted wrapper behavior.

### 2026-06-07 — component-owned Worker status actions
- [x] **First post-create component-owned object mutation.**
  `api.metacrdtComponent.setOwnedWorkerStatus` accepts only `active` /
  `terminated`, derives actor context server-side, and appends a
  cardinality-one `worker.status` assertion into the component-owned log.
- [x] **Component detail page can mutate component-owned state.**
  Worker component entities now show Reactivate / Terminate buttons that update
  the current fold and append-only event log through the host wrapper.
- [x] Wrapper test proves status current-state winner and protocol history
  (`assert`, `assert`, `retract`).

### 2026-06-07 — component-owned configured action runner
- [x] **Shared action-definition semantics.** `convex/lib/actionDefs.ts` now owns
  action id construction, validators, action loading, and `$arg.*` placeholder
  resolution for both host-owned `api.actions.runAction` and component-owned
  `api.metacrdtComponent.runOwnedAction`.
- [x] **Configured actions can write component-owned state.** `runOwnedAction`
  derives actor context server-side, validates the component-owned entity's
  current `type` facts against `appliesTo`, resolves action args, adapts host
  schema cardinality, and appends action asserts into the component-owned log.
- [x] **Component detail uses configured actions instead of hard-coded Worker
  buttons.** `/component/e/:id` queries `actionsForType`, renders labels/asserts
  and fields, and writes through the host wrapper. Live smoke ran configured
  Terminate/Reactivate against `worker:ava-reed-mq4ph0h7`.
- [x] Tests cover arg resolution, cardinality-one replacement, and `appliesTo`
  enforcement.

### 2026-06-07 — Datalog disjunction
- [x] **Added bounded `or` clauses to the engine.** `convex/lib/engine.ts` now
  parses `{ or: [[...clauses], ...] }`, caps branch count with
  `LIMITS.maxOrBranches`, rejects nested `or` for now, and preserves the existing
  unsafe-query behavior for branches whose variables are not bound by incoming
  state or branch-local patterns.
- [x] **Branch union composes with the existing solver.** Each branch evaluates
  from the current binding; resulting bindings are unioned/deduped and provenance
  is merged. Branches can bind variables for later joins and can contain compare
  and safe negation clauses.
- [x] **Docs/UI expose the syntax.** `convex/datalog.ts`, `README.md`, and the
  Data model Datalog console now show an active-or-pending Worker query using
  `or`.
- [x] Verification: focused Datalog tests, full backend suite (103 tests), core
  and convex-package suites, typechecks, build, backend/static deploy, and live
  `convex run` smoke all passed.

### 2026-06-07 — @metacrdt/runtime p2p DataChannel transport
- [x] **Added structural p2p transport.** `packages/runtime/src/p2p.ts` defines
  `DataChannelLike`, `PeerDataChannelTransport`, and
  `attachPeerDataChannelTransport`.
- [x] **Point-to-point anti-entropy now works without a shared bus.** The
  transport serializes protocol messages as JSON strings over `send()`, handles
  hello/version-vector/delta catch-up, filters foreign protocols and directed
  deltas, and advertises the `transport` capability.
- [x] **Multi-hop gossip is covered.** Newly inserted remote events are gossiped
  onward to other connected peers, so a left → middle → right graph converges
  without full mesh connectivity.
- [x] Tests cover direct publish, late-peer catch-up, three-node gossip,
  filtering, and stop/disconnect lifecycle cleanup. Deferred: WebRTC signaling,
  STUN/TURN, auth, and live Cloudflare deployment.

### 2026-06-07 — @metacrdt/local SQLite-compatible persistence
- [x] **Added dependency-free SQLite storage.** `packages/local/src/sqlite.ts`
  defines `SqliteDatabaseLike`, `SqliteStatementLike`, `SqliteRuntimeStorage`,
  and `sqliteStorage` for prepare/get/run-style SQLite clients supplied by the
  host app.
- [x] **Added SQLite local-first runtime helpers.**
  `createSqliteLocalFirstRuntime` / `startSqliteLocalFirstRuntime` plug SQLite
  storage into the same async event store, HLC, sequencer, and BroadcastChannel
  path as IndexedDB.
- [x] Tests cover key/value get/set/remove, unsafe table-name rejection, runtime
  restart durability for event log/HLC/`seq`, and BroadcastChannel convergence
  between SQLite-backed local-first replicas. Deferred at that point: p2p
  networking, live Cloudflare deployment, and relay auth; p2p transport and the
  relay auth boundary shipped in later slices.

### 2026-06-07 — @metacrdt/local IndexedDB-compatible async persistence
- [x] **Added async local runtime services.** `packages/local/src/async.ts`
  defines `AsyncLocalRuntimeStorage`, `AsyncLocalEventStore`, `AsyncLocalClock`,
  `AsyncLocalSequencer`, and `createAsyncLocalRuntime`.
- [x] **Added IndexedDB browser storage adapter.** `packages/local/src/indexedDb.ts`
  wraps IndexedDB as async key/value storage; `createIndexedDbLocalFirstRuntime`
  and `startIndexedDbLocalFirstRuntime` compose it with BroadcastChannel
  anti-entropy and the same `start`/`stop` lifecycle.
- [x] **Serialization stays shared.** `@metacrdt/runtime` now exports the local
  event/value encoding helpers and storage key helpers so async adapters reuse
  the same content-address-preserving storage format.
- [x] Tests cover async restart durability for event log/HLC/`seq`,
  IndexedDB-compatible convergence over BroadcastChannel, late-replica
  hello/delta catch-up, `broadcast:false`, and missing-host error behavior.
  Deferred at that point: SQLite and p2p networking; both now have structural
  target slices.

### 2026-06-07 — @metacrdt/local browser local-first package
- [x] **Added the browser-facing local target package.** `packages/local` exports
  `browserStorage`, `browserBroadcastChannel`, `createLocalFirstRuntime`, and
  `startLocalFirstRuntime`.
- [x] **Package boundary is composition, not duplication.** Durable event log/HLC/
  `seq` storage remains in `@metacrdt/runtime`'s local target seed; same-origin
  anti-entropy remains in `BroadcastChannelTransport`. `@metacrdt/local` supplies
  browser defaults, lifecycle methods, and the package-level target name.
- [x] Tests cover BroadcastChannel peer convergence, late-replica hello/delta
  catch-up, restart durability, `broadcast:false` local persistence, and host
  helper behavior. Deferred at that point: IndexedDB/SQLite adapters and p2p
  networking; IndexedDB/SQLite-compatible persistence and p2p transport shipped
  in later slices.

### 2026-06-07 — @metacrdt/cloudflare Worker/DO example shell
- [x] **Added the deploy-facing Cloudflare shell.** `packages/cloudflare/src/worker.ts`
  exports `MetaCrdtRelayDurableObject`, `createRelayWorker`, and `relayWorker`.
  The Worker routes `?room=` / `/rooms/<name>` requests to a Durable Object
  namespace; the DO class handles WebSocket upgrades by attaching the relay to
  `createDurableObjectRuntime(state.storage)`.
- [x] **Added `wrangler.example.toml`.** It documents the `METACRDT_RELAY`
  Durable Object binding and migration entry without making live deployment a
  test prerequisite.
- [x] Tests cover Worker health/routing/error responses, DO health, WebSocket
  upgrade wiring, and non-WebSocket `426` rejection. Deferred at that point:
  live deployment, relay auth, and p2p transport; relay auth and p2p have since
  shipped.

### 2026-06-07 — @metacrdt/cloudflare Durable Object WebSocket relay shell
- [x] **Added a structural DO WebSocket relay.** `packages/cloudflare/src/relay.ts`
  exports `WebSocketLike`, `DurableObjectWebSocketRelay`, and
  `attachDurableObjectRelay`.
- [x] **Relay behavior proved with fake server sockets.** Tests cover socket
  acceptance, initial version-vector hello, local operation fan-out through
  `Transport.publish`, client hello/delta catch-up, idempotence once caught up,
  client event merge + fan-out, foreign protocol filtering, and invalid-JSON
  disconnect.
- [x] Still deferred: concrete Worker class/fetch routing, Wrangler config,
  deployment scripts, auth, and p2p transport.

### 2026-06-07 — @metacrdt/cloudflare Durable Object runtime services
- [x] **Added the first Cloudflare target package.** `packages/cloudflare`
  exports `DurableObjectStorageLike`, `DurableObjectEventStore`,
  `DurableObjectClock`, `DurableObjectSequencer`, and
  `createDurableObjectRuntime`.
- [x] **Durable Object storage target behavior proved with fake async DO
  storage.** Tests cover restart durability for event log/HLC/`seq`,
  same-wall-clock logical HLC increment, version-vector delta convergence between
  two DO runtimes, post-restart idempotence, and rejection of invalid stored
  events.
- [x] This is deliberately **not** the Worker/WebSocket relay shell yet; the
  protocol logic now lives in a reusable target package, and the eventual Worker
  can bind real `state.storage` to the structural storage interface.

### 2026-06-07 — runtime BroadcastChannel transport seed
- [x] **Added same-origin browser anti-entropy transport inside
  `@metacrdt/runtime`.** `packages/runtime/src/broadcast.ts` defines
  `BroadcastChannelLike`, `BroadcastChannelTransport`, and
  `attachBroadcastTransport`.
- [x] **Transport behavior proved with an in-memory BroadcastChannel-compatible
  bus.** Tests cover live publish from `applyOperation`, `hello` version-vector
  announcements, `delta` catch-up, post-catch-up idempotence, protocol isolation,
  directed-delta filtering, and the attached `transport` capability.
- [x] Still deferred at that point: relay/Cloudflare Durable Object/p2p
  transports and the full `@metacrdt/local` package boundary. Those structural
  target slices and the Cloudflare relay auth boundary have since shipped; live
  deployment remains open.

### 2026-06-07 — runtime localStorage target seed
- [x] **Added a browser/localStorage runtime target seed inside
  `@metacrdt/runtime`.** `packages/runtime/src/local.ts` defines
  `LocalRuntimeStorage`, `LocalEventStore`, `LocalClock`, `LocalSequencer`, and
  `createLocalRuntime`. It persists the G-Set event log, HLC, and per-replica
  sequence under a namespace while preserving verified core event IDs.
- [x] **Restart durability proved.** Local runtime tests recreate replicas over
  the same storage and prove event log/HLC/`seq` continuity, same-wall-clock HLC
  logical increments, byte-value round-trip without breaking content addressing,
  and version-vector exchange that converges, restarts, and remains idempotent.
- [x] This was deliberately **not** `@metacrdt/local` yet and not a network
  transport. BroadcastChannel, IndexedDB-compatible persistence, and Cloudflare
  relay targets shipped later; SQLite and p2p shipped as separate later slices.

### 2026-06-07 — @metacrdt/convex registered component surface
- [x] **Packaged component entrypoints added.** `@metacrdt/convex` now exports
  `./convex.config(.js)` and `./_generated/component(.js)`, with a stateless
  component under `packages/convex/src/component`.
- [x] **Registered protocol helpers shipped.** Component functions build protocol
  assert/lifecycle rows and summarize one or many protocol rows. They accept
  explicit values across the component boundary; host apps still own auth, table
  selection, database writes, and public wrapper names.
- [x] **Reference app mount proved.** `convex/convex.config.ts` installs the
  component as `metacrdt`; `api.metacrdtComponent.verifyEvents` fetches host
  `factEvents`/`transactions`, calls `components.metacrdt.protocol.summarizeRows`,
  and enforces optional `requireValid` for protocol-stamped events.
- [x] Tests: `@metacrdt/convex` package component tests, app wrapper test,
  root Convex suite, package typecheck, Convex typecheck, and live
  `npx convex run metacrdtComponent:verifyEvents ...`.

### 2026-06-07 — command menu polish
- [x] **Header search is real.** `Cmd/Ctrl+K` or the header search control opens a
  modal command palette backed by live queries for entities, configured types, and
  flow definitions, plus static page navigation commands.
- [x] **Keyboard route smoke verified.** Search `maria` → `/e/worker%3Amaria`;
  search `flows` → `/flows`; Escape/overlay close and arrow/Enter navigation are
  handled inside the palette.

### 2026-06-07 — Goal 13 @metacrdt/runtime harness groundwork
- [x] **Version-vector anti-entropy shape implemented in memory.** Runtime
  operations now stamp events with per-replica `seq` when a target supplies a
  sequencer. `sync.ts` adds `versionVector`, `deltaSince`,
  `mergeVersionVectors`, and `exchangeDeltas`; memory tests prove unseen-event
  deltas, idempotent repeated exchange, and legacy unsequenced compatibility.
- [x] **First runtime harness package.** `packages/runtime` defines the portable
  service boundary (`EventStore`, `RuntimeClock`, `Scheduler`, `Transport`),
  runtime profiles/capabilities, and operation helpers (`applyOperation`,
  `mergeFrom`) over `@metacrdt/core`.
- [x] **Memory target proves the contract.** In-memory store/clock/scheduler/
  transport target with tests for injected HLC behavior, append/publish,
  cross-runtime G-Set exchange convergence, lifecycle operations, and capability
  checks. Convex is intentionally not migrated onto it yet.

### 2026-06-07 — physics capstone
- [x] **`docs/physics.md` added.** It defines "physics" as entities, facts,
  rules, intentions, access, time, merge policy, and runtime target over the same
  MetaCRDT protocol, then maps compliance datarooms, small-group co-signing, and
  agent swarms as three blueprints over one substrate. README/metacrdt docs link
  it.

### 2026-06-07 — Goal 12 collection-token hardening
- [x] **Collection links are now single-use and expiring.** `flowRuns` stores
  `tokenExpiresAt` / `tokenConsumedAt`; token lookup refuses consumed, expired,
  and no-longer-waiting runs before returning form metadata; successful submit
  consumes the token.
- [x] **Issuance and tests updated.** Flow collects, standalone collects, and
  form-opening actions stamp token expiry; idempotent issuance reuses only live
  tokens. Tests cover post-submit single-use and pre-submit expiry.

### 2026-06-07 — Goal 11 actions that open forms
- [x] **Configured actions can issue collection links.** `defineAction` stores
  optional `opensForm`, `runAction` resolves its literals/`$arg`/`$entity`
  placeholders, creates or reuses a waiting `flowRuns` collection run, and
  returns the `/collect?token=...` link.
- [x] **UI and tests shipped.** Entity detail shows the returned collection link
  after an action runs; Data model shows `opensForm` in the registry. Tests cover
  configured form-open success and idempotent reuse of an existing waiting run.

### 2026-06-07 — Goal 10 arg-taking actions
- [x] **Configured actions now accept inputs.** `defineAction` stores optional
  action fields, `runAction` accepts `args`, and assert values can reference
  `$arg.<name>` or `$entity`. Existing fixed actions keep working.
- [x] **UI and tests shipped.** Entity detail renders inputs for actions with
  fields; the action registry shows input schema. Tests cover parameterized
  success, missing required args, unknown placeholders, and fixed-action
  compatibility.

### 2026-06-07 — Goal 9 config history/diff
- [x] **Config changes are now inspectable.** `convex/configHistory.ts` adds
  `currentManifest` and `history`: the current config-owned artifact manifest and
  recent config-authored transaction diffs computed by comparing
  `config:default` ownership snapshots before/after each transaction.
- [x] **Idempotence is visible.** Repeated identical applies report no manifest
  diff, while requirement removal reports a removed requirement. The Data model
  page now shows manifest counts and recent config diffs.

### 2026-06-07 — Goal 8 selected: Confect-first compliance planning
- [x] **PLAN.md now answers the Confect-first question.** Decision: use Confect
  next, but narrowly — convert the compliance read/planning domain and ship
  dry-run compliance through a sidecar production slice, not a wholesale
  rewrite of `convex/`.
- [x] **Goal 8 is executable.** It names the files, mount pattern, requirement
  source decision, typed errors, read-only guarantees, tests, UI work, docs, and
  full verification gate. It preserves `@metacrdt/core` as Effect-free and keeps
  protocol writes out of scope.
- [x] **Goal 8 shipped.** `confect/compliance.*` adds
  `dryRunWorkerCompliance`; `convex/complianceConfect.ts` mounts it; the planner
  derives requirements from enabled `require.*` rules, returns `reuse`/`collect`
  decisions, and fails unsupported rule shapes with typed errors. The Compliance
  page renders the dry-run panel. Verification: Confect codegen; core/convex/
  forma/package tests; 80 Convex tests; all typechecks; Vite build; Convex dev
  push; static upload; live `complianceConfect:dryRunWorkerCompliance` call.

### 2026-06-07 — schema-driven entity UI
- [x] **Goal 7 shipped:** `attributes.typeSchemaAsOf` now returns UI-ready
  `columns` with attribute definitions reconstructed from schema-as-facts while
  preserving the existing `attributes` compatibility list.
- [x] **Entities list from declared schema:** the Entities route uses
  `typeSchemaAsOf(...).columns` for table columns and `queryEntities` for rows,
  so configured type shape drives the browser rather than ad-hoc current-fact
  discovery.
- [x] **Detail ordering from schema:** entity detail renders state in primary
  type schema order, then appends extra runtime facts. Collection forms remain
  form-definition driven, and PII `Denied` markers continue to render.
- [x] Tests cover column definitions and configured Placement row attributes.

### 2026-06-07 — attribute-level PII read authorization
- [x] **Goal 6 shipped:** form definitions can mark fields `pii` / `sensitive`,
  and the staffing blueprint marks `i9/ssn` as PII. `convex/lib/readAuth.ts`
  centralizes principal derivation, sensitive-attribute detection, grant matching,
  and attribute-map redaction.
- [x] **Facts-native grants:** grants are ordinary current facts on the principal:
  `(principal, "grants.read", { e, a })`, with wildcard support. Public read
  functions derive the principal from `ctx.auth.getUserIdentity().tokenIdentifier`
  (or `anonymous`) and never accept a caller-provided user id.
- [x] **Projection enforcement:** `getEntity`, `queryFacts`, `entityAsOf`,
  `compareFacts`, `entityFactsAsOf`, `history`, `entityTimeline`,
  `entityDetail`, `queryEntities`, and public Datalog/aggregate queries now omit
  or redact ungranted PII. Internal rule/materialization folds opt out via the
  Datalog engine's explicit `enforceReadAuth` option.
- [x] **UX + tests:** entity detail and transaction-log pages render `Denied`
  markers. `convex/readAuth.test.ts` proves unauthenticated and ungranted reads
  cannot see `i9/ssn`, while a granted authenticated principal can read it through
  entity reads, as-of reads, `queryFacts`, and Datalog.

### 2026-06-07 — true `applyConfig` reconcile
- [x] **Goal 5 shipped:** `applyConfig` now reconciles configured artifacts
  instead of only upserting them. It tracks ownership on `config:default`
  (`owns.attribute`, `owns.entityType`, `owns.form`, `owns.flow`,
  `owns.requirement`, `owns.action`) and computes desired sets for explicitly
  supplied config sections.
- [x] **Safe cleanup semantics:** dropped owned `attr:*`, `type:*`, `form:*`, and
  `action:*` carriers are retracted through a new `actorId: "config"` transaction;
  dropped requirements disable `require.*` / `task.*` rules and delete stale
  derived facts; dropped flows delete the owned `flowDefs` row. Omitted config
  sections are overlays and do not reconcile to empty.
- [x] **Regression coverage:** tests prove removing the forklift requirement
  removes the obligation, removing `terminate` removes only that action while
  preserving forms, and removing the configured `Venue` type / `venue` attribute
  does not delete runtime `venue:stadium7` data.

### 2026-06-07 — @metacrdt/forma extraction
- [x] **Goal 4 shipped:** `packages/forma` now publishes `@metacrdt/forma`, the
  runtime-neutral Lisp / S-expression authoring language extracted from the
  pinned Open Ontology language implementation. It owns reader/source/session,
  formatter, evaluator, expander, VM, builtins, HM type inference, forms,
  descriptors, artifacts, and language-owned elaboration/codegen utilities.
- [x] **Boundary documented:** `packages/forma/README.md` states what Forma owns
  and explicitly excludes Convex bindings, protocol event storage, Datalog/runtime
  execution, platform targets, and product UI. Onlang is documented as a legacy
  alias; new code imports `@metacrdt/forma`.
- [x] **Fixture coverage:** selected Open Ontology Lisp fixtures were copied into
  package-local tests and now parse/evaluate/typecheck under the new package. The
  extraction test also enforces no `.context/open-ontology` or `@open-ontology/*`
  imports in `packages/forma/src`.
- [x] Verification: `npm run test:forma` (9 tests) and package typecheck pass;
  full repo gates are recorded in the commit that shipped this slice. Current
  goal moves to true `applyConfig` reconcile.

### 2026-06-07 — @metacrdt/convex adapter package extraction
- [x] **Host-mounted append/verify helpers added to `@metacrdt/convex`.**
  `packages/convex/src/functions.ts` exports builders and a
  `createProtocolFactEventWriter` factory that append protocol assert/lifecycle
  rows through an injected inserter, plus `summarizeProtocolEventRows` through an
  injected transaction lookup. This is the reusable helper layer before a
  registered Convex component surface. Current verification:
  `npm run test:convex-package` is 17 tests.
- [x] **Cardinality-one reconcile helper moved into `@metacrdt/convex`.**
  `packages/convex/src/reconcile.ts` now exports a pure
  `reconcileCardinalityOneCandidates` helper and shared supersession reason; the
  Convex reference app uses it while retaining host-owned DB/projection writes.
  Package tests cover `≺` winner selection, order independence, empty input, and
  the shared lifecycle reason. Current verification: `npm run test:convex-package`
  was 13 tests before the append/verify helper slice.
- [x] **Goal 3 shipped adapter-first:** `packages/convex` now publishes
  `@metacrdt/convex` with package-owned Convex/core event adapters, HLC fallback,
  `eventPatch`, protocol row reconstruction/summarization, bitemporal visibility
  mapping, protocol metadata validators, and a Confect sidecar warning/helper.
- [x] **Reference app consumes the package:** `convex/lib/coreEvent.ts` delegates
  event construction/patching to `@metacrdt/convex`; `convex/lib/visibility.ts`
  delegates projected-row visibility to the package; `confect/metacrdt.impl.ts`
  uses the package event-summary helper instead of duplicating reconstruction.
- [x] Verification: `npm run test:convex-package` (9 tests), `npm run test:core`
  (46 tests), `npm test` (72 tests), package/Convex/app typechecks, and
  `npx convex dev --once` all pass. Goal 4 (`@metacrdt/forma`) is now current in
  `PLAN.md`.

### 2026-06-07 — PLAN.md becomes the executable goal file
- [x] **Goal 2 Confect spike shipped:** `confect/` now defines a Confect v8
  sidecar group over real MetaCRDT `factEvents`; `metacrdt.verifyEvents` uses
  Effect Schema args/returns, typed `UnknownEntity` / `InvalidProtocolEvent`
  errors, generated `DatabaseReader`, and `@metacrdt/core.verifyId`.
  `convex/metacrdtConfect.ts` manually mounts the generated registered function
  beside the existing plain Convex backend. Verification: `npm run
  confect:codegen`, `npm run test:core`, `npm run test:confect`, `npm test` (72
  Convex tests), both typechecks, `npx convex dev --once`, and a live
  `metacrdtConfect:verifyEvents` call returning `validEventId: true`.
- [x] **Confect decision:** adopt narrowly for `@metacrdt/convex` internals /
  typed boundary experiments, not as a wholesale reference-app migration. Raw
  Confect codegen rewrites/removes files in the configured Convex functions
  directory, so this repo uses `scripts/confect-codegen-sidecar.mjs` to generate
  `confect/_generated/*` safely against a throwaway target.
- [x] **Expanded Goal 2 into an executable Confect spike plan** after finishing
  the protocol write-path work: current Confect v8 API baseline, sidecar-not-
  migration scope, exact dependencies, generated file layout, typed-error
  requirements, test/deploy gates, and adopt/defer/reject decision criteria.
  `docs/confect.md` now names the current v8 surface before the older conceptual
  sketch.
- [x] **Goal 1 implementation slice shipped:** additive protocol metadata on
  `factEvents` (`eventId`, HLC, replica, target, causal refs), `facts.assertEventId`
  for lifecycle targeting, local Convex/core adapter (`convex/lib/coreEvent.ts`),
  new writes sealed/verified through `@metacrdt/core`, `correctFact` now emits
  tombstone+assert protocol events instead of new `correction` rows, and
  cardinality-one current projection chooses the `≺`-max candidate. Verified with
  70 Convex tests + 46 core tests + both typechecks; functions pushed to
  `chatty-hare-94`.
- [x] Added explicit legacy fallback coverage: a fact with `assertEventId`
  removed still reconciles safely through the compatibility target path during a
  later cardinality-one assertion.
- [x] `rebuildProjections` now prefers protocol order (`hlc` then `eventId`) for
  core-shaped rows and falls back to legacy `txTime` / `_creationTime` ordering.
- [x] Rewrote `PLAN.md` from the old triple-store milestone backlog into a
  goal-oriented MetaCRDT execution plan: Goal 1 is core-shaped Convex writes
  (`eventId`/HLC/replica metadata, `≺`-max cardinality-one supersession,
  rebuild-from-log tests); Goal 2 is a scoped Confect spike after the protocol
  semantics are correct; later goals cover `@metacrdt/convex` and
  `@metacrdt/forma`.
- [x] Tightened `PLAN.md` from review feedback: `correction` is now explicitly an
  operation that expands to tombstone+assert protocol events; centralized Convex
  `≺` behavior is framed as a test-proven convergence property, not a visible UX
  change; global sequence counters are deferred to real replicas to avoid
  write-contention; legacy event metadata policy is explicit (tolerant adapter
  first, optional backfill later).

### 2026-06-06 — wire the read path through @metacrdt/core
- [x] **Planned the Open Ontology → MetaCRDT fold** in
  `docs/package-consolidation.md`: this repo is canonical; Open Ontology remains a
  pinned context submodule; the Lisp layer becomes `@metacrdt/forma`; ViewSpec
  becomes `@metacrdt/views`; database/triplestore concepts split into
  `@metacrdt/core` + `@metacrdt/query` + target packages; migration is extraction
  by package boundary, not bulk copy.
- [x] **`convex/lib/visibility.ts` now delegates to `@metacrdt/core`** — the
  bitemporal visibility predicate has one definition (core, SPEC §5.3); the Convex
  adapter maps a folded `facts` row → core events (assert + optional retract/
  tombstone) and asks `core.visible`. All read queries (`entityFactsAsOf`,
  `entityAsOf`, `queryFacts`, `compareFacts`) and `rebuildProjections` inherit it,
  no call-site changes, behavior preserved.
- [x] **Step 0 retired the bundler unknown** — Convex's esbuild bundles the
  workspace package's `.ts` source directly; no `dist` build required.
- [x] 66 convex + 46 core tests green; convex typecheck clean; verified live on
  `chatty-hare-94` (the time-travel as-of read renders through the core fold).

### 2026-06-06 — the first package: @metacrdt/core
- [x] **Extracted `@metacrdt/core`** (`packages/core`) — the pure, dependency-free
  convergence kernel implementing SPEC §4–5: zero-dep `sha256` (NIST-vector
  tested) + `base32` for content-addressed `EventId`s, canonical value encoding
  (§A.1, with a pure `utf8` so the package pulls in no DOM/ambient globals), the
  HLC (`tick`/`receive` take wallclock as a param — no `Date.now`), the immutable
  `Event` + builders, the `≺` total order (§5.1), the G-Set `Log` + union `merge`
  (§4.3), and the deterministic bitemporal `fold`/`visible` (§5.3–5.4).
- [x] 46 tests: SHA-256 vectors; canonical key-order independence + type
  distinction; `eventId` content-addressing (seq/sig excluded); merge
  commutativity/associativity/idempotence; `≺` totality; **fold determinism under
  shuffled insertion order** (convergence) and **cardinality-one supersession =
  `≺`-max regardless of order**; full visibility quadrants + retract/tombstone/
  untombstone + flags.
- [x] npm workspaces (`packages/*`); root vitest scoped to `convex/**` so the pure
  package runs under its own (node) config. Root convex suite still 66/66.

### 2026-06-05 — naming, docs, and the SaaS/Tailwind rebuild
- [x] **Consolidated under the MetaCRDT umbrella.** `docs/architecture.md` (the
  layer/package map: features × IR × targets; where Open/Alpha Ontology, Onlang,
  Schematics, Onboarded all land) + `docs/manifesto.md` (the founding statement).
  VISION opens with a naming note; `@metacrdt/core`-first extraction plan tracked.
- [x] **`SPEC.md` — the MetaCRDT protocol spec** (normative, v0.1): events,
  content addressing, G-Set merge, the `≺` total order, the deterministic
  bitemporal fold + visibility predicate, derivation, HLC + version-vector sync,
  and the coordination profiles (capabilities / membership / quorum / read authz).
- [x] **Named the substrate MetaCRDT.** Whitepaper `docs/metacrdt.md` (log as a
  G-set CRDT, deterministic-fold projections, bitemporal+provenance as the
  meta-layer; frontier named honestly). Live rebrand: sidebar, Overview
  research-preview hero, datarooms framing; README now indexes the doc set.
- [x] Design docs: `confect.md` (the backend as Effect via Confect), `foldkit.md`
  (the client as a projection — serializable app → serializable organization),
  `alchemy.md` (infrastructure as the same Effect program; Cloudflare/Durable
  Objects as app-level actors).
- [x] `VISION.md` — the substrate → engine → emergent-product thesis + 12 pillars.
- [x] **Frontend rebuilt** on Tailwind v4 (`@tailwindcss/vite`) + React Router v7:
  dark grouped-sidebar shell, routed pages, an Overview dashboard
  (`overview.summary` / `recentActivity`), restyled to the design mockup.
- [x] **SaaS reframe:** origin facet (system / configured / data), the entity
  detail page (contextual flows + actions), the actions registry, config-as-code
  (`applyConfig` + staffing blueprint), and the system-processes read model.
- [x] Flows: `listFlows` / `listFlowDefs` + a reusable entity picker.
- [x] Phase 2 — the general Flow **DAG** interpreter + onboarding demo
  (collect → branch → action → notify → done).
- [x] External collection: field-defining forms + an isolated magic-link
  `/collect` page + save-and-continue.

### 2026-06-04 — compliance, flows, provenance, schema-as-facts
- [x] Durable **collect-step Flow runner** (issue → park → resume on submission
  fact / scheduler tick) + Flows demo UI.
- [x] **Compliance engine slice** (first vision slice): obligations-as-facts,
  reuse-as-scope-key, tasks via negation (`requirement ∧ ¬submitted`) with
  provenance, guarded requirements, valid-time expiry via cron.
- [x] Assessed the vision against the Convex build; rebased substrate assumptions
  (SQL/Effect/event-bus → Convex validators/indexes/scheduler) — the reframes/cuts
  in PLAN.md.
- [x] Datalog **aggregation** (count/sum/avg/min/max + group-by) and a two-axis
  **time-travel** + provenance UI.
- [x] **Provenance:** derived facts trace back to the source facts (and asserting
  transaction) that justify them; `explainDerived` + "why?" UI.
- [x] `rebuildProjections` — fold the log to regenerate facts/currentFacts/derived,
  with a replay property test; relabel facts/currentFacts/derived as projections.
- [x] **Schema-as-facts** (meta-circular): attribute/type definitions are
  bitemporal triples; the `attributes` table is gone.
- [x] Running feature backlog added to PLAN.md.

### 2026-06-03 — substrate, Datalog, hosting
- [x] Semi-naive **incremental transitive closure** + an entities browser with a
  dynamic query builder compiled to Datalog.
- [x] Richer **Datalog**: comparison predicates, negation, derived-fact querying,
  transitive closure.
- [x] `@convex-dev/static-hosting` + the demo Triple Store Explorer UI (live on
  `chatty-hare-94`).
- [x] Tests (convex-test + vitest), attribute schema, incremental recompute, M6
  bitemporal queries (`entityAsOf` / `compareFacts`).
- [x] Scaffold the Convex project + the bitemporal triple-store MVP (append-only
  `factEvents`, `facts`/`currentFacts` projections, assert/retract/tombstone/correct).
- [x] Initial README + PLAN for the bitemporal triple store.
