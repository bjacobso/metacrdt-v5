# @open-ontology/language-ocaml-lsp

Node-side Language Server Protocol wrapper for the OCaml language engine.

The server is intentionally thin:

- LSP protocol is handled by `vscode-languageserver`.
- Editor semantics go through OCaml-owned `editor*` JSON ABI operations.
- The default transport is the existing JS artifact at `packages/language-ocaml/dist/js/jsoo_entry.cjs`.
- One OCaml session is kept open per LSP workspace so prelude loading is amortized.

## Build

```bash
pnpm build --filter @open-ontology/language-ocaml
pnpm --dir packages/language-ocaml-lsp build
```

## Run

```bash
pnpm --dir packages/language-ocaml-lsp build
node packages/language-ocaml-lsp/dist/server.js --stdio
```

Useful environment variables:

- `OPEN_ONTOLOGY_OCAML_LSP_ARTIFACT`: override the JS-OCaml artifact path.
- `OPEN_ONTOLOGY_OCAML_LSP_PRELUDES`: comma-separated prelude names to load from `preludes/`. Use `none` to disable prelude loading for focused tests.
- `OPEN_ONTOLOGY_OCAML_LSP_ENABLE_FORMATTING=1`: register `textDocument/formatting`. Formatting is disabled by default until the OCaml formatter preserves comments and reader sugar.
- `OPEN_ONTOLOGY_WEB_LANGUAGE_LSP=ocaml`: documented opt-in flag for web-app integration. The web app does not consume it yet; the TS LSP remains the default until side-by-side soak is complete.

## Capabilities

The exposed surface matches the TS authoring LSP surface:

- `textDocument/didOpen`
- `textDocument/didChange`
- `textDocument/didClose`
- `textDocument/publishDiagnostics`
- `textDocument/hover`
- `textDocument/completion`
- `textDocument/definition`
- `textDocument/formatting` when `OPEN_ONTOLOGY_OCAML_LSP_ENABLE_FORMATTING=1`
- `initialize`, `initialized`, `shutdown`, `exit`

Current implementation notes:

- Diagnostics come from `editorAnalyze`, which projects parse/expand/lower/typecheck diagnostics.
- Hover uses OCaml typed-core annotations and returns the smallest typed span under the cursor.
- Completion uses OCaml editor-service completion items from core forms, source definitions, and session type environment names.
- Definition uses OCaml source-symbol resolution over editor-service definitions.
- Formatting uses OCaml `editorFormat`, but the LSP only registers it when `OPEN_ONTOLOGY_OCAML_LSP_ENABLE_FORMATTING=1`.

## Parity Gate

Run:

```bash
pnpm --dir packages/language-ocaml-lsp test:parity
```

The parity harness covers diagnostics, hover, completion, definition, and formatting fixtures. Diagnostics are compared against the TS `analyzeLsp` library with normalization to `none`/`some` because diagnostic wording differs across engines.

Known parity gaps:

- Completion is still a semantic baseline: core forms, top-level/source definitions, and session type-environment bindings. Descriptor slot-sensitive completions are not yet projected.
- Definition resolves source-level symbols to known source definitions. Local binding definition resolution is not yet complete.
- Formatting is AST-based and does not preserve comments or reader sugar until the OCaml formatter uses the lossless CST. It stays opt-in so authoring clients do not silently rewrite source.

Parity status: the smoke fixture set passes when `packages/language-ocaml/dist/js/jsoo_entry.cjs` is present and current. If the artifact is missing, parity tests report the missing build and skip runtime assertions.

## Web App Opt-In Plan

Do not flip the web app default as part of this package. To exercise the OCaml LSP side-by-side later, add a web integration point that checks:

```bash
OPEN_ONTOLOGY_WEB_LANGUAGE_LSP=ocaml
```

When set, the web app should launch or proxy `oo-language-ocaml-lsp`; otherwise it should continue using the TS engine path.
