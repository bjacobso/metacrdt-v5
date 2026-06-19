# Vision — Modules: the full project, package by package

> Part of the `vision/` set — see [`README.md`](./README.md). Status: `📐`.
> The concrete instantiation of [`composition.md`](./composition.md): that doc
> named the seams; this one names every package, its dependencies, what it
> does, and what it exposes — the whole hypothetical project on one screen.
> Naming follows [`../plans/names.md`](../plans/names.md) (two npm scopes,
> `@metacrdt/*` and `@open-ontology/*`) and the four-repo split.

---

## Three laws this layout obeys

1. **Dependency direction.** `forma` and `metacrdt` are roots — they depend on
   nothing else in the project. The workbench depends only on a generic
   language-service *interface*. The distribution depends on everything. No
   arrow ever points back toward a root.
2. **Cross-repo edges are seam artifacts only** (the seven from
   `composition.md`): a package never imports another repo's internals, only
   the validated artifact between them.
3. **Scope uniqueness.** `@metacrdt/*` and `@open-ontology/*` are flat global
   namespaces; a package name is unique across *all four repos*. (This is why
   the workbench core is `@open-ontology/schematics`, not a second
   `@open-ontology/core`.)

```
                ┌──────────────────────────────────────────┐
products  →     │  onboarded · ontology.run (private apps)   │
                └──────────────────────────────────────────┘
                                  │ consume
        ┌─────────────────────────────────────────────────────┐
distrib │  repo: ontology  (@open-ontology/*)  — the glue       │
        │  ontology · ir · ontology-runtime · collect ·         │
        │  dashboard · connectors · agent-skills · std · web    │
        └───────┬──────────────────┬───────────────────┬───────┘
         depends│           depends │            depends│
        ┌───────▼──────┐   ┌────────▼────────┐   ┌──────▼─────────────┐
language│ repo: forma  │   │ repo: metacrdt  │   │ repo: schematics    │
        │@open-ontology│   │  @metacrdt/*    │   │ @open-ontology/*    │
        │  /forma-*    │   │  (substrate)    │   │ (generic workbench, │
        │ (language)   │   │                 │   │  future @formwork)  │
        └──────────────┘   └─────────────────┘   └─────────────────────┘
         roots: depend on nothing else        depends only on the
                                              language-service interface
```

---

## Repo: `forma` — the language

**Purity rule:** knows the kernel and its own meta-API (`define-form`,
`meta-fn`). Knows nothing of entities, the IR, storage, or runtimes.
Published `@open-ontology/forma-*` (the `@forma` npm org is taken; reclaim via
dispute is a stretch goal). The forma-zero conformance suite is the spec.

**`@open-ontology/forma`** — the TS engine (today `@forma/ts`).
- *Deps:* none (external: a minimal std only).
- *Exposes:* reader/parser with spans, kernel evaluator (`assert`/`fold`/`react`
  + McCarthy primitives), descriptor registry, the meta-API for defining forms.

**`@open-ontology/forma-ocaml`** — the OCaml HM engine, compiled to JS (today
`@forma/ocaml`).
- *Deps:* none (self-contained jsoo artifact).
- *Exposes:* Hindley-Milner typechecking engine, the editor/JSON ABI, daemon
  session entrypoint. The second conformance engine.

**`@open-ontology/forma-host`** — sessions + prelude management + the
language-service contract (today `@forma/host`).
- *Deps:* `forma`, `forma-ocaml` (engine-agnostic over both).
- *Exposes:* `Session`, the **LanguageService interface** (seam artifact 2),
  prelude loading + `preludeFingerprint`, the **PreludeSet** (seam artifact 1),
  value/ABI projections. This is the package the workbench depends on.

**`@open-ontology/forma-ocaml-lsp`** — LSP server over the OCaml engine (today
`@forma/ocaml-lsp`).
- *Deps:* `forma-ocaml`, `forma-host`.
- *Exposes:* an LSP process (one OCaml session per workspace).

**`@open-ontology/forma-editor`** — editor integration (today `@forma/editor`).
- *Deps:* `forma-host`.
- *Exposes:* CodeMirror bindings, syntax, completion/hover wiring.

**`@open-ontology/forma-conformance`** — the forma-zero suites (today
`@forma/conformance`).
- *Deps:* `forma`, `forma-ocaml` (dev).
- *Exposes:* shared implementation-neutral fixtures + runner; the executable
  proof that both engines agree and that the seven reduce to the kernel.

*Bare package `forma-lang`* (unscoped, reserved) — the CLI entrypoint
(`npm i -g forma-lang`), thin wrapper over `forma-host`.

---

## Repo: `metacrdt` — protocol + substrate

**Purity rule:** knows facts, folds, merge, sync, targets — and its own
protocol. Knows nothing of syntax, the IR's named kinds, markdown, or the IDE.
The normative `spec/protocol.md` (L1–L5) lives in-repo, not as a package.
Published `@metacrdt/*` — the one scope where independent identity is
existential (a third party must be able to implement the protocol and prove
conformance without touching `@open-ontology/*`).

**`@metacrdt/core`** — L1+L2 kernel.
- *Deps:* none.
- *Exposes:* `Event`, content-addressed `eventId`/`seal`/`verifyId`, HLC, the
  total order `≺`, the pure bitemporal `fold`/projection, value/sha256/base32.

**`@metacrdt/query`** — Datalog (L3).
- *Deps:* `core`.
- *Exposes:* the query AST (data), the bounded evaluator, negation, aggregation,
  materialized transitive closure.

**`@metacrdt/runtime`** — the Effect-native reference runtime.
- *Deps:* `core`, `query`.
- *Exposes:* service tags (`EventStore`, `Clock`, `Sequencer`, `Scheduler`,
  `Transport`), version vectors + `deltaSince`/`exchangeDeltas` (L4 sync), p2p +
  broadcast transports, the in-memory runtime, projection store.

**`@metacrdt/testkit`** — conformance harness.
- *Deps:* `core`, `runtime`, `query`.
- *Exposes:* `runRuntimeConformance`, `runRuntimePersistenceConformance` — the
  L1–L5 tests any storage/host must pass.

**Storage + execution-host targets** (each implements the runtime service
contracts for one host):

**`@metacrdt/local`** — browser. *Deps:* `core`, `runtime`. *Exposes:* IndexedDB
/ SQLite-wasm / memory `EventStore`, the local runtime layer (the merge-demo
replica).

**`@metacrdt/node`** — Node host. *Deps:* `core`, `runtime`. *Exposes:* node
runtime assembly over `sqlite | postgres | memory`.

**`@metacrdt/convex`** — Convex target. *Deps:* `core`, `runtime`, `query`.
*Exposes:* the Convex component (tables, reactive reads, scheduler), the
authoritative-sequencer deployment ("the replica you trust").

**`@metacrdt/cloudflare`** — Durable Object target. *Deps:* `core`, `runtime`,
`query`. *Exposes:* DO + SQLite runtime, WebSocket transport (the L5 per-room
quorum world).

**Clients:**

**`@metacrdt/client`** — backend-agnostic frontend. *Deps:* `core` (types),
`runtime` (contracts). *Exposes:* the `MetacrdtClient` service + effect-atom
hooks, swappable backend Layers.

**`@metacrdt/client-node`**, **`@metacrdt/client-cloudflare`** — backend
bindings. *Deps:* `client` + the matching target.

**`@metacrdt/views`** — headless view algebra (query- and render-agnostic; see
[[views-architecture-layering]]). *Deps:* `query`. *Exposes:* the view/projection
structure a `ViewSpec` lowers onto — generic over facts, no React, no kind
knowledge. *(Boundary: the `define-view` **vocabulary** is distribution; this is
the substrate **mechanism** it targets.)*

**`@metacrdt/views-react`** — React bindings for the above. *Deps:* `views`,
`client`. *Exposes:* render components for headless views.

---

## Repo: `schematics` — the generic workbench

**Purity rule:** knows artifacts, routes, validation, plan/apply — for *any*
schema-defined project (the Okta-provider test: nothing here may assume
ontologies). Depends on the language-service **interface** from `forma-host`,
never on ontology semantics. Published `@open-ontology/*` today; migrates to
`@formwork/*` at independent adoption (rename `alchemy` then — collides with
alchemy.com). See [`../plans/names.md`](../plans/names.md) decision 5.

**`@open-ontology/artifacts`** — the primitives (today `@schematics/artifacts`).
- *Deps:* effect/schema.
- *Exposes:* `ArtifactProject`, refs, glob matchers, typed views (read/write +
  cost/cache policy), handlers, stores, registries.

**`@open-ontology/schematics`** — the workbench core (today `@schematics/core`).
- *Deps:* `artifacts`, `forma-host` (the LanguageService interface only).
- *Exposes:* JSON/YAML/Markdown document codecs, `DocumentSourceMap` (line/col
  per path), continuous validation + `SchematicsReflection`, the schema
  language-service client.

**`@open-ontology/algebra`** — schema-native relation graph (today
`@schematics/algebra`).
- *Deps:* `artifacts`.
- *Exposes:* id/ref/scoped-ref extraction, duplicate/unresolved validation,
  the relation graph (paths/traversal/lenses are the planned phases).

**`@open-ontology/ide`** — the React workbench component.
- *Deps:* `schematics`, `artifacts`.
- *Exposes:* `<Schematics />` (CodeMirror + schema-generated forms + diagnostics
  + timeline + chat). Ontology-agnostic; flavor arrives via the loaded
  PreludeSet.

**`@open-ontology/agent`** — the agent edit surface.
- *Deps:* `schematics`, `artifacts`.
- *Exposes:* OpenRouter-compatible typed tools (`read_artifact_view`,
  `write_artifact_source`, `validate_artifact_project`, `propose_patch`), the
  chat adapter. Same validated surface humans use — no separate AI path.

**`@open-ontology/alchemy`** — the deploy engine.
- *Deps:* `artifacts`.
- *Exposes:* `pull → plan → apply → destroy` over schema-value diff, dependency
  ordering, the lockfile state model, the provider interface (seam artifact 5).
  Provider-agnostic; the MetaCRDT provider lives in the distribution.

**`@open-ontology/provider`** — the provider-authoring DSL.
- *Deps:* `alchemy`, `artifacts`.
- *Exposes:* `defineResource`/`defineProvider` → derived artifact project +
  deploy service + CLI. (The five SaaS examples — github/okta/pagerduty/
  salesforce/catalog — are fixtures, not shipped packages.)

*Bare/CLI:* `@open-ontology/schematics-cli`, `-server` — terminal + HTTP host
over the workbench.

---

## Repo: `ontology` — the distribution (the glue)

**Role:** the only place allowed to know all four layers. Owns the *vocabulary*
and the *wiring*, and **zero** generic machinery. This repo is what the current
monorepo becomes after `forma` and `metacrdt` extract; it inherits the
ontology-flavored survivors of both ancestors. Published `@open-ontology/*`.

**`@open-ontology/ontology`** — THE prelude package (today
`preludes/ontology.lisp` + `ontology-compiler.lisp`).
- *Deps:* `forma-host` (registers elaboration hooks via the meta-API), `ir`
  (emits IR nodes).
- *Exposes:* the vocabulary — `define-entity`, `define-relation`,
  `define-query`, `define-constraint`, `define-process`, `define-action`,
  `define-form`/`define-document`, `define-view`, `define-workspace` — as
  derived forms, plus the elaboration hooks that lower them. **The only module
  that knows both syntax and IR.** This is what `(import ontology)` resolves to
  (seam artifact 1's first registry entry), retiring the unresolved
  `(:preludes core)` token.

**`@open-ontology/ir`** — the IR schema + lowering.
- *Deps:* `@metacrdt/core` (for fact/event shapes only).
- *Exposes:* the typed, versioned IR node kinds with provenance (seam artifact
  3), and the pure `lower(IRBundle) → facts[]` (seam artifact 4). *Resolves
  composition.md's open question:* the IR lives **here, in the distribution**,
  not in `@metacrdt/*` — so the substrate stays kind-agnostic; lowering depends
  *up* the stack for fact shapes, never the reverse.

**`@open-ontology/ontology-runtime`** — IR-kind semantics.
- *Deps:* `ir`, `@metacrdt/runtime`, `@metacrdt/query`.
- *Exposes:* the runtime meaning of each kind — entities/relations as
  schema-facts, constraints as Datalog, the durable **flow** engine (flowRuns,
  `submitted.<form>` resumption — folds the current `@metacrdt/workflow`),
  grants, the reconciler/materializer reactions. Generic `SchedulerService`
  stays down in `@metacrdt/runtime`; everything that knows a *named kind* is
  here.

**`@open-ontology/deploy`** — the MetaCRDT deploy provider.
- *Deps:* `@open-ontology/alchemy`, `ir`, a `@metacrdt/*` target.
- *Exposes:* the alchemy provider that turns a plan into one provenance-stamped
  MetaCRDT transaction (seam artifact 7); the **MarkdownFormaModule** artifact
  route; deploy-metadata-as-facts (no lockfile for MetaCRDT targets).

**`@open-ontology/collect`** — forms & collection (today `@metacrdt/collect`).
- *Deps:* `ir`, `ontology-runtime`.
- *Exposes:* collection tokens + TTL, submission → facts, form-definition facts.
  Moves out of `@metacrdt/*` because forms are an IR kind, not substrate.

**`@open-ontology/dashboard`** — the generic ontology explorer (today
`@metacrdt/dashboard`).
- *Deps:* `@metacrdt/views-react`, `@metacrdt/client`, `ir`.
- *Exposes:* target-agnostic React pages (overview, entities, data model, tx
  log, flows) bound by stable query/mutation names.

**`@open-ontology/connectors`** — integrations (from old OO `connectors`).
- *Deps:* `ontology-runtime`.
- *Exposes:* egress-guarded action steps, external-system sync as facts.

**`@open-ontology/agent-skills`** — ontology authoring skills.
- *Deps:* `@open-ontology/agent` (the generic tools), `ontology` (the
  vocabulary).
- *Exposes:* the ontology-author skill/prompt pack — domain knowledge layered
  over the generic agent surface.

**`@open-ontology/std`** — the standard blueprint library (the future
`ontology/*` namespace).
- *Deps:* `ontology` (authored *in* the vocabulary, as Forma modules).
- *Exposes:* reusable blueprints — `ontology/staffing`, `ontology/compliance`,
  `ontology/documents` — resolved by the prelude registry. This is the
  Schema.org-for-operations slot; ships when it exists (named `std`/`core`, not
  "Alpha").

**`create-ontology`** (bare package) — the starter. *Deps:* the distribution.
*Exposes:* `npm create ontology` — scaffolds a markdown+Forma project and runs
the loop locally.

**`@open-ontology/web`** — the site + studio (app, not a library). *Deps:* `ide`,
`dashboard`, the distribution. *Exposes:* open-ontology.com, the docs, the live
merge demo, the ontology-flavored authoring studio (= generic `ide` + `ontology`
prelude + `dashboard`).

*CLI:* `@open-ontology/cli` — `ontology plan/apply/pull/drift` against a target
(distribution-side wrapper over `alchemy` + `deploy`).

---

## Products (private repos, top of the graph)

- **ontology.run** — the hosted runtime: a composition of `ontology-runtime` +
  `@metacrdt/convex` (+ cloudflare) + `deploy` + `web`, operated as one more
  conforming replica.
- **Onboarded** — the compliance-dataroom app: a blueprint over `std` +
  `collect` + `dashboard`, deployed through `deploy`. The existence proof.

---

## Boundary questions (honestly unresolved)

- **Views.** Headless algebra in `@metacrdt/views` vs. the `define-view`
  vocabulary in `@open-ontology/ontology` — split as drawn, but the line (how
  much projection logic is substrate-generic vs. kind-specific) is still being
  proven; see the [`../plans/views.md`](../plans/views.md) plan.
- **Flows.** Folded into `ontology-runtime` here (named kinds), with only the
  generic scheduler in `@metacrdt/runtime`. Today it's a standalone
  `@metacrdt/workflow`; the split happens with the IR extraction.
- **IR home.** Resolved to `@open-ontology/ir` (above), reversing
  composition.md's "@metacrdt/schema for now." Revisit only if a second,
  non-ontology IR emitter appears (the n8n/Workato explorations) and wants a
  substrate-level shared schema.
- **Capability manifest** (seam artifact 6) — not yet placed; likely a small
  `@open-ontology/ir` sub-export (a target declares which kinds@version it
  implements), since it is about IR kinds, not substrate.
