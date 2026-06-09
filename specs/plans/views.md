# Views — `@metacrdt/views`

Fold Open Ontology's ViewSpec into a new `@metacrdt/views` feature package, with
the view contract **generated from in-package Forma preludes** and the output
**vendored**. This is the first production exercise of `@metacrdt/forma`'s
descriptor codegen.

## Status at a glance

| Phase | What | Status |
|---|---|---|
| 1 | `@metacrdt/views` — ViewSpec contract + runtime, generated from Forma preludes (self-hosting) | ✅ shipped |
| 2 | Raw-JSON Entities model proof (headless; proves views never executes queries) | ✅ shipped |
| 3 | Inline ViewSpec→React renderer; Entities list renders from a ViewSpec | ✅ shipped |
| — | Effect-free `@metacrdt/views/runtime` entry (fixed a bundle regression) | ✅ shipped |
| 4 | Extract `@metacrdt/views-react` (deps: `@metacrdt/views/runtime` + react) | ⏳ later |
| 5 | Edge binding layer: ViewSpec `queries` → `@metacrdt/query` → Convex execution | ⏳ later |
| 6 | Ontology → ViewSpec authoring (Forma lens/view defs lower to ViewSpec) | ⏳ later |

Detail for each phase is in **Phases** below. Phases 1–3 + the runtime entry are
on PR #1. Phases 4–6 are independent follow-ons.

### Remaining work — entry points for the next sessions

- **Phase 4 (small, mechanical now):** move `src/views/ViewRenderer.tsx` into a new
  `packages/views-react` package depending on `@metacrdt/views/runtime` + react;
  re-point the app import. The runtime-only entry (its prerequisite) is already
  done. Grow the node coverage beyond the Entities subset as needed.
- **Phase 5 (touches the backend):** replace the hand-rolled `flattenEntityRows`
  edge in `src/pages/Entities.tsx` with a real binding resolver that reads a
  ViewSpec `queries` descriptor, builds a `@metacrdt/query` clause, runs it via
  Convex, and feeds the result into the runtime scope. Views stays query-agnostic.
- **Phase 6 (Forma authoring):** lower Forma view/board/nav/lens defs to ViewSpec
  — the ontology-aware *producer* of specs. Likely starts as Forma preludes / app
  code; a package only when proven.
- **Cleanup (optional):** split the generated Schema consts out of the
  catalog/normalizer module so `normalizeViewSpec`/`validateViewSpecStructure` can
  also move to `@metacrdt/views/runtime` (effect-free), letting hosts normalize
  untrusted specs without bundling the Schema IR.

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

- `queries` bindings → opaque data-dependency descriptors; the **edge** resolves
  them to folds over facts (where `@metacrdt/query` plugs in — outside views).
- `state` → view-local reactive state (still deterministic).
- `actions` / `events` → intentions that emit facts (writes under the same
  provenance).
- the whole spec → host-agnostic; one description, many renderers.

So `@metacrdt/views` is a **pure feature package**: depends on `effect` only,
never on a target, never on React, never on the query engine.

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
  package.json         # runtime dep: effect only
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
- **A drift test ties the knot:** `pnpm generate` into a temp dir, diff
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

`@metacrdt/views` **does not own:** the Forma→ViewSpec *authoring* lowering, the
renderer (a separate target), and — importantly — **query execution or any
knowledge of queries at all** (see below).

## Layering — views is query-agnostic and render-agnostic

The runtime already works the decoupled way: `evaluateViewExpression` resolves
expressions (e.g. `$queries.rows`) against a **scope the host hands it**. It
never executes anything. So views does **not** need to know about queries — it
only needs a declarative slot ("I depend on a dataset named `rows`"), which the
envelope's `queries` field provides as an **opaque descriptor**. Views must never
import `@metacrdt/query` or interpret the binding payload. Resolution is an edge
concern.

That gives a clean long-term layering:

```
@metacrdt/views          Pure contract + runtime. Knows: ViewSpec, expressions,
                         state, normalize/validate/evaluate. Deps: effect only.
                         Does NOT know: React, query execution, ontology, Convex.
                         Query bindings are opaque; the runtime evaluates against
                         a host-provided scope.

@metacrdt/views-react    A render *target*: ViewSpec node tree → React. Deps:
(eventually a package)   views + react. A package boundary is the strongest
                         guarantee React never leaks back into views. Prototyped
                         inline in `src/` first; extracted when proven/stable.

edge / binding layer     Resolves query bindings → @metacrdt/query clauses →
(app, later a package)   Convex execution, and feeds resolved data into the
                         runtime scope. This is where views meets queries — never
                         inside views itself.

ontology → view          Forma view/lens defs → ViewSpec lowering. Ontology-aware:
authoring (Forma, later) turns entity-type definitions into default ViewSpecs.
                         The producer of specs, distinct from the contract and the
                         renderer.
```

**Key correction to the original plan:** views does **not** depend on
`@metacrdt/query`. The earlier "bind queries to `@metacrdt/query`" step is
reframed as an *edge binding layer* that lives outside views.

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

Gates green: `pnpm test:packages`, `pnpm pack:packages`,
`pnpm typecheck`, `pnpm build` (packages + vite app). Pure extraction, no
behavior change.

### Phase 2 — Raw-JSON model proof (headless) — SHIPPED ✅

Proved the contract carries a real surface with **no renderer, no React, no query
execution, no ontology coupling**:

- `test/fixtures/entities-view.json` — a real "Entities of type X" ViewSpec
  authored as raw JSON: an `input`, a view-local `state` slot, an **opaque**
  `entities` query binding (`queryRef` + params — views never interprets it), and
  a `rows` layout containing a heading (expression-driven text) and a `table`
  (bind, columns, empty-state, `onRowClick`).
- `test/entities-view.proof.test.ts` (7 tests) — `normalizeViewSpec` +
  `validateViewSpecStructure` (no errors), `initializeViewState`, evaluate the
  heading text expression, resolve the table `bind` from host-provided
  `ctx.query` data, and a column projection over the resolved rows. A key
  assertion proves views **does not execute anything**: with nothing placed in
  `ctx.query`, the bind resolves to null — data only ever comes from the scope
  the edge provides.

`@metacrdt/views` stays `effect`-only. 32 tests total in the package.

### Phase 3 — Inline React renderer in `src/` — SHIPPED ✅

Minimal ViewSpec → React renderer, inline in the app:

- `src/views/ViewRenderer.tsx` — a switch on `node.type` covering the nodes the
  Entities view needs (`rows`, `columns`, `heading`, `text`, `table`,
  `empty-state`). Reads a normalized ViewSpec node + a host-provided
  `ViewRenderContext` (the eval scope + an `onRowActivate` host action). It is a
  render *target*; it never queries — data comes from `ctx.query`.
- `src/views/entitiesView.ts` — `buildEntitiesViewSpec(type, columns)` builds the
  Entities ViewSpec dynamically from the type's schema columns;
  `flattenEntityRows(...)` is the **edge** that flattens backend
  `queryEntities` rows into renderer-friendly scope rows.
- `src/pages/Entities.tsx` — the bespoke `typeSchemaAsOf` table is replaced by
  `<ViewRenderer node={spec.root} ctx={ctx} />`, fed by `queryEntities` +
  `typeSchemaAsOf`; row click navigates to the entity. First *visible* proof.

Verified: app `tsc --noEmit`, full `pnpm build` (packages + vite app), and a
`react-dom/server` smoke render (table with status badges, denied-attribute
handling, mono ids, clickable rows; empty-state path). Package stays
`effect`-only; the app gained `@metacrdt/views` as a dependency.

**Finding + fix — runtime-only entry — SHIPPED ✅:** importing `@metacrdt/views`
pulled the full Effect `Schema` IR into the app bundle (665 kB; +260 kB) because
`index.ts` does `export * from "./generated/*"` and the Schema consts are
side-effectful — even importing just `evaluateViewExpression` cost 373 kB.

Fixed by splitting the effect-free runtime into `src/runtime.ts` (expression /
value eval, state init, path helpers, and the plain types — imports **only types**
from the generated IR) and exposing it as the `@metacrdt/views/runtime` subpath.
`@metacrdt/views` (main entry) re-exports it and remains the superset with
`normalizeViewSpec` / `validateViewSpecStructure` + the full Schema IR. The app
renderer + `entitiesView` now import from `@metacrdt/views/runtime` and author the
spec in already-normalized shape (no `normalizeViewSpec`).

Result (esbuild, minified): eval from `/runtime` = **3.2 kB** vs **373 kB** from
the main entry; the whole runtime entry is 4.7 kB. App bundle back to **410 kB**
(baseline + ~5 kB for the renderer). `normalizeViewSpec`/`validateViewSpecStructure`
can move to `/runtime` too once the generator splits the Schema consts out of the
catalog/normalizer module.

### Phase 4 (later) — Extract `@metacrdt/views-react`

Once the inline renderer is real and stable, extract it to `@metacrdt/views-react`
(deps: `@metacrdt/views/runtime` + react) so the React boundary is hard-enforced.
Extract-when-proven, not before. The **runtime-only entry prerequisite is already
done** (see the Phase 3 finding) — `@metacrdt/views-react` will depend on
`@metacrdt/views/runtime`, not the Schema-bearing main entry.

### Phase 5 (later) — Edge binding layer

Resolve ViewSpec `queries` bindings → `@metacrdt/query` clauses → Convex
execution, feeding resolved data into the runtime scope. Lives at the edge (app,
later possibly a `views-convex` package). Views never imports `@metacrdt/query`.

### Phase 6 (later) — Ontology → ViewSpec authoring lowering

Forma view/board/nav/lens defs → ViewSpec. The ontology-aware producer of specs.
Likely starts as Forma preludes / app code; becomes a package only when proven.

## Acceptance — Phase 1 — MET ✅

- [x] `packages/views` exists as `@metacrdt/views`.
- [x] README stating ownership / non-ownership.
- [x] No import from `.context/open-ontology`.
- [x] Runtime tests + drift test (`generated-sources.test.ts`) green; IR snapshot
  tests green (25 tests total).
- [x] Runtime depends only on `effect`; `@metacrdt/forma` is a build-time
  devDependency only.
- [x] `pnpm test:packages`, `pnpm build:packages`, `pnpm pack:packages`,
  `pnpm typecheck`, `pnpm build` pass.

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
