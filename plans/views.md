# plans/views.md — `@metacrdt/views`

Fold Open Ontology's ViewSpec into a new `@metacrdt/views` feature package, with
the view contract **generated from in-package Forma preludes** and the output
**vendored**. This is the first production exercise of `@metacrdt/forma`'s
descriptor codegen.

## North Star

A view is **derived coherence** — a deterministic projection of facts — and
ViewSpec is the description of that projection. The view contract is itself an
ontology: a component catalog authored in Forma that *lowers* to a typed IR. So
the substrate describes its own UI layer in the same language it describes
everything else (fact → fold → projection), one level up.

Target end state: `@metacrdt/views` owns `preludes/*.lisp` + an in-package Forma
`generate` step + the vendored Schema output + the runtime, guarded by a drift
test. The Schema regenerates from Forma; it is never hand-maintained.

## What ViewSpec Is (scoped from `.context/open-ontology`)

`@open-ontology/view-protocol` is an accepted spec, not a sketch: an 817-line
pure runtime (`src/index.ts`) plus a generated Schema IR.

- **Envelope:** `$viewSpec.version`, `input`, `state`, `queries`, `defs`,
  `theme`, `root` — a declarative, data-native, query-aware UI description.
- **Six IR modules:** view-expression, view-action, view-event, view-state,
  view-node, view-spec.
- **Pure runtime:** `normalizeViewSpec`, `validateViewSpecStructure`,
  `evaluateViewExpression` / `evaluateViewValue`, `initializeViewState`, and path
  helpers (`get` / `set` / `patchValueAtPath`).
- Already **Effect/Schema-based** — arrives on the Effect-native mandate, no
  rewrite needed.

The mapping into MetaCRDT is exact:

- `queries` bindings → folds over facts (where `@metacrdt/query` plugs in).
- `state` → view-local reactive state (still deterministic).
- `actions` / `events` → intentions that emit facts (writes under the same
  provenance).
- the whole spec → host-agnostic; one description, many renderers.

So `@metacrdt/views` is a **pure feature package**: depends on `effect`
(+ later `@metacrdt/query` for query bindings), never on a target, never on
React.

## The Generation Flow (confirmed)

```
preludes/ui.lisp + views.lisp        ← component catalog, authored in Forma
        │   (define-form entity-browser (:view/component …) (:slots …) (:events …))
        ▼
parseDescriptorPrelude  (Forma reader → descriptors)
        ▼
DescriptorCodegen       → src/generated/*.generated.ts   (Effect Schema IR)
        ▼
runtime (index.ts)      normalize / validate / evaluate; web + MCP renderers consume it
```

The ViewSpec protocol IR is **generated from Forma `define-form` definitions**.
The component catalog (entity-browser, action-button, slots, events, validation)
is authored in Forma; the typed protocol is a derived projection of it.

### Why this is mostly wiring, not greenfield

`@open-ontology/compiler-protocol-codegen` was essentially forma's descriptor
layer. Of the six functions OO's view codegen used:

- `buildProtocolObjectDescriptors`, `emitProtocolObjectSchema`,
  `emitProtocolModule` → **already in** `packages/forma/src/Descriptor.ts`,
  exported via `DescriptorCodegen`.
- `parseDescriptorPrelude` / `parseDescriptor` → **not yet named exports**, but
  forma is the Lisp reader and `descriptor/parse-descriptor.ts` exists. Small
  wiring job (reader + parse-descriptor), not a missing engine.

So "generate ViewSpec Schema from Lisp" is ~90% already in the monorepo.

## Chosen Layout — prelude-in-package, not a `view-ir` package

```
packages/views/
  preludes/
    ui.lisp            # neutral component catalog (Forma source of truth)
    views.lisp         # ontology-aware forms: entity-browser, action-button…
  scripts/
    generate.ts        # forma DescriptorCodegen: preludes/*.lisp → src/generated/*.ts
  src/
    generated/         # VENDORED output, committed — the Effect Schema IR
    index.ts           # runtime: normalize / validate / evaluate (ports OO index.ts)
  views.test.ts        # runtime tests + a DRIFT test
  package.json         # runtime dep: effect (+ later @metacrdt/query)
                       # devDep: @metacrdt/forma  ← build-time only
```

Properties that make this "best of both worlds":

- **Source of truth = the in-package Lisp prelude.** The catalog is owned by the
  package whose protocol it defines.
- **forma is a build-time devDependency.** It runs `generate`; the shipped
  runtime + vendored Schema depend only on `effect`. Consumers never need forma —
  embeddability and the held-v4 posture are preserved.
- **The generated Schema is committed (vendored).** Ships now; no codegen at
  install time.
- **A drift test ties the knot:** `npm run generate` into a temp dir, diff
  against committed `src/generated/`, fail if stale. Vendored stability + the
  source can't silently rot. (The snapshot pattern OO used, but enforced.)
- **It exercises forma for real, now** — the first production use of forma's
  descriptor codegen on real Lisp. Low-stakes, self-contained.

### Why this beats a separate `view-ir` package

1. **Cohesion / one version.** The IR, its Lisp source, and the runtime that
   consumes it change and version together.
2. **Extract only when the boundary is proven.** The IR has exactly one
   consumer (the views runtime) → no package. Keep it a folder.
3. **The engine already has a home.** The codegen lives in `@metacrdt/forma`
   (`DescriptorCodegen`); a `view-ir` package would be an empty boundary.
4. The self-hosting story lands in one unit: "the view contract is generated
   from Forma, inside the package that owns it."

Split later **only** if a second protocol gets generated the same way (e.g. a
forms-protocol, or a JIT HttpApi contract). Then the *generate harness* (not the
IR) might graduate into a shared `@metacrdt/forma/codegen` entry. That is a
harness extraction, never a `view-ir` data package.

## Ownership

`@metacrdt/views` **owns:** the ViewSpec Schema IR (generated), the `preludes/`
source, the in-package generate step, `normalizeViewSpec`,
`validateViewSpecStructure`, `evaluateViewExpression`, `initializeViewState`,
path helpers.

`@metacrdt/views` **does not own:** the Forma→ViewSpec *authoring* lowering
(view/board/nav/lens defs — lives in the OO compiler, a separate fold), the
renderer (web/MCP — stays in the app), query execution (delegates to
`@metacrdt/query`).

## The De-risking Spike — DONE ✅ (it round-trips)

The whole layout rested on one unproven seam: can forma read a `.lisp` prelude →
descriptors → emit the Schema that OO's `view-node.generated.ts` etc. produced?

**Result: it round-trips exactly.** `@metacrdt/forma/descriptor` re-exports
*every* protocol-codegen function OO's `generate-view-node.ts` imported (22 of
23 identically; the 23rd, `parseDescriptorPrelude`, is forma's `parsePrelude`
with the same `{ forms }` shape). The OO type names map cleanly
(`DescriptorFormDescriptor`→`FormDescriptor`, `DescriptorSlotSpec`→`SlotSpec`,
`DescriptorValidationCheck`→`ValidationCheck`; the rest identical). Adapting the
codegen was purely swapping the import source and aliasing those four symbols —
the script bodies are byte-identical to OO's.

Running the forma-driven generate produced all six Schema modules, and the
ported OO test suite (25 tests) passes against them: the IR-snapshot tests
confirm forma's descriptor IR matches OO's committed snapshots byte-for-byte, and
`generated-sources.test.ts` confirms the committed generated TS matches a fresh
forma render.

**So Phase 1 ships as the self-hosting version** — "vendor now, self-host later"
collapsed into one step.

## Phases

### Phase 1 — Stand up `@metacrdt/views` — SHIPPED ✅ (self-hosting)

`packages/views` exists as `@metacrdt/views`:

- `preludes/{ui,viewspec,viewspec-protocol}.lisp` — the Forma source of truth.
- `scripts/generate-view-node.ts` (+ `protocol-ir-snapshots.ts`,
  `viewspec-ir-snapshots.ts`, and the two `snapshot:*` CLIs) — drive
  `@metacrdt/forma`'s descriptor codegen over the preludes.
- `src/generated/*.generated.ts` — vendored, committed Schema IR.
- `src/index.ts` — ported pure runtime (normalize/validate/evaluate/path
  helpers), `effect`-only.
- `test/*` — 25 tests: contract, IR-snapshot conformance, runtime behavior, and
  the drift guard.
- `@metacrdt/forma` is a build-time devDependency only; the shipped runtime +
  vendored Schema depend only on `effect`.

Gates green: `npm run test:packages`, `npm run pack:packages`,
`npm run typecheck`, `npm run build` (packages + vite app). Pure extraction, no
behavior change.

### Phase 2 — Wire one real view

Re-express the Entities list (`convex/entities.ts` `queryEntities` + `src/pages/*`)
as a ViewSpec evaluated against event-log facts, replacing bespoke
`typeSchemaAsOf` column shaping for that one surface.

### Phase 3 — Bind queries to `@metacrdt/query`

View `queries` bindings become real folds over facts.

### Phase 4 (later) — Authoring lowering + renderer

Forma view/board/nav/lens → ViewSpec lowering (separate fold). A web/MCP
renderer (stays in the app, not the package).

## Acceptance — Phase 1 — MET ✅

- [x] `packages/views` exists as `@metacrdt/views`.
- [x] README stating ownership / non-ownership.
- [x] No import from `.context/open-ontology`.
- [x] Runtime tests + drift test (`generated-sources.test.ts`) green; IR snapshot
  tests green (25 tests total).
- [x] Runtime depends only on `effect` (+ later `@metacrdt/query`);
  `@metacrdt/forma` is a build-time devDependency only.
- [x] `npm run test:packages`, `npm run build:packages`, `npm run pack:packages`,
  `npm run typecheck`, `npm run build` pass.

## What we get by expressing ViewSpec as Forma preludes

- **One source of truth, zero contract drift** — the spec's own goal: one
  versioned contract shared by compiler, web renderer, MCP renderer, future
  hosts. Add a component = add one `define-form` + regenerate.
- **Homoiconic / macro-extensible** — new components, aliases, slot types,
  validation are library code in Forma, not host-TypeScript changes.
- **Agent-authorable & reviewable** — a component catalog as a small Lisp file is
  a natural surface for an agent to propose a new component (the
  agent-participation seam lands here).
- **Uniform & self-describing** — the UI layer is "just another ontology that
  lowers to the typed IR," same reader / descriptor / provenance as everything
  else.
- **Cross-host determinism** — the contract is generated and versioned, so every
  renderer shares it exactly.

The cost is owning the descriptor-codegen + prelude-as-source — but forma
already holds the descriptor half, so the marginal cost is the preludes + wiring.
