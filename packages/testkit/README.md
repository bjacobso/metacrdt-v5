# @metacrdt/testkit

The cross-target conformance suite for MetaCRDT. MetaCRDT's central claim is
*one feature set → many targets, guaranteed to converge*. This package is how
that claim is **proven** rather than asserted: it ships reusable checks that any
target's runtime must pass, so a Convex, Cloudflare, Node, or browser replica is
verified to behave identically at the boundaries that matter.

## What Testkit Owns

- **The conformance target contract** — `RuntimeLayerConformanceTarget`
  (`createLayer`), `RuntimeFactoryOptions`, and `ConformanceReport`. A target
  package implements this once and gets the whole suite. The older
  `RuntimeConformanceTarget` (`createRuntime` / optional `disposeRuntime`) still
  works as a compatibility adapter, but new targets should provide Layers.
- **`runEventStoreConformance`** — that a target's `EventStore` is a correct
  grow-only-set log:
  - `append-idempotent` — re-appending the same event does not duplicate it.
  - `scan-filters` — `scan({ e })` / `scan({ a })` / `scan({ ids })` filter as
    specified.
  - `gset-merge-idempotent` — merging already-seen events inserts nothing.
  - `content-id-verification` — the store **rejects** events whose id does not
    match their content hash.
- **`runRuntimeConvergenceConformance`** — that two replicas of a target converge
  under anti-entropy:
  - `bidirectional-delta-exchange` — `exchangeDeltas` moves each side's events to
    the other.
  - `version-vector-convergence` — replicas end with equal event ids and matching
    version vectors.
  - `deterministic-fold-convergence` — both replicas fold the merged log to the
    same cardinality-one winner and the same cardinality-many set.
  - `idempotent-second-sync` — a second exchange sends and inserts nothing.
- **`runRuntimeConformance`** — runs both suites and returns the combined report.
- **`runRuntimePersistenceConformance`** — that a durable Layer target survives
  runtime re-creation over the same backing store:
  - `event-log-survives-recreate` — the pre-restart event remains readable.
  - `version-vector-survives-recreate` — the persisted log still yields the same
    per-replica vector.
  - `sequencer-survives-recreate` — the next append continues `seq`.
  - `hlc-survives-recreate` — the HLC resumes and advances logical time when
    wall time has not moved.
  - `post-restart-append-advances-vv` — a post-restart write advances the
    version vector.
- **`runRuntimeSchedulerConformance`** — that a Layer target's `Scheduler`
  service boundary accepts scheduled operations:
  - `scheduler-accepts-operations` — calls through `SchedulerService.after` are
    observed by the target scheduler.
  - `scheduler-preserves-delay-order` — requested delays and submission order are
    preserved at the boundary.
  - `scheduler-preserves-payloads` — operation names and payloads are preserved.
  This is intentionally **not** durable wakeup conformance; target-specific host
  schedulers still need their own execution tests.
- **`runRuntimeTransportConformance`** — that a Layer target's `Transport`
  service boundary accepts event batches:
  - `transport-accepts-batches` — calls through `TransportService.publish` are
    observed by the target transport.
  - `transport-preserves-batches` — batch boundaries are preserved.
  - `transport-preserves-event-order` — events are published in the requested
    order. This is intentionally **not** network delivery conformance;
    BroadcastChannel, p2p, WebSocket, and HTTP relay behavior still need
    transport-specific suites.
- **`runRuntimeNetworkTransportConformance`** — that a target-provided network
  harness actually delivers G-Set events between peers:
  - `network-delivers-local-events` — a local write on one started peer reaches a
    connected peer.
  - `network-catches-up-late-peer` — a peer that joins after a write announces
    its version vector and receives the missing delta.
  - `network-sync-is-idempotent` — after catch-up, a second anti-entropy
    exchange sends and inserts nothing. This proves delivery/catch-up for the
    provided harness, not production relay auth, retry policy, or host durability.

## What Testkit Does Not Own

- Protocol primitives — `@metacrdt/core`.
- Service contracts and sync algorithms — `@metacrdt/runtime`.
- Any concrete target — it imports nothing from `convex` / `cloudflare` /
  `local` / `node`; targets depend on testkit (in their tests), never the
  reverse.

## Dependencies

- `@metacrdt/core`
- `@metacrdt/runtime`
- `effect` v3 (`^3.21.3`) for Layer-provided conformance.

## Relation to SPEC

Testkit is the executable check on the guarantees the SPEC makes: §4 content
addressing (`content-id-verification`), §5 the grow-only-set merge and the
deterministic fold, and §8 version-vector anti-entropy. If a target passes
`runRuntimeConformance`, it satisfies the log/sync convergence contract those
sections define. If a durable target also passes
`runRuntimePersistenceConformance`, its log/HLC/seq state survives runtime
re-creation over the same backing store. `runRuntimeSchedulerConformance` proves
the Effect scheduler service boundary for targets that expose an observable
scheduler; it does not claim host wakeup durability.
`runRuntimeTransportConformance` proves the Effect transport publish boundary;
it does not claim peer discovery, delivery, retries, or relay semantics.
`runRuntimeNetworkTransportConformance` proves the first peer delivery and
late-join catch-up behaviors from SPEC §8 for a target-provided network harness;
relay auth, retries, and durability remain target-specific.

## Usage

A target proves itself with a few lines in its own test suite:

```ts
import { runRuntimeConformance } from "@metacrdt/testkit";
import { createMemoryRuntimeLayer } from "@metacrdt/runtime";

const report = await runRuntimeConformance({
  name: "memory",
  createLayer: ({ replicaId, wall }) =>
    createMemoryRuntimeLayer({ replicaId, wall }),
});
// report.checks lists every passed check; a failure throws with the target name.
```

`@metacrdt/cloudflare`, `@metacrdt/local`, and `@metacrdt/node` run this suite
through their Effect Layer providers in their own `conformance`/index tests.
Durable targets that preserve storage across runtime re-creation also run
`runRuntimePersistenceConformance`. Targets with observable schedulers can add
`runRuntimeSchedulerConformance`. Targets with observable transports can add
`runRuntimeTransportConformance`. Targets with observable peer/network harnesses
can add `runRuntimeNetworkTransportConformance`.

## Scope Today, and What's Next

The suite covers the **log + sync plane**, durable restart semantics, scheduler
submission, the basic transport publish boundary, and the first network-delivery
checks: event-store semantics, anti-entropy, the in-log fold, persistence of the
event log/HLC/seq across re-creation, payload-preserving scheduler submission,
event-batch preserving transport publication, and peer delivery/catch-up for the
BroadcastChannel and p2p DataChannel harnesses. It does **not yet** cover
Cloudflare relay production behavior or **projection conformance** — proving
that two targets fold the same events into the same *bitemporal projection* and
resolve the same cardinality-one winner through the shared projection path.
Projection checks should be added once the fold/reconcile logic is shared out of
`@metacrdt/convex` into `@metacrdt/core` (the keystone in
[docs/cloudflare-target.md](../../docs/cloudflare-target.md) and
[docs/targets.md](../../docs/targets.md)). Until then, the cross-target guarantee
is proven for the log, not yet for the materialized triple store.
