# @metacrdt/local

The browser / local-first target for MetaCRDT. It composes the runtime's durable
storage seeds with BroadcastChannel anti-entropy and supplies browser defaults
and lifecycle ergonomics, so an app can run a converging replica entirely in the
client.

A target binds the protocol to a host. The convergence semantics live in
`@metacrdt/core`, and the storage/transport primitives live in
`@metacrdt/runtime`; this package is intentionally thin glue over them.

## What Local Owns

- **Runtime composition** — `createLocalFirstRuntime` /
  `createLocalFirstRuntimeLayer` / `startLocalFirstRuntime`
  (`LocalFirstRuntime`, `LocalFirstRuntimeOptions`): wires a localStorage runtime
  to a BroadcastChannel transport with sensible browser defaults, Effect Layer
  provisioning, and `start`/`stop` lifecycle.
- **Browser defaults** — `browserStorage` and `browserBroadcastChannel`, which
  resolve `globalThis.localStorage` / `BroadcastChannel` and throw helpfully when
  absent (tests/non-browser hosts pass `storage` / `channel` explicitly).
- **Async persistence** — `createAsyncLocalRuntime` with `AsyncLocalEventStore` /
  `AsyncLocalClock` / `AsyncLocalSequencer`, plus `createAsyncLocalRuntimeLayer`
  and the IndexedDB / SQLite flavors:
  `createIndexedDbLocalFirstRuntime` / `createIndexedDbLocalFirstRuntimeLayer` /
  `startIndexedDbLocalFirstRuntime` and `createSqliteLocalFirstRuntime` /
  `createSqliteLocalFirstRuntimeLayer` / `startSqliteLocalFirstRuntime`.
- **Storage adapters** — `IndexedDbRuntimeStorage` / `indexedDbStorage` and a
  dependency-free structural `SqliteRuntimeStorage` / `sqliteStorage`
  (`SqliteDatabaseLike`, `SqliteStatementLike`).
- **Re-exports** — the localStorage seeds and BroadcastChannel transport from
  `@metacrdt/runtime`, so consumers import a single local-first surface.

## What Local Does Not Own

- Protocol primitives — `@metacrdt/core`.
- The durable event-log/HLC/seq encoding and the BroadcastChannel protocol logic
  themselves — those are `@metacrdt/runtime`; this package supplies defaults and
  lifecycle, not the primitives.
- Feature semantics (schema, query, workflow, forms).
- Convex, Cloudflare, or Node bindings.

## Dependencies

- `@metacrdt/core`
- `@metacrdt/runtime`
- `effect` v3 (`^3.21.3`) for Layer providers.

## Relation to SPEC

A local-first replica is a full SPEC participant: it keeps a durable event log,
ticks an HLC, stamps per-replica `seq`, and runs SPEC §8 version-vector
anti-entropy with same-origin peers over BroadcastChannel — converging to the
same projections as server targets, and surviving restart.
The async local runtime passes the shared `@metacrdt/testkit` EventStore /
anti-entropy / deterministic-fold conformance suite through its Effect Layer
provider. The localStorage, async, IndexedDB, and SQLite-compatible targets also
have direct Layer smoke tests through `applyOperationEffect`.

## Usage

```ts
import { startLocalFirstRuntime } from "@metacrdt/local";

const runtime = await startLocalFirstRuntime({ name: "tab" });
```

Effect-native hosts can provide local targets as Layers:

```ts
import { createLocalFirstRuntimeLayer } from "@metacrdt/local";

const layer = createLocalFirstRuntimeLayer({
  replicaId: "browser:tab",
  storage,
  broadcast: false,
});
```

In non-browser hosts pass `storage` and `channel` explicitly, or use the
IndexedDB / SQLite runtime factories.
