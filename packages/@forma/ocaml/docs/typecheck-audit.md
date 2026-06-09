---
title: Typecheck ABI Audit
created: 2026-04-30
updated: 2026-04-30
status: active
layer: language
tags:
  - ocaml
  - abi
  - typecheck
---

# Typecheck ABI Audit

The `typecheck`, `typecheckCore`, and `typecheckCoreTyped` ABI operations share
the same HM inference implementation for lowered core expressions. The remaining
difference is the source-level prelude around that inference path: `typecheck`
accepts surface forms and must keep AST-aware declaration handling before it can
delegate regular forms to typed core.

## Shared Path

`typecheckCore` and `typecheckCoreTyped` lower directly into `Core_ast.program`
and run `Typecheck.typecheck_core_program_typed_with_descriptor_infer`.

`typecheck` expands source forms, handles source-only declarations in
`Typed_toplevel`, lowers ordinary expressions, and then calls the same typed-core
inference callbacks. This means expression inference, descriptors, records,
functions, match checking, builtin application, typeclass application, and
diagnostic construction are already shared after lowering.

## Surface-Only Work

These forms are intentionally unique to `typecheck` because they either mutate
the source-level type environment or do not have a standalone core form:

- `define-typeclass` and `instance`
- `define-type`
- `define-form`
- `meta-fn`
- `define-protocol`
- `define-elaboration`
- `define-elaboration-primitive`
- `define-payload-contract`
- `defmacro` and `define-macro`
- legacy/ascription pairs like `(: symbol Type)` followed by the bound form
- effect type annotations and `define-effect`

`typecheck` also owns AST-aware warnings that should not be duplicated in
typed-core: keyword literal warnings and simple ADT match coverage warnings.

## ABI Policy Hook

The host ABI's `typePolicy.unboundSymbols` option is applied before effect
registry collection and before the `Typed_toplevel` pass. It only creates
bindings for symbols that are not already present in the current type
environment. Supported match patterns are:

- `{kind:"exact", value:"name"}`
- `{kind:"prefix", value:"?"}`

Supported type policy names are the primitive type names accepted by the ABI
projection: `Int`, `Float`, `Bool`, `String`/`Str`, `Unit`/`Nil`, `Keyword`,
`Symbol`, `Syntax`, and `Any`.

The response preserves the historical top-level `type` and `diagnostics` fields
while adding a `value` projection object. `result:"summary"` is the default.
`result:"per-expression"` is accepted and returns the same summary plus an
`expressionTypes` slot; source-span-level expression projections remain a future
extension once the typed top-level pass preserves per-form typed-core output.

## Conclusion

Do not replace `typecheck` with `typecheckCore` wholesale yet. The correct
consolidation point is below the surface declaration layer: keep one AST-aware
source operation, keep one typed-core inference engine, and route any new
source-level ABI policy through the environment that both paths already share.
