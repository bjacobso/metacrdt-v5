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
  append-and-rebuild, `getEvent`, `listEvents`, `rebuildCurrent`, `listCurrent`,
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
  table.
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
Cloudflare SQLite API, and it passes the shared `@metacrdt/testkit` runtime,
projection-store, and restart-persistence conformance suites.

It is still not a fully optimized bitemporal triple store or a live deployment.
The first component-equivalent current-state surface exists over the SQLite
runtime, and the same facade now exposes protocol event reads (`getEvent` /
`listEvents`) plus EventStore-backed Datalog reads (`query`, `page`,
`aggregate`, `derivedRows`) plus projection-backed current Datalog reads
(`queryCurrent`, `pageCurrent`, `aggregateCurrent`, `derivedRowsCurrent`). The
remaining parity plan — full historical SQL-indexed query optimization,
collection/flow surface, alarm multiplexing, and live frontend queries over DO
WebSockets — is
[docs/cloudflare-target.md](../../docs/cloudflare-target.md).

Live Cloudflare deployment remains on the frontier; the Worker relay auth
boundary is present but not yet exercised by a production deployment (see
[TODO.md](../../TODO.md), [docs/alchemy.md](../../docs/alchemy.md)).
