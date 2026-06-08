# @metacrdt/runtime

The target-neutral runtime harness for MetaCRDT. It defines the service
interfaces a runtime must provide to host the protocol, supplies operation/sync
helpers over `@metacrdt/core`, and ships an in-memory target plus
browser-oriented seeds used to prove multi-runtime convergence before any durable
transport exists.

## What Runtime Owns

- **Service contracts** — `EventStore`, `RuntimeClock`, `RuntimeSequencer`,
  `Scheduler`, `Transport`, `RuntimeServices`, plus capability/profile metadata
  (`RuntimeCapability`, `RuntimeProfile`) and operation types (`Operation`,
  `AssertOperation`, `TargetOperation`, `ScheduledOperation`, `AppendResult`,
  `MergeResult`, `VersionVector`, `Actor`, `EventFilter`).
- **Operation helpers** — `applyOperation`, `mergeFrom`, `requireCapability`.
- **Anti-entropy / sync** — `versionVector`, `deltaSince`, `mergeVersionVectors`,
  `exchangeDeltas` (`SyncDelta`, `SyncExchangeResult`): version-vector exchange
  that converges idempotently (SPEC §8 shape).
- **In-memory target** — `createMemoryRuntime` with `MemoryEventStore`,
  `MemoryClock`, `MemorySequencer`, `MemoryScheduler`, `MemoryTransport`: the
  reference harness for convergence tests.
- **localStorage seed** — `createLocalRuntime` with `LocalEventStore`,
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

## Relation to SPEC

Runtime is the harness for SPEC §8 (anti-entropy sync) and the service boundary
targets implement. The memory target proves G-Set exchange convergence and
version-vector anti-entropy without committing to any storage or network.

## Usage

```ts
import { createMemoryRuntime, exchangeDeltas, versionVector } from "@metacrdt/runtime";
```

## Status

In-memory, localStorage, BroadcastChannel, and p2p DataChannel paths are shipped.
It does not yet own Convex bindings or durable network transport — those live in
the target packages.
