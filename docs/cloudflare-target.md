# Cloudflare target — Durable Object + SQLite triple store

**Status:** Active target plan. Phase A is shipped and Phase C has started:
`@metacrdt/cloudflare` now has a structural Durable Object SQLite runtime
adapter over `ctx.storage.sql.exec(...)`, with EventStore / ProjectionStore /
HLC / seq services, collection capability rows, DAG run/timeline rows,
Layer-backed conformance, and the first
component-equivalent log/current/query surface (`appendAssert` /
`appendLifecycle` helpers with scoped current-coordinate projection reconcile,
target-indexed lifecycle lookup, `getEvent`, `listEvents`,
SQL-indexed historical `query` / `page` / `aggregate` / `derivedRows`,
projection-backed `queryCurrent` / `pageCurrent` / `aggregateCurrent` /
`derivedRowsCurrent`, `rebuildCurrent`, `listCurrent`, `getCurrentEntity`,
`listCurrentEntities`, collection `issueCollection` / `collectionByToken` /
`listCollections` / `submitCollection`, DAG `recordDagRun` / `getDagRun` /
`listDagRuns` / `resumeDagRun`, flow-wait timer rows, an operational timer alarm
multiplexer, and deterministic projection change summaries for touched `(e, a)`
coordinates).
Full historical SQL query-provider parity/conformance and full Cloudflare flow
interpreter/action-execution parity are still ahead.

**Scope:** Grow `@metacrdt/cloudflare` from a sync-plane shell into a full
MetaCRDT target at parity with the `@metacrdt/convex` component — an indexed,
bitemporal triple store backed by Durable Object SQLite storage — without
breaking the convergence guarantee.

Companion docs: [architecture.md](./architecture.md) (the layer/target map),
[package-consolidation.md](./package-consolidation.md) (the package graph),
[SPEC.md](../SPEC.md) §8 (anti-entropy sync). This doc is the target-specific
build plan.

---

## Why this doc exists

`@metacrdt/convex` is currently the only target that implements MetaCRDT as a
real operational triple store. `@metacrdt/cloudflare` started as only the
**sync plane** — a convergent event log over Durable Object KV storage, plus a
WebSocket relay and a Worker shell. It now also has the first Durable Object
SQLite runtime substrate: structural SQLite services for events, projection
rows, HLC, and per-replica `seq`. It now has the first component-equivalent
log/current/query surface over that substrate: append helpers with scoped
current-coordinate projection reconcile,
`getEvent`, `listEvents`, SQL-indexed bitemporal Datalog reads
(`query`, `page`, `aggregate`, `derivedRows`), projection-backed current Datalog
reads (`queryCurrent`, `pageCurrent`, `aggregateCurrent`,
`derivedRowsCurrent`), `rebuildCurrent`, and current entity/list reads backed by
SQLite projection rows, with rebuild results reporting changed current
projection coordinates and before/after event ids; append/lifecycle writes now
replace only the touched current projection coordinate and fold only matching
assertions plus lifecycle events found by target id. It now also has the first
operational collection capability rows over SQLite: deterministic caller-provided
tokens can be issued, read, listed, and submitted with stored payload/status. It
can also lower optional submitted assertions into protocol events for the
collection subject through the existing append/reconcile path. Collection
reminder/escalation/expiry ticks now persist as caller-identified `timers` rows
and can be fired through the facade. Component-style DAG run/timeline rows now
persist as caller-identified `flow_dag_runs` and `flow_dag_events`, exposed
through `recordDagRun`, `getDagRun`, `listDagRuns`, and the narrow
`resumeDagRun` terminal-decision surface. Flow-wait timer rows can now be
scheduled, listed, fired, and drained through the DO alarm multiplexer.
Historical Datalog queries now use a Cloudflare-specific indexed SQLite
candidate source for bounded assertion patterns and target-indexed lifecycle
visibility checks. It still has no full SQL query-provider conformance/parity,
no live invalidation fanout, and no Cloudflare DAG interpreter/action execution
surface.

This doc defines what it takes to bring Cloudflare to parity, in what order, and
which decisions must be settled first — and it makes **live frontend queries an
explicit stretch goal** that the architecture must not preclude, even though it
is not an initial requirement.

---

## The bar: what `@metacrdt/convex` actually provides

The Convex target is two stacked layers. Only the second is target-specific.

### Layer 1 — target-neutral adapters (`packages/convex/src/*.ts`)

Row ↔ core `Event` conversion, the bitemporal fold, and cardinality-one
reconcile. **The logic here is core semantics, not Convex semantics:**

- `events.ts` — `assertEvent` / `retractEvent` / `tombstoneEvent` /
  `untombstoneEvent`, `eventPatch`, `protocolEventFromRows`, `hlcFromTransaction`.
- `visibility.ts` — `foldEventsForFactProjection`, `isFactVisible`, `valueKey`.
- `reconcile.ts` — `reconcileCardinalityOneCandidates` (select the `≺`-max
  visible assert; losers retracted, history preserved).
- `validators.ts` — protocol metadata validators.

### Layer 2 — the stateful component (`packages/convex/src/component/`)

A registered Convex component owning its own tables and a ~16-function surface:

| Convex component table | Role |
| --- | --- |
| `transactions` | one row per write: actor, source, txTime |
| `factEvents` | append-only protocol log (`eventId`, `hlc`, `replicaId`, `seq`, `targetEventId`, `causalRefs`) |
| `facts` | bitemporal interval projection |
| `currentFacts` | now-projection (disposable) |
| `flowRuns` | collection capability runs / tokens / timers |
| `flowDagRuns` / `flowDagEvents` | durable workflow runs + timeline |

Function surface (`component/log.ts`):

- **Protocol log:** `appendAssert`, `appendLifecycle`, `getEvent`, `listEvents`.
- **Projections:** `listCurrent`, `getCurrentEntity`, `listCurrentEntities`,
  `rebuildProjections`.
- **Collection/forms:** `issueCollection`, `tickCollection`, `collectionByToken`,
  `submitCollection`, `listCollections`.
- **Workflow:** `recordDagRun`, `listDagRuns`, `getDagRun`.

Parity means a Cloudflare target with the equivalent storage, projections, and
function surface — backed by Durable Object SQLite instead of the Convex DB.

---

## Current state of `@metacrdt/cloudflare`

| Present | Role |
| --- | --- |
| `DurableObjectEventStore` | KV-blob event log: one `event:<id>` entry per event + an `events:index` id array |
| `DurableObjectProjectionStore` | KV-blob materialized projection-store seed for shared `ProjectionStoreService` conformance |
| `DurableObjectClock` / `DurableObjectSequencer` | persisted HLC + per-replica `seq` |
| `DurableObjectSqliteEventStore` | SQLite-backed event table over `ctx.storage.sql.exec(...)`; indexed by entity, attribute, and lifecycle target |
| `DurableObjectSqliteProjectionStore` | SQLite-backed materialized projection table; indexed by entity, attribute, and source event |
| `DurableObjectSqliteCollectionStore` | SQLite-backed collection capability rows; indexed by subject, status, and expiry |
| `DurableObjectSqliteDagStore` | SQLite-backed DAG run rows and child timeline events; indexed by subject, status, updated time, and run id |
| `DurableObjectSqliteFlowWaitTimerStore` | SQLite-backed flow-wait timer rows; indexed by run, step, status, and fire time |
| `DurableObjectSqliteClock` / `DurableObjectSqliteSequencer` | SQLite-backed HLC + per-replica `seq` metadata |
| `createDurableObjectSqliteCurrentSurface` | First component-equivalent log/current/query/collection/DAG facade: append helpers with scoped current-coordinate projection reconcile, get/list events, indexed historical bitemporal Datalog reads, projection-backed current Datalog reads, rebuild with changed `(e, a)` summaries, list current rows, read current entity, list typed current entities, issue/read/list/submit collection tokens, collection tick rows, flow-wait tick rows, record/read/list DAG runs, and terminally resume running DAG rows |
| `durableObjectSqliteIndexedHistoricalDatalogQueryService` | Cloudflare-specific historical Datalog source: reuses the shared runtime solver, scans bounded assertion candidates through SQLite `e` / `a` indexes, and checks lifecycle visibility through target-indexed rows |
| `createDurableObjectSqliteAlarmMultiplexer` | Structural single-alarm helper: arms `ctx.storage.setAlarm` to the earliest pending collection or flow-wait timer row, drains due ticks through the corresponding firing path, and re-arms or deletes the alarm |
| `DurableObjectWebSocketRelay` | version-vector hello/delta sync + event fan-out |
| `MetaCrdtRelayDurableObject` / `relayWorker` | Worker/DO example shell |

This is now the sync plane plus a SQL storage substrate. The KV store still
linearly loads ids and filters in memory; the SQLite store adds targeted event
and projection indexes, including lifecycle `target` lookup, plus a first
current-state, collection-token, and indexed historical-query facade. It is not
yet a full queryable component-equivalent bitemporal triple store.

---

## The gap, in one sentence

Cloudflare can already **converge and persist an event log**, expose protocol
event reads, run SQL-indexed bitemporal Datalog reads for bounded historical
patterns, run
projection-backed current Datalog reads over SQLite projection rows, rebuild
SQLite-backed current projection rows, serve current entity/list reads, and
persist simple collection capability rows plus DAG run/timeline history and
flow-wait timer rows; it cannot yet expose the full historical SQL query-provider
parity/conformance surface or the full **operational flow interpreter/action**
surface.

---

## Build plan (phased; B is the keystone and goes first)

### Phase A — SQLite storage substrate *(started)*

Adopt the Durable Object **SQLite storage backend** (`ctx.storage.sql.exec(...)`,
synchronous, transactional within the DO). Add a `SqlEventStore` implementing the
existing `@metacrdt/runtime` `EventStore` interface, so the relay keeps working
unchanged. Define a SQL schema mirroring `component/schema.ts`.

**Shipped seed:** `DurableObjectSqliteEventStore`,
`DurableObjectSqliteProjectionStore`, `DurableObjectSqliteClock`, and
`DurableObjectSqliteSequencer` over structural `sql.exec`, exported through
`createDurableObjectSqliteRuntime` / `createDurableObjectSqliteRuntimeLayer`.
The seed owns `events`, `projection`, and `meta` tables with entity/attribute
and lifecycle-target indexes and passes shared runtime, projection-store, and
restart-persistence conformance.

**Still ahead for parity:** SQL schema mirroring the component-owned surface:
`transactions`, `fact_events`, `facts`, `current_facts`, plus indexes replacing
Convex `.index(...)`: `by_e`, `by_e_a_txTime`, `by_eventId`, `by_a_v`,
`by_assertedAt`, etc. The current seed is runtime-service substrate, not the
full component-equivalent table/function surface.

### Phase B — Extract the shared fold/reconcile into core *(do this first)*

This is the correctness keystone. The whole MetaCRDT claim is that **every target
converges to the same projection** — which is only true if every target runs the
*same* fold and the *same* `≺`-reconcile. If Cloudflare reimplements them, the
two targets will eventually disagree on an edge case and the convergence
guarantee is false.

So pull the pure logic out of `@metacrdt/convex` — `foldEventsForFactProjection`,
`isFactVisible`, `valueKey`, `reconcileCardinalityOneCandidates` — into
`@metacrdt/core` (or a new `@metacrdt/target-kit`), operating on plain
`{ e, a, v, validFrom, validTo, ... }` rows. Then both `convex` and `cloudflare`
import identical code. This honors the architecture rule: *core owns the
convergence guarantee; targets only swap I/O.*

### Phase C — Reimplement the log surface against SQLite *(started)*

Port `log.ts`'s function surface to Durable Object methods (RPC entrypoints):
`appendAssert`, `appendLifecycle`, `getEvent`, `listEvents`, `listCurrent`,
`getCurrentEntity`, `listCurrentEntities`, `rebuildProjections`. A DO is
single-threaded, so writes get **serializable transactions for free** — simpler
than Convex's optimistic concurrency. `rebuildProjections` ports almost verbatim:
truncate projections, replay `fact_events` ordered by `≺`. Cardinality-one
reconcile reuses the Phase B helper.

**Shipped seed:** `createDurableObjectSqliteCurrentSurface` wraps the SQLite
runtime with `appendAssert` / `appendLifecycle` helpers that reconcile only the
touched current projection coordinate,
`getEvent`, `listEvents`, `rebuildCurrent`, `listCurrent`, `getCurrentEntity`,
`listCurrentEntities`, the indexed historical `DatalogQueryService`
methods (`query`, `page`, `aggregate`, `derivedRows`), and the
projection-backed current methods (`queryCurrent`, `pageCurrent`,
`aggregateCurrent`, `derivedRowsCurrent`). It reads protocol events from the
SQLite event table, rebuilds the neutral `ProjectionStoreService` rows from the
protocol log using shared `@metacrdt/runtime` / `@metacrdt/core` fold semantics,
serves current reads from the SQLite projection table, routes bitemporal Datalog
reads through a Cloudflare-specific indexed historical Datalog source that still
uses the shared runtime solver and core visibility semantics, and routes current
Datalog reads through runtime's projection-backed query provider over those
SQLite projection rows. The indexed historical provider avoids unrelated full
event-table scans for bounded patterns by fetching assertion candidates through
SQLite `e` / `a` filters and lifecycle rows through the `target` index.
`rebuildCurrent` returns a deterministic `changed`
summary of touched `(e, a)` coordinates with before/after event ids; append and
lifecycle helpers surface the same change result from their scoped coordinate
reconcile. The scoped reconcile folds only matching `(e, a)` assertions plus
lifecycle events discovered through the SQLite `target` index. Explicit
`rebuildCurrent` remains the full truncate/replay recovery path.

**Still ahead for parity:** richer append function surface, full SQL-indexed
query-provider parity/conformance for historical bitemporal queries, live
invalidation fanout, and the full flow interpreter/action-execution surface.

### Phase D — Operational surface + alarms

Port `flowRuns` / `flowDagRuns` / `flowDagEvents` and the collection/DAG
functions. Collection rows, timer rows, DAG history rows, flow-wait alarm
wakeups, and terminal DAG resume decisions have started; full flow
interpreter/action execution remains. Map **Convex scheduler → Durable
Object `setAlarm()`**. Caveat: a DO has a single alarm, but the operational
layer has reminder + escalation + expiry + flow-wait timers — so introduce a
`timers` table and set
`next alarm = MIN(fire_at)`, re-arming on each wake.

**Shipped seed:** Cloudflare DO SQLite now owns a `collections` table with
deterministic caller-provided tokens, `subject`, `form`, `status`
(`issued` / `submitted` / `expired`), issue/expiry/submission timestamps,
submitted payload JSON, and optional `runId` / `stepId` / `scope`. The current
facade exposes `issueCollection`, `collectionByToken`, `listCollections`, and
`submitCollection`. `submitCollection` persists submitted payload/status and
intentionally rejects already-submitted or expired tokens, marking late tokens as
`expired`. It also accepts optional submitted assertions, appends them as
protocol events for the collection subject through the existing append/reconcile
path, and returns event/projection summaries for those lowered assertions.
Cloudflare DO SQLite also now owns a `timers` table for collection
reminder/escalation/expiry ticks. The current facade exposes
`scheduleCollectionTick`, `collectionTickById`, `listCollectionTicks`, and
`fireCollectionTick`; firing a pending tick updates bounded operational
collection timestamps, expires still-issued collections, or records a skipped
tick after submission/expiry. This is timer row execution only, not DO alarm
multiplexing. Cloudflare DO SQLite also now owns `flow_dag_runs` and
`flow_dag_events` tables for component-style DAG process history. The current
facade exposes `recordDagRun`, `getDagRun`, `listDagRuns`, and `resumeDagRun`;
new run and timeline ids are caller-provided, while calls without `runId` can
reuse the newest active run for the same `(subject, flowDefName)`. `listDagRuns`
can filter by `flowDefName`, and `resumeDagRun` records caller-provided
terminal `completed` / `unsupported` decisions for existing `running` rows with
caller-provided timeline events. The package also
exports `createDurableObjectSqliteAlarmMultiplexer`, which maps the single DO
alarm to the earliest pending collection or flow-wait timer row, drains due
collection ticks through `fireCollectionTick`, drains due flow-wait ticks through
`fireFlowWaitTick`, and re-arms or deletes the host alarm. Flow-wait tick firing
records a deterministic `timer` / `flow-wait` DAG timeline event using a
caller-provided event id and moves a still-waiting run back to `running`; it does
not execute flow steps or actions.

**Still ahead for Phase D parity:** full flow interpreter/action execution and
WebSocket live-query fanout.

### Phase E — Sharding + real multi-replica sync

Decide the unit of a DO:

- **One DO per graph/tenant** (recommended default): matches single-writer
  convergence, transactionally simple, fits the per-DO SQLite size ceiling.
- **Many DOs syncing via the relay:** wire `SqlEventStore.append` into the
  existing `relay.ts` version-vector fan-out so cross-DO anti-entropy converges.

This is where Cloudflare can **exceed** Convex: genuine multi-replica P2P
convergence, which the centralized Convex target only simulates.

---

## Stretch goal — live frontend queries over DO WebSockets

**Not an initial requirement. The architecture must not preclude it, and should
trend toward it.**

Convex queries are reactive: the frontend subscribes and the server pushes
updates. Durable Object SQLite is not reactive natively. The eventual goal is the
same developer experience on the Cloudflare target — a frontend that subscribes
to a query and sees live results — delivered over the **Durable Object WebSocket**
connection the relay already owns.

### Design constraints to honor now (so the stretch goal stays reachable)

1. **Single write path through the DO.** Every projection mutation flows through
   the same DO methods, so there is one place to emit change notifications later.
   Do not let any code path mutate `facts` / `current_facts` outside those
   methods.
2. **Make writes describe what changed.** `appendAssert` / `appendLifecycle` /
   `rebuildCurrent` now return the set of `(e, a)` coordinates whose current
   projection changed, with before/after event ids. A live query can be indexed
   by it — it is the invalidation key for live queries. Append/lifecycle writes
   now update the materialized current projection by replacing the touched
   coordinate through `ProjectionStoreService.replaceMatching`; explicit
   `rebuildCurrent` still full-rebuilds for recovery. Emitting those summaries to
   WebSocket subscribers is still future transport work.
3. **Reuse the relay socket, don't add a second channel.** The
   `DurableObjectWebSocketRelay` already manages connections and fan-out for
   replica sync. Live-query subscriptions are the same socket carrying a second
   message type (`subscribe(query)` / `invalidate(coords)` / `result(rows)`),
   not a new transport.
4. **Keep queries pure and re-runnable.** Lean on `@metacrdt/query`: a live query
   is just a stored `where`/`select` re-evaluated against the SQL triple source
   when its coordinates invalidate. Determinism here is what makes push-on-change
   correct.

### Likely shape when it lands

```
client subscribes ──ws──▶ DO registers (connectionId → query)
DO write touches (e,a) ──▶ match against registered queries
                        ──▶ re-run affected query via @metacrdt/query
                        ──ws──▶ push result/delta to subscribers
```

This mirrors the `foldkit` client story already sketched in
[docs/foldkit.md](./foldkit.md): the client is a projection, and the transport
keeps it converged.

---

## Hard decisions to settle up front

1. **Shared fold or divergence.** Phase B is non-negotiable. Do not copy-paste
   the fold/reconcile into the Cloudflare package.
2. **Value encoding & index ordering.** Convex `v.any()` gives free cross-type
   ordering; SQLite indexes are typed. Encode `v` with a **canonical, sortable**
   representation for index keys — reuse `@metacrdt/core`'s `canonicalString` /
   `canonicalBytes`, do not invent a new encoding.
3. **Transaction scope.** Serializable *within* a DO; only *eventually*
   convergent *across* DOs (via the relay). Document this boundary.
4. **Reactivity timing.** Live queries are a stretch goal, but the
   change-notification plumbing (decision constraints 1–2 above) should be built
   into Phase C so it is not a later rewrite.

---

## Sizing

The Phase B adapters (~600–800 LOC) get **shared, not rewritten**. The
Cloudflare-specific work is comparable to the existing Convex component: the
runtime-service SQLite seed and first log/current/query facade are now present;
the remaining work is full SQL-indexed query-provider parity/conformance, full
flow interpreter/action execution, and live-query fanout.
Roughly 2–4 focused sessions remain, gated on shared fold/reconcile reuse. The
live-query stretch goal is a separate later increment on top.

---

## Acceptance criteria for parity (excluding the stretch goal)

- `@metacrdt/cloudflare` exposes append/lifecycle/get/list event functions and
  `listCurrent` / `getCurrentEntity` / `rebuildProjections` over DO SQLite.
- Projections are produced by the **shared** core fold; cardinality-one uses the
  **shared** `≺`-reconcile.
- A rebuild from `fact_events` reproduces the live projection.
- Collection tokens can be issued, read, listed, and submitted over DO SQLite.
- The remaining flow execution surface runs with DO alarms.
- Cross-DO writes converge through the existing relay.
- A convergence test proves a Cloudflare replica and a Convex/memory replica fold
  the same event set to the same projection.
