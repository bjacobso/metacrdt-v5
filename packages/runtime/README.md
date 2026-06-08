# @metacrdt/runtime

The target-neutral runtime harness for MetaCRDT. It defines the service
interfaces a runtime must provide to host the protocol, supplies operation/sync
helpers over `@metacrdt/core`, and ships an in-memory target plus
browser-oriented seeds used to prove multi-runtime convergence before any durable
transport exists.

## What Runtime Owns

- **Effect service contracts** — `EventStoreService`, `RuntimeClockService`,
  `ProjectionStoreService`, `DatalogQueryService`, `RuntimeSequencerService`,
  `SchedulerService`, `TransportService`, and `RuntimeProfileService` as
  `Context.Tag`s, with `Layer` helpers for adapting target-provided
  stores/projections/query engines/clocks/sequencers/schedulers/transports. This is the
  canonical runtime boundary (SPEC §1.2).
- **Compatibility service shapes** — `EventStore`, `RuntimeClock`,
  `ProjectionStore`, `RuntimeSequencer`, `Scheduler`, `Transport`,
  `RuntimeServices`, plus capability/profile metadata (`RuntimeCapability`,
  `RuntimeProfile`) and operation types (`Operation`, `AssertOperation`,
  `TargetOperation`, `ScheduledOperation`, `AppendResult`, `MergeResult`,
  `VersionVector`, `Actor`, `EventFilter`, `ProjectionRow`,
  `ProjectionFilter`). These keep already-shipped targets green while they
  migrate to Layer providers.
- **Materialized projection rows** — `projectionRowsFromLog` folds a protocol log
  into deterministic current projection rows using `@metacrdt/core` visibility
  and cardinality semantics. Targets own storage and indexing; runtime owns the
  shared row contract.
- **Datalog query service** — `DatalogQueryService` exposes
  Effect/Schema-validated `query`, `page`, `aggregate`, and `derivedRows`
  operations over a target's `EventStoreService`, using the pure
  `@metacrdt/query` planner and row helpers. The default Layer is
  EventStore-backed. `projectionDatalogQueryLayer()` provides the same service
  contract over a target's materialized `ProjectionStoreService` rows for
  current-state query surfaces; target-optimized providers should preserve the
  same API and result semantics.
- **Operation helpers** — Effect-native `applyOperationEffect`,
  `mergeFromEffect`, and `requireCapabilityEffect` over the service tags, plus
  compatibility `applyOperation`, `mergeFrom`, `requireCapability` wrappers over
  `RuntimeServices`.
- **Anti-entropy / sync** — `versionVector`, `deltaSince`, `mergeVersionVectors`,
  `exchangeDeltas` (`SyncDelta`, `SyncExchangeResult`): version-vector exchange
  that converges idempotently (SPEC §8 shape).
- **In-memory target** — `createMemoryRuntimeLayer` for the Effect service
  boundary, plus compatibility `createMemoryRuntime` with `MemoryEventStore`,
  `MemoryProjectionStore`, `MemoryClock`, `MemorySequencer`, `MemoryScheduler`,
  `MemoryTransport`: the reference harness for convergence and projection-store
  tests.
- **localStorage seed** — `createLocalRuntimeLayer` for the Effect service
  boundary, plus compatibility `createLocalRuntime` with `LocalEventStore`,
  `LocalClock`, `LocalSequencer` and the local event/value encode/decode + key
  helpers. This is the shared primitive `@metacrdt/local` composes rather than
  duplicates.
- **Transports** — `BroadcastChannelTransport` / `attachBroadcastTransport`
  (same-origin browser anti-entropy) and `PeerDataChannelTransport` /
  `attachPeerDataChannelTransport` (structural WebRTC/DataChannel gossip).

## What Runtime Does Not Own

- The protocol primitives themselves — events, ids, order, and fold are
  `@metacrdt/core`.
- Concrete durable persistence or production transport — those are **targets**
  (`@metacrdt/convex`, `@metacrdt/cloudflare`, `@metacrdt/local`, future
  `@metacrdt/node`).
- Feature semantics (schema, query, workflow, forms).

## Dependencies

- `@metacrdt/core`
- `@metacrdt/query`
- `effect` v3 (`^3.21.3`). Effect v4 is intentionally held until Confect ships a
  v4-compatible release.

## Relation to SPEC

Runtime is the harness for SPEC §8 (anti-entropy sync) and the Effect service
boundary targets implement per SPEC §1.2. The memory target proves G-Set
exchange convergence and version-vector anti-entropy without committing to any
durable storage or network. `ProjectionStoreService` starts the materialized
read-model boundary: projection rows are still deterministic folds of the log,
but target adapters can persist, index, and coordinate-scope replace them behind
a shared service (`replaceMatching`) without changing fold semantics.
`DatalogQueryService` is the runtime query boundary for SPEC §6-style
deterministic query/derivation helpers: target adapters provide event access,
runtime owns the service contract, and `@metacrdt/query` owns pure planning and
row semantics.

## Usage

```ts
import { Effect } from "effect";
import {
  EventStoreService,
  applyOperationEffect,
  createMemoryRuntimeLayer,
} from "@metacrdt/runtime";

const program = Effect.gen(function* () {
  const event = yield* applyOperationEffect({
    op: "assert",
    e: "worker:maria",
    a: "worker.status",
    v: "active",
    actor: "user:1",
  });
  const store = yield* EventStoreService;
  return { event, events: yield* store.scan() };
});

const result = await Effect.runPromise(
  Effect.provide(
    program,
    createMemoryRuntimeLayer({ replicaId: "node:example" }),
  ),
);
```

```ts
import { Effect, Layer } from "effect";
import {
  DatalogQueryService,
  createMemoryRuntimeLayer,
  datalogQueryLayer,
} from "@metacrdt/runtime";

const queryProgram = Effect.gen(function* () {
  const datalog = yield* DatalogQueryService;
  return yield* datalog.query({
    where: [["?e", "worker.status", "active"]],
    select: ["?e"],
    coord: { txTime: 10_000, validTime: 10_000 },
  });
});

const queryResult = await Effect.runPromise(
  Effect.provide(
    queryProgram,
    Layer.provideMerge(
      createMemoryRuntimeLayer({ replicaId: "node:example" }),
    )(datalogQueryLayer()),
  ),
);
```

## Status

The Effect service/tag boundary plus memory and localStorage Layers are shipped.
The memory and localStorage Layers now provide `ProjectionStoreService`, and
`datalogQueryLayer()` provides the default EventStore-backed
`DatalogQueryService`; `projectionDatalogQueryLayer()` provides the same query
API over materialized projection rows for current-state providers. BroadcastChannel
and p2p DataChannel compatibility paths are also shipped. Node, local, and
Cloudflare target packages expose their own runtime Layers and projection stores,
and the Convex component target exposes a component-owned `projectionRows` read
model through `ProjectionStoreService`.
`@metacrdt/testkit` conformance runs over Layer-provided targets while
compatibility `RuntimeServices` facades remain for older callers.
