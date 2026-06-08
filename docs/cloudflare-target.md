# Cloudflare target — Durable Object + SQLite triple store

**Status:** Draft proposal
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
real operational triple store. `@metacrdt/cloudflare` today implements only the
**sync plane** — a convergent event log over Durable Object KV storage, plus a
WebSocket relay and a Worker shell. It has no projections, no indexed triple
queries, no bitemporal fold-on-read, no cardinality-one resolution, no rebuild,
and none of the operational (collection/flow) surface.

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
| `DurableObjectClock` / `DurableObjectSequencer` | persisted HLC + per-replica `seq` |
| `DurableObjectWebSocketRelay` | version-vector hello/delta sync + event fan-out |
| `MetaCrdtRelayDurableObject` / `relayWorker` | Worker/DO example shell |

This is the sync plane: a convergent log + transport. `scan()` linearly loads
every id and filters in memory — correct, but not a queryable triple store.

---

## The gap, in one sentence

Cloudflare can already **converge an event log**; it cannot yet **project, index,
or query that log as a bitemporal triple store**, nor run the operational
collection/flow surface.

---

## Build plan (phased; B is the keystone and goes first)

### Phase A — SQLite storage substrate

Adopt the Durable Object **SQLite storage backend** (`ctx.storage.sql.exec(...)`,
synchronous, transactional within the DO). Add a `SqlEventStore` implementing the
existing `@metacrdt/runtime` `EventStore` interface, so the relay keeps working
unchanged. Define a SQL schema mirroring `component/schema.ts`:

- `transactions`, `fact_events`, `facts`, `current_facts`.
- SQL indexes replace Convex `.index(...)`: `by_e`, `by_e_a_txTime`,
  `by_eventId`, `by_a_v`, `by_assertedAt`, etc.

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

### Phase C — Reimplement the log surface against SQLite

Port `log.ts`'s function surface to Durable Object methods (RPC entrypoints):
`appendAssert`, `appendLifecycle`, `getEvent`, `listEvents`, `listCurrent`,
`getCurrentEntity`, `listCurrentEntities`, `rebuildProjections`. A DO is
single-threaded, so writes get **serializable transactions for free** — simpler
than Convex's optimistic concurrency. `rebuildProjections` ports almost verbatim:
truncate projections, replay `fact_events` ordered by `≺`. Cardinality-one
reconcile reuses the Phase B helper.

### Phase D — Operational surface + alarms

Port `flowRuns` / `flowDagRuns` / `flowDagEvents` and the collection/DAG
functions. Map **Convex scheduler → Durable Object `setAlarm()`**. Caveat: a DO
has a single alarm, but the operational layer has reminder + escalation + expiry
+ flow-wait timers — so introduce a `timers` table and set
`next alarm = MIN(fire_at)`, re-arming on each wake.

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
   reconcile should be able to return (or emit) the set of `(e, a)` coordinates
   they touched. Phase C should thread this through even before anything consumes
   it — it is the invalidation key for live queries.
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
Cloudflare-specific work is comparable to the existing Convex component: a SQL
schema + migration, a ~1000–1500 LOC SQL-backed log surface, and the
alarm-multiplexing layer. Roughly 2–4 focused sessions, gated on Phase B landing
first. The live-query stretch goal is a separate later increment on top.

---

## Acceptance criteria for parity (excluding the stretch goal)

- `@metacrdt/cloudflare` exposes append/lifecycle/get/list event functions and
  `listCurrent` / `getCurrentEntity` / `rebuildProjections` over DO SQLite.
- Projections are produced by the **shared** core fold; cardinality-one uses the
  **shared** `≺`-reconcile.
- A rebuild from `fact_events` reproduces the live projection.
- The collection/flow surface runs with DO alarms.
- Cross-DO writes converge through the existing relay.
- A convergence test proves a Cloudflare replica and a Convex/memory replica fold
  the same event set to the same projection.
