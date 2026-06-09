---
title: Editor Services Audit
created: 2026-04-30
updated: 2026-04-30
status: active
layer: language
tags:
  - ocaml
  - abi
  - editor
  - web
---

# Editor Services Audit

The existing OCaml editor services are sufficient for the current migration
boundary. They should stay out of `KernelHost` and remain a separate web-facing
language-service surface.

## Consumer Survey

`packages/runtime/src/kernel/KernelHost.ts` only needs evaluation, typecheck,
projection, and value/runtime helpers. It has no hover, completion, definition,
format, rename, symbol, or signature-help surface. Runtime consumers should not
gain editor operations during `OcamlKernelHost`; doing so would mix execution
with authoring UX and make the one-flip runtime migration larger.

`packages/web/app/routes/language.tsx` still uses TypeScript `inferSourceAll`,
`showType`, and diagnostic classes for the notebook-style language page. That
is covered by the host ABI `typecheck` replacement, not by editor-specific ops.

`packages/language-editor` currently derives diagnostics and hover
from TypeScript `analyzeLsp`, and accepts pluggable providers for completions,
hover, diagnostics, and semantic highlighting. Those map to the OCaml surface as
follows:

| Editor need           | OCaml op           | Notes                                                   |
| --------------------- | ------------------ | ------------------------------------------------------- |
| diagnostics on change | `editorAnalyze`    | Returns `diagnostics` and `typedCore` in one pass.      |
| type hover            | `editorHover`      | Returns the smallest typed span at `offset`.            |
| completions           | `editorCompletion` | Returns builtin, document, and session type-env labels. |
| go to definition      | `editorDefinition` | Returns local top-level definition targets.             |
| formatting            | `editorFormat`     | Formats parsed source through the existing formatter.   |

`packages/compiler/compiler-editor` provides ontology-specific completions,
hover text, diagnostics, and semantic ranges from descriptor metadata. That
behavior belongs above the generic language service. The OCaml editor ABI should
not grow ontology-aware operations for it.

## Frozen OCaml Surface

The frozen OCaml editor operations are:

- `editorAnalyze`
- `editorHover`
- `editorCompletion`
- `editorDefinition`
- `editorFormat`

All five accept either an inline `source`, or `sessionId` plus `sourceId`.
Position-sensitive operations use the existing `offset` request field.

All five return:

```text
{
  ok: true,
  value: {
    ...operationFields,
    diagnostics: Diagnostic[]
  }
}
```

Operation-specific fields are:

| Op                 | Operation fields                              |
| ------------------ | --------------------------------------------- |
| `editorAnalyze`    | `typedCore`, `definitions`, `completionItems` |
| `editorHover`      | `hover`                                       |
| `editorCompletion` | `items`                                       |
| `editorDefinition` | `definition`                                  |
| `editorFormat`     | `text`                                        |

This is intentionally separate from `specs/language/host-abi.md` `KernelHost`.
The runtime host ABI remains the execution/typecheck contract. A future web
adapter should own the editor surface.

## Web Adapter Shape

Do not implement this yet, but the migration target is a small `WebKernelHost`
or `LanguageServiceHost` wrapper:

```text
LanguageServiceHost
  analyze(source | session document) -> editorAnalyze
  hover(source | session document, offset) -> editorHover
  completion(source | session document, offset) -> editorCompletion
  definition(source | session document, offset) -> editorDefinition
  format(source | session document) -> editorFormat
```

The wrapper should translate OCaml diagnostics and typed spans into CodeMirror
and React editor objects. Compiler-specific editor providers can continue to
compose on top of that wrapper.

## Deferred Ops

No new OCaml editor ops are needed now.

Rename/refactor, signature help, document symbols, semantic tokens, and
descriptor-aware semantic highlighting are deferred until a concrete web
consumer asks for them. The current compiler editor already implements
descriptor-aware completions, hover, diagnostics, and semantic ranges on the
TypeScript side, and none of those require new language surface or HM features.
