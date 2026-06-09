# Cloudflare Phase D Operational Parity

## Status

Cloudflare Durable Object SQLite has shipped the operational collection,
timer/alarm, DAG timeline, action, registered-action, caller-provided flow,
SQL-indexed historical query, and live-query transport seeds through Goal 145.
This spec tracks the remaining parity work before claiming Cloudflare Phase D
operational parity.

## Shipped

- [x] Goal 123: collection capability rows and current-surface methods.
- [x] Goal 124: collection submit field-to-fact lowering.
- [x] Goal 125: collection reminder/escalation/expiry timer rows.
- [x] Goal 126: DAG run/timeline rows.
- [x] Goal 127: collection alarm multiplexing.
- [x] Goal 128: flow-wait timer rows over DO alarms.
- [x] Goal 129: SQL-indexed historical Datalog provider seed.
- [x] Goal 130: DAG resume surface seed.
- [x] Goal 142: single DAG-step execution seed.
- [x] Goal 143: caller-described action execution seed.
- [x] Goal 144: registered action lookup/execution seed.
- [x] Goal 145: caller-provided flow interpreter seed.

## Remaining Slices

### 1. Persisted Flow Definition Registry

Objective: store named flow definitions in DO SQLite and execute a registered
definition through the existing `executeFlow` interpreter.

Deliverables:
- `flow_definitions` table/store with deterministic caller-provided names.
- `upsertFlowDefinition`, `flowDefinitionByName`, and `listFlowDefinitions`.
- `executeRegisteredFlow` facade method that loads a definition and delegates to
  `executeFlow`.
- Tests for persistence across runtime recreation, filtering by subject type /
  status, disabled definitions, and execution through the existing interpreter.

Non-goals:
- No automatic resume orchestration.
- No host action invocation.
- No multi-effect action execution.

### 2. Resume Orchestration After Wakeups

Objective: continue a parked registered flow after collection submission or
flow-wait timer wake.

Deliverables:
- Resume from the parked DAG run's `currentStepId`.
- Use persisted flow definitions rather than caller-provided step arrays.
- Preserve deterministic event ids from caller-provided or stored execution
  prefixes.
- Tests for collection submit resume, timer wake resume, terminal runs, and
  missing/disabled definitions.

Non-goals:
- No host action side effects outside the structural action boundary.

### 3. Multi-Effect Configured Action Execution

Objective: let registered actions execute more than one supported effect in
order while preserving protocol-event and operational-row summaries.

Deliverables:
- Multiple assertion effects in one action.
- Optional collection-opening effect sequencing where explicitly configured.
- Clear result shape with per-effect outcomes.
- Tests for order, partial unsupported definitions, and projection summaries.

Non-goals:
- No external host invocation.

### 4. Host Action Invocation Boundary

Objective: define the Cloudflare-side host action boundary without baking in an
application framework.

Deliverables:
- Structural host action interface.
- Effect error channel for host failures.
- Tests for success, unsupported action, and failure propagation.

Non-goals:
- No provider-specific application actions in `@metacrdt/cloudflare`.

## Verification Gates

Each slice should pass:

- `pnpm typecheck`
- `pnpm build`
- relevant package tests
- `pnpm test:packages`
- `pnpm pack:packages`
- `git diff --check`
