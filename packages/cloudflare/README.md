# @metacrdt/cloudflare

The Cloudflare target for MetaCRDT. It binds the runtime service contracts to
Durable Object storage and provides a WebSocket relay shell for anti-entropy sync
and event fan-out between replicas.

A target binds the protocol to a host. The convergence semantics live in
`@metacrdt/core`; the service contracts live in `@metacrdt/runtime`; this package
implements them on Cloudflare.

## What Cloudflare Owns

- **Durable Object runtime services** — `createDurableObjectRuntime` with
  `DurableObjectEventStore`, `DurableObjectClock`, and `DurableObjectSequencer`:
  a storage-backed event log, HLC clock, and per-replica sequencer over a
  `DurableObjectStorageLike` interface.
- **WebSocket relay** — `DurableObjectWebSocketRelay` / `attachDurableObjectRelay`
  (`RelayConnection`, `RelayOptions`, `WebSocketLike`): accepts server sockets,
  answers version-vector hellos with deltas, merges client events through the
  G-Set/HLC path, and fans out accepted events.
- **Worker/DO example shell** — `MetaCrdtRelayDurableObject`, `createRelayWorker`,
  `relayWorker`, and the supporting `DurableObjectNamespaceLike` /
  `DurableObjectStateLike` / `WebSocketPairLike` shapes for wiring a Worker router
  to the relay DO. See `wrangler.example.toml` for the binding/migration.

## What Cloudflare Does Not Own

- Protocol primitives — `@metacrdt/core`.
- Service interfaces and sync algorithms — `@metacrdt/runtime`.
- Feature semantics (schema, query, workflow, forms).
- Convex or local-first bindings.

## Dependencies

- `@metacrdt/core`
- `@metacrdt/runtime`

## Relation to SPEC

This package is a SPEC §8 anti-entropy endpoint on Cloudflare: the relay exchanges
version vectors and deltas, and merges incoming events through the same
grow-only-set / HLC path every other replica uses, so a Durable Object converges
to the same projections as any other target.

## Usage

```ts
import { createDurableObjectRuntime, relayWorker } from "@metacrdt/cloudflare";
```

## Status

The runtime services, relay, and Worker/DO example are **structural** shells:
storage-backed and protocol-correct, but not yet a live deployment. Live
Cloudflare deployment and auth remain on the frontier (see
[TODO.md](../../TODO.md), [docs/alchemy.md](../../docs/alchemy.md)).
