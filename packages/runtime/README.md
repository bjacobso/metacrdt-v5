# @metacrdt/runtime

The target-neutral runtime harness for MetaCRDT. It defines the service
interfaces a runtime must provide to host the protocol, supplies operation/sync
helpers over `@metacrdt/core`, and ships an in-memory target plus
browser-oriented seeds used to prove multi-runtime convergence before any durable
transport exists.

## What Runtime Owns

- **Effect service contracts** — `EventStoreService`, `RuntimeClockService`,
  `RuntimeSequencerService`, `SchedulerService`, `TransportService`, and
  `RuntimeProfileService` as `Context.Tag`s, with `Layer` helpers for adapting
  target-provided stores/clocks/sequencers/schedulers/transports. This is the
  canonical runtime boundary (SPEC §1.2).
- **Compatibility service shapes** — `EventStore`, `RuntimeClock`,
  `RuntimeSequencer`, `Scheduler`, `Transport`, `RuntimeServices`, plus
  capability/profile metadata (`RuntimeCapability`, `RuntimeProfile`) and
  operation types (`Operation`, `AssertOperation`, `TargetOperation`,
  `ScheduledOperation`, `AppendResult`, `MergeResult`, `VersionVector`, `Actor`,
  `EventFilter`). These keep already-shipped targets green while they migrate to
  Layer providers.
- **Operation helpers** — Effect-native `applyOperationEffect`,
  `mergeFromEffect`, and `requireCapabilityEffect` over the service tags, plus
  compatibility `applyOperation`, `mergeFrom`, `requireCapability` wrappers over
  `RuntimeServices`.
- **Anti-entropy / sync** — `versionVector`, `deltaSince`, `mergeVersionVectors`,
  `exchangeDeltas` (`SyncDelta`, `SyncExchangeResult`): version-vector exchange
  that converges idempotently (SPEC §8 shape).
- **In-memory target** — `createMemoryRuntimeLayer` for the Effect service
  boundary, plus compatibility `createMemoryRuntime` with `MemoryEventStore`,
  `MemoryClock`, `MemorySequencer`, `MemoryScheduler`, `MemoryTransport`: the
  reference harness for convergence tests.
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
- `effect` v3 (`^3.21.3`). Effect v4 is intentionally held until Confect ships a
  v4-compatible release.

## Relation to SPEC

Runtime is the harness for SPEC §8 (anti-entropy sync) and the Effect service
boundary targets implement per SPEC §1.2. The memory target proves G-Set
exchange convergence and version-vector anti-entropy without committing to any
storage or network.

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

## Status

The Effect service/tag boundary plus memory and localStorage Layers are shipped.
BroadcastChannel and p2p DataChannel compatibility paths are also shipped. Node,
local, and Cloudflare target packages now expose their own runtime Layers;
`@metacrdt/testkit` conformance runs over layer-provided targets while
compatibility `RuntimeServices` facades remain for older callers.
