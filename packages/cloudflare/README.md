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
  createDurableObjectRuntimeLayer,
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

This package today implements the **sync plane** — a convergent event log over
Durable Object storage, plus the relay and Worker shells. It is storage-backed
and protocol-correct, but not yet a queryable triple store or a live deployment.
Its Durable Object runtime services pass the shared `@metacrdt/testkit`
EventStore / anti-entropy / deterministic-fold conformance suite through the
Durable Object Effect Layer, plus materialized projection-store conformance
through `ProjectionStoreService`. The Layer is also smoke-tested directly
through `applyOperationEffect`.

The plan to grow it to parity with `@metacrdt/convex` — an indexed, bitemporal
triple store over Durable Object **SQLite** storage, with projections,
cardinality-one reconcile, rebuild, and the collection/flow surface — is
[docs/cloudflare-target.md](../../docs/cloudflare-target.md). That doc also tracks
**live frontend queries over DO WebSockets** as an explicit stretch goal the
architecture must not preclude.

Live Cloudflare deployment remains on the frontier; the Worker relay auth
boundary is present but not yet exercised by a production deployment (see
[TODO.md](../../TODO.md), [docs/alchemy.md](../../docs/alchemy.md)).
