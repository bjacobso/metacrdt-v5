# Cloudflare SQL Query Hardening

## Status

The Cloudflare indexed historical Datalog provider has broad seed coverage for
joins, `or`, `not`, compare/compute, pagination, aggregation, derived rows,
lifecycle visibility, and bounded SQLite scans. This spec tracks the remaining
performance and parity hardening before calling the SQL provider complete.

## Remaining Slices

### 1. Missing Query Shape Inventory

Objective: compare runtime/query conformance expectations against the
Cloudflare indexed source and document any missing shapes.

Deliverables:
- Checklist of query constructs covered by shared testkit and Cloudflare tests.
- Explicit list of missing shapes or a documented no-gap finding.

### 2. Scan Bound Tightening

Objective: reduce accidental full-log scans for query shapes that can use
available `e`, `a`, `(e, a)`, or `target` indexes.

Deliverables:
- Tests using fake SQLite scan counters.
- Provider changes only where tests prove a narrower scan path.

### 3. Lifecycle Visibility Stress Coverage

Objective: harden target-indexed lifecycle lookup under mixed assert/retract /
tombstone histories.

Deliverables:
- Tests for multiple targets, overlapping valid times, and lifecycle events on
  unrelated coordinates.
- No changes to `@metacrdt/core` fold semantics.

## Non-Goals

- Do not create `@metacrdt/sql` until a second real SQL consumer needs the same
  relational triple-store query generation.
- Do not replace the shared runtime solver.
