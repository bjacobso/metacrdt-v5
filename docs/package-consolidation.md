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

## Decision summary

1. **This repository becomes the canonical MetaCRDT monorepo.**
   `.context/open-ontology` remains a pinned reference until the useful code and
   specs have been folded in.
2. **The Lisp language is formalized as `@metacrdt/forma`.**
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
├── forma/            @metacrdt/forma      # Lisp reader/evaluator/types/tooling
├── schema/           @metacrdt/schema     # schema-as-facts, attributes, type defs
├── query/            @metacrdt/query      # Datalog, rules, derived coherence
├── workflow/         @metacrdt/workflow   # durable steps, processes, obligations
├── forms/            @metacrdt/forms      # forms, collection, prompt-response
├── views/            @metacrdt/views      # ViewSpec / response surfaces
├── agent/            @metacrdt/agent      # agent actors, proposals, skills
├── runtime/          @metacrdt/runtime    # done: services + memory/localStorage + BroadcastChannel
├── convex/           @metacrdt/convex     # Convex target / component / bindings
├── cloudflare/       @metacrdt/cloudflare # DO/Worker target
├── local/            @metacrdt/local      # browser/local-first target
├── node/             @metacrdt/node       # node target, tests, dev server
├── cli/              @metacrdt/cli
├── sdk/              @metacrdt/sdk
└── testkit/          @metacrdt/testkit
```

This is the target map, not a mandate to create empty packages now. The rule is:
extract a package only when code and tests justify the boundary.

---

## Axes and ownership

Keep these axes separate.

| Axis | Packages | Owns | Must not own |
| --- | --- | --- | --- |
| **Protocol kernel** | `core` | events, IDs, HLC, `≺`, G-Set merge, bitemporal fold | storage, Datalog, UI |
| **Language** | `forma` | Lisp syntax, reader, evaluator, type system, diagnostics, LSP/editor contracts | ontology-specific runtime |
| **Feature packages** | `schema`, `query`, `workflow`, `forms`, `views`, `agent` | portable substrate features | Convex/Cloudflare/Node APIs |
| **Harness** | `runtime` | service interfaces, operation helpers, memory harness, capability model | concrete persistence or durable transport |
| **Targets** | `convex`, `cloudflare`, `local`, `node` | runtime bindings, persistence, scheduler, transport, deploy shape | feature semantics |
| **Tools/apps** | `cli`, `sdk`, app surfaces | developer/product experience | protocol semantics |

The core discipline: a feature package may depend on `@metacrdt/core` and
eventually `@metacrdt/runtime` interfaces, but it must not import a target.

---

## Open Ontology package mapping

Current Open Ontology package names are listed from the submodule inventory.
The proposed MetaCRDT destination is intentionally not one-to-one.

### Language and compiler

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `@open-ontology/language-ts` | `@metacrdt/forma` | Rename and fold. This is the TypeScript Forma engine. |
| `@open-ontology/language-ocaml` | `@metacrdt/forma-ocaml` or archive | Keep as research until TS Forma stabilizes. Do not make it default. |
| `@open-ontology/language-ocaml-lsp` | `@metacrdt/forma-lsp` or archive | Candidate later. Do not port before `forma` API is stable. |
| `@open-ontology/language-host` | `@metacrdt/forma/host` or `@metacrdt/runtime` | Split by owner: host ABI contracts belong near Forma; runtime service bindings belong in runtime. |
| `@open-ontology/language-editor` | `@metacrdt/forma-editor` | Optional editor package after Forma extraction. |
| `@open-ontology/language-e2e` | `@metacrdt/forma` tests / `@metacrdt/testkit` | Keep tests, not a public package. |
| `@open-ontology/onlang` | `@metacrdt/forma` CLI subcommand or legacy alias | Onlang becomes the old name for the Forma authoring surface. |
| `@open-ontology/dsl-ts` | `@metacrdt/schema` / `@metacrdt/runtime` builders | Mine for TypeScript builders; do not preserve as a package. |

### Compiler and IR

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `@open-ontology/ontology-ir` | `@metacrdt/runtime` initially, maybe `@metacrdt/ir` later | IR is the harness contract. Avoid a standalone package until two compilers/targets need it. |
| `@open-ontology/ontology-compiler` | `@metacrdt/forma` + `@metacrdt/runtime` | Split: Forma parses/elaborates; runtime owns deployable IR semantics. |
| `@open-ontology/ontology-project` | `@metacrdt/cli` / `@metacrdt/sdk` | Project loading is tooling, not substrate semantics. |
| `@open-ontology/ontology-generate` | `@metacrdt/cli` / `@metacrdt/runtime` | Keep generation as a tool over IR. |
| `@open-ontology/compiler-editor` | Schematics / `@metacrdt/forma-editor` | Product/editor layer; not core substrate. |
| `@open-ontology/compiler-descriptor-protocol` | `@metacrdt/runtime` contracts | Fold stable descriptor concepts into the IR. |
| `@open-ontology/compiler-protocol-codegen` | `@metacrdt/cli` | Tooling only. |
| `@open-ontology/logic-ast` | `@metacrdt/query` | Query/rule AST belongs with derivation. |

### Database, store, and query

| Open Ontology source | MetaCRDT destination | Decision |
| --- | --- | --- |
| `@open-ontology/database` | `@metacrdt/query` + target storage helpers | Split. Datalog/rules move to query; storage bindings move to targets. |
| `@open-ontology/database-sql` | archive or target-private helper | SQL generation is not central to MetaCRDT. Keep only if used by `node`/`local`. |
| `@open-ontology/database-sqlite` | `@metacrdt/local` / `@metacrdt/node` | SQLite is a local/node target concern. |
| `@open-ontology/database-postgres` | `@metacrdt/node` optional adapter | Defer. Not first-class until a Postgres target is real. |
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
- `@metacrdt/forma` — the formal Lisp/expression language.
- `@metacrdt/schema` — schema-as-facts and type contracts.
- `@metacrdt/query` — Datalog/rules/derivation.
- `@metacrdt/workflow` — processes, flows, obligations.
- `@metacrdt/forms` — collection surfaces and prompt-response forms.
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

`@metacrdt/forma` is the formal authoring language for MetaCRDT.

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
  → @metacrdt/forma parses/elaborates/types
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

### Phase 3 — Extract `@metacrdt/forma`

Status: shipped as `packages/forma` / `@metacrdt/forma`.

Source material:

- `packages/language-ts`
- `packages/language-host`
- `packages/language-editor`
- `specs/language/*`
- `docs/lisp/*`
- selected `language-e2e` tests

Deliverables:

- [x] `packages/forma`
- [x] README defining the language boundary
- [x] source parser/evaluator/type API
- [x] fixtures proving compatibility with selected Open Ontology Lisp examples
- [x] no imports from `.context/open-ontology`

### Phase 4 — Extract query/schema/workflow/forms/views

Extract only when each package has a concrete use in the current reference app:

1. `@metacrdt/schema` from current `convex/lib/meta.ts`, `convex/attributes.ts`,
   and Open Ontology entity/type specs.
2. `@metacrdt/query` from current Datalog engine plus Open Ontology `logic-ast`
   and database query material.
3. `@metacrdt/forms` from current `convex/forms.ts` and `/collect`.
4. `@metacrdt/workflow` from current `convex/flows.ts`.
5. `@metacrdt/views` from Open Ontology `view-protocol` only after schema-driven
   UI exists in the app.

### Phase 5 — Extract the harness and targets

Only after two targets exist or are actively being built:

- `@metacrdt/runtime` for IR + service interfaces.
- `@metacrdt/convex` as the reference target/component.
- `@metacrdt/cloudflare` as the Durable Object target.
- `@metacrdt/local` as the browser/local-first target.

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
- [ ] Tests ported or rewritten under the new package.
- [ ] Dependency direction matches [architecture.md](./architecture.md).
- [ ] Any old Open Ontology names are either removed or explicitly retained as
  compatibility aliases.
- [ ] TODO entry updated with the source packages consumed and remaining source
  packages not yet folded.

---

## Open questions

1. **Does `@metacrdt/forma` include the compiler, or only the language?**
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
Open Ontology language/onlang       → @metacrdt/forma
Open Ontology triple/database layer → @metacrdt/core + @metacrdt/query + targets
Open Ontology runtime               → @metacrdt/runtime
Open Ontology platform-*            → @metacrdt/{convex,cloudflare,local,node}
Open Ontology view-protocol         → @metacrdt/views
Open Ontology app/editor surfaces   → Schematics / apps, not substrate core
```

The canonical repo is this one. The first package is `@metacrdt/core`. The next
language package is `@metacrdt/forma`. Everything else is extracted only when the
boundary is proven by real code.
