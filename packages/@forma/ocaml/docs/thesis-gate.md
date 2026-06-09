# Thesis Gate

The OCaml-hosted implementation of onlang is a bet, not a conclusion. This
document specifies the single concrete test that decides whether the bet
pays off. Everything in the engine that is not reaching toward this gate
is parity work that could be done in any language. Read this first when
picking the project back up.

## Current Status

As of the 2026-04-24 migration review, `scripts/thesis-gate.mjs` is
green in this workspace. The gate now covers the original mutation
shape plus descriptor-aware query and record cases, macro-expanded
spans, repeated diagnostics, and author-facing type names. Future work
should treat a thesis-gate regression as serious, but the active
architectural question has moved to typed IR dominance.

That boundary has tightened since the thesis gate first passed:
artifact declarations now cross packaging as typed canonical or typed
HTTP payloads, declaration summaries are emitted by elaboration instead
of inferred from OCaml domain vocabulary, descriptor-derived summary
expectations are carried behind opaque elaboration types, packaged canonical IR
strips summary metadata, and `Artifact.package` validates summaries before any
artifact is serialized. Remaining typed-IR work is about reducing the generic
canonical envelope where a richer typed host representation is worth the
ownership cost.

## The Bet

The reason onlang's engine is written in OCaml, rather than TypeScript, Zig,
Rust, or anything else, is a claim:

> OCaml's algebraic data types, pattern matching, and ergonomic
> unification make a real Hindley-Milner typechecker and a typed
> canonical IR substantially cheaper to build and maintain than they are
> in the alternatives.

If that claim is true, the OCaml port pays for itself in typechecker
quality, IR clarity, and diagnostic precision. If it is not true, the
port is paying an implementation-language tax (OCaml contributors are
fewer, build toolchain is more involved, Wasm artifacts are larger) for
benefits a mainstream language would match.

Parity with the prior implementation does not settle this question.
Parity can be reached in any language; it does not test the thesis.

## The Gate

The thesis is tested by one mutation test, run against the standing
example corpus:

> Mutate a representative query contract — for example, changing an
> attribute's declared type from `Bool` to `String` in the
> `define-query` `where` slot. Load the corpus unchanged. The engine
> must reject the affected source with a Hindley-Milner diagnostic that
>
> 1. carries a source span pointing at the offending form (not at the
>    macro expansion, not at the whole file),
> 2. names the expected and actual types in the author's vocabulary
>    (`Bool` vs `String`, not `TVar 17` vs `TVar 29`),
> 3. is produced by real unification over structured types, not by
>    string-label comparison or by value-shape matching.

The third clause is load-bearing. A test that passes because the
engine string-matched `"Bool"` against `"String"` proves nothing. The
point of the gate is to force unification, let-generalization, and
span-preserving constraint solving into the hot path.

## What Passing Looks Like

When the gate passes:

- The default typed-core path is real HM inference, not label comparison.
  `typecheckCore` and `typecheckCoreTyped` are response projections over the
  same typed-core result.
- `lib/typecheck.ml`, `lib/type_unify.ml`, `lib/type_env.ml`, and
  `lib/typed_core.ml` cover the inference path reached by the mutation:
  literals, `let`, `fn`, application, `if`, record field access,
  descriptor infer/check hooks, and whatever `define-query`'s `where` slot
  lowers into.
- A failing test in `test/thesis_gate.ml` applies the mutation and
  asserts the diagnostic shape (code, span bounds, expected/actual type
  strings).
- `dist/**/*.json` output contains no `"span": null` on the failure.
- `reset-gate.mjs` remains green.

When those conditions hold, the OCaml port is earning its keep and
further work (Move D, backends, performance) is justified. The other
drains (`abi.ml` into session/artifact modules, etc.) become routine
cleanup rather than investment decisions.

## What Failing Looks Like

Failure is not "the test is red." Failure is one of:

- **Scope balloon.** The minimal inference surface required to reach
  the gate turns out to be much larger than expected — full record row
  typing, typeclass dictionaries, effect rows, all front-loaded.
- **Implementation drag.** The work takes three times longer than the
  TypeScript implementation of the same inference surface took,
  controlled for developer familiarity.
- **Diagnostic drift.** The structured types reach unification but the
  error messages produced are materially worse than the label-based
  predecessor because preserving source spans through substitution is
  harder than the thesis assumed.

Any of those reopens the language-of-implementation question. The
honest outcomes are:

1. **Pass.** Continue the port. The other moves are mechanical.
2. **Fail on scope.** Scope the inference surface smaller, retry. If
   the smaller surface is trivial, it does not test the thesis either.
3. **Fail on drag or diagnostics.** Shelve the OCaml implementation as
   a research package. Pick up parity work in the language that was
   going to own the typechecker anyway.

## Why This Particular Test

The mutation is deliberately chosen to touch every subsystem that
justifies OCaml:

- **Parser and CST** must preserve a span to point at.
- **Expander** must thread that span through macro rewriting.
- **Elaborator** must reach the `where` slot's contract.
- **Type system** must represent `Bool` and `String` as structured
  types, unify them, fail with a named mismatch.
- **Diagnostic layer** must carry the span, the types, and a code from
  the deepest point of unification back to the user.

A smaller test (say, pure arithmetic inference) would not exercise any
of the ontology-shaped cases that motivated the project. A larger test
(full row-polymorphic effect inference) would conflate the thesis gate
with the separately shelved effect-system research. This test is the
tightest one that still tests the whole bet.

## Self-Contained Harness (post-extraction)

The current gate references a specific line of a prelude that lives in
the Open Ontology repository. When this package is extracted to a
standalone repo, the gate needs a prelude it controls.

The extracted repo should carry a minimal test prelude under
`preludes/` and a fixture under `test/fixtures/thesis-gate/` that:

- Declares one entity type with one `Bool`-typed attribute.
- Defines one query whose `where` clause binds that attribute.
- Ships a second version of the same file with the attribute retyped
  to `String`.

The thesis gate test loads both, asserts the first typechecks and the
second produces the diagnostic described above. This keeps the bet
testable without any dependency on Open Ontology's specific corpus.

## Dated Kill

Pick a date. The suggested date at the time of extraction is eight
weeks from resuming work in earnest. If the gate has not passed by
then, invoke one of the failure outcomes above and stop investing. An
open-ended gate converts into an open-ended port.
