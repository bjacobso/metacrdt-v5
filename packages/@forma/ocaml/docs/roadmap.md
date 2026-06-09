# Roadmap

What's done, what's next, and what's deferred. This document is the
pickup point: read `vision.md` for why the project exists, read
`thesis-gate.md` for the bet that decides whether to continue, then
read this to see where the code currently is and what the next move
looks like.

## Current State

The engine is a working vertical slice. The reader, expander,
evaluator, JSON ABI, Hindley-Milner typechecker, descriptor-aware
typed-core output, canonical artifact packaging, and native/JS/Wasm
build outputs all function on a gated corpus. Moves A-E are green:
the evaluator and ABI drains are complete, the thesis gate is green,
and typed IR dominance is now enforced by artifact packaging and reset
gates. Move E closed after warm-session declaration caching,
dependency-aware source invalidation, and honest edit-path telemetry
proved meaningful authoring-loop improvement without weakening the typed
package boundary.

### What Works

- Lossless reader with source spans on every token.
- Macro expansion (`defmacro`, quasiquote, unquote, gensym) running as
  a separate pass in `lib/expand.ml`.
- Tree-walking evaluator with closures, pattern matching, destructuring,
  and a descriptor-driven meta hook registry for elaboration.
- Real HM-style inference over `Core_ast`, producing `Typed_core`
  annotations and spanful diagnostics through descriptor hooks.
- JSON ABI with sessions, preludes, source bundles, batch elaborate,
  batch emit, canonical IR output with source/prelude hashes, warm
  artifact declaration cache telemetry, and editor-service projections.
- Native, `js_of_ocaml`, and `wasm_of_ocaml` build outputs. Target
  parity runner confirms identical evaluation on a shared case list.
- Corpus gates: architecture gate, corpus-golden gate, reset-gate
  ratchet, span-null scanner over produced IR.

### What Is Still Mixed

- Canonical IR construction. Artifact declarations cross packaging as
  typed canonical/HTTP payloads, and artifact validation lives inside the
  artifact package constructor. Most ontology families intentionally use a
  generic typed canonical envelope (`kind`, optional `name`, JSON payload)
  rather than family-specific OCaml records: the engine should not become
  a registry of domain vocabulary unless a protocol earns a typed host
  representation.
- Typecheck ABI shape. `typecheckCore` and `typecheckCoreTyped` now project
  from the same typed-core result. Regular `typecheck` remains AST-aware
  because it owns surface forms such as macros, typeclasses, protocols, and
  effect sugar that are not all lowerable as plain `Core_ast` forms yet.
- Documentation and planning. Some older local notes may still describe
  the pre-thesis reset state; this roadmap is the tracked source for
  current package direction.

### What Is Deferred

- Bytecode or VM-style evaluation.
- Additional backend targets beyond canonical IR.
- Full effect row system (see `design-decisions.md` for why the
  shipping substrate is elaboration-time instead).

## Move Plan

The reset was organized as five moves. Moves A, B, C, D, and E are now green.
Move F is active and is scoped to the Shared Host ABI. It moves consumers onto
`packages/language-host` so the TypeScript and OCaml engines share source,
session, projection, diagnostic, and host-effect contracts before any runtime
default flip. New surface language features, new engine backends beyond the
existing TS/native OCaml/JS OCaml host implementations, or new prelude forms
still need a coherent Move-level rationale from bench output, architecture
pressure, and product need.

### Move A — Drain `eval.ml`

**Goal:** split the evaluator god-module into single-purpose files
before the code hardens.

**State:** complete for reset purposes. `eval.ml` is below the target
budget and no longer owns every subsystem. The reset gate ratchets its
line count so it cannot regress.

**Remaining:** routine cleanup only. Do not reopen evaluator structure
unless a measured boundary problem appears.

### Move B — Drain `abi.ml`

**Goal:** `abi.ml` dispatches JSON; it does not own session state,
artifact construction, or elaboration orchestration.

**State:** complete for reset purposes. `abi.ml` is now a thin
decode/delegate/pack dispatcher with operation families moved into
dedicated `abi_*_ops.ml` modules.

**Remaining:** keep validation and packaging centralized in artifact modules.
The ABI should select operations and format responses, not own compiler
semantics.

### Move C — Real Hindley-Milner on the typed core

**Goal:** make the thesis gate pass. See `thesis-gate.md`.

**State:** green. `typecheckCoreTyped` runs real structured inference
through `Type_expr`, `Type_env`, `Type_unify`, descriptor hooks, and
`Typed_core` annotations. The thesis gate covers query and record
contract mismatches, macro-expanded spans, repeated diagnostics, and
author-facing type names.

**Remaining:** split module responsibilities if needed (`infer.ml`
versus facade `typecheck.ml`). Compact `typecheckCore` and rich
`typecheckCoreTyped` already share the same typed-core result; the larger
remaining question is how to make regular `typecheck` a projection over the
same semantic result without losing AST-level surface-form support.

### Move D — Typed IR

**Goal:** canonical IR has a typed OCaml artifact boundary. JSON is the
wire format, produced by one serializer; nothing constructs IR by string
templating.

**State:** green. The package has typed artifact envelope structures, a
generic typed canonical declaration envelope (`kind`, optional `name`,
required elaboration result type, JSON payload), and a typed HTTP path.
Runtime fallback is guarded so declaration-like values with a `kind`
field must go through typed IR. Declaration summaries are elaboration
owned: preludes emit explicit `:$summary` metadata, OCaml validates it
against descriptor-derived summary expectations and the typed payload,
strips it from packaged IR, and computes package summaries from the
validated boundary. The summary expectation type, typed payload
diagnostics, package metadata, and elaboration intermediate types are
opaque in public module interfaces, keeping descriptor and artifact
contracts internal to the package boundary.

**Result:** artifacts are built as typed package data and serialized at
deliberate JSON boundaries (`Artifact_json`, package metadata hashing,
and declaration package hashing). The wire format carries an explicit
`irVersion` and a named hash algorithm.

## Move E — Incremental Elaboration

**Goal:** make repeated artifact operations and single-source edits fast
enough for the authoring loop while preserving cold full-session output.

**State:** green. Sessions cache validated packageable declarations by source
hash plus active prelude fingerprint. Source reloads invalidate the changed
source and dependency-linked cached sources conservatively; `artifactSummary`,
`emit`, and `emitMany` surface aggregate and per-source cache telemetry.

The corpus payload matrix is documented in `payload-matrix.md`; keep that
file aligned with `scripts/reset-gate.mjs` when descriptor contracts,
typed validators, or malformed fixtures change.

**Final measurement captured 2026-05-01 with
`node packages/language-ocaml/scripts/bench.mjs` after `pnpm build:ocaml`:**

| metric                                  |         value |
| --------------------------------------- | ------------: |
| native bytes                            |     4,008,016 |
| native startup                          |     184.71 ms |
| JS bytes                                |     3,934,409 |
| JS brotli                               | 322,063 bytes |
| JS gzip                                 | 469,868 bytes |
| Wasm bytes                              |     2,068,056 |
| Wasm wrapper bytes                      |        57,144 |
| Wasm brotli                             | 458,581 bytes |
| Wasm gzip                               | 616,474 bytes |
| corpus sources                          |            54 |
| corpus loaded inputs                    |            61 |
| corpus declarations                     |           541 |
| corpus diagnostics                      |             0 |
| corpus load + summarize                 |   1,940.41 ms |
| source load, including eager cache warm |   1,899.27 ms |
| first summarize after source load       |      17.68 ms |
| warm summarize                          |      17.32 ms |
| warm emitMany                           |      71.58 ms |
| single-source edit loadSource           |      62.94 ms |
| edit summarize after loadSource         |      17.27 ms |
| single-source edit + summarize          |      80.21 ms |
| single-source edit loadSource for emit  |      75.97 ms |
| edit emitMany after loadSource          |     116.20 ms |
| single-source edit + emitMany           |     192.17 ms |
| warm summary cache hits/misses          |        54 / 0 |
| warm emit cache hits/misses             |        54 / 0 |
| edit summary cache hits/misses          |        54 / 0 |
| edited-source summary cache hit         |          true |
| edit emit cache hits/misses             |        54 / 0 |
| edited-source emit cache hit            |          true |

Move E is closed on this evidence. `loadSource` eagerly warms artifact
declarations for source inputs, so edit-path work is paid during the edit
operation and the following summary or emit observes a hit for the edited
source. A future cache lane needs a new Move-level rationale.

## Move F - Shared Host ABI

**Goal:** move consumers off the TypeScript language object graph before
requiring any OCaml runtime default. See `move-f.md` for the active gate.

**State:** active. `packages/language-host` now owns the shared host ABI and has
TS, native OCaml, and JS OCaml host implementations. Runtime kernel evaluation
can route through configured language backends. Action execution and MCP have
readiness evidence for explicit OCaml trials, but both remain TS-backed by
default.

**Phase 1 gate:** make the docs tell one current story, keep TS/native OCaml/JS
OCaml backend posture explicit by deployment target, classify old TypeScript
language object graph leaks, and enforce the boundary through
`packages/language-host/test/import-boundary.test.ts` plus
`packages/language-host/test/conformance.test.ts`.

**Non-goal:** Move F is not permission to add language surface area or flip
runtime defaults. ActionExecutionService and MCP `execute-lisp` have separate
default-flip decisions after their cancellation/session posture is accepted.

## Reset Guardrails

The stop rule is enforced mechanically. See
`scripts/reset-gate.mjs`. The ratchet includes:

- Maximum 557 LOC for any OCaml interface or implementation file in
  `lib/`. The old oversized-module exception list has been removed.
- No `"span": null` in any JSON artifact under `dist/`.
- Typed IR boundary checks: declaration objects with a `kind` field
  must be elaborated as typed canonical or typed HTTP payloads before
  packaging.
- Explicit artifact summary checks: declaration payloads must include
  elaboration-produced `:$summary` metadata, packaged IR must not leak that
  metadata, descriptor-backed expectations stay opaque, and the summary must
  match descriptor and typed payload kind/name/result type.
- Centralized artifact validation: `Artifact.package` is the choke point, so
  callers cannot bypass validation by calling the package constructor directly.
- Turbo build ordering for emit checks: `pnpm language-ocaml:emit` runs emit
  checks through Turbo, and emit-family scripts fail clearly if the native
  artifact has not been built.

The Move E feature freeze is retired. New operations still need a coherent
Move-level rationale when they add language surface, backend targets, or prelude
forms; editor-service projections remain acceptable when they reuse existing
passes.

## Kill Criteria

These are the conditions under which the OCaml implementation is
shelved and the project reopens the language-of-implementation
question. They are load-bearing; an open-ended gate becomes an
open-ended port.

- **Typed-boundary regression.** The thesis gate is green; the current
  failure mode is reintroducing untyped value/JSON construction as the
  durable artifact path.
- **Thesis gate regression.** See `thesis-gate.md` for the three
  original failure modes (scope balloon, implementation drag,
  diagnostic drift).
- **Wasm artifact size.** Target is under 8 MB gzipped for the
  `wasm_of_ocaml` output. Measure per-commit once artifacts are
  stable enough to gate.
- **Evaluation throughput.** Target is within 2x of the prior
  implementation on a 1000-form corpus. Keep measuring as the typed
  IR path replaces value-based artifact construction.
- **Contributor friction.** If onboarding a new contributor to the
  OCaml codebase takes materially longer than onboarding to the
  prior TypeScript codebase did, document the cost and reconsider.

## Post-Gate Candidates

- **Full effect system integration.** Wire the elaboration-time
  capability resolver into elaboration, surface missing-capability
  and uncovered-raise diagnostics. See `design-decisions.md`.
- **Incremental elaboration, later slices.** Move E is closed. Reopen this only
  with a specific named problem such as cross-session cache reuse or a measured
  dependency-invalidation miss.
- **Editor and LSP consolidation.** Editor-service ABI projections and the
  `language-ocaml-lsp` package exist; the remaining work is consolidating the
  old TypeScript editor stack around that surface.
- **Backend plugins.** Additional IR consumers (Rust, Go, OpenAPI,
  MCP descriptors) over the frozen canonical IR.
- **Prelude package format.** Preludes are currently loose files
  loaded per-session. A packaged format with hashes and version
  metadata enables caching and sharing.

These are candidates, not parallel tracks. Pick one Move before starting feature
work outside reset-safe cleanup.

## Picking the Work Back Up

If you are resuming this project cold:

1. Read `vision.md` to see what onlang is trying to be.
2. Read `thesis-gate.md` to understand the original bet. The local
   gate is currently green; treat regressions as serious.
3. Skim `design-decisions.md` for the effect-system choice and other
   load-bearing decisions.
4. Come back here. Moves A-E are green and Move F is active; read
   `move-f.md` before writing language, runtime, editor, or compiler adapter
   code.
5. Run the existing gates before writing code:

   ```bash
   pnpm exec turbo run test --filter @open-ontology/language-host
   pnpm exec turbo run typecheck --filter @open-ontology/language-host
   pnpm exec turbo run test --filter @open-ontology/runtime
   pnpm exec turbo run typecheck --filter @open-ontology/runtime
   ```

   If OCaml architecture scripts or emitted artifacts are touched, also run:

   ```bash
   pnpm build:ocaml
   node packages/language-ocaml/scripts/gates.mjs
   node packages/language-ocaml/scripts/architecture-gate.mjs
   ```

   If any of these is red on a clean checkout, the first job is to
   turn them green before doing anything else.
