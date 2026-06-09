# Anti-Entropy TLA+ Spec

## Status

Spec scaffold ready. Model checking pending.

## Goal

Model only the version-vector delta-sync protocol, not the full fold semantics.
The fold is already tested against the pure core oracle; the TLA+ value is in
proving the transport-level liveness/safety contract:

- replicas never invent events
- learned events are monotone
- duplicate/reordered delivery is idempotent
- if the network eventually delivers deltas between connected replicas, all
  replicas eventually learn the same event set

The draft module is [`AntiEntropy.tla`](./AntiEntropy.tla).

## Model Boundary

Included:

- finite replica set
- finite event set
- event origin replica and sequence number
- each replica's known event set
- version-vector summary derived from known events
- delta send based on receiver vector
- nondeterministic message delivery
- duplicate delivery and out-of-order delivery

Excluded:

- content-address verification
- hash-DAG causal traversal
- bitemporal fold semantics
- Byzantine/equivocation behavior
- partial replication and ACL filtering

Those excluded items are separate specs; keeping this module small is the point.

## State

- `known[r]`: set of events replica `r` has stored.
- `network`: multiset/sequence of in-flight delta messages.
- `Origin[e]`: origin replica for event `e`.
- `EventSeq[e]`: per-origin sequence number for event `e`.

`VersionVector(r)` is derived from `known[r]`: for each origin, the maximum
sequence known by `r`.

`Delta(sender, receiver)` contains events known by `sender` whose sequence is
greater than `receiver`'s vector entry for that event's origin.

## Actions

- `LocalAppend(r, e)`: origin replica learns its own event.
- `Send(sender, receiver)`: enqueue a delta message.
- `Deliver(i)`: merge an in-flight delta into the receiver.
- `Drop(i)`: remove an in-flight message without delivery.
- `Duplicate(i)`: add a second copy of an in-flight message.

All merge steps are set union.

## Invariants

Required safety invariants:

- `KnownSubset`: every known event is in the finite universe `Events`.
- `OriginOwnsLocalAppend`: a local append only creates events at their origin.
- `KnownMonotone`: delivery never removes known events.
- `DeltaSound`: every delivered event came from the sender's known set at send
  time.
- `MergeIdempotent`: delivering the same message twice has the same final
  `known` state as delivering it once.

## Liveness Property

Under weak fairness for `Send` and `Deliver` on every connected pair:

- `EventualConvergence`: once every origin has appended its events and the
  network remains connected, eventually every replica knows `Events`.

This liveness property should be checked under small finite models first:

- 2 replicas, 2 events
- 3 replicas, 3 events
- 3 replicas, 5 events with duplicate/drop actions enabled

## Acceptance Criteria

- TLC checks the safety invariants for the small models above.
- The liveness property is either checked directly with fairness or documented
  as a theorem obligation if TLC state space becomes impractical.
- Any future change to version-vector delta semantics updates this spec.
- The checked command and config live beside the module.

## Non-Goals

- No attempt to model all runtime targets.
- No proof of query/materializer convergence.
- No model of auth, ACLs, or Byzantine peers.
