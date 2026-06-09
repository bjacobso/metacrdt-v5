# Move F - Shared Host ABI

## Goal

Move consumers off the TypeScript language object graph before requiring an
OCaml runtime flip. The durable shape is:

```text
consumer -> packages/language-host -> TypeScript backend
consumer -> packages/language-host -> native OCaml backend
consumer -> packages/language-host -> JS OCaml backend
```

The TypeScript backend exists to let consumers migrate to the new source,
session, projection, diagnostic, and host-effect contract without also taking
every OCaml backend gap in the same change. The OCaml backends are the durable
engine direction, but Phase 1 does not flip runtime defaults.

## Current State

Move F is active. The first implementation slice has landed:

- `packages/language-host` defines the shared ABI types.
- `TsLanguageHost` adapts the current TypeScript language implementation.
- `NodeOcamlLanguageHost` adapts the native OCaml daemon/CLI when
  `packages/language-ocaml/dist/native/oo_lang_cli.exe` is available.
- `JsOcamlLanguageHost` adapts the JS OCaml artifact when
  `packages/language-ocaml/dist/js/jsoo_entry.cjs` is available.
- Runtime kernel evaluation can route through configured language backends.
- Action execution has action-scoped OCaml readiness evidence.
- MCP `execute-lisp` has global-runtime OCaml readiness evidence.

The remaining Move F work is contract hardening and default-decision readiness,
not more proof that a package can call both engines.

## Contract

The working contract is `specs/language/host-abi.md`, narrowed for the active
Move F gate to:

- version/capability reporting
- parse
- typecheck
- evaluate
- open/configure/load/evaluate/close session operations
- host builtin descriptors and host-effect pause/resume
- value projection and retained value operations
- stable diagnostics
- cancellation capability metadata
- backend availability and startup failure diagnostics

The public ABI must not expose `Env`, `KValue`, implementation `SExpr`,
TypeScript `Type` objects, or TypeScript error classes.

## Backend Posture

```text
Backend              Phase 1 posture
-------------------  -------------------------------------------------
TS                   Production default everywhere.
Native OCaml Node    Explicit opt-in only. Requires timeout and
                     cancellation-risk acknowledgement for broad runtime
                     selection.
JS OCaml Node        Host implementation exists. It must pass conformance and
                     action-shaped runtime tests before any default decision.
Bun                  TS-backed. Native OCaml is not available there.
Cloudflare           TS-backed. A JS/Wasm OCaml path would need separate
                     wiring and tests before selection.
```

ActionExecutionService and MCP must not flip together:

- action execution owns action-scoped backend selection and is tracked in
  `specs/runtime/execution/action-service-ocaml-backend-readiness.md`
- MCP `execute-lisp` follows the global runtime backend and is tracked in
  `specs/runtime/execution/mcp-execute-lisp-ocaml-backend-readiness.md`
- native in-flight cancellation/default posture is tracked in
  `specs/runtime/execution/ocaml-native-in-flight-cancellation-plan.md`

Native destructive daemon abort is a bounded interruption path. It is not the
same as cooperative production-grade cancellation, and it can invalidate native
sessions owned by the killed daemon.

## Phase 1 Gate

Phase 1 is complete when:

- `roadmap.md` and this file agree that Move F is active.
- `roadmap.md` no longer describes current state as having no selected Move F.
- `packages/language-host/test/conformance.test.ts` is the named host ABI
  conformance gate.
- `packages/language-host/test/import-boundary.test.ts` enforces old engine
  import boundaries, backend construction ownership, and Move F doc
  consistency.
- The import boundary audit below has no unclassified consumer leak.
- Runtime defaults remain unchanged.

Phase 1 does not flip runtime defaults, add new language syntax, add new
prelude forms, or expand ViewSpec behavior.

## Conformance Gate

`packages/language-host/test/conformance.test.ts` is the Move F conformance
gate. It covers the host ABI categories that currently matter:

- TS host availability and shared ABI behavior.
- Native OCaml host availability when the native artifact exists.
- JS OCaml host availability when the JS artifact exists.
- missing native and JS artifact diagnostics.
- native daemon startup failure, restart, timeout, and active abort behavior.
- parse projections, including keywords.
- typecheck projections, type policies, host builtin schemes, variadic host
  builtin schemes, disabled default builtins, and per-expression types.
- simple evaluation.
- session load/evaluate/close behavior.
- session binding reuse.
- host-effect pause/resume for session evaluation.

Optional native/JS backend cases are allowed to skip when their artifacts are
not built, but missing-artifact diagnostics must remain covered.

## Import Boundary Audit

The Phase 1 audit command is:

```bash
rg -n "from ['\"]@open-ontology/language|from ['\"]@open-ontology/lisp" \
  packages apps test tools
```

Current classifications:

```text
Path/pattern                                      Classification    Action
------------------------------------------------  ----------------  -----------------------------
packages/language-host/src/ts-host.ts            adapter-owned     allowed temporary TS backend
packages/language-host/package.json              adapter-owned     allowed dependency owner
packages/runtime/src/kernel/* language-host      adapter-owned     shared runtime bridge
packages/runtime/src/actions/* language-host     adapter-owned     configured runtime default
packages/runtime/src/pdf/* language-host         adapter-owned     configured runtime default
packages/runtime/api/src/mcp/* language-host     adapter-owned     configured runtime default
packages/runtime/api/src/handlers/ide.ts         adapter-owned     IDE parser through host ABI
packages/runtime/test* language-host             test-owned        allowed runtime coverage
packages/runtime/testkit/src/parser.ts           testkit-owned     parser helper through host ABI
packages/language/language-editor/*              adapter-owned     editor projections over host ABI
packages/compiler/compiler-editor/*              adapter-owned     editor projections over host ABI
packages/compiler/ontology-project/src/loader.ts adapter-owned     project parse through host ABI
packages/language-ocaml-lsp/test/parity.test.ts  test-owned        parity coverage
packages/web/app/routes/language.tsx             app-owned         host ABI route surface
packages/web/app/lib/lisp-pretty-print.ts        app-owned         host ABI AST projection
packages/web/app/components/dsl-editor/parser.ts app-owned         host ABI parser
packages/web/app/components/ontology-source/*    app-owned         local source-sexpr adapter over host ABI
packages/web/test/ontology-source-blocks.test.ts app-test-owned    local source-sexpr adapter coverage
packages/language/src/* and README.md            package-owned     old TS engine package internals/docs
```

The old direct web ontology-source imports from
`@open-ontology/language/reader`, `@open-ontology/language/sexpr`, and
`@open-ontology/language/formatter` have been drained behind
`packages/web/app/components/ontology-source/source-sexpr.ts`, which uses
`createDefaultLanguageHost`.

The broader object-name audit command is:

```bash
rg -n "\bEnv\b|\bKValue\b|\bSExpr\b|\bType\b" \
  packages/runtime packages/runtime/api packages/web packages/compiler \
  -g '*.ts' -g '*.tsx'
```

Current classifications:

```text
Path/pattern                                      Classification    Action
------------------------------------------------  ----------------  -----------------------------
packages/runtime/src/kernel/* KValue             adapter-owned     runtime host-effect bridge
packages/runtime/test/kernel/* KValue            test-owned        runtime bridge coverage
packages/compiler/descriptor-protocol/* SExpr    protocol-owned    descriptor parser internals
packages/compiler/protocol-codegen/* SExpr       protocol-owned    protocol parser/codegen internals
packages/compiler/ontology-compiler/* KValue     compiler-owned    compiler meta builtin internals
packages/web/app/components/ontology-source/*    app-owned         local source-sexpr type, not TS engine
false-positive UI text "Type"                    false-positive   no action
false-positive Effect Schema `.Type`             false-positive   no action
```

Any new consumer that needs parse, typecheck, evaluate, diagnostics, AST spans,
or value projections should import from `@open-ontology/language-host` or a
documented package-local adapter over it.

## Architecture Rules

- Do not expose `Env`, `KValue`, implementation `SExpr`, TypeScript `Type`
  objects, or TS error classes through the shared ABI.
- Normalize TypeScript reader output to the `keyword` AST contract before it
  crosses `LanguageHost`.
- Keep runtime host builtins as descriptors and host-effect dispatch in the
  public contract. The TS backend may emulate the old evaluator internally
  during migration.
- Keep regular OCaml `typecheck` AST-aware above typed core.
- Runtime production consumers must receive backend selection through
  `KernelService` configured defaults or the action-scoped selector, not by
  directly constructing `TsLanguageHost` or `NodeOcamlLanguageHost`.
- Non-Node platform runtime config remains TS-backed unless a tested non-native
  OCaml backend is wired for that platform.

## Verification

For Phase 1 changes, run:

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

Before committing, run:

```bash
pnpm format
```

## Move F Completion Bar

Move F can close when:

- all production parse/typecheck/evaluate consumers use `LanguageHost` or a
  package-local adapter over it.
- old TypeScript engine object graph imports are limited to the TS backend and
  explicitly documented bridge internals.
- TS, native OCaml, and JS OCaml pass shared conformance where their artifacts
  are available.
- runtime ActionExecutionService has a recorded default decision.
- MCP `execute-lisp` has a separate recorded default decision.
- cancellation/session invalidation posture is accepted per defaulted slice.
- docs and gates prevent reintroducing direct old engine imports.
