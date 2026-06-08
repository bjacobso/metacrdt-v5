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
`runRuntimeConformance`, it satisfies the convergence contract those sections
define.

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

## Scope Today, and What's Next

The suite covers the **log + sync plane**: event-store semantics, anti-entropy,
and the in-log fold. It does **not yet** cover **projection conformance** —
proving that two targets fold the same events into the same *bitemporal
projection* and resolve the same cardinality-one winner through the shared
projection path. That check should be added once the fold/reconcile logic is
shared out of `@metacrdt/convex` into `@metacrdt/core` (the keystone in
[docs/cloudflare-target.md](../../docs/cloudflare-target.md) and
[docs/targets.md](../../docs/targets.md)). Until then, the cross-target guarantee
is proven for the log, not yet for the materialized triple store.
