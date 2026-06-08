# PLAN.md — MetaCRDT Execution Goal

**Current goal:** make the Convex reference runtime actually produce and consume
MetaCRDT protocol-shaped events, then evaluate Confect as the typed Effect layer
for the Convex target.

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

The immediate technical gap is the write path: reads already delegate bitemporal
visibility to `@metacrdt/core`, but writes still use the older Convex-specific
projection logic and arrival-order cardinality-one supersession.

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
- Convex backend tests are green: 66 tests at last verification.
- Frontend is a MetaCRDT research-preview UI with datarooms/compliance as the
  live elaboration.
- Open Ontology is a pinned submodule under
  [`.context/open-ontology`](./.context/open-ontology).

### Not Yet True

- Legacy `factEvents` may still lack core `eventId` / HLC / replica metadata.
- Convex schema still permits the legacy `correction` event kind for historical
  rows, while new corrections write protocol primitives.
- `facts` and `currentFacts` are still maintained as imperative projections,
  not folded directly from raw core-shaped events.
- Multi-replica sync is specified but not implemented.
- Confect is documented as a direction, not integrated.

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

This is intentionally after Goal 1.

### Why After Goal 1

Confect improves schema, service, and error boundaries. It does not define the
MetaCRDT protocol. Converting to Confect before the write path is protocol-shaped
would move complexity sideways while preserving the central correctness gap.

### Spike Scope

Port one vertical slice only:

- Recommended slice: `convex/facts.ts`
- Keep public API behavior stable.
- Do not port flows, compliance, forms, or frontend in the first spike.

### Acceptance Criteria

- One mutation/query group is expressed through Confect/Effect.
- Args/returns/errors use Effect Schema where practical.
- Existing tests pass or have a clear minimal harness adaptation.
- Bundle/build/deploy work with Convex.
- The code is simpler or more defensible than the plain Convex version.
- Decision recorded in `docs/confect.md` or a follow-up ADR.

### Spike Tasks

- [ ] Verify current Confect API from its source/docs before coding.
- [ ] Install dependencies only if needed and record why.
- [ ] Create a small Confect-backed function group.
- [ ] Model typed errors:
  - unknown fact
  - invalid attribute value
  - cardinality conflict / denied write if relevant
- [ ] Evaluate test ergonomics.
- [ ] Evaluate generated Convex function compatibility.
- [ ] Write a decision note:
  - adopt broadly
  - adopt only at package boundary
  - defer
  - reject

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
```

### Surfaces

- Convex component for drop-in use.
- Lower-level bindings for apps that want to own their own tables.
- Schema fragments / validators.
- Rebuild/materialization helpers.
- Testkit utilities.

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

- `packages/forma` exists as `@metacrdt/forma`.
- README states what Forma owns and does not own.
- No runtime/target dependencies.
- No imports from `.context/open-ontology`.
- Selected Lisp fixtures parse/evaluate/typecheck.
- Any old Onlang naming is either removed or documented as legacy alias.

---

## Parked Product/Engine Backlog

These remain valuable, but they should not interrupt Goal 1.

### Product / Config

- [ ] `applyConfig` true reconcile: retract config facts removed from the
  blueprint.
- [ ] Config history/diff UI.
- [ ] Arg-taking actions / actions that open forms.
- [ ] Dry-run compliance: hypothetical worker + scope, no writes.

### Auth / Privacy

- [ ] Auth + write authorization for the live site.
- [ ] Attribute-level read grants / PII authorization.
- [ ] Collect-token single-use / expiry hardening.

### Query / Rules

- [ ] Engine-level result pagination / streaming.
- [ ] Computed predicates: arithmetic, string ops.
- [ ] Disjunction.
- [ ] Cross-entity rule incremental recompute.
- [ ] DRed/counting for transitive closure deletions.

### UX

- [ ] Schema-driven list columns.
- [ ] Schema-driven forms.
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

Goal 1 is complete when:

- Convex writes protocol-shaped events.
- Event IDs verify through `@metacrdt/core`.
- Cardinality-one projections use `≺`-max.
- Rebuild from events matches live projection.
- Existing demo behavior is preserved.
- Tests cover deterministic convergence under shuffled write/event order.
- `TODO.md` marks the write-path item complete and records the next Confect
  spike.
- The change is committed and pushed.
