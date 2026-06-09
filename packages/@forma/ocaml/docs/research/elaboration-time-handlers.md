---
title: Elaboration-Time Handlers
status: draft
created: 2026-04-18
updated: 2026-04-18
layer: language
capabilities: [type-system, effects, handlers, elaboration, macros, hm]
depends_on_layers: [compiler]
tags: [language, lisp, effects, elaboration, handlers, macros]
---

# Elaboration-Time Handlers

## Purpose

Provide an effect-and-handler primitive for the Open Ontology language that
gives every observable benefit of algebraic effects (typed handler dispatch,
effect-coverage diagnostics, portable handler logic) **without runtime
continuation capture or row-polymorphic type inference**.

The core move: handlers for effect operations are resolved and inlined at
elaboration time. `perform` becomes a macro-expansion problem, not a
type-theory problem. Effect "rows" become ordinary product types of
capability values, checkable by plain Hindley-Milner.

This is the preferred substrate for the HTTP API authoring DSL
([`compiler/ontology/http-api-authoring.md`](../compiler/ontology/http-api-authoring.md))
and for every other effectful DSL that follows it (rules, actions, workflows,
MCP, background jobs).

## Motivation

Row-polymorphic algebraic effects with full Hindley-Milner inference are
powerful but costly: 3–6 months of implementation work with genuine research
risk. The research cost comes from two sources:

- **Runtime continuation capture.** `perform` must suspend and a handler must
  resume with a continuation. This requires delimited continuations or CPS
  transformation in the interpreter and every compilation target.
- **Row-polymorphic unification.** Inferring which handlers are required for
  an expression means unifying row variables, which is a distinct
  type-theoretic mechanism on top of ordinary HM.

Neither is strictly necessary for an HTTP API framework (or for rules,
actions, workflows, etc., as they exist today). The workloads served by
these DSLs share three properties:

- Handler sets are static — installed at process boundary, not swapped
  mid-computation.
- No multi-shot continuations — handlers call their continuation exactly
  once.
- No row-polymorphic reuse — the same handler body is never typed against
  multiple effect sets.

Under those constraints, the full machinery is strictly overbuilt. This spec
specifies the smaller primitive that covers the same use cases at roughly
one-tenth the implementation cost.

## Non-Goals

- Multi-shot continuations (reinvoke `k` more than once per `perform`).
- Dynamic handler installation that depends on runtime values.
- Row-polymorphic handler bodies reused across distinct effect sets.
- First-class continuations as Lisp values.
- `dynamic-wind`-style effect scoping.

Any DSL that genuinely needs these would require a fresh row-polymorphic design
pass. The current HTTP, rule, action, workflow, and MCP surfaces do not.

## Core Primitive

### Operations

An operation is a named, typed effect:

```lisp
(define-operation :blob-store/upload
  (:input  (Struct (field content Bytes) (field mime String)))
  (:output BlobUploadResponse)
  (:raises BlobUploadError))
```

Operations are first-class declarations. They carry input, output, and
raisable error types. They do not by themselves introduce a handler; they
only declare the contract.

### Capabilities

A capability is a record whose fields are operation implementations:

```lisp
(define-capability BlobStore
  (:ops
    (:blob-store/upload        (Fn InputT -> OutputT))
    (:blob-store/get-metadata  (Fn HashT  -> MetadataT))))
```

The capability's type is a plain record in the existing type system. No row
machinery; no effect variables.

### `perform` (surface form)

The `!`-suffix sugar desugars into a capability lookup plus direct call:

```lisp
(blob-store/upload! {:content … :mime …})

;; elaborates, before typechecking, to:

(call-op (cap-of :blob-store/upload) {:content … :mime …})
```

`cap-of` is a compile-time lookup. Elaboration finds the capability
providing `:blob-store/upload` in the surrounding lexical scope and rewrites
the call. If no capability provides the operation, elaboration produces a
structured diagnostic.

### `with-handler` (surface form)

A handler form installs a concrete capability for the duration of an
expression:

```lisp
(with-handler [blob-store (make-blob-store local-config)]
  body…)
```

This is ordinary lexical binding of a capability value. No continuation
machinery. Inside `body`, every `(blob-store/op! …)` resolves to a field
access on the bound `blob-store` record and a direct call.

### `raise!` and `catch*`

Errors follow the same pattern:

```lisp
(raise! (BlobUploadError {:reason "quota"}))
;; elaborates to:
(throw-op :blob-upload-error {:reason "quota"})

(catch* [(BlobUploadError e) (fallback e)]
  body…)
;; elaborates to an ordinary try/catch on the host's error channel,
;; matching on the tagged _tag field.
```

`raise!` is a thrown value in the host. `catch*` is a pattern-matched
catch. Both are fully typed by HM via the declared `:raises` on each
operation.

## Typing

The primitive adds nothing new to the type system beyond ordinary HM. It
does add two elaboration-time checks that produce typed diagnostics.

### Capability resolution

For every `(op! args)` call, elaboration walks the lexical scope looking
for a capability whose `:ops` includes the operation. Exactly one match is
required. Zero matches is a diagnostic:

```text
error[E-CAP-MISSING]: no capability in scope provides :blob-store/upload
  --> handler.lisp:12:7
   |
12 |   (blob-store/upload! payload)
   |   ^^^^^^^^^^^^^^^^^^^
   |
   = available capabilities in scope: [DatabaseManager, RuntimeClock]
   = :blob-store/upload is provided by capability `BlobStore`
   = hint: add `BlobStore` to (:requires …) of the enclosing handler group
```

Multiple matches is a diagnostic with the same shape, asking for
disambiguation via an explicit `with-handler` binding.

### Error coverage

For every `(raise! (Err …))` reachable in a handler body, elaboration walks
outward looking for a `catch*` or a declaration at the form boundary
(e.g., the endpoint's `:errors`) that covers `Err`. An uncovered raise is
a diagnostic.

Both checks are linear walks over the already-elaborated AST. Neither
requires row unification or effect inference.

## Ergonomics

The surface looks like direct-style code. Capability threading is implicit
through the capability-passing desugaring. The author never writes explicit
row annotations.

```lisp
;; What the author writes:
(handle upload [{:keys [path payload]}]
  (database-manager/get! (:database path))
  (let [result (blob-store/upload! {:content payload :mime "…"})]
    result))

;; What elaboration produces (abridged):
(fn [req _cap]
  (let [database-manager (get-cap _cap :database-manager)
        blob-store       (get-cap _cap :blob-store)]
    (database-manager.get (:database (:path req)))
    (let [result (blob-store.upload {:content (:payload req) :mime "…"})]
      result)))
```

Every `!` call becomes a plain record-field access plus function call. The
typechecker sees ordinary HM code. Errors like "missing capability" surface
at the original `!` call site with full source span.

## Implementation Cost

| Piece                                                           | Estimated effort |
| --------------------------------------------------------------- | ---------------- |
| `define-operation`, `define-capability` form descriptors        | 3 days           |
| `!`-suffix desugaring pass                                      | 3 days           |
| Capability-in-scope resolution + E-CAP-MISSING diagnostic       | 1 week           |
| `with-handler` lexical binding                                  | 2 days           |
| `raise!` / `catch*` desugaring to host try/catch                | 3 days           |
| Error coverage walk + E-RAISE-UNCOVERED diagnostic              | 1 week           |
| Integration with `define-form` / `meta-fn` boundary annotations | 1 week           |
| Golden diagnostic fixtures                                      | 3 days           |

Total: **~4 weeks** versus the 3–6 months estimated for the rejected
row-polymorphic approach. Every line is ordinary HM plus elaboration-time AST
walks — no unification extensions, no continuation machinery, no fiber
runtime.

## Comparison With Row-Polymorphic Effects

| Dimension                            | Elaboration-Time (this spec)                          | Row-Polymorphic (spike)                  |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------------- |
| Implementation cost                  | ~4 weeks                                              | 3–6 months                               |
| Research risk                        | None — HM plus macro expansion                        | Row unification, delimited continuations |
| Runtime cost                         | Zero — handlers inlined to direct calls               | Fiber per effect invocation              |
| Portability                          | Every target: effects are ordinary calls after expand | Each target needs continuation support   |
| Dynamic handler installation         | Not supported                                         | Supported                                |
| Multi-shot continuations             | Not supported                                         | Supported                                |
| Row-polymorphic handler reuse        | Not supported                                         | Supported                                |
| Effect-coverage diagnostics          | Supported, precise source spans                       | Supported, precise source spans          |
| Error-coverage diagnostics           | Supported                                             | Supported                                |
| Compatibility with future row system | Full — can graduate to rows without changing surface  | n/a                                      |

The surface syntax is identical across both substrates. If a future workload
requires dynamic handlers or multi-shot continuations, the row-polymorphic
substrate can be adopted without changing any DSL surface; only the
elaboration target changes.

## Integration Points

### With HTTP API authoring

`define-handler-group` in the HTTP API DSL maps directly:

- `:requires [BlobStore DatabaseManager]` is a declaration that the
  containing handler bodies may use those capabilities.
- Each `handle` form is compiled to a function that takes a capability
  record satisfying the declared `:requires`.
- The runtime translator (per target) constructs the capability record at
  service-wiring time.

No changes to the HTTP API authoring surface are needed; this spec
substantiates the Phase 0 / Phase 1 rows described there.

### With `define-form` and `meta-fn`

Form descriptors already declare boundary types through
`:produces` and slot type annotations. Those annotations become the
bidirectional checking anchors for handler bodies authored under a form.

### With the canonical IR

The IR gains no row-effect representation. `SuspendedExpr` is still the
handler body IR shape, but its contents are ordinary lambda-calculus plus
capability access. Translators to Effect-TS, Rust, Go, etc. consume it as
plain code — they do not need to reconstruct effect rows.

## Staging

1. **Week 1.** `define-operation`, `define-capability`, `!`-suffix desugaring,
   basic capability resolution.
2. **Week 2.** Missing-capability diagnostics with source spans; golden
   fixtures.
3. **Week 3.** `raise!` / `catch*` / error coverage; integration with
   `define-error` from the HTTP API DSL.
4. **Week 4.** Port the BlobApi handler corpus from
   `specs/compiler/ontology/http-api-authoring.md` end-to-end through the
   new pipeline. Measure inference time and diagnostic quality.

Pass criteria mirror the effect-row spike: correctness, diagnostic
legibility, ergonomics on real handlers, cold-typecheck under 5 seconds on
the full API corpus.

## Open Questions

1. **Operation namespacing.** Operations are keywords (e.g.,
   `:blob-store/upload`). If two capabilities in scope provide the same
   operation name, is the later binding a shadow or an error? Shadowing
   matches Lisp tradition; erroring is safer for DSL authors. Recommend
   erroring by default with an explicit `(:shadow true)` escape.
2. **Capability composition.** Should a capability be composable from other
   capabilities (`(compose-capabilities A B)`)? Useful for layered
   implementations; complicates scope resolution. Defer to v2.
3. **Testing hooks.** Tests need to install mock capabilities. `with-handler`
   covers this but the ergonomics for a test file of many overrides could
   benefit from a `with-handlers` multi-binding form. Cheap to add.
4. **Compile-time evaluation.** If an operation is marked `:pure true` and
   all its arguments are compile-time constants, can the elaborator
   evaluate it during compilation? Valuable for schemas and constants;
   dangerous for anything that can diverge. Defer.
5. **Interaction with the reader macro system.** `!`-suffix is currently
   lexical sugar applied at elaboration time. It could also be implemented
   as a reader macro. Recommend elaboration-time — it preserves source
   spans cleanly and keeps the reader simple.
6. **Graduation path.** If a future workload requires multi-shot
   continuations or dynamic handlers, how do we detect the boundary? An
   explicit `(define-operation … (:continuations :multi))` declaration
   should make the requirement visible at the operation site and gate the
   compiled-in runtime.

## Related

- [`language/type-system.md`](./type-system.md) — baseline type system;
  this primitive rests on plain HM.
- [`compiler/ontology/http-api-authoring.md`](../compiler/ontology/http-api-authoring.md)
  — primary consumer of this primitive.
- [`compiler/ontology/form-group-architecture.md`](../compiler/ontology/form-group-architecture.md)
  — form-descriptor machinery that anchors boundary types.
