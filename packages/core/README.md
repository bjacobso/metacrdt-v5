# @metacrdt/core

The pure, deterministic, dependency-free convergence kernel — the module every
MetaCRDT runtime embeds so that all replicas agree. It implements SPEC §4–5: the
event model, content addressing, the `≺` total order, the grow-only-set log, and
the bitemporal fold.

This is the first extracted package and the foundation every other package
either builds on or targets.

## What Core Owns

- **Hashing & encoding** — `sha256`, `base32`, and canonical value encoding
  (`canonicalString`, `canonicalBytes`, `utf8`) so identical facts hash
  identically on every target.
- **Hybrid Logical Clocks** — `Hlc`, `tick`, `receive`, `compareHlc`,
  `initialClock` (SPEC §4.2).
- **Events** — immutable, content-addressed `Event`s (`assert`, `retract`,
  `tombstone`, `untombstone`), construction via `seal`/`eventId`, and
  `verifyId` (SPEC §3–4).
- **Order** — the `≺` total order over events (`precedes`, `compareEvents`,
  `maxByOrder`): `hlc → actorId → eventId` (SPEC §5.1).
- **Log** — the grow-only-set event log and its merge (`emptyLog`, `fromEvents`,
  `add`, `merge`, `events`, `has`): commutative, associative, idempotent.
- **Fold** — the deterministic bitemporal visibility predicate and projection
  helpers (`visible`, `visibleAsserts`, `value`, `valueOf`, `entity`),
  including cardinality-one resolution by `≺`-max (SPEC §5.2–5.3).

## What Core Does Not Own

- Storage, persistence, or indexes — those belong to **targets**
  (`@metacrdt/convex`, `@metacrdt/cloudflare`, `@metacrdt/local`).
- Datalog, rules, or derivation — that is `@metacrdt/query`.
- Schema conventions — that is `@metacrdt/schema`.
- Sync transport, schedulers, and service wiring — that is `@metacrdt/runtime`.
- Any I/O, ambient clocks, or randomness. `Date.now()` and `Math.random()` are
  forbidden here: HLC functions take wall-clock time as a parameter so that
  every function is a pure fold, identical on every V8 target.

## Dependencies

None. This package is intentionally dependency-free.

## Relation to SPEC

Core is the normative implementation of [SPEC.md](../../SPEC.md) §4 (events, ids,
clocks) and §5 (order, merge, bitemporal fold). If the SPEC and this package
disagree, that is a bug in one of them — the convergence guarantees the rest of
the monorepo claims rest entirely on this module being correct.

## Usage

```ts
import { assert, seal, merge, fromEvents, visible } from "@metacrdt/core";
```

## Tests

`pnpm --filter @metacrdt/core test` proves the CRDT merge laws, content
addressing, fold determinism under insertion-order shuffle, cardinality-one
supersession by `≺`-max, and the bitemporal visibility quadrants.
