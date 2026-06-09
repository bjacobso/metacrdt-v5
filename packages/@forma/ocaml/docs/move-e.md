# Move E Proposal: Incremental Elaboration

**Status:** closed. The implementation caches validated packageable
declarations for warm-session artifact operations and reuses unaffected source
caches after single-source edits using declaration-reference dependency
tracking with source-order fallback.

## Lane

Choose **incremental elaboration** for Move E.

This beat the other candidates because the reset had just made the artifact
boundary stricter, but authors still paid for broad session work during artifact
operations. The 2026-04-29 bench baseline made that cost visible: corpus load +
summarize was 6,648.55 ms for 45 sources and 440 declarations. Before adding
new authoring features, backend targets, or prelude surface area, the next move
needed to make the existing authoring loop feel fast and stable. The first
slice is now implemented, so this document records both the original lane
selection and the measured checkpoint for later slices.

The alternatives are still real, but they depend on this lane more than they
displace it:

- Effect-system integration is user-visible, but it expands language semantics
  immediately after the typed boundary reset.
- Editor and LSP work needs fast per-file semantic refresh to avoid becoming a
  slow wrapper around whole-session elaboration. Editor-service ABI projections
  are allowed by the stop-rule carve-out when they reuse existing passes.
- Backend plugins are premature while canonical IR production is still paid for
  as a full rebuild.
- Prelude package format would help caching, but authors will notice source
  edit latency before they notice packaged prelude metadata.

## User-Visible Success

An ontology author can edit one source file in a multi-file ontology and re-emit
canonical IR without waiting for unchanged sources and preludes to be expanded,
elaborated, and summarized again. The emitted artifact must remain byte-for-byte
equivalent to a cold full-session emit for the same source set, except for
deliberate timing/session metadata.

## Smallest First Slice

Add an explicit warm-session emit path for already-loaded sources:

1. Cache validated packageable declarations by source hash plus the active
   prelude hash set.
2. Reuse cached declaration payloads for unchanged source IDs inside the same
   session.
3. Invalidate dependents conservatively when a prelude or source hash changes.
4. Add a focused script fixture that loads the existing canonical IR parity
   sources, emits once cold, emits again warm, and asserts identical declaration
   summaries and canonical declarations.

This slice demonstrates the lane without adding language parity features,
prelude forms, or a new backend. The current implementation optimizes warm
unchanged sessions and source edits: loading a prelude clears the artifact
declaration cache, while loading a source invalidates that source and cached
sources whose parsed symbols, strings, or keywords reference declarations
exported by it. If the graph is incomplete, invalidation falls back to source
load order. `artifactSummary`, `emit`, and `emitMany` report cache hit/miss
counts so the authoring loop can tell whether a request reused validated
declarations or fell back to re-elaboration.

## Measured Bench Movement

The primary metrics are **corpus load + summarize** and **corpus emitMany**,
split into cold, warm, and one-source-edit numbers. The final 2026-05-01 run
below was captured with `node packages/language-ocaml/scripts/bench.mjs` after
`pnpm build:ocaml`.

| metric                                  |       value |
| --------------------------------------- | ----------: |
| corpus sources                          |          54 |
| corpus loaded inputs                    |          61 |
| corpus declarations                     |         541 |
| corpus diagnostics                      |           0 |
| corpus load + summarize                 | 1,940.41 ms |
| source load, including eager cache warm | 1,899.27 ms |
| first summarize after source load       |    17.68 ms |
| warm summarize                          |    17.32 ms |
| warm emitMany                           |    71.58 ms |
| single-source edit loadSource           |    62.94 ms |
| edit summarize after loadSource         |    17.27 ms |
| single-source edit + summarize          |    80.21 ms |
| single-source edit loadSource for emit  |    75.97 ms |
| edit emitMany after loadSource          |   116.20 ms |
| single-source edit + emitMany           |   192.17 ms |
| warm summary cache hits/misses          |      54 / 0 |
| warm emit cache hits/misses             |      54 / 0 |
| edit summary cache hits/misses          |      54 / 0 |
| edited-source summary cache hit         |        true |
| edit emit cache hits/misses             |      54 / 0 |
| edited-source emit cache hit            |        true |

The measurement confirms warm-session artifact operations are no longer paying
for full-session declaration elaboration. `loadSource` intentionally warms the
artifact declaration cache for source inputs: the edit cost is paid during the
edit operation, then the following summary or emit observes a cache hit for the
edited source. This matches the authoring loop this lane was selected for:
edit a source, then immediately re-summarize or re-emit.

The split also makes the tradeoff explicit. `loadSource` is not the cheapest
possible storage operation because it performs eager artifact work, but it keeps
the next semantic artifact request at warm-cache latency. Batch source loading
already pays this cost once for the loaded bundle, which is the same behavior
the artifact-cache fixture enforces.

Artifact footprint from the same run:

| artifact           |         value |
| ------------------ | ------------: |
| native bytes       |     4,008,016 |
| native startup     |     184.71 ms |
| JS bytes           |     3,934,409 |
| JS brotli          | 322,063 bytes |
| JS gzip            | 469,868 bytes |
| Wasm bytes         |     2,068,056 |
| Wasm wrapper bytes |        57,144 |
| Wasm brotli        | 458,581 bytes |
| Wasm gzip          | 616,474 bytes |
| JS startup         |      64.94 ms |
| Wasm startup       |      50.91 ms |

## Lane Closed

Move E is closed on the first slice. The final bench is materially better than
the pre-cache baseline: the 2026-04-29 corpus load + summarize path was
6,648.55 ms for 45 sources and 440 declarations, while the final run is
1,940.41 ms for 54 sources and 541 declarations. A single-source edit followed
by summary is 80.21 ms total, with only 17.27 ms spent in the post-load summary
request. A single-source edit followed by `emitMany` is 192.17 ms total, with
116.20 ms spent in the post-load emit request.

No second Move E slice is selected. The remaining opportunities are either
ordinary cleanup (clearer dependency graph tests, module drains, diagnostic
hardening) or belong to a new Move: effect-system integration, prelude package
format, editor consolidation, or a first additional IR consumer.

## Stop Rule

The Move E stop rule is retired. Moves A-E are green; future language-surface,
backend, or prelude-form work should be selected as a new Move rather than
smuggled in as incremental elaboration follow-up.

## Gate Shrink Progress

- Removed the broad `scripts/emit.mjs` string-presence assertion from
  `reset-gate.mjs`; malformed payload coverage now relies on the executing
  emit behavior plus the remaining corpus-kind matrix checks.
- Moved `relation/construct` from an imperative `meta-fn` body to a
  descriptor-only `define-elaboration`, proving the net-deletion migration path
  across both engines. The follow-up vocabulary analysis for `view`, `query`,
  and `document` lives in `elaboration-migration.md`.
- Added expression slot projection to the descriptor vocabulary and migrated
  `action/construct` to descriptor-only elaboration.
- Added repeated string slot projection and migrated `mutation/construct` and
  `workspace/construct` to descriptor-only elaboration.
- Added formatted descriptor names and migrated `link/construct` to
  descriptor-only elaboration.
- Added descriptor defaults, first-present source selection, and companion refs
  to migrate `constraint/construct`.
- Added nameless summaries to migrate `document-localized/construct`.
- Added conditional object sources to migrate `task-definition/construct`.
- Added child-object and positional sources to migrate `process/construct`.
- Added primitive-backed sources with `attribute-binding` and introduced a
  parity-backed `document/construct` descriptor while keeping its Lisp fallback.
- Migrated `document-locale/construct` to descriptor-only construction and
  confirmed nested sub-IR reuse is an expansion-time concern, not a descriptor
  shared-shape requirement.
- Added `:constructed-by` for nested-only forms and deleted the localized
  `role/construct`, `section/construct`, and `locale-field/construct` bodies.

## Reset Gate Shrink Candidates

These `scripts/reset-gate.mjs` checks should move into OCaml types or focused
behavioral tests as Move E progresses:

- `Artifact_validated_payload.canonical_json` allowed-call-site checks should be
  replaced by an interface split: expose serialization only from an artifact
  writer module and keep package construction on the validated payload type.
- Abstract `.mli` record-shape exclusions for artifact/package/summary types
  should become compile-time interface tests or ordinary module signatures
  reviewed by `dune build`, not source-text bans.
- The typed payload validator registry matrix should become a runtime unit test
  that asks `Artifact_typed_payload_validator` for registered kind coverage and
  compares it with corpus kind counts.
- Malformed payload fixture count checks should become table-driven behavioral
  tests in `scripts/emit.mjs` that assert every non-HTTP matrix row fails through
  its typed validator.
- Descriptor payload contract routing checks in `preludes/ontology.lisp` should
  be validated by loading descriptors and querying resolved artifact contracts,
  not by searching for `(:contract ...)` text.
- `construct/declaration` `:$summary` checks should become an elaboration test
  that emits each descriptor family and asserts summary metadata is present
  before packaging and absent after packaging.
- HTTP validator ownership checks should become a behavioral test that sends
  malformed `Schema` and `HttpApi` declarations through artifact packaging and
  asserts `Http_ir_validation` diagnostics.
- Forbidden hardcoded ontology form-name checks should move into an architecture
  gate over descriptor registration APIs, allowing form names in fixtures and
  forbidding only engine dispatch branches.
- Canonical family `.mli` diagnostic-shape checks should become a shared module
  signature that each family validator must implement.
