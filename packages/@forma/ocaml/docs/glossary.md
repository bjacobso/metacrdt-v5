# Glossary

Short anchors for onlang-specific terms. If a word appears in the other
docs without definition, it is probably here.

## ABI

The JSON request/response contract the engine speaks. Every host — CLI,
Node, browser, Wasm embedder — drives the engine through the same
operations. See `architecture.md` § JSON ABI.

## AST

The semantic abstract syntax tree consumed by the expander, elaborator,
and evaluator. Distinct from the CST: the AST has no whitespace,
comments, or reader sugar. Produced by lowering the CST in `reader.ml`.

## Bidirectional elaboration

A typechecking discipline in which some positions are checked against a
known type (for example, the declared return type of a form) and others
are inferred from the expression. onlang's elaborator uses bidirectional
rules at form boundaries so that descriptor slot types anchor the
inference.

## Canonical IR

The engine's output: a typed OCaml variant (`lib/ir.ml`) serialized to
JSON (`lib/ir_json.ml`). Backends consume canonical IR; the engine
itself does not. The wire format carries `irVersion`, source and
prelude hashes, declaration provenance, and all diagnostics.

## Capability

A record whose fields are operation implementations. A handler
installs a capability for the duration of an expression; `!`-suffix
calls in that scope resolve to field access on the bound capability.
The shipping effect substrate (see `design-decisions.md` § 2) is
capabilities plus elaboration-time resolution.

## CST

The concrete syntax tree produced by the reader. Preserves whitespace,
comments, and exact source spans. Used by formatters, editors, and
diagnostic renderers. Distinct from the AST.

## Descriptor

A prelude-registered definition of a form. Names the form's slots,
their types, their validators, and the meta hooks that run during
elaboration. The engine dispatches to descriptors by name without
knowing what the form means. See `lib/descriptor.ml`.

## Effect row

A type-level list of effect operations an expression may perform. In
onlang's shipping substrate, effect rows are present in the surface type
grammar but do not require row-polymorphic inference; they are
checked as ordinary records of capabilities via elaboration-time
resolution. Full row-polymorphic inference is not a live implementation
track.

## Elaboration

The pass that runs after expansion and before typechecking.
Dispatches each top-level form to its descriptor, applies the
descriptor's meta hooks, and produces typed IR fragments.
Elaboration is where host-specific vocabulary enters the pipeline.

## Elaborator reflection

The architectural pattern in which host programs register typed
forms with the engine. Contrast with hard-coded language features.
onlang's elaborator reflection is the descriptor + meta hook protocol.
Racket calls the same idea "macros that produce typed programs";
Lean 4 calls it "elaboration monad extension."

## Handler

A form that installs a capability for the duration of an
expression. `(with-handler [blob-store (make …)] body)` binds
`blob-store` in the scope of `body`; every `blob-store/op!` call
in `body` resolves to a field access on the bound record.

## Meta hook

A function registered by a descriptor that runs during elaboration.
Four slots exist: `construct-fn` produces the IR fragment,
`infer-fn` infers the form's result type, `check-fn` validates
against an expected type, `result-type-fn` computes the type in
contexts where no IR fragment is needed.

## Operation

A named, typed effect: `:blob-store/upload`, `:raise/NotFound`,
etc. Operations are declared with `define-operation`, specify
input, output, and raisable error types, and are invoked through
`!`-suffix syntax or explicit `perform`.

## Prelude

A Lisp source loaded into a session to register macros, form
descriptors, meta hooks, operations, and capabilities. onlang ships
no built-in prelude; hosts provide their own. A session's
prelude set is content-hashed for caching and provenance.

## Session

The engine's unit of caching and isolation. A session carries
loaded preludes, loaded sources, and cached expanded/elaborated
results. Opened, reset, and closed through the ABI. Does not
persist across engine restarts.

## Span

A source location: source id, byte offsets, line, column. Every
AST node carries a span; every diagnostic carries a span after
the reader succeeds. The absence of `"span": null` in generated
JSON is enforced by `reset-gate.mjs`.

## Typed macro

A macro whose output is typed IR, not just syntactic rewriting.
The key property: errors point at the source form the author
wrote, not at the shape produced after expansion. onlang's macros
become typed macros as elaboration runs: expansion produces AST,
elaboration produces typed IR, and the span threads through both.
