# PLAN.md — MetaCRDT Execution Goal

**Current goal:** Goal 13 (`@metacrdt/runtime` harness groundwork) has shipped.
The next active goal should be chosen from the remaining TODO candidates: full
app write authorization or the next `@metacrdt/convex` function
factory/component slice.

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
   boundaries without becoming the protocol or infecting `@metacrdt/core`.

The immediate technical gap is now choosing the next runtime/product slice. The
protocol kernel is extracted, the Convex write/read paths are core-shaped enough
for the centralized reference runtime, the package graph has `core`, `convex`,
and `forma`, config reconciliation works, PII read authorization is enforced, the
entity UI is schema-driven, Confect has now been adopted narrowly for a real
read/planning domain, config changes are inspectable as manifest diffs, and
configured actions can now take small typed arguments.

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
  - helper factories for building/appending protocol fact-event rows through a
    host-provided inserter
  - helper for summarizing/verifying rows through a host-provided transaction
    lookup
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
- `@metacrdt/runtime` exists in [`packages/runtime`](./packages/runtime):
  - target-neutral service contracts (`EventStore`, `RuntimeClock`, `Scheduler`,
    `Transport`, optional `RuntimeSequencer`)
  - capability metadata and operation helpers over `@metacrdt/core`
  - an in-memory target/harness for proving convergence across runtimes
  - version-vector delta calculation and one-round anti-entropy exchange helpers
  - package-local tests for HLC injection, per-replica sequencing, G-Set exchange
    convergence, version-vector deltas, lifecycle events, and capability checks
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
- Config history/diff exists:
  - `configHistory.currentManifest` reconstructs the current owned-artifact
    manifest from `config:default`
  - `configHistory.history` diffs the manifest before/after config-authored
    transactions so idempotent re-applies report no manifest change
  - the Data model page surfaces current manifest counts and recent config diffs
- Arg-taking actions exist:
  - action definitions can declare bounded input fields
  - `runAction` accepts args and resolves `$arg.<name>` / `$entity`
    placeholders in asserted facts
  - entity detail renders action inputs for configured fields
- Actions can open forms:
  - action definitions can declare `opensForm`
  - `runAction` issues or reuses the same waiting collection run/token used by
    flow collect steps
  - entity detail surfaces the returned `/collect` link immediately
- Collection links are single-use and expiring:
  - new `flowRuns` collection tokens carry `tokenExpiresAt`
  - successful submission stamps `tokenConsumedAt`
  - token lookup refuses consumed/expired/not-waiting runs before exposing form
    definitions

### Not Yet True

- Legacy `factEvents` may still lack core `eventId` / HLC / replica metadata.
- Convex schema still permits the legacy `correction` event kind for historical
  rows, while new corrections write protocol primitives.
- `facts` and `currentFacts` are still maintained as imperative projections,
  not folded directly from raw core-shaped events.
- `@metacrdt/convex` is adapter-first. It now owns cardinality-one reconcile
  selection by `≺`, but the host app still owns database writes/projection rows.
  A full Convex component surface and mutation factories remain deferred until
  the package boundary is proven against more host-app usage.
- `@metacrdt/runtime` is harness-first. It is not yet used by the Convex
  reference runtime and does not implement durable transport targets.
- Multi-replica sync is specified and now implemented as in-memory
  version-vector anti-entropy, but not yet bound to Cloudflare/local/Convex
  transports.
- Full app login/write authorization is not configured; unauthenticated callers
  are treated as `anonymous`, so PII is denied by default but general public
  writes remain demo-grade.
- Confect is integrated as a narrow sidecar spike:
  - `confect/` defines a typed Effect Schema function group.
  - `convex/metacrdtConfect.ts` manually mounts the generated registered
    function beside the existing hand-written Convex backend.
  - `api.metacrdtConfect.verifyEvents` verifies protocol-shaped `factEvents`
    with `@metacrdt/core`.
  - The spike result is recorded in [docs/confect.md](./docs/confect.md).

---

## Goal 1 — Core-Shaped Convex Write Path

**Status:** shipped in the Convex reference runtime.

**Objective:** Convex mutations must append events shaped like MetaCRDT protocol
events, and cardinality-one semantics must use the core `≺` order.

This was the protocol-correctness prerequisite for every later runtime and
Confect step.

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

- [x] Read `convex/_generated/ai/guidelines.md`.
- [x] Note any generated rules that affect schema, indexes, validators, or
  scheduler usage.

#### 2. Audit Existing Write Path

- [x] Inspect:
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

**Status:** shipped as a sidecar spike; adopted narrowly.

**Objective:** evaluate whether Confect should become the authoring/runtime style
for `@metacrdt/convex`, after core write semantics are correct.

This was an evaluation, not a migration. The output was a working sidecar slice
plus the written decision captured in [docs/confect.md](./docs/confect.md).

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
- [x] Export pure cardinality-one reconcile selection by `≺`.
- [x] Export host-mounted helper factories for:
  - append protocol assert event
  - append lifecycle event
  - verify event rows
- [ ] Export registered Convex component/functions for the same helpers once the
  component API is clear.
- [ ] Keep host apps free to mount functions under their own names.

Deferred rationale: Goal 3 ships reusable, target-shaped helpers before
mountable functions. The package now owns host-mounted helpers; a full registered
component surface should come after one more host-app usage or the component API
shape is clear, otherwise it risks fossilizing the current reference app's
projection choices as public API.

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

## Goal 8 — Confect-First Compliance Planning

**Status:** shipped in the Convex reference runtime.

**Objective:** answer the question "should we first convert current Convex logic
to Confect/Effect?" by converting one real production domain boundary, not the
whole backend. The target domain is compliance read/planning:

- preserve the existing plain Convex `api.compliance.workerCompliance` behavior;
- add a no-write dry-run compliance planner;
- implement the new planning logic through Confect/Effect schemas, services, and
  typed errors;
- keep `@metacrdt/core` and existing protocol write-path code Effect-free.

The intended result is a reusable pattern for future `@metacrdt/convex` work:
Confect owns typed boundary logic and domain services where it pays rent, while
the protocol kernel and low-level Convex projections remain plain, auditable
code.

### Decision

Yes, Confect should be next, **but not as a wholesale conversion of `convex/`**.

The earlier Confect spike proved:

- Confect can run inside the Convex isolate.
- Effect Schema args/returns work.
- tagged errors cross the Convex boundary as structured `ConvexError.data`.
- generated registered functions can be mounted manually beside plain Convex
  modules.
- raw `confect codegen` is not safe to run directly against this repo's real
  `convex/` directory.

Therefore the next step is a **sidecar production slice**:

```text
confect/compliance.spec.ts       # typed args / returns / errors
confect/compliance.impl.ts       # Effect implementation over generated services
convex/complianceConfect.ts      # manual mount of generated functions
convex/compliance.ts             # stable existing public API remains plain Convex
```

This slice is clear enough to adopt Confect narrowly for read/planning domains.
It does **not** justify a wholesale rewrite or converting protocol writes yet.

### Why Compliance Planning

Compliance planning is the right next conversion target because it exercises real
business logic without touching the highest-risk protocol write path.

It uses:

- schema/config facts (`form:*`, configured requirements, placement attrs);
- current runtime facts (`submitted.<form>`, worker placements);
- derived obligations (`requires.*`, `task.*`) as a compatibility check;
- redaction-safe public reads;
- a user-facing UI where "collect vs reuse" is immediately visible.

It avoids:

- mutating `factEvents`;
- rewriting `facts.ts`;
- changing cardinality-one projection semantics;
- making `@metacrdt/core` depend on Effect;
- handing the whole `convex/` tree to Confect codegen.

### Feature Scope

Add a dry-run planner that answers:

> For this worker and a hypothetical placement context, which forms would be
> required, which existing submissions would be reused, and which forms would
> need collection?

Representative input:

```ts
{
  worker: "worker:maria",
  placement: {
    employer: "employer:acme",
    client: "client:globex",
    job: "job:forklift",
    venue: "venue:stadium7"
  }
}
```

Representative output:

```ts
{
  worker: "worker:maria",
  items: [
    { form: "i9", scope: "employer:acme", decision: "reuse" },
    { form: "handbook", scope: "client:globex", decision: "collect" },
    { form: "forklift", scope: "job:forklift", decision: "collect" },
    { form: "venue_disclosure", scope: "venue:stadium7", decision: "reuse" }
  ],
  summary: { reuse: 2, collect: 2, total: 4 }
}
```

The query must not write transactions, facts, derived facts, flow runs, or
tokens. It is a planning projection only.

### Acceptance Criteria

- `confect/compliance.spec.ts` defines Effect Schema args, returns, and at least
  these typed errors:
  - `UnknownWorker`
  - `InvalidPlacement`
  - `UnknownRequirementShape` or `UnsupportedRequirement`
- `confect/compliance.impl.ts` implements the dry-run query using generated
  Confect `DatabaseReader` services and ordinary Effect programs.
- `convex/complianceConfect.ts` manually mounts the generated function, matching
  the safe sidecar pattern from `convex/metacrdtConfect.ts`.
- Existing `api.compliance.workerCompliance` behavior remains unchanged.
- A public dry-run API exists. Acceptable mount options:
  - preferred: `api.compliance.dryRunWorkerCompliance` as a plain Convex wrapper
    around shared logic or a stable exported function;
  - acceptable: `api.complianceConfect.dryRunWorkerCompliance` if wrapping the
    generated function cleanly creates circularity or type issues.
- The dry-run planner is backed by the same configured requirement source the
  live compliance engine uses, not a hard-coded UI list.
- The planner handles at least:
  - existing worker with existing placement;
  - existing worker with hypothetical placement;
  - new/unsubmitted form => `collect`;
  - current matching submission for same `(worker, form, scope)` => `reuse`;
  - conditional forklift requirement based on job role.
- Tests prove the query is read-only by checking relevant table counts before
  and after.
- Tests prove decisions are stable regardless of row order.
- Existing Convex compliance tests continue to pass.
- Docs record the decision:
  - Confect adopted for compliance planning sidecar;
  - not yet adopted for protocol writes;
  - next expansion criteria.

### Work Breakdown

#### 1. Read and Audit

- [x] Read `convex/_generated/ai/guidelines.md`.
- [x] Inspect:
  - `convex/compliance.ts`
  - `convex/appconfig.ts`
  - `convex/rules.ts`
  - `convex/entities.ts`
  - existing compliance/appconfig tests
  - `confect/metacrdt.*`
  - `confect/schema.ts`
  - `confect/tables/*`
- [x] Confirm working tree is clean before changing the Confect sidecar.

#### 2. Define Requirement Source

The planner must not drift from configured requirements.

Choose one source:

- **Preferred:** derive requirements from configured/enabled rules:
  - parse `rules` rows named `require.<form>`;
  - infer scope from the placement clause, e.g. `["?p", "employer", "?s"]`;
  - infer simple guards, e.g. job role equals `forklift`;
  - treat unknown shapes as typed `UnsupportedRequirement`, not silent success.
- **Fallback:** factor staffing requirements into a shared constant used by both
  `appconfig` and the dry-run planner. This is simpler but less general.

Do not duplicate requirement literals directly in the UI.

#### 3. Extend Confect Schema

- [x] Add Confect table definitions needed by the planner:
  - `currentFacts`
  - `rules`
  - optionally `derivedFacts`
  - any table required for read-only verification
- [x] Preserve the safe codegen wrapper:
  - use `npm run confect:codegen`;
  - do not run raw `confect codegen` against the real `convex/` tree.
- [x] Regenerate `confect/_generated/*` and confirm no hand-written Convex files
  are removed or rewritten.

#### 4. Write the Confect Spec

- [x] Create `confect/compliance.spec.ts`.
- [x] Add `dryRunWorkerCompliance` public query spec:
  - args: worker id and optional hypothetical placement object.
  - returns: typed result with item list and summary.
  - errors: `UnknownWorker`, `InvalidPlacement`, `UnsupportedRequirement`.
- [x] Use exact optional fields correctly; Confect/Effect Schema should omit
  absent fields rather than return `undefined`.

#### 5. Implement the Effect Program

- [x] Create `confect/compliance.impl.ts`.
- [x] Read current facts through `DatabaseReader`.
- [x] Build a placement context from:
  - existing `Placement` facts for the worker;
  - optional hypothetical placement args.
- [x] Read and parse configured requirement rules.
- [x] For each requirement:
  - resolve the scope entity;
  - evaluate supported guards;
  - check existing `submitted.<form>` facts for `(worker, scope)`;
  - return `reuse` or `collect`.
- [x] Deduplicate by `(form, scope)`.
- [x] Produce deterministic ordering by `(form, scope, decision)`.
- [x] Make absence/error cases typed, not thrown strings.

#### 6. Mount Safely

- [x] Add the new group to `confect/spec.ts` and `confect/impl.ts`.
- [x] Export the registered function from `convex/complianceConfect.ts`.
- [x] Decide whether `convex/compliance.ts` should expose a wrapper:
  - if yes, document how the wrapper avoids generated-reference circularity;
  - if no, document why clients should call `api.complianceConfect.*` directly.
- [x] Keep existing `api.compliance.workerCompliance` unchanged.

#### 7. Tests

- [x] Add Confect/Convex tests proving:
  - dry-run for a fully seeded worker returns expected `reuse`/`collect`;
  - dry-run with a hypothetical forklift placement includes forklift form;
  - non-forklift job omits forklift form;
  - existing current submissions are reused;
  - missing submissions are collected;
  - unsupported rule shapes fail with a typed error;
  - no rows are inserted/updated/deleted by the query.
- [x] Reuse existing appconfig/staffing bootstrap helpers where possible.
- [x] Avoid asserting UI copy in backend tests.

#### 8. Frontend

- [x] Add a dry-run panel to `src/pages/Compliance.tsx`.
- [x] Inputs:
  - worker
  - employer
  - client
  - job
  - venue
- [x] Render a compact table:
  - form
  - scope
  - decision (`Reuse` / `Collect`)
  - reason/source if returned
- [x] Do not add explanatory marketing copy in-app.
- [x] Preserve the existing compliance panel and bootstrap behavior.

#### 9. Documentation

- [x] Update `docs/confect.md` with the Goal 8 result:
  - what became easier;
  - what remained awkward;
  - whether Confect should expand beyond compliance planning.
- [x] Update `TODO.md`:
  - mark dry-run compliance shipped if complete;
  - record any next Confect conversion candidate.
- [x] Update `README.md` only if public API or first-principles positioning
  changes.

#### 10. Verification

Run:

```bash
npm run confect:codegen
npm run test:core
npm run test:convex-package
npm run test:forma
npm run test:confect
npm test
npx tsc --noEmit -p packages/core/tsconfig.json
npx tsc --noEmit -p packages/convex/tsconfig.json
npx tsc --noEmit -p packages/forma/tsconfig.json
npx tsc --noEmit -p convex/tsconfig.json
npx tsc --noEmit -p tsconfig.json
npm run build
npx convex dev --once
npx @convex-dev/static-hosting upload
```

Result for shipped Goal 8:

- `npm run confect:codegen` passed.
- `npm run test:core` passed (46 tests).
- `npm run test:convex-package` passed (9 tests).
- `npm run test:forma` passed (9 tests).
- `npm run test:confect` passed (2 tests).
- `npm test` passed (80 Convex tests).
- Package, Convex, and app typechecks passed.
- `npm run build` passed.
- `npx convex dev --once` pushed functions to `chatty-hare-94`.
- `npx @convex-dev/static-hosting upload` pushed the static UI.
- Live `complianceConfect:dryRunWorkerCompliance` returned a dry-run plan for
  `worker:maria`.

If browser tooling is available, verify:

- `/compliance` renders the dry-run panel;
- a seeded worker shows both `Reuse` and `Collect` decisions;
- no admin/sidebar chrome appears on `/collect`.

### Non-Goals

- Do not convert `convex/facts.ts` to Confect in this goal.
- Do not convert Datalog, flows, forms, or appconfig wholesale.
- Do not introduce `@metacrdt/runtime`.
- Do not move `@metacrdt/core` behind Effect services.
- Do not make Confect codegen own the real `convex/` tree.
- Do not add auth provider configuration as part of this goal.

### Expansion Criteria

After Goal 8, Confect can expand only if all are true:

- the compliance planner is easier to test than the equivalent plain Convex
  implementation would be;
- typed errors are visible and useful to callers;
- codegen remains sidecar-safe;
- the domain logic reads as an Effect service boundary rather than boilerplate;
- the public API stays stable.

Likely next Confect candidates if Goal 8 succeeds:

1. `@metacrdt/convex` function factories for read-only event verification and
   append helpers.
2. Config diff/history read model.
3. Arg-taking action planning.
4. Only later: protocol writes.

---

## Goal 9 — Config History / Diff Read Model

**Status:** shipped in the Convex reference runtime.

**Objective:** make config-as-code changes inspectable. `applyConfig` already
lowers declarations into facts and rows; this goal adds a read model and UI
surface that show the current configured ownership manifest and the manifest
diff for recent config-authored transactions.

### Implementation Notes

- `convex/configHistory.ts` introduces:
  - `currentManifest`: current owned artifacts grouped by
    `attribute/entityType/form/flow/requirement/action`;
  - `history`: recent `actorId="config"` transactions annotated with the
    manifest before/after the transaction, `added`, `removed`, counts, and direct
    fact events.
- The diff is computed from `config:default` ownership facts, not from raw
  `assert` events alone. This matters because idempotent re-applies reassert
  desired ownership; the history must report no manifest diff when the owned set
  is unchanged.
- The Data model page now includes a "Config history" card with current manifest
  counts and recent added/removed artifacts.

### Acceptance Criteria

- Current manifest query reconstructs owned config artifacts from facts.
- History query shows additions on first setup.
- Removing a requirement shows a removed requirement in the latest diff.
- Reapplying the same desired config reports no manifest diff.
- Runtime data is not confused with config ownership.
- UI surfaces manifest counts and recent diffs under Data model.
- Full tests/typechecks/build/deploy pass.

### Verification

- `npx convex codegen` passed.
- Focused `npx vitest run appconfig` passed (10 tests).
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 10 — Arg-Taking Actions

**Status:** shipped in the Convex reference runtime.

**Objective:** extend configured actions from fixed assertions only to small
parameterized commands. An action can declare input fields and reference them in
its `asserts` map; running the action resolves those placeholders and asserts
the resulting facts in one transaction.

### Scope

Backward-compatible action definition:

```ts
{
  name: "set_status",
  label: "Set status",
  appliesTo: "Worker",
  fields: [
    { name: "status", label: "Status", type: "select", options: ["active", "terminated"] }
  ],
  asserts: { "worker.status": "$arg.status" }
}
```

Supported placeholder values:

- `"$arg.<name>"` — value supplied when the action runs.
- `"$entity"` — target entity id.
- all other values are literal.

This goal does **not** implement actions that open forms or run flow steps. It is
the narrow parameterized-assert slice.

### Acceptance Criteria

- `defineAction` accepts optional `fields` and stores them as schema-as-facts on
  `action:<name>`.
- `actionsForType` / `listActions` return `fields`.
- `runAction` accepts optional `args` and resolves placeholders.
- Missing required args fail clearly.
- Unknown arg placeholders fail clearly.
- Existing fixed actions still work unchanged.
- Entity detail renders action inputs for actions with fields and sends them to
  `runAction`.
- Tests cover fixed action compatibility, parameterized action success, missing
  args, and unknown placeholders.
- Full tests/typechecks/build/deploy pass.

### Verification

- Focused `npx vitest run appconfig` passed (12 tests).
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 11 — Actions That Open Forms

**Status:** shipped in the Convex reference runtime.

**Objective:** extend configured actions from "assert facts now" to "issue a
collection form now" while reusing the existing `/collect?token=...` flow-run
path. This keeps collection semantics in one place: action-opened forms,
standalone compliance collects, and flow collect steps all park on `flowRuns`
and submit through `forms.submitCollection`.

### Scope

Backward-compatible action definition:

```ts
{
  name: "collect_i9",
  label: "Collect I-9",
  appliesTo: "Worker",
  fields: [{ name: "scope", label: "Employer", type: "string" }],
  opensForm: { form: "i9", scope: "$arg.scope" },
  asserts: {}
}
```

`opensForm.form` and `opensForm.scope` use the same resolver as action asserts:

- `"$arg.<name>"` — value supplied when the action runs.
- `"$entity"` — target entity id.
- all other values are literal.

### Acceptance Criteria

- `defineAction` accepts optional `opensForm` and stores it as a fact on
  `action:<name>`.
- `actionsForType` / `listActions` / `entityDetail` return `opensForm`.
- `runAction` resolves `opensForm` values and creates a waiting collection run
  for the action target entity.
- Re-running the same form/scope action reuses the existing waiting run rather
  than issuing duplicate links.
- The returned mutation payload includes the collection URL/token.
- Entity detail displays the returned `/collect` link immediately after the
  action runs.
- Data model action registry shows form-opening behavior.
- Tests cover configured form-open success and idempotent reuse.
- Full tests/typechecks/build/deploy pass.

### Verification

- Focused `npx vitest run appconfig` passed (13 tests).
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 12 — Collection-Token Hardening

**Status:** shipped in the Convex reference runtime.

**Objective:** make `/collect?token=...` links single-use and expiring without
changing the existing collection flow path. Flow collect steps, standalone
compliance collections, and form-opening actions still park on `flowRuns`; the
token now controls whether the public collection page can reveal and submit the
form.

### Acceptance Criteria

- `flowRuns` stores optional `tokenExpiresAt` and `tokenConsumedAt`.
- New collection tokens get an expiry timestamp:
  - explicit `expireSeconds` uses that shorter window;
  - otherwise a default 7-day TTL is applied.
- `forms.collectionByToken` does not reveal form metadata for:
  - consumed tokens;
  - expired tokens;
  - runs that are no longer waiting.
- `forms.submitCollection` rejects consumed/expired tokens and marks expired
  waiting runs as expired.
- Successful collection submission stamps `tokenConsumedAt` before the event path
  resumes the run.
- Collection issuance idempotence reuses only waiting runs whose token is still
  live; expired/consumed waiting runs can be reissued.
- Existing legacy runs without `tokenExpiresAt` remain tolerated until used.
- Tests cover single-use behavior and pre-submit expiry.
- Full tests/typechecks/build/deploy pass.

### Verification

- Focused `npx vitest run forms flows flowdag appconfig` passed (24 tests).
- Full gate for this slice is recorded in the commit that shipped it.

---

## Goal 13 — `@metacrdt/runtime` Harness Groundwork

**Status:** shipped as a pure workspace package.

**Objective:** introduce the portable runtime harness boundary without migrating
the Convex reference app. The goal is to make the "one feature set → many
targets" architecture concrete: service contracts, capability metadata, operation
helpers over `@metacrdt/core`, and a memory target that proves convergence
without Convex.

### Scope

Package:

```text
packages/runtime/
  src/types.ts       # EventStore, Clock, Sequencer, Scheduler, Transport, caps
  src/operations.ts  # applyOperation, mergeFrom, capability checks
  src/memory.ts      # in-memory store/clock/scheduler/transport target
  src/sync.ts        # version vectors, deltas, anti-entropy exchange
  src/index.ts       # public API
```

This is **not** a Convex migration and **not** a durable transport target. Convex
remains the reference target; the memory harness exists so future Convex /
Cloudflare / local targets can share one contract and one set of convergence
tests. The harness now implements SPEC §8's version-vector anti-entropy shape in
memory.

### Acceptance Criteria

- Add `@metacrdt/runtime` as an npm workspace package.
- Define target-neutral service interfaces:
  - `EventStore`
  - `RuntimeClock`
  - optional `RuntimeSequencer`
  - `Scheduler`
  - `Transport`
  - `RuntimeProfile` / capabilities
- Add operation helpers that:
  - author core assert/retract/tombstone/untombstone events through an injected
    clock;
  - append through the injected store;
  - optionally publish through transport;
  - check required capabilities explicitly.
- Add an in-memory runtime target:
  - verified event-id append;
  - HLC clock with injected wall time;
  - per-replica sequencer;
  - scheduler/transport fakes for tests.
- Add version-vector sync helpers:
  - `versionVector`
  - `deltaSince`
  - `exchangeDeltas`
- Add tests proving:
  - injected HLC behavior;
  - per-replica sequence stamping;
  - append/publish path;
  - two runtimes converge after exchanging G-Set events;
  - version-vector deltas send only unseen sequenced events;
  - repeated anti-entropy exchange is idempotent;
  - legacy unsequenced events remain compatibility deltas;
  - lifecycle target operations fold correctly;
  - capability checks fail clearly.
- Add root `npm run test:runtime`.
- Do **not** move `convex/` onto runtime yet.
- Full tests/typechecks/build pass.

### Verification

- `npm run test:runtime` passed (7 tests).
- Runtime package typecheck passed.
- Full gate for this slice is recorded in the commit that shipped it.

---

## Parked Product/Engine Backlog

These remain valuable, but they should not interrupt the current goal.

### Product / Config

- [x] Config history/diff UI.
- [x] Arg-taking actions.
- [x] Actions that open forms.
- [x] Dry-run compliance: hypothetical worker + scope, no writes.

### Runtime / Targets

- [x] `@metacrdt/runtime` harness groundwork.
- [x] In-memory version-vector anti-entropy helpers.
- [ ] Durable anti-entropy transport targets.
- [ ] Full registered `@metacrdt/convex` component/function surface.
- [ ] Cloudflare Durable Object target.
- [ ] Browser/local-first target.

### Auth / Privacy

- [ ] Auth + write authorization for the live site.
- [x] Collect-token single-use / expiry hardening.

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

- [x] `docs/physics.md`: compliance, small-group co-signing, and agent swarms
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

## Definition of Done for the Active Objective

`implement PLAN.md` remains active until the open backlog above is either shipped
or intentionally moved out of this repo's scope. Each shipped slice must update
`PLAN.md` / `TODO.md`, pass the relevant test/typecheck/build gate, and be
committed/pushed with the verification recorded.
- Entity list rows render declared columns from schema-as-facts.
- Entity detail state is ordered by declared schema first.
- Existing form collection remains driven by `formDef`.
- Tests cover declared column definitions and configured data rows.
- `npm run test:forma`, `npm run test:core`, `npm run test:convex-package`,
  `npm test`, typechecks, build, static upload, and `npx convex dev --once` pass.
- `PLAN.md`, `TODO.md`, and relevant docs record the schema-driven UI result.
- The change is committed and pushed.
