# @metacrdt/views

A host-agnostic **ViewSpec** contract for MetaCRDT: a declarative, data-native,
query-aware description of a UI, plus the pure runtime that normalizes,
validates, and evaluates it.

A view is **derived coherence** — a deterministic projection of facts — and
ViewSpec is the description of that projection. The view contract is itself an
ontology: a component catalog authored in Forma that *lowers* to a typed Effect
Schema IR. The substrate describes its own UI layer in the same language it
describes everything else.

## What this package owns

- **`preludes/*.lisp`** — the ViewSpec component catalog and protocol, authored
  in Forma. This is the source of truth.
  - `ui.lisp` — the neutral component catalog (`define-form` per component).
  - `viewspec.lisp` — the ViewSpec view-node descriptors.
  - `viewspec-protocol.lisp` — the expression/action/event/state/envelope
    protocol descriptors and the descriptor-tree protocol registry.
- **`scripts/generate-view-node.ts`** — the in-package generate step. It runs
  `@forma/ts`'s descriptor codegen over the preludes and emits the Effect
  Schema IR. Forma is a **build-time devDependency only**.
- **`src/generated/*.generated.ts`** — the **vendored** Schema IR (committed).
  Treated as generated artifacts; never hand-edited.
- **`src/index.ts`** — the pure ViewSpec runtime: `normalizeViewSpec`,
  `validateViewSpecStructure`, `evaluateViewExpression` / `evaluateViewValue`,
  `initializeViewState`, and the path helpers (`getValueAtPath`,
  `setValueAtPath`, `patchValueAtPath`).

## What this package does not own

- **The Forma → ViewSpec authoring lowering** (view/board/nav/lens defs). That
  is a separate fold in the compiler layer.
- **The renderer.** ViewSpec is host-agnostic; the web/MCP renderer lives in the
  host application, not here.
- **Query execution.** View `queries` bindings delegate to `@metacrdt/query`.

## Dependencies

- **Runtime:** `effect` only. The shipped runtime + vendored Schema never import
  Forma, a target, or React — so the package stays embeddable.
- **Build-time (devDependency):** `@forma/ts` runs the generate step.
  Consumers never need it.

## Regenerating the IR

```sh
pnpm --filter @metacrdt/views generate          # regenerate src/generated/*
pnpm --filter @metacrdt/views snapshot:protocol-ir
pnpm --filter @metacrdt/views snapshot:viewspec-ir
```

The committed output can't silently rot: `test/generated-sources.test.ts`
re-renders every module from the preludes and asserts it matches the committed
files (a **drift test**), and the IR snapshot tests assert the descriptor IR
matches the committed snapshots.

## Tests

- `generated-sources.test.ts` — drift guard (generated files match a fresh render).
- `generated-*-contract.test.ts` — the generated Schema matches the runtime contract.
- `protocol-ir-snapshots.test.ts` / `viewspec-ir-snapshots.test.ts` — descriptor
  IR conformance against committed snapshots.
- `protocol-conformance.test.ts` / `structure-validation.test.ts` — runtime
  normalize / validate / evaluate behavior.
