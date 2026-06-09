# MetaCRDT package consolidation proposal

**Status:** Draft proposal  
**Scope:** Fold the useful Open Ontology packages and specs into this repository
as the canonical `@metacrdt/*` monorepo, without prematurely copying the whole
old package graph.

Open Ontology now lives in this repo as a context submodule:

```text
.context/open-ontology → https://github.com/bjacobso/open-ontology
```

Treat it as source material: prior implementation, specs, tests, language work,
and package-boundary research. The canonical project is now **MetaCRDT**. The
task is not to preserve the Open Ontology package names. The task is to absorb
the durable concepts under the MetaCRDT primitive:

> a convergent graph of facts, constraints, intentions, and effects.

This proposal defines where the Open Ontology packages land, what gets renamed,
what gets merged, and what should stay archived until the new boundaries are
proven.

---

## Update (2026-06-09): the Forma language layer moved to `@forma/*`

The language layer is no longer a proposal — it has been extracted into a
dedicated scope, `packages/@forma/*`, segregated from the rest of `@metacrdt/*`.
The proposal below predates the move and floated `@metacrdt/forma*`-style names;
the shipped scope is `@forma/*`, and the destination columns have been updated to
match what actually landed.

| Old (Open Ontology) | Now in this repo | Notes |
| --- | --- | --- |
| `@open-ontology/language-ts` | **`@forma/ts`** | The TypeScript Forma engine (reader, evaluator, VM, HM types, descriptor/codegen). Pure; depends only on `effect`. |
| `@open-ontology/language-ocaml` | **`@forma/ocaml`** | OCaml engine built from source via dune (native + js_of_ocaml + wasm). `private`; consumed by `@forma/host` over a filesystem path, not as a module. Toolchain pinned by `mise.toml`. |
| `@open-ontology/language-host` | **`@forma/host`** | The shared ABI facade bridging the TS and OCaml engines. Its conformance suite runs TS, native-OCaml, and JS-OCaml against the same operations. |
| `@open-ontology/language-ocaml-lsp` | **`@forma/ocaml-lsp`** | LSP server over `@forma/host`. |
| `@open-ontology/language-editor` | **`@forma/editor`** | CodeMirror + React editor integration. Generates its Lezer parser at build time. |
| `@open-ontology/language-e2e` | *(dissolved into tests)* | See below — its engine-parity job is already covered by `@forma/host`'s conformance suite. |

**The boundary that makes this clean:** Forma terminates at a typed descriptor /
Effect Schema. Everything past that — CanonicalIR, lowering to facts, execution —
is a MetaCRDT concern. That is what keeps `@forma/*` runtime-neutral.

### Where the left-behind middle layer fits

`language-e2e` and the `ontology-compiler` / IR closure were intentionally **not**
moved (they would drag in ~10 more packages). They are the *bridge* between
authoring (`@forma/*`) and facts/execution (`@metacrdt/*`):

```text
@forma/ts ── elaborate ──► typed descriptor ──► CanonicalIR ──► facts ──► query/runtime
@forma/ocaml               (Forma ends here)     └──────── MetaCRDT owns this ───────┘
```

| Left-behind package | Future home | Rationale |
| --- | --- | --- |
| `ontology-ir` (CanonicalIR) | `@metacrdt/runtime` first → maybe `@metacrdt/ir` later | The harness contract / load-bearing boundary. Don't make it standalone until a 2nd target or compiler needs it. |
| `ontology-compiler` | **splits** — front half already in `@forma/ts`; back half (lower→IR, datalog type-check) → `@metacrdt/runtime` | It does not move as a unit; it is cut at the IR boundary. |
| `ontology-project` (workspace/source-graph loading, markdown extraction) | `@metacrdt/cli`/`sdk`, or `@forma/project` | Depends only on `@forma/host`; authoring-workspace tooling, not substrate. |
| `logic-ast` (TypeExpr/Datalog/LogicExpr grammars) | `@metacrdt/query` | Query already owns clause syntax + planning; this is the typed front of derivation. |
| `view-protocol` | `@metacrdt/views` | Views already consumes `@forma/ts/descriptor`. |
| `compiler-descriptor-protocol` / `compiler-protocol-codegen` | fold into IR/runtime contracts; codegen → `@metacrdt/cli` | Thin protocol/tooling layers. |
| `language-e2e` | `@forma/host` conformance + `@metacrdt/testkit` | Not a public package. Its engine-parity half is **already** covered by `@forma/host`'s conformance suite (it runs all three engines side by side); only its compiler-level fixtures wait for the compiler pieces to land. |

### The one decision still open

Reframed now that `@forma/*` is real: **is CanonicalIR a Forma output (`@forma/ir`)
or a MetaCRDT input (`@metacrdt/ir`)?**

Recommendation: **MetaCRDT input.** Forma already terminates at an Effect Schema;
keeping lowering-to-facts out of Forma is exactly what preserves its
runtime-neutrality. Concretely: fold IR + the compiler back-half into
`@metacrdt/runtime` now, and only carve out `@metacrdt/ir` when a second target or
a second compiler (e.g. the OCaml engine emitting IR directly) proves the boundary.

---

## Decision summary

1. **This repository becomes the canonical MetaCRDT monorepo.**
   `.context/open-ontology` remains a pinned reference until the useful code and
   specs have been folded in.
2. **The Lisp language is formalized as `@forma/ts`.**
   Forma owns the generic Lisp reader/evaluator/type/tooling layer. It is not the
   ontology runtime and not the product. It is the authoring language.
3. **`@metacrdt/core` stays the first extracted package.**
   It is the pure convergence kernel. Everything else must eventually build on
   it or target it.
4. **No `@metacrdt/triplestore` package at first.**
   The old triple-store/database work is split by responsibility:
   `@metacrdt/core` owns event/fold semantics, `@metacrdt/query` owns Datalog and
   derivation, and target packages own persistence adapters. A package named
   `triplestore` would accidentally re-center the old storage model instead of
   the MetaCRDT protocol.
5. **ViewSpec becomes `@metacrdt/views`.**
   Views are schema-described response surfaces over facts. They should be
   runtime-agnostic and UI-framework-agnostic.
6. **Targets are separate from features.**
   `@metacrdt/cloudflare` is a target, not a workflow package. `@metacrdt/convex`
   is a target, not the substrate. `@metacrdt/runtime` is the IR and service
   harness that features compile against.
7. **Migration is by extraction, not bulk copy.**
   Each package gets pulled only when it has a stable MetaCRDT owner, a README,
   passing tests, and no hidden dependency on `.context/open-ontology`.

---

## Target package graph

```text
packages/
├── core/              @metacrdt/core       # done: SPEC §4-5 kernel
├── forma/            @forma/ts      # Lisp reader/evaluator/types/tooling
├── schema/           @metacrdt/schema     # done: ids, cardinality, meta attrs, definition lowering
├── query/            @metacrdt/query      # done slices: parser, operators, rows, aggregation, emit shaping, planner, dedupe, source inputs, join expansion, negation/state/limit/bound-var/frame helpers
├── workflow/         @metacrdt/workflow   # durable steps, processes, obligations
├── collect/          @metacrdt/collect    # forms, collection, prompt-response
├── views/            @metacrdt/views      # ViewSpec / response surfaces
├── agent/            @metacrdt/agent      # agent actors, proposals, skills
├── runtime/          @metacrdt/runtime    # done: services + memory/localStorage + BroadcastChannel + p2p
├── sql/              @metacrdt/sql        # storage adapter: relational triple-store DDL + queries (sqlite/postgres dialects)
├── convex/           @metacrdt/convex     # target (managed): component-owned log + projections + cardinality / bindings
├── cloudflare/       @metacrdt/cloudflare # target (managed): DO storage + WebSocket relay + Worker example
├── local/            @metacrdt/local      # target (browser): localStorage + IndexedDB + SQLite + BroadcastChannel
├── node/             @metacrdt/node       # done: open host memory + structural SQLite/Postgres + shared SQL lifecycle plan + HTTP/SSE handler/listener + dev-server CLI
├── cli/              @metacrdt/cli
├── sdk/              @metacrdt/sdk
└── testkit/          @metacrdt/testkit    # done: first convergence-conformance suite
```

This is the target map, not a mandate to create empty packages now. The rule is:
extract a package only when code and tests justify the boundary.

**Target ≠ storage backend.** A *target* is an execution host; a *storage
adapter* (`sqlite`, `postgres`, DO SQLite, IndexedDB) implements `EventStore`;
a *transport adapter* implements `Transport`. So Postgres is not a peer of
`convex`/`cloudflare` — it is an adapter the open `node` host mounts. The full
target/adapter/transport model, the managed-vs-open-host distinction, and the
eventual dependency graph are in [targets.md](../reference/targets.md).

---

## Axes and ownership

Keep these axes separate.

| Axis | Packages | Owns | Must not own |
| --- | --- | --- | --- |
| **Protocol kernel** | `core` | events, IDs, HLC, `≺`, G-Set merge, bitemporal fold | storage, Datalog, UI |
| **Language** | `forma` | Lisp syntax, reader, evaluator, type system, diagnostics, LSP/editor contracts | ontology-specific runtime |
| **Feature packages** | `schema`, `query`, `workflow`, `forms`, `views`, `agent` | portable substrate features | Convex/Cloudflare/Node APIs |
| **Harness** | `runtime` | service interfaces, operation helpers, memory harness, capability model | concrete persistence or durable transport |
| **Storage adapters** | `sql` (sqlite/postgres), adapters inside `local` | implement `EventStore` + projection store | execution scheduling, feature semantics |
| **Transport adapters** | broadcast/p2p in `runtime`, WS in `cloudflare`, HTTP/SSE in `node` | implement `Transport` (anti-entropy I/O) | storage, feature semantics |
| **Targets (hosts)** | `convex`, `cloudflare`, `local`, `node` | execution host + scheduler + a default adapter choice + deploy shape | feature semantics; another target |
| **Tools/apps** | `cli`, `sdk`, `testkit`, app surfaces | developer/product experience, conformance | protocol semantics |

The core discipline: a feature package may depend on `@metacrdt/core` and
eventually `@metacrdt/runtime` interfaces, but it must not import a target.
Adapters and transports depend only on `runtime` + `core`. Targets depend
downward on everything; targets never depend on each other. See
[targets.md](../reference/targets.md) for the full dependency graph.

---

## Open Ontology package mapping

Current Open Ontology package names are listed from the submodule inventory.
The proposed MetaCRDT destination is intentionally not one-to-one.

### Language and compiler

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `@open-ontology/language-ts` | `@forma/ts` | Rename and fold. This is the TypeScript Forma engine. |
| `@open-ontology/language-ocaml` | `@forma/ocaml` or archive | Keep as research until TS Forma stabilizes. Do not make it default. |
| `@open-ontology/language-ocaml-lsp` | `@forma/ocaml-lsp` or archive | Candidate later. Do not port before `forma` API is stable. |
| `@open-ontology/language-host` | `@forma/host` or `@metacrdt/runtime` | Split by owner: host ABI contracts belong near Forma; runtime service bindings belong in runtime. |
| `@open-ontology/language-editor` | `@forma/editor` | Optional editor package after Forma extraction. |
| `@open-ontology/language-e2e` | `@forma/ts` tests / `@metacrdt/testkit` | Keep tests, not a public package. |
| `@open-ontology/onlang` | `@forma/ts` CLI subcommand or legacy alias | Onlang becomes the old name for the Forma authoring surface. |
| `@open-ontology/dsl-ts` | `@metacrdt/schema` / `@metacrdt/runtime` builders | Mine for TypeScript builders; do not preserve as a package. |

### Compiler and IR

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `@open-ontology/ontology-ir` | `@metacrdt/runtime` initially, maybe `@metacrdt/ir` later | IR is the harness contract. Avoid a standalone package until two compilers/targets need it. |
| `@open-ontology/ontology-compiler` | `@forma/ts` + `@metacrdt/runtime` | Split: Forma parses/elaborates; runtime owns deployable IR semantics. |
| `@open-ontology/ontology-project` | `@metacrdt/cli` / `@metacrdt/sdk` | Project loading is tooling, not substrate semantics. |
| `@open-ontology/ontology-generate` | `@metacrdt/cli` / `@metacrdt/runtime` | Keep generation as a tool over IR. |
| `@open-ontology/compiler-editor` | Schematics / `@forma/editor` | Product/editor layer; not core substrate. |
| `@open-ontology/compiler-descriptor-protocol` | `@metacrdt/runtime` contracts | Fold stable descriptor concepts into the IR. |
| `@open-ontology/compiler-protocol-codegen` | `@metacrdt/cli` | Tooling only. |
| `@open-ontology/logic-ast` | `@metacrdt/query` | Query/rule AST belongs with derivation. |

### Database, store, and query

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `@open-ontology/database` | `@metacrdt/query` + target storage helpers | Split. Datalog/rules move to query; storage bindings move to targets. |
| `@open-ontology/database-sql` | archive or target-private helper | SQL generation is not central to MetaCRDT. Keep only if used by `node`/`local`. |
| `@open-ontology/database-sqlite` | `@metacrdt/local` / `@metacrdt/node` | SQLite is a local/node target concern. |
| `@open-ontology/database-postgres` | `@metacrdt/node` optional adapter | Folded as structural Postgres runtime services plus shared SQL lifecycle planning; keep concrete driver deps out. |
| `@open-ontology/database-cloudflare` | `@metacrdt/cloudflare` | Fold into the Cloudflare target if useful. |
| `@open-ontology/database-foundationdb` | archive | Do not port unless a FoundationDB target becomes a priority. |
| `@open-ontology/database-testkit` | `@metacrdt/testkit` | Keep useful convergence/query fixtures. |

Do **not** create `@metacrdt/triplestore` unless a concrete external consumer
needs a storage-only API. The MetaCRDT primitive is not "a triple store"; triples
are one representation of facts inside a convergent event log.

### Runtime, platform, and targets

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `@open-ontology/runtime` | `@metacrdt/runtime` | Fold after core/write-path semantics are stable. |
| `@open-ontology/runtime-http` | `@metacrdt/node` or `@metacrdt/sdk` | HTTP surface is target/tooling, not core runtime. |
| `@open-ontology/runtime-cli` | `@metacrdt/cli` | Fold CLI commands only after package APIs settle. |
| `@open-ontology/runtime-testkit` | `@metacrdt/testkit` | Important; port early after runtime exists. |
| `@open-ontology/platform` | `@metacrdt/runtime` interfaces | Split service contracts from implementations. |
| `@open-ontology/platform-node` | `@metacrdt/node` | Target. |
| `@open-ontology/platform-cloudflare` | `@metacrdt/cloudflare` | Target. Durable Object work belongs here. |
| `@open-ontology/platform-bun` | archive or `@metacrdt/node` later | Defer. |
| `@open-ontology/platform-clerk` | app integration / archive | Auth provider integration, not substrate. |
| `@open-ontology/deploy` | `@metacrdt/cli` + Alchemy notes | Prefer Alchemy for infra orchestration; mine code selectively. |

### Views, UI, blocks, connectors, agents

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `@open-ontology/view-protocol` | `@metacrdt/views` | Rename ViewSpec to views. Runtime-agnostic view descriptions. |
| `@open-ontology/ui` | app/Schematics UI or `@metacrdt/ui` later | Do not port until a shared UI surface repeats. |
| `@open-ontology/blocks` | Schematics / app layer | Blocks are product/editor composition, not substrate. |
| `@open-ontology/web` | app layer | Do not fold into substrate packages. |
| `@open-ontology/connectors` | `@metacrdt/connectors` later or app-specific | Defer until integration model stabilizes. |
| `@open-ontology/agent-skills` | `@metacrdt/agent` | Fold useful actor/proposal/skill contracts. |
| `@open-ontology/sdk` | `@metacrdt/sdk` | Fold after public package APIs exist. |
| `@open-ontology/devtools` | Schematics / `@metacrdt/devtools` later | Product tooling; not early. |

### Apps, examples, tests, tools

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `apps/node`, `apps/cloudflare`, `apps/bun` | target examples | Mine for target fixtures after runtime exists. |
| `examples` | `examples/` in this repo | Convert selected examples to MetaCRDT/Forma blueprints. |
| `test/*` | `@metacrdt/testkit` + package tests | Port only tests that prove package boundaries. |
| `tools/ci` | repo tooling | Keep if needed; do not publish. |
| `tools/content-bundler` | `@metacrdt/cli` optional | Defer. |

---

## Package names to use and avoid

### Use

- `@metacrdt/core` — already real.
- `@forma/ts` — the formal Lisp/expression language.
- `@metacrdt/schema` — schema-as-facts and type contracts. First slice shipped:
  carrier ids, bootstrap cardinality rules, value/cardinality guards, and
  meta-attribute definitions. Definition fact lowering and attribute-shape
  reconstruction have also shipped.
- `@metacrdt/query` — Datalog/rules/derivation. First pure slice shipped:
  clause/term types, parser, operators, compute/comparison helpers, projection,
  pagination, aggregation, explain descriptions, rule-locality analysis, and
  read-only rule emit shaping. Clause-pick planning for the Datalog scheduler
  and provenanced binding dedupe/source merging have also shipped, as has
  pattern-input construction for target triple sources, provenanced pattern
  extension/candidate expansion for positive joins, accumulated row-limit
  checking for already-fetched positive-pattern candidates, negation candidate
  checking over already-fetched triples, and compare/compute state transitions
  over provenanced solved bindings, plus the shared intermediate-row limit guard.
  Bound-variable advancement, solver-frame initialization, and solver work-list
  clause selection/removal for scheduler state have shipped too.
- `@metacrdt/workflow` — processes, flows, obligations.
- `@metacrdt/collect` — collection surfaces and prompt-response forms.
- `@metacrdt/views` — ViewSpec and generated response surfaces.
- `@metacrdt/runtime` — IR + service harness.
- `@metacrdt/convex`, `@metacrdt/cloudflare`, `@metacrdt/local`, `@metacrdt/node` — targets.

### Avoid for now

- `@metacrdt/triplestore` — too storage-centric; use `core` + `query` + targets.
- `@metacrdt/database` — same issue; MetaCRDT is not a DB package graph.
- `@metacrdt/platform-*` — "platform" is too vague and overlaps with Alchemy.
  Use target names.
- `@metacrdt/onlang` — old frontend name; keep as legacy alias only if needed.
- `@metacrdt/viewspec` — keep ViewSpec as a term, package it as `views`.

---

## Forma definition

`@forma/ts` is the formal authoring language for MetaCRDT.

It owns:

- Lisp reader/parser and source spans
- expression encoding
- evaluator / VM
- type inference and diagnostics
- host ABI contracts
- editor/LSP contracts
- the syntax for entities, constraints, workflows, forms, views, and agent
  proposals

It does **not** own:

- the MetaCRDT event fold (`core`)
- Datalog execution (`query`)
- runtime deployment (`runtime`)
- Convex/Cloudflare/local storage (`targets`)
- the Schematics IDE or app UX

The compiler boundary should look like:

```text
Forma source
  → @forma/ts parses/elaborates/types
  → @metacrdt/runtime IR
  → target package emits/binds/deploys
```

This preserves Open Ontology's hard-won separation between language and runtime,
but names the language in a way that fits the MetaCRDT umbrella.

---

## Migration phases

### Phase 0 — Context and inventory

Done:

- Add `.context/open-ontology` as a submodule.
- Extract `@metacrdt/core`.
- Route Convex visibility through core.
- Write this consolidation proposal.

### Phase 1 — Establish canonical package policy

- Add this doc to the README and architecture index.
- Treat Open Ontology as read-only context during extraction.
- Add a package extraction checklist to `TODO.md`.
- Do not create empty package shells.

### Phase 2 — Cash the core semantics in Convex

- Stamp `eventId`, HLC, actor, replica, and sequence metadata onto
  `factEvents`.
- Switch cardinality-one supersession to `≺`-max, not arrival order.
- Make the Convex write path produce data shaped like SPEC §3-5.

This comes before folding in larger Open Ontology packages because it keeps the
new repo honest: the canonical runtime must actually use the canonical core.

### Phase 3 — Extract `@forma/ts`

Status: shipped as `packages/@forma/ts` / `@forma/ts`.

Source material:

- `packages/language-ts`
- `packages/language-host`
- `packages/language-editor`
- `specs/language/*`
- `docs/lisp/*`
- selected `language-e2e` tests

Deliverables:

- [x] `packages/@forma/ts`
- [x] README defining the language boundary
- [x] source parser/evaluator/type API
- [x] fixtures proving compatibility with selected Open Ontology Lisp examples
- [x] no imports from `.context/open-ontology`

### Phase 4 — Extract query/schema/workflow/collect/views

Extract only when each package has a concrete use in the current reference app:

1. `@metacrdt/schema` from current `convex/lib/meta.ts`, `convex/attributes.ts`,
   and Open Ontology entity/type specs. The first pure slice from
   `convex/lib/meta.ts` has shipped, and stable type/attribute definition
   lowering plus attribute read-model shaping from `convex/attributes.ts` now
   lives in the package. Convex storage, authorization, transactions, and query
   execution remain in the reference runtime.
2. `@metacrdt/query` from current Datalog engine plus Open Ontology `logic-ast`
   and database query material. The first pure slice from `convex/lib/engine.ts`
   has shipped (syntax, operators, projection, pagination, aggregation,
   descriptions, locality). Read-only rule emit shaping has also shipped:
   `EmitSpec`, `DerivedRow`, emit-term resolution, deterministic dedupe, and
   stable derived-row sorting. The pure clause-pick planner
   (`chooseNextClausePosition`) and provenanced solved-binding dedupe/source
   merging (`dedupeProvenancedBindings`) have shipped as well. Pattern-input
   construction (`patternInputForBinding`) and provenanced positive-join
   extension/candidate expansion (`extendProvenancedBinding`,
   `extendPatternCandidates`) now live in the package too. Negation candidate
   checking (`passesNegationCandidates`) and local compare/compute state
   transitions (`filterCompareStates`, `applyComputeStates`) have shipped as pure
   helpers. The shared intermediate-row limit guard
   (`assertIntermediateRowsWithinLimit`) and guarded positive-pattern extension
   (`extendPatternCandidatesWithinLimit`) have shipped too. Scheduler bound-var
   advancement (`advanceBoundVars`), initial solver-frame construction
   (`initialSolverFrame`), and solver work-list clause selection/removal
   (`selectNextClause`) have shipped too.
   Convex-specific triple fetching, read authorization, provenance
   interpretation, solving, async join execution, negation IO, and branch
   recursion remain in the reference runtime.
3. `@metacrdt/collect` from current `convex/forms.ts`, `/collect`, and
   collection-backed compliance requirements. This supersedes the older
   `@metacrdt/forms` name because the portable package owns collection runs,
   token predicates, submission-to-fact lowering, and `requires AND NOT
   submitted` clause shaping; form definitions are one input to that collection
   surface. The first pure slice has shipped: field definitions, form-definition
   facts, submission validation/lowering, scope-key derivation, token validity,
   and requirement/task clauses, with Convex consuming it through
   `convex/lib/collect.ts`.
4. `@metacrdt/workflow` from current `convex/flows.ts`. The first pure slice has
   shipped: step types, value resolution, wait-key derivation, DAG validation,
   flow-definition row/fact lowering, and a target-neutral step reducer that
   emits intents. Convex consumes the package through `convex/lib/workflow.ts`.
   The Cloudflare registered-flow runner now executes through the same reducer,
   translating intents back into its Durable Object SQLite effects. Target-local
   IO, transaction, scheduling, and unsupported-step behavior remain in the
   targets.
5. `@metacrdt/views` from Open Ontology `view-protocol` only after schema-driven
   UI exists in the app.

### Phase 5 — Extract the harness and targets

Only after two targets exist or are actively being built:

- `@metacrdt/runtime` for IR + service interfaces.
- `@metacrdt/convex` as the reference target/component.
- `@metacrdt/cloudflare` as the Durable Object target.
- `@metacrdt/local` as the local-first target (localStorage + BroadcastChannel +
  IndexedDB-compatible and SQLite-compatible async persistence now).

This is where the Confect/Alchemy notes become executable architecture.

### Phase 6 — Retire or archive the submodule

When all useful source/spec/tests have moved:

- Replace the submodule with a historical pointer in `docs/archive.md`, or
- Keep it pinned under `.context/` only if it remains useful for archaeology.

Do not leave active code depending on the submodule.

---

## Extraction checklist

Every folded package must satisfy:

- [ ] New package is named `@metacrdt/*`.
- [ ] README states ownership, non-ownership, dependencies, and relation to SPEC.
- [ ] No source import from `.context/open-ontology`.
- [x] Package builds with tsdown/Rolldown into `dist` ESM + declarations,
  coordinated by Turbo and centralized through the root `tsdown.config.ts`.
- [ ] Package `main`, `types`, and `exports` point at `dist`, not raw `src`.
- [ ] `pnpm pack --dry-run` shows no `src` or test files in the published
  payload unless a package explicitly documents why source must ship.
- [ ] Tests ported or rewritten under the new package.
- [ ] Dependency direction matches [architecture.md](../reference/architecture.md).
- [ ] Any old Open Ontology names are either removed or explicitly retained as
  compatibility aliases.
- [ ] TODO entry updated with the source packages consumed and remaining source
  packages not yet folded.

---

## Open questions

1. **Does `@forma/ts` include the compiler, or only the language?**
   Recommendation: language first; compiler-to-runtime lowering moves into
   `@metacrdt/runtime` until the IR boundary proves it deserves `@metacrdt/ir`.
2. **Should `@metacrdt/views` render React?**
   Recommendation: no. It should describe view state and bindings. React/Tailwind
   rendering belongs in apps or Schematics.
3. **Should Postgres/FoundationDB targets survive?**
   Recommendation: no by default. Archive until someone needs those targets.
4. **Should Open Ontology remain a public project?**
   Recommendation: yes, as the open spec/community label. The implementation
   moves to MetaCRDT.

---

## The short version

Open Ontology collapses under MetaCRDT like this:

```text
Open Ontology methodology/spec      → Open Ontology (community/spec label)
Open Ontology language/onlang       → @forma/ts
Open Ontology triple/database layer → @metacrdt/core + @metacrdt/query + targets
Open Ontology runtime               → @metacrdt/runtime
Open Ontology platform-*            → @metacrdt/{convex,cloudflare,local,node}
Open Ontology view-protocol         → @metacrdt/views
Open Ontology app/editor surfaces   → Schematics / apps, not substrate core
```

The canonical repo is this one. `@metacrdt/core` is the convergence kernel,
`@forma/ts` is the language package, `@metacrdt/collect` and
`@metacrdt/workflow` hold the portable collection/workflow semantics, and
`@metacrdt/testkit` is now the first conformance package. Everything else is
extracted only when the boundary is proven by real code.
