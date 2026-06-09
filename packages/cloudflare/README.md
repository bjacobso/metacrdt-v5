# @metacrdt/cloudflare

The Cloudflare target for MetaCRDT. It binds the runtime service contracts to
Durable Object storage and provides a WebSocket relay shell for anti-entropy sync
and event fan-out between replicas.

A target binds the protocol to a host. The convergence semantics live in
`@metacrdt/core`; the service contracts live in `@metacrdt/runtime`; this package
implements them on Cloudflare.

## What Cloudflare Owns

- **Durable Object runtime services** — `createDurableObjectRuntime` with
  `DurableObjectEventStore`, `DurableObjectProjectionStore`,
  `DurableObjectClock`, and `DurableObjectSequencer`: a storage-backed event
  log, materialized projection store, HLC clock, and per-replica sequencer over
  a `DurableObjectStorageLike` interface. `createDurableObjectRuntimeLayer`
  exposes the same target as an Effect `Layer`.
- **Durable Object SQLite runtime services** —
  `createDurableObjectSqliteRuntime` with `DurableObjectSqliteEventStore`,
  `DurableObjectSqliteProjectionStore`, `DurableObjectSqliteClock`, and
  `DurableObjectSqliteSequencer`: the first structural SQLite-backed DO adapter
  over `ctx.storage.sql.exec(query, ...bindings)`. It uses SQL tables/indexes for
  events, projections, and HLC/seq metadata while keeping Worker types out of the
  package surface. `createDurableObjectSqliteRuntimeLayer` exposes it as an
  Effect `Layer`.
- **Durable Object SQLite current-state surface** —
  `createDurableObjectSqliteCurrentSurface` plus Effect-native helpers for
  append with scoped current-coordinate projection reconcile, `getEvent`,
  `listEvents`, `rebuildCurrent`, `listCurrent`,
  `getCurrentEntity`, `listCurrentEntities`, and the EventStore-backed
  bitemporal Datalog query methods (`query`, `page`, `aggregate`,
  `derivedRows`) plus projection-backed current query methods (`queryCurrent`,
  `pageCurrent`, `aggregateCurrent`, `derivedRowsCurrent`). The surface reads
  protocol events from the SQLite event table, rebuilds SQL projection rows from
  the protocol log with shared `@metacrdt/runtime` / `@metacrdt/core` fold
  semantics, serves current reads from the SQLite projection table, routes
  bitemporal query semantics through `@metacrdt/runtime`'s EventStore-backed
  `DatalogQueryService`, and routes current query methods through runtime's
  projection-backed `DatalogQueryService` provider over the SQLite projection
  table. `rebuildCurrent` and the append/lifecycle helpers report deterministic
  projection changes as touched `(e, a)` coordinates with before/after event ids,
  giving the future live-query transport a concrete invalidation key; append and
  lifecycle helpers replace only the touched current coordinate through
  `ProjectionStoreService.replaceMatching`, while `rebuildCurrent` remains the
  full recovery rebuild.
- **Durable Object SQLite flow-step execution seed** —
  `executeDagStep` on `createDurableObjectSqliteCurrentSurface` runs one
  caller-described `assert`, `collect`, `wait`, or `unsupported` DAG step over
  the existing append/reconcile, collection, DAG timeline, and flow-wait timer
  primitives. Assertion steps append protocol events for the subject, collect
  steps issue caller-provided collection tokens and park runs, and wait steps
  schedule caller-provided wake ticks for the alarm path. This is a structural
  single-step primitive, not a declarative DAG interpreter, configured action
  registry executor, or host action invocation layer.
- **Durable Object SQLite action execution seed** —
  `executeAction` on `createDurableObjectSqliteCurrentSurface` validates one
  caller-described action effect and delegates to the DAG-step substrate for
  protocol assertions or collection-token opening. This is an action-effect
  primitive, not configured action registry lookup, branch evaluation,
  declarative workflow interpretation, or host action invocation.
- **Durable Object SQLite registered action lookup seed** —
  `actionByName`, `listActions`, `actionsForType`, and
  `executeRegisteredAction` on `createDurableObjectSqliteCurrentSurface` read
  configured action facts from current projection rows, resolve `$entity` /
  `$arg.*` placeholders, validate `appliesTo`, and delegate one supported
  assertion or collection-opening effect through `executeAction`. This is
  registry lookup and one-effect execution only, not multi-effect configured
  action execution, branch evaluation, declarative workflow interpretation, or
  host action invocation.
- **Durable Object SQLite caller-provided flow interpreter seed** —
  `executeFlow` on `createDurableObjectSqliteCurrentSurface` interprets bounded
  caller-provided flow steps over the existing DAG/action/collection/wait
  substrate. It runs assert/notify/action steps inline, evaluates simple
  current-state branch patterns, and parks collect/wait steps with
  caller-provided operational ids. This is interpreter plumbing for supplied
  step definitions, not persisted flow definition registry lookup, automatic
  resume orchestration, multi-effect configured action execution, or host action
  invocation.
- **Durable Object SQLite live invalidation fanout** —
  `DurableObjectSqliteLiveInvalidationFanout` plus Effect/Promise publish
  helpers accept bounded `e` / `a` subscriptions over structural WebSocket
  sockets and broadcast current-projection change summaries to matching
  subscribers. This is invalidation transport, not query result caching or query
  execution.
- **Durable Object SQLite live current-query fanout** —
  `DurableObjectSqliteLiveCurrentQueryFanout` accepts bounded
  projection-backed current Datalog query subscriptions over structural
  WebSocket sockets, sends initial `query.subscribed` snapshots, and refreshes
  matching subscriptions with `query.updated` results when projection-change
  summaries overlap derived `e` / `a` dependencies. It can optionally persist
  active/closed subscription metadata through
  `DurableObjectSqliteLiveQuerySubscriptionStore`, which stores
  `live_query_subscriptions` and indexed `live_query_dependencies` rows over DO
  SQLite, and it can hydrate connected sockets from active persisted rows with
  fresh `query.subscribed` snapshots. Update messages include deterministic
  added/removed row and event-source-id diff metadata relative to the prior
  delivered snapshot; `durableObjectSqliteLiveQueryResultDiff` exposes the same
  comparison helper for callers.
- **Durable Object SQLite live-query route plumbing** —
  `createRelayWorker` forwards `/live-query/<room>` through the same token auth
  boundary as relay room routes, and
  `attachDurableObjectSqliteLiveQueryWebSocket` attaches upgraded DO requests to
  an existing `DurableObjectSqliteLiveCurrentQueryFanout`. This is
  snapshot/update, metadata persistence, structural hydration, and route attach
  plumbing, not a frontend SDK, durable client session protocol, or
  cross-reconnect diff replay.
- **Durable Object SQLite live-query DO assembly** —
  `MetaCrdtSqliteLiveQueryDurableObject` constructs the DO SQLite runtime,
  current query surface, persisted live-query registry, and structural fanout for
  upgraded current-query sockets over `ctx.storage.sql`.
- **Durable Object SQLite live-query write publishing** —
  `createRelayWorker` forwards `/write/<room>/<operation>` through the same auth
  boundary as relay and live-query routes, and
  `MetaCrdtSqliteLiveQueryDurableObject` accepts POST JSON append assert,
  append lifecycle, and collection submit routes that publish returned
  projection-change summaries through the live current-query fanout. This is
  write publish orchestration, not a frontend SDK, durable client session
  protocol, cross-reconnect diff replay, or reconnect retry policy.
- **Durable Object SQLite live-query client seed** —
  `createDurableObjectSqliteLiveQueryClient` is a dependency-free structural
  WebSocket client helper for frontend or SDK callers. It sends current-query
  subscribe/unsubscribe/hydrate messages, filters server messages by protocol,
  supports stable connection-id hydration, and can opt into bounded reconnect
  attempts. This is a client primitive, not React hooks, durable session token
  issuance, or application auth storage.
- **Durable Object SQLite live-query session helper seed** —
  `createDurableObjectSqliteLiveQuerySession` wraps the structural client with a
  caller-provided stable `connectionId`, derives the matching WebSocket URL
  query param through `durableObjectSqliteLiveQuerySessionUrl`, delegates
  hydration/reconnect behavior, and caches latest current-query snapshots by
  subscription id. This is a session primitive, not React hooks, auth storage,
  server-issued session tokens, or a full frontend SDK package.
- **WebSocket relay** — `DurableObjectWebSocketRelay` / `attachDurableObjectRelay`
  (`RelayConnection`, `RelayOptions`, `WebSocketLike`): accepts server sockets,
  answers version-vector hellos with deltas, merges client events through the
  G-Set/HLC path, and fans out accepted events.
- **Worker/DO example shell** — `MetaCrdtRelayDurableObject`, `createRelayWorker`,
  `relayWorker`, and the supporting `DurableObjectNamespaceLike` /
  `DurableObjectStateLike` / `WebSocketPairLike` shapes for wiring a Worker router
  to the relay DO. See `wrangler.example.toml` for the binding/migration.
- **Relay auth boundary** — `createRelayWorker` can enforce a shared token on
  room/WebSocket relay routes. By default it looks for `METACRDT_RELAY_TOKEN` in
  the Worker env; if the secret is present, clients must send
  `Authorization: Bearer <token>` (or a configured header/query token).

## What Cloudflare Does Not Own

- Protocol primitives — `@metacrdt/core`.
- Service interfaces and sync algorithms — `@metacrdt/runtime`.
- Feature semantics (schema, query, workflow, forms).
- Convex or local-first bindings.

## Dependencies

- `@metacrdt/core`
- `@metacrdt/query`
- `@metacrdt/runtime`
- `effect` v3 (`^3.21.3`) for Layer providers.

## Relation to SPEC

This package is a SPEC §8 anti-entropy endpoint on Cloudflare: the relay exchanges
version vectors and deltas, and merges incoming events through the same
grow-only-set / HLC path every other replica uses, so a Durable Object converges
to the same projections as any other target.

## Usage

```ts
import {
  createDurableObjectRuntime,
  createDurableObjectSqliteCurrentSurface,
  attachDurableObjectSqliteLiveQueryWebSocket,
  createDurableObjectSqliteLiveQueryClient,
  createDurableObjectSqliteLiveQuerySession,
  durableObjectSqliteLiveQueryResultDiff,
  durableObjectSqliteLiveQuerySessionUrl,
  DurableObjectSqliteLiveCurrentQueryFanout,
  DurableObjectSqliteLiveInvalidationFanout,
  MetaCrdtSqliteLiveQueryDurableObject,
  createDurableObjectRuntimeLayer,
  createDurableObjectSqliteRuntimeLayer,
  relayWorker,
} from "@metacrdt/cloudflare";
```

### Worker relay auth

For a live Worker, set a secret:

```sh
wrangler secret put METACRDT_RELAY_TOKEN
```

`createRelayWorker()` enforces the token automatically when that env var exists:

```ts
import { createRelayWorker } from "@metacrdt/cloudflare";

export { MetaCrdtRelayDurableObject } from "@metacrdt/cloudflare";
export default createRelayWorker();
```

Clients may authenticate with `Authorization: Bearer <token>`. You can also
customize the source:

```ts
export default createRelayWorker({
  auth: {
    envKey: "MY_RELAY_TOKEN",
    header: "x-metacrdt-token",
    queryParam: "relayToken",
    requireHealth: true,
  },
});
```

Use `auth: false` only when another trusted boundary already protects the Worker.
Worker `/health` is public by default so load balancers can probe it; set
`requireHealth: true` to protect health too.

## Status

This package today implements the **sync plane** and the first **Durable Object
SQLite storage substrate**. The original KV-shaped Durable Object runtime remains
for relay/storage-shell tests; the SQLite runtime is the forward path for the
full target. Both expose Effect Layers. The SQLite adapter persists the event log,
materialized projection rows, HLC, and per-replica sequence through the structural
Cloudflare SQLite API. Its event table indexes entity, attribute, and lifecycle
target ids, and it passes the shared `@metacrdt/testkit` runtime,
projection-store, and restart-persistence conformance suites.

It is still not a fully optimized bitemporal triple store or a live deployment.
The first component-equivalent current-state surface exists over the SQLite
runtime, and the same facade now exposes protocol event reads (`getEvent` /
`listEvents`) plus EventStore-backed Datalog reads (`query`, `page`,
`aggregate`, `derivedRows`) plus projection-backed current Datalog reads
(`queryCurrent`, `pageCurrent`, `aggregateCurrent`, `derivedRowsCurrent`) and
deterministic `changed` summaries for current-projection rebuilds. The indexed
historical provider has conformance-style coverage for joins, disjunction,
negation, compare/compute, pagination, aggregation, derived rows, lifecycle
visibility, and bounded SQLite scan counters. The remaining parity plan —
broader historical SQL-indexed query optimization, persisted flow registry /
resume orchestration / host action invocation parity, and full React/frontend
SDK live-query package/auth integration over DO WebSockets — is
[docs/cloudflare-target.md](../../docs/cloudflare-target.md).

Live Cloudflare deployment remains on the frontier; the Worker relay auth
boundary is present but not yet exercised by a production deployment (see
[TODO.md](../../TODO.md), [docs/alchemy.md](../../docs/alchemy.md)).
