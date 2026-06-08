# PLAN.md — MetaCRDT Execution Goal

**Current goal:** Goal 7 (schema-driven entity list/detail UI) has shipped in
the Convex reference runtime. The next product/runtime goal should be chosen
from the TODO candidates: dry-run compliance, `@metacrdt/runtime` harness
groundwork, or auth/write hardening.

This plan is the operational goal file. Read it with:

- [README.md](./README.md) — first-principles project overview
- [SPEC.md](./SPEC.md) — normative protocol
- [TODO.md](./TODO.md) — running worklog and open-item pulse
- [docs/architecture.md](./docs/architecture.md) — package/layer map
- [docs/package-consolidation.md](./docs/package-consolidation.md) — Open
  Ontology fold plan
- [docs/confect.md](./docs/confect.md) — Confect/Effect direction

When changing Convex code, read
[`convex/_generated/ai/guidelines.md`](./convex/_generated/ai/guidelines.md)
first. Those generated Convex guidelines override prior assumptions.

---

## North Star

MetaCRDT names a primitive:

> a convergent graph of facts, constraints, intentions, and effects.

The repository should make that statement true in code:

1. `@metacrdt/core` defines the pure deterministic protocol kernel.
2. The Convex reference runtime writes core-shaped events.
3. Read projections are rebuildable deterministic folds of those events.
4. Later runtime targets (Cloudflare Durable Objects, browser/local-first, Node)
   can import the same core and converge to the same projections.
5. Confect/Effect improves the Convex target's schema, error, and service
   boundaries without becoming the protocol.

The immediate technical gap is now product/runtime ergonomics: the package graph
has `core`, `convex`, and `forma`; the live config-as-code layer reconciles
owned artifacts; PII read authorization is enforced in public read projections;
and the entity UI is now driven by declared type schema, while full write
authorization and multi-runtime sync remain open.

---

## Current State

### Shipped

- `@metacrdt/core` exists in [`packages/core`](./packages/core):
  - SHA-256
  - base32 EventIds
  - canonical values
  - HLC helpers
  - immutable events
  - `≺` total order
  - G-Set log merge
  - bitemporal fold / visibility
- Core has 46 tests proving:
  - CRDT merge laws
  - content addressing
  - fold determinism under insertion-order shuffle
  - cardinality-one supersession by `≺`-max
  - bitemporal visibility quadrants
- Convex read path delegates visibility to core via
  [`convex/lib/visibility.ts`](./convex/lib/visibility.ts).
- New Convex writes stamp protocol metadata on `factEvents`:
  `eventId`, HLC, `replicaId`, `targetEventId`, and `causalRefs` where
  applicable.
- `facts.assertEventId` stores the protocol assert event id for lifecycle
  targeting.
- `correctFact` is represented in new event history as tombstone-old + assert-new
  with causal refs, not as a new core event kind.
- Cardinality-one current projection reconciles candidates by `@metacrdt/core`
  `≺` order and retracts projection losers.
- Convex backend tests are green: 70 tests at last verification.
- Frontend is a MetaCRDT research-preview UI with datarooms/compliance as the
  live elaboration.
- Open Ontology is a pinned submodule under
  [`.context/open-ontology`](./.context/open-ontology).
- `@metacrdt/convex` exists in [`packages/convex`](./packages/convex) as the
  first reusable Convex target package:
  - package-owned Convex/core event adapters
  - package-owned bitemporal visibility adapter
  - protocol metadata validators
  - event-row verification/summarization helpers used by the Confect sidecar
  - an explicit Confect sidecar warning/helper documenting the manual-mount
    lesson from Goal 2
  - package-local tests for deterministic event reconstruction and legacy
    fallback behavior
- `@metacrdt/forma` exists in [`packages/forma`](./packages/forma):
  - runtime-neutral Lisp / S-expression authoring language
  - parser, formatter, evaluator, VM, type inference, and language-owned
    elaboration utilities
  - selected Open Ontology Lisp fixtures copied into package-local tests
  - no source imports from `.context/open-ontology`
- `applyConfig` now behaves as a true section-scoped reconciler:
  - configured artifact ownership is tracked on `config:default`
  - explicitly supplied config sections compute desired sets
  - dropped owned types/attributes/forms/actions are retracted through facts
  - dropped requirements deactivate their rules and remove stale derived facts
  - dropped flows remove their definitions
  - runtime data and system/meta facts are not deleted
- Attribute-level PII read authorization exists in the Convex reference runtime:
  - form fields can carry `pii: true` / `sensitive: true`
  - the staffing blueprint marks `i9/ssn` as PII
  - readers are derived from `ctx.auth.getUserIdentity().tokenIdentifier`
  - read grants are ordinary facts on the principal (`grants.read`)
  - public entity, bitemporal, Datalog, and timeline projections omit/redact
    ungranted PII and report `Denied` markers where appropriate
- Schema-driven entity UI exists:
  - `typeSchemaAsOf` returns both the compatibility `attributes` list and richer
    `columns` with attribute definitions
  - the Entities route renders declared type columns via `queryEntities`
  - entity detail orders state by the primary type's declared schema, then appends
    extra runtime facts
  - collection forms were already rendered from form definitions

### Not Yet True

- Legacy `factEvents` may still lack core `eventId` / HLC / replica metadata.
- Convex schema still permits the legacy `correction` event kind for historical
  rows, while new corrections write protocol primitives.
- `facts` and `currentFacts` are still maintained as imperative projections,
  not folded directly from raw core-shaped events.
- `@metacrdt/convex` is adapter-first. A full Convex component surface,
  mutation factories, and cardinality-one reconcile helpers remain deferred
  until the package boundary is proven against more host-app usage.
- Multi-replica sync is specified but not implemented.
- Full app login/write authorization is not configured; unauthenticated callers
  are treated as `anonymous`, so PII is denied by default but public writes remain
  demo-grade.
- Confect is integrated as a narrow sidecar spike:
  - `confect/` defines a typed Effect Schema function group.
  - `convex/metacrdtConfect.ts` manually mounts the generated registered
    function beside the existing hand-written Convex backend.
  - `api.metacrdtConfect.verifyEvents` verifies protocol-shaped `factEvents`
    with `@metacrdt/core`.
  - The spike result is recorded in [docs/confect.md](./docs/confect.md).

---

## Goal 1 — Core-Shaped Convex Write Path

**Objective:** Convex mutations must append events shaped like MetaCRDT protocol
events, and cardinality-one semantics must use the core `≺` order.

This is the next implementation goal.

### Acceptance Criteria

- `factEvents` include enough data to reconstruct a core `Event`:
  - `eventId`
  - `kind`
  - `e`, `a`, `v`
  - `validFrom`, `validTo`
  - HLC timestamp
  - `actor`, `actorType`
  - causal references / target IDs for lifecycle events
  - replica ID and per-replica sequence where appropriate
- Event IDs are deterministic and verified with `@metacrdt/core.verifyId` or an
  equivalent adapter.
- Cardinality-one attributes choose the surviving visible value by core `≺`,
  not by write arrival order.
- Existing public behavior is preserved for normal single-writer Convex use.
- Tests cover same-coordinate / concurrent-like writes in shuffled order and
  prove the same winner.
- The current `correctFact` behavior is represented as protocol primitives:
  tombstone the old assertion and assert the replacement, linked by causal
  metadata. Any retained Convex `correction` row is compatibility/audit sugar,
  not an event that `@metacrdt/core` must understand.
- `rebuildProjections` can rebuild from the event log without hidden dependency
  on prior `facts` state.
- `npm test`, `npm run test:core`, and Convex typecheck pass.

### Design Rules

1. **Do not make Confect part of this step.**
   This goal is protocol correction, not framework migration.
2. **Keep `@metacrdt/core` dependency-free.**
   Any Convex adaptation belongs in `convex/` for now, later
   `@metacrdt/convex`.
3. **Keep projections for now.**
   `facts`, `currentFacts`, and `derivedFacts` remain read models until the fold
   path is proven and migration risk is lower.
4. **Prefer additive schema migration.**
   Add event fields; do not break existing rows before a backfill/rebuild path is
   available.
5. **Make old events readable.**
   Adapters should tolerate missing `eventId` / HLC fields for existing dev data
   until `rebuildProjections` or a migration stamps them.
6. **Treat `correction` as an operation, not a core event.**
   `correctFact` may remain a public Convex mutation, but the protocol log should
   express it as tombstone-old + assert-new with causal links. A Convex-only
   `correction` row can remain only as legacy compatibility or audit summary.
7. **Centralized Convex will not naturally exercise concurrency.**
   With one authoritative writer, HLC logical counters will usually be `0` and
   observed writes will still look sequential. `≺`-supersession is a correctness
   property we prove with tests and need for future replicas, not a user-visible
   behavior change in normal centralized operation.

### Work Breakdown

#### 1. Read Convex Guidelines

- [ ] Read `convex/_generated/ai/guidelines.md`.
- [ ] Note any generated rules that affect schema, indexes, validators, or
  scheduler usage.

#### 2. Audit Existing Write Path

- [ ] Inspect:
  - `convex/schema.ts`
  - `convex/facts.ts`
  - `convex/lib/visibility.ts`
  - `convex/internal/materialize.ts`
  - tests that assert/retract/tombstone/correct facts
- [x] Identify where each event kind is appended.
- [x] Identify where `facts` and `currentFacts` are patched.
- [x] Identify where cardinality-one supersession is decided.
- [x] Identify how `correctFact` currently records `correction` and patches
  `supersedes` / `supersededBy`, then decide which fields become causal metadata
  on the protocol tombstone/assert pair.

#### 3. Define Convex ↔ Core Adapters

Create local Convex adapters first; extract to `@metacrdt/convex` later.

- [x] Add adapter module, likely `convex/lib/coreEvent.ts`.
- [x] Implement:
  - Convex event row → core `Event`
  - core `Event` → Convex event row fields
  - transaction actor/source → core actor fields
  - timestamp → HLC fallback
  - missing legacy metadata fallback
- [x] Keep conversion deterministic and testable.

Recommended shape:

```ts
toCoreEvent(row): Event
eventBodyFromAssert(args, tx, hlc): EventBody
sealEventForConvex(body, seq): { eventId, hlc, ...rowFields }
```

#### 4. Extend Schema

- [x] Add fields to `factEvents`:
  - `eventId?: string`
  - `hlc?: { pt: number; l: number; r: string }` or flattened fields
  - `replicaId?: string`
  - `seq?: number`
  - `targetEventId?: string` / lifecycle refs if needed
  - `causes?: string[]`
- [x] Add indexes only if needed by the implementation:
  - by `eventId`
  - by `replicaId, seq` only after a real `seq` source exists
- [x] Keep old fields in place for compatibility with current tests and UI.

#### 5. Stamp New Events

- [x] In `assertFact`, build a core assert event body and seal it.
- [x] In `retractFact`, build a core retract event targeting the asserted event.
- [x] In `tombstoneFact`, build a core tombstone event.
- [x] In `correctFact`, express correction as tombstone-old + assert-new, linked
  by causal metadata.
- [x] Decide whether the existing Convex `correction` event row remains:
  - preferred: stop writing new `correction` rows once the protocol pair is in
    place, and derive "correction" for UI/audit from causal links;
  - acceptable transition: continue writing a `correction` summary row, but mark
    it Convex-only and ensure the core adapter ignores or expands it.
- [x] Preserve transaction rows and existing event semantics.

#### 6. Implement HLC / Replica Metadata

For the centralized Convex runtime, this can be minimal but protocol-shaped.

- [x] Define a stable replica ID for the deployment / runtime.
  - Initial pragmatic value can be `"convex:<deployment>"` or `"convex:dev"`.
  - Avoid reading browser/client state.
- [x] Do **not** add a global transactional counter in this phase.
  - A single counter row would serialize every write and create avoidable
    contention.
  - For the centralized Convex runtime, leave `seq` optional or derive a
    compatibility sequence from existing transaction/event ordering only for
    export/sync adapters.
  - Add a real per-replica monotonic `seq` when building the multi-replica sync
    runtime, where it can be owned by the replica/target (for example a Durable
    Object or local replica), not by one global Convex document.
- [ ] HLC physical time can start from transaction time.
- [x] HLC physical time starts from transaction time.
- [x] HLC logical component is derived from Convex transaction document
  `_creationTime`, preserving rapid same-millisecond centralized write order
  without a global counter.
- [x] Tests freeze wall-clock time to exercise `≺` conflict resolution in the
  Convex projection.

#### 7. Switch Cardinality-One Supersession

- [x] Replace "current arrival-order prior fact wins/loses" logic with a
  core-order comparison among visible candidate assertions for `(e, a)`.
- [x] Surviving value for `cardinality: "one"` is the `≺`-max visible assert.
- [x] Non-surviving visible asserts should be represented as superseded/retracted
  in the projection without pretending their events never existed.
- [x] Preserve user-facing current state for ordinary sequential writes.

Important distinction:

- The event log should keep all concurrent assertions.
- The projection chooses one current value for cardinality-one.
- The losing event remains explainable/auditable.
- In today's centralized runtime, ordinary user behavior should remain
  sequential. The point of this change is to make projection semantics
  replica-independent before a second replica exists.

#### 8. Rebuild From Event Log

- [x] Update `rebuildProjections` to prefer core-shaped events when present.
- [x] Keep compatibility with legacy event rows.
- [x] Prove rebuild produces the same `facts` / `currentFacts` result as live
  writes.
- [x] Ensure derived-rule materialization still runs from rebuilt facts.

#### 8.5. Legacy Metadata Policy

- [x] Choose and document one policy before deployment:
  - **Permanent tolerant adapter:** legacy `factEvents` without `eventId` / HLC
    remain readable forever; only new events are protocol-shaped.
  - **Backfill mutation:** add an internal one-shot/self-continuing migration that
    stamps deterministic compatibility metadata onto existing events in
    `chatty-hare-94`.
- [x] Preferred initial policy: permanent tolerant adapter. It is lower risk for
  the dev deployment, avoids rewriting audit history, and still lets all new
  writes be protocol-shaped. A backfill can be added later if sync/export needs
  every historical row stamped.

#### 9. Tests

Add focused tests before broader refactors.

- [x] Core adapter tests:
  - [x] New event rows carry metadata that reconstructs a core event whose
    `eventId` verifies.
  - [x] Legacy event row can still be adapted explicitly.
- [x] Write-path tests:
  - `assertFact` writes `eventId` and HLC metadata.
  - retract/tombstone/correct events reference the target event/fact correctly.
  - `correctFact` either emits tombstone+assert protocol events or its Convex-only
    summary row expands/ignores cleanly in the adapter.
- [x] Cardinality tests:
  - two same-coordinate cardinality-one assertions converge to the `≺`-max.
  - insertion order does not change final `currentFacts`.
  - losing assertion remains in history/provenance.
- [x] Rebuild tests:
  - live projection equals rebuilt projection.
  - derived facts still rebuild.

#### 10. Verification

Run:

```bash
npm run test:core
npm test
npx tsc --noEmit -p convex/tsconfig.json
npx tsc --noEmit -p tsconfig.json
npx convex dev --once
```

If frontend-visible behavior changes:

```bash
npm run build
npx @convex-dev/static-hosting upload
```

Then verify the live site at `chatty-hare-94`.

---

## Goal 2 — Confect Spike for the Convex Target

**Objective:** evaluate whether Confect should become the authoring/runtime style
for `@metacrdt/convex`, after core write semantics are correct.

This is the current implementation goal. It is an evaluation, not a migration.
The output should be a working sidecar slice plus a written decision.

### Why After Goal 1

Confect improves schema, service, and error boundaries. It does not define the
MetaCRDT protocol. Converting to Confect before the write path is protocol-shaped
would move complexity sideways while preserving the central correctness gap.

Goal 1 is now shipped: new writes carry protocol metadata, corrections expand to
tombstone+assert protocol events, cardinality-one projection uses core `≺`, and
`rebuildProjections` prefers protocol order. That makes Confect a framework
question rather than a correctness substitute.

### Current Confect API Baseline

Verified against current Confect docs / npm on 2026-06-07:

- Packages are `@confect/core`, `@confect/server`, `@confect/cli`, and
  `@confect/react`; current npm version is `8.0.0`.
- Confect projects define:
  - `confect/schema.ts` with `DatabaseSchema.make().addTable(...)`
  - `confect/*.spec.ts` with `GroupSpec` / `FunctionSpec`
  - `confect/*.impl.ts` with `GroupImpl` / `FunctionImpl`
  - `confect/impl.ts` finalized with `Impl.finalize`
- `confect codegen` generates Confect API refs, services, and registered Convex
  functions.
- Confect functions can coexist with plain Convex functions. That is mandatory
  for this repo; do not try to port the whole backend in one step.
- Database access is through generated services such as `DatabaseReader` and
  `DatabaseWriter`.
- Confect docs explicitly cover incremental migration and plain Convex function
  integration; the spike should use that path.

### Decision Question

The spike answers one question:

> Should `@metacrdt/convex` be authored in Confect/Effect, or should Confect
> remain an optional app-level integration on top of plain Convex bindings?

The decision must be based on code, not preference.

### Spike Scope

Build one sidecar vertical slice only. Do **not** rewrite `convex/facts.ts` in
place during the first spike.

Recommended slice:

- A `confect/` sidecar group that can read protocol-shaped fact events and expose
  one small MetaCRDT-facing function, for example:
  - `metacrdt.events.byEntityAttr`
  - `metacrdt.events.verify`
  - `metacrdt.entity.current`
- It should call or mirror only enough logic to test Confect's shape:
  - Effect Schema args/returns
  - generated database services
  - typed errors
  - interop with plain Convex tables/functions
  - convex-test or Confect test harness ergonomics
- It must not become the production write path until the spike decision is
  recorded.

Explicit non-scope:

- Do not port flows, compliance, forms, Datalog, or the frontend.
- Do not replace `convex/schema.ts` globally.
- Do not move `@metacrdt/core` behind Effect services.
- Do not introduce `@metacrdt/runtime` yet; one runtime target is not enough
  evidence for the harness boundary.

### Acceptance Criteria

- Dependencies are installed intentionally:
  - `effect`
  - `@confect/core`
  - `@confect/server`
  - `@confect/cli`
  - optionally `@confect/react` only if a frontend call is part of the spike
- Confect codegen runs and generated files coexist cleanly with
  `convex/_generated`.
- One query or mutation group is expressed through Confect/Effect without
  changing existing public API behavior.
- Args and returns use Effect Schema.
- At least two typed errors are modeled, for example:
  - `UnknownEntity`
  - `UnknownEvent`
  - `InvalidProtocolEvent`
  - `Denied`
- The function can import and use `@metacrdt/core`.
- Existing plain Convex functions keep working.
- Tests or a documented harness run prove:
  - the Confect function executes locally
  - generated refs typecheck
  - typed errors are representable at the boundary
- `npm test`, `npm run test:core`, Convex typecheck, app typecheck, and
  Confect codegen/typecheck pass or any failure is clearly documented as a
  blocker.
- Decision recorded in `docs/confect.md`:
  - adopt broadly
  - adopt only for `@metacrdt/convex`
  - adopt only for app-level functions
  - defer
  - reject

### Spike Tasks

#### 1. Re-read project and Convex constraints

- [x] Read `convex/_generated/ai/guidelines.md`.
- [x] Re-read this Goal 2 section.
- [x] Confirm the working tree is clean before installing dependencies.

#### 2. Verify Confect current API

- [x] Check npm versions for Confect packages.
- [x] Read current Confect docs for:
  - packages
  - quickstart / project structure
  - functions
  - database schema
  - services
  - testing
  - incremental migration
  - plain Convex function interop
- [x] Capture any API differences from `docs/confect.md` before coding.

#### 3. Install and generate

- [x] Install the minimal Confect dependencies.
- [x] Add npm scripts:
  - `confect:codegen`
  - `test:confect`
  - `confect:dev` intentionally omitted; this repo should not let Confect watch
    and rewrite the existing hand-written `convex/` tree.
- [x] Create the minimal Confect file tree:

```text
confect/
  schema.ts
  spec.ts
  impl.ts
  metacrdt.spec.ts
  metacrdt.impl.ts
```

- [x] Run Confect codegen.
- [x] Inspect generated files and commit only source/generated files that Confect
  expects to be checked in.
- [x] Add a safe sidecar codegen wrapper:
  `scripts/confect-codegen-sidecar.mjs` temporarily points Confect at a throwaway
  functions target so codegen can update `confect/_generated/*` without
  overwriting this repo's real `convex/` tree.

#### 4. Sidecar function group

- [x] Define a small Effect Schema for protocol event output:
  - `eventId`
  - `kind`
  - `e`, `a`, `v`
  - `validFrom`, `validTo`
  - `hlc`
  - `actor`, `actorType`
  - `targetEventId`, `causalRefs`
- [x] Implement one Confect public query that reads existing Convex tables.
- [x] Keep it read-only unless the first query proves too small to evaluate the
  write ergonomics.
- [x] If adding a write, use a separate probe table or a no-op validation write;
  do not route production `assertFact` through Confect in this spike.
- [x] Import `@metacrdt/core.verifyId` and expose a validation result for events
  with metadata.

#### 5. Typed errors

- [x] Define at least two Effect tagged errors.
- [x] Verify how Confect serializes or exposes those errors to callers.
- [x] Decide whether the error surface is appropriate for:
  - Datalog `QueryTooComplex`
  - PII/auth `Denied`
  - protocol `InvalidEvent`

#### 6. Testing and deploy compatibility

- [x] Add a focused test for the Confect sidecar function, using whichever harness
  Confect recommends.
- [x] Keep existing `convex-test` tests green.
- [x] Run:

```bash
npm run confect:codegen
npm run test:core
npm test
npx tsc --noEmit -p convex/tsconfig.json
npx tsc --noEmit -p tsconfig.json
npx convex dev --once
```

- [x] If Confect generates Convex functions under `convex/`, verify they deploy
  alongside the existing functions without changing current API refs.

#### 7. Decision record

- [x] Update `docs/confect.md` with a dated "Spike Result" section.
- [x] Record:
  - exact versions installed
  - generated file layout
  - what worked
  - what broke
  - bundle/codegen/deploy friction
  - test friction
  - recommendation
- [x] Update `TODO.md` with the decision and the next action.

### Spike Result

**Decision:** adopt Confect narrowly for `@metacrdt/convex` internals and typed
boundary experiments; do **not** convert the current reference app wholesale.

Evidence:

- Confect/Effect functions run inside the Convex isolate.
- Effect Schema args/returns work for a real protocol function.
- Typed errors are transported as `ConvexError.data` and are visible through
  `convex-test`.
- The generated registered function can be manually mounted beside the existing
  plain Convex backend.
- Confect's CLI is not sidecar-safe by default: `confect codegen` treats
  `convex/` as a generated target, rewrites `schema.ts`, and removes function
  modules not represented in the Confect spec. The safe wrapper avoids this for
  the spike, but a reusable package should not depend on that workaround forever.

Recommendation:

- Use the Confect source/spec/impl style as an option inside `@metacrdt/convex`.
- Keep `@metacrdt/core` pure and Effect-free.
- Keep the current reference app's production API in plain Convex until
  `@metacrdt/convex` has a clean package boundary.
- Do not run raw `confect dev` in this repo unless the entire `convex/` tree has
  been intentionally moved under Confect ownership.

### Decision Gates

Adopt Confect for `@metacrdt/convex` only if all are true:

- Generated Convex functions coexist cleanly with plain Convex functions.
- Effect Schema actually reduces duplication at the function boundary.
- Typed errors survive the Convex/client boundary in a way the app can use.
- The test story is no worse than current `convex-test`, or the improvement is
  large enough to justify a new harness.
- The code remains easy to understand for someone who knows Convex but not
  Effect.

Defer Confect if:

- codegen layout fights the current repo structure;
- generated refs are awkward to call from the existing React/Convex client;
- Effect boilerplate obscures a simple Convex function;
- tests require rewriting most of the suite before proving value.

Reject Confect for the core target if:

- it cannot deploy cleanly with Convex in this repo;
- typed errors collapse into opaque server errors;
- database service ergonomics make indexed reads/writes harder to audit;
- it forces `@metacrdt/core` or protocol semantics to depend on Effect.

---

## Goal 3 — Extract `@metacrdt/convex`

**Objective:** turn the proven Convex reference code into a reusable Convex target
package.

Do this only after Goal 1, and preferably after the Confect spike.

### Target Shape

One package:

```text
packages/convex/
  package.json        # @metacrdt/convex
  src/
    component/        # Convex component surface, if used
    bindings/         # lower-level function/schema factories
    adapters/         # Convex row ↔ core event
    confect/          # optional Confect mounting helpers, informed by Goal 2
```

### Surfaces

- Convex component for drop-in use.
- Lower-level bindings for apps that want to own their own tables.
- Schema fragments / validators.
- Rebuild/materialization helpers.
- Testkit utilities.
- Optional Confect adapter helpers that expose generated registered functions
  without requiring Confect to own a host app's entire `convex/` tree.

### Goal 3 Work Breakdown

#### 1. Package boundary

- [x] Create `packages/convex` as `@metacrdt/convex`.
- [x] Keep it dependent on `@metacrdt/core`.
- [x] Do not depend on app `convex/_generated/*` types.
- [x] Keep Confect optional unless the package boundary proves it should be a
  peer dependency.

#### 2. Move adapters first

- [x] Move or duplicate the stable adapter logic from:
  - `convex/lib/coreEvent.ts`
  - `convex/lib/visibility.ts`
  - Confect spike reconstruction helpers in `confect/metacrdt.impl.ts`
- [x] Expose pure Convex-row adapter helpers:
  - assert row → core `Event`
  - lifecycle row → core `Event`
  - core event → Convex insert patch
  - legacy fallback event
- [x] Add package-local tests with fixtures, not live Convex tables.

#### 3. Schema and function bindings

- [x] Export validators/schema fragments for protocol metadata fields.
- [ ] Export function factories for:
  - append protocol assert event
  - append lifecycle event
  - verify event rows
  - cardinality-one reconcile by `≺`
- [ ] Keep host apps free to mount functions under their own names.

Deferred rationale: Goal 3 shipped the reusable adapter boundary first. Function
factories and a full component surface should come after one more host-app usage
or the component API shape is clear; otherwise they risk fossilizing the current
reference app's projection choices as public API.

#### 4. Confect integration decision

- [x] Extract the safe parts of the spike:
  - Effect Schema event summary
  - typed protocol errors
  - generated-function manual mount pattern
- [x] Do not expose a helper that runs raw `confect codegen` against a host app's
  `convex/` tree.
- [x] Decide whether Confect support is:
  - `@metacrdt/convex/confect`
  - docs-only recipe
  - deferred until Confect supports a true sidecar target.

Decision: `@metacrdt/convex` exposes a small `confectSidecarWarning()` helper and
keeps Confect optional/docs-first. The package does not run codegen for host apps.

#### 5. Verification

- [x] Package tests pass.
- [x] Existing Convex reference tests pass after importing from package.
- [x] `npx convex dev --once` still deploys the reference app.
- [x] Docs/TODO updated with the extraction result.

### Non-Goals

- Do not include Cloudflare or local-first code.
- Do not include Forma compiler code.
- Do not include product UI.

---

## Goal 4 — Extract `@metacrdt/forma`

**Objective:** fold the durable Open Ontology Lisp language layer into the
MetaCRDT package graph as the formal authoring language.

Use [docs/package-consolidation.md](./docs/package-consolidation.md) as the
source map.

### Source Material

- `.context/open-ontology/packages/language-ts`
- `.context/open-ontology/packages/language-host`
- `.context/open-ontology/packages/language-editor`
- `.context/open-ontology/specs/language/*`
- `.context/open-ontology/docs/lisp/*`
- selected language tests

### Acceptance Criteria

- [x] `packages/forma` exists as `@metacrdt/forma`.
- [x] README states what Forma owns and does not own.
- [x] No runtime/target dependencies.
- [x] No imports from `.context/open-ontology`.
- [x] Selected Lisp fixtures parse/evaluate/typecheck.
- [x] Any old Onlang naming is either removed or documented as legacy alias.

---

## Goal 5 — True `applyConfig` Reconcile

**Status:** shipped in the reference runtime.

**Objective:** make config-as-code behave like a reconciler, not just an
idempotent upsert. If a configured type, attribute, form, flow, requirement, or
action is removed from the blueprint and `applyConfig` runs again, the old
configured shape must be retracted or deactivated through the same fact/history
model instead of lingering.

### Implementation Notes

- Reconcile is **section-scoped**. A partial config such as
  `{ actions: [...] }` reconciles only actions; omitted sections are treated as
  untouched overlays, not empty desired sets. An explicit empty array means
  "remove every artifact previously owned by this section."
- Ownership is tracked as facts on `config:default`:
  `owns.attribute`, `owns.entityType`, `owns.form`, `owns.flow`,
  `owns.requirement`, and `owns.action`. This prevents config cleanup from
  guessing whether an unrelated system/data artifact belongs to the tenant
  blueprint.
- Fact-backed carriers (`attr:*`, `type:*`, `form:*`, `action:*`) are removed by
  retracting their current facts in a new `actorId: "config"` transaction.
- Requirement cleanup disables `require.<form>` / `task.<form>` rules and deletes
  their derived facts; flow cleanup deletes the owned `flowDefs` row. These rows
  are not currently modeled as full retractable protocol events, so this is the
  documented imperative edge for now.

### Acceptance Criteria

- `applyConfig` computes a stable desired set for every configured artifact it
  owns.
- Previously configured facts that are no longer desired are retracted in a new
  transaction with `actorId: "config"` and an explicit reconcile reason.
- Runtime data facts are not retracted by config reconcile.
- System/meta facts are not retracted by tenant config reconcile.
- Existing imperative rows that are not fact-backed enough to retract safely
  (for example flow/action definitions, if applicable) have a clear inactive or
  superseded state, or the plan records why they remain append-only for now.
- Tests prove removal:
  - removing a requirement removes the derived obligation on the next reconcile
  - removing an action makes it disappear from `actionsForType` / entity detail
  - removing a configured type/attribute affects configured-type discovery
    without deleting runtime entities
- Existing behavior for repeated identical `setupStaffing` / `applyConfig` stays
  idempotent.
- Convex tests, package tests, typechecks, and `npx convex dev --once` pass.

---

## Goal 6 — Attribute-Level PII Read Authorization

**Status:** shipped in the Convex reference runtime.

**Objective:** make PII fields readable only to principals with explicit
attribute grants. Ungranted projections must omit the value and report a
`Denied` marker instead of relying on frontend hiding.

### Implementation Notes

- The read principal is derived server-side from
  `ctx.auth.getUserIdentity()?.tokenIdentifier`; unauthenticated callers are the
  `anonymous` principal. No read API accepts a caller-provided user id.
- Sensitive attributes are detected from form definitions (`pii: true` or
  `sensitive: true`) and from schema-as-facts escape-hatch metadata on
  `attr:<name>` (`pii` / `sensitive`).
- Grants are facts on the principal:
  `(principal, "grants.read", { e, a })`, with `*` supported for entity or
  attribute wildcards.
- Public read surfaces enforce redaction:
  - `facts.getEntity`
  - `facts.queryFacts`
  - `facts.entityAsOf`
  - `facts.compareFacts`
  - `facts.entityFactsAsOf`
  - `facts.history`
  - `facts.entityTimeline`
  - `entities.entityDetail`
  - `entities.queryEntities`
  - public Datalog / aggregate queries
- Internal folds/materializers continue to evaluate raw facts. The Datalog engine
  takes an explicit `enforceReadAuth` option so public queries are protected
  without changing rule/materialization semantics.
- The UI displays denied rows on the entity detail and time-travel pages.

### Acceptance Criteria

- I-9 SSN is marked as PII in the staffing blueprint.
- Unauthenticated reads omit `i9/ssn` and include a `Denied` marker.
- An authenticated principal without a grant is also denied.
- Granting `(principal, "grants.read", { e, a })` reveals the value to that
  principal.
- Public Datalog cannot bind ungranted PII values.
- Tests prove denial and grant behavior through entity reads, as-of reads,
  `queryFacts`, and Datalog.
- Full Convex tests, package tests, typechecks, build, and `npx convex dev
  --once` pass.

---

## Goal 7 — Schema-Driven Entity UI

**Status:** shipped in the Convex reference runtime.

**Objective:** make the user-facing entity browser/rendering follow configured
type schema instead of opportunistically discovering whatever facts happen to be
present on current data rows.

### Implementation Notes

- `attributes.typeSchemaAsOf` now returns:
  - `attributes`: the existing compatibility list of declared attribute names
  - `columns`: UI-ready attribute definition objects (`valueType`, `cardinality`,
    description, etc.) reconstructed from schema-as-facts where present
- `src/pages/Entities.tsx` uses `typeSchemaAsOf(...).columns` as the table
  columns and `entities.queryEntities` as the paginated row source.
- `src/pages/EntityDetail.tsx` orders the state table by the entity's primary
  declared type schema first, then appends extra runtime facts not in the schema.
- The collection page already renders from `forms.collectionByToken` /
  `formDef`, so form rendering remains schema-driven.
- PII `Denied` markers continue to flow through list/detail rows.

### Acceptance Criteria

- Configured type schema exposes declared column definitions from facts.
- Entity list rows render declared columns rather than only id/name rows or
  discovered columns.
- Entity detail state is ordered by declared schema.
- Tests prove `typeSchemaAsOf` includes column definitions and that configured
  staffing rows expose declared Placement attributes.
- Full Convex tests, package tests, typechecks, build, static upload, and
  `npx convex dev --once` pass.

---

## Parked Product/Engine Backlog

These remain valuable, but they should not interrupt the current goal.

### Product / Config

- [ ] Config history/diff UI.
- [ ] Arg-taking actions / actions that open forms.
- [ ] Dry-run compliance: hypothetical worker + scope, no writes.

### Auth / Privacy

- [ ] Auth + write authorization for the live site.
- [ ] Collect-token single-use / expiry hardening.

### Query / Rules

- [ ] Engine-level result pagination / streaming.
- [ ] Computed predicates: arithmetic, string ops.
- [ ] Disjunction.
- [ ] Cross-entity rule incremental recompute.
- [ ] DRed/counting for transitive closure deletions.

### UX

- [ ] Search / command menu.
- [ ] Guided demo tour.
- [ ] "New entity" flow.

### Docs

- [ ] `docs/physics.md`: compliance, small-group co-signing, and agent swarms
  as three blueprints over one substrate.

---

## Working Rules

1. **Protocol before framework.**
   Fix MetaCRDT write semantics before Confect migration.
2. **Core stays pure.**
   No Convex, Effect, DOM, `Date.now()`, `Math.random()`, or runtime I/O in
   `@metacrdt/core`.
3. **Adapters live at the edge.**
   Convex row/document adaptation belongs in `convex/` now, later
   `@metacrdt/convex`.
4. **Projection tables are disposable.**
   Keep them for performance, but preserve rebuildability from `factEvents`.
5. **Do not bulk-copy Open Ontology.**
   Extract package by package with tests and a clean owner.
6. **Every convergence claim needs a test.**
   If the README/SPEC says order-independent, write a shuffled-order test.
7. **Docs and TODO move with code.**
   Any shipped phase updates `TODO.md`; any architectural change updates the
   relevant doc.

---

## Definition of Done for the Current Goal

Goal 7 is complete when:

- `typeSchemaAsOf` exposes UI-ready column definitions while preserving the old
  attribute-name list.
- Entity list rows render declared columns from schema-as-facts.
- Entity detail state is ordered by declared schema first.
- Existing form collection remains driven by `formDef`.
- Tests cover declared column definitions and configured data rows.
- `npm run test:forma`, `npm run test:core`, `npm run test:convex-package`,
  `npm test`, typechecks, build, static upload, and `npx convex dev --once` pass.
- `PLAN.md`, `TODO.md`, and relevant docs record the schema-driven UI result.
- The change is committed and pushed.
