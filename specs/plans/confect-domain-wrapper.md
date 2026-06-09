# Confect Domain Wrapper

## Status

The repo has shipped narrow Confect/Effect sidecars for selected read-only
domains without moving protocol writes behind Confect. This spec tracks future
domain wrappers under the same constraint.

## Candidate Slices

### 1. Stable Read/Planning Domain

Objective: choose one bounded read or planning domain with stable inputs,
outputs, and error cases.

Selection criteria:
- Uses existing protocol-shaped event-log reads.
- Does not require moving writes behind Confect.
- Has a small public schema and clear tagged errors.

### 2. Effect Schema Boundary

Objective: expose the chosen domain through `effect/Schema` inputs and outputs.

Deliverables:
- Schemas in the smallest appropriate package/module.
- Tagged errors in the Effect error channel.
- Tests for success and typed failures.

### 3. Host Integration

Objective: route one existing host read path through the wrapper if it reduces
duplication or clarifies semantics.

Deliverables:
- Narrow integration.
- Projection-wipe or event-log-backed test if relevant.

## Non-Goals

- Do not convert `convex/` wholesale.
- Do not wrap `@metacrdt/core` deterministic folds in Effect.
- Do not introduce Effect v4 while the repo is on `effect@3`.
