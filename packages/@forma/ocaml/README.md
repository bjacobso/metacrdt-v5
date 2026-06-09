# onlang

A typed Lisp built to host domain DSLs. Homoiconic, macro-first,
compiled via OCaml to native, JavaScript, and WebAssembly.

**Status:** pre-alpha, research-stage. Reading is welcome; depending
on it is not.

## What It Is

onlang takes the parts of Clojure most users agree were right —
immutable data, macros, REPL — and integrates three things Clojure
users have spent a decade patching in from the outside:

- **A real type system.** Bidirectional elaboration with typed macros.
  Errors point at the source form the author wrote, not at the
  expanded shape.
- **An effect system.** `!`-suffixed operations resolve to handlers
  in scope at elaboration time. Type system stays plain
  Hindley-Milner; effect calls become direct function calls after
  expand.
- **Elaborator reflection.** Host programs register descriptors and
  meta hooks that participate in elaboration. Domain vocabulary
  (`define-entity`, `define-api-group`) is preludes, not built-ins.
  The engine ships with no domain knowledge.

The engine is a portable frontend: source and preludes go in,
diagnostics and canonical IR come out. Backends over the IR produce
target-specific code.

## A Taste

```lisp
(define-schema Blob
  (:kind struct)
  (:fields
    (field id      Uuid)
    (field content Bytes)
    (field mime    (Refine String :mime-type))))

(define-error BlobNotFound (:fields (field id Uuid)) (:status 404))

(define-api-group blob-api
  (endpoint upload
    (:method  POST) (:path "/blobs")
    (:payload Bytes)
    (:success Blob)
    (:errors  BlobNotFound))

  (endpoint get
    (:method GET) (:path "/blobs/{id}")
    (:path-params (param id Uuid))
    (:success Blob)
    (:errors  BlobNotFound)))
```

One source feeds the typechecker, a codegen target, and the host's
schema registry. The DSL itself is host-neutral — `define-api-group`
is a prelude form, not an engine feature.

## Documentation

For repo-wide language direction and cleanup planning, see
[`../../LISP.md`](../../LISP.md). Package-specific reset notes live in
[`docs/roadmap.md`](./docs/roadmap.md).

Read in order:

1. [`docs/overview.md`](./docs/overview.md) — top-to-bottom walkthrough
   with a concrete example, elaboration steps, current commands, and the
   future JS source backend shape.
2. [`docs/vision.md`](./docs/vision.md) — what onlang is and what bets
   it makes.
3. [`docs/thesis-gate.md`](./docs/thesis-gate.md) — the single test
   that decides whether the OCaml implementation is worth
   continuing.
4. [`docs/design-decisions.md`](./docs/design-decisions.md) — the
   load-bearing choices and the conditions that would reopen them.
5. [`docs/architecture.md`](./docs/architecture.md) — pipeline,
   module map, sessions, preludes, ABI, backends, build targets.
6. [`docs/schemas.md`](./docs/schemas.md) — how schema declarations should
   lower into schema IR, project into the typechecker, and feed JSON Schema /
   OpenAPI / Effect Schema exporters.
7. [`docs/modules.md`](./docs/modules.md) — proposed module/import/export
   system for multi-file projects, incremental elaboration, and agent context.
8. [`docs/saas-config.md`](./docs/saas-config.md) — how the language could
   model SaaS configuration as desired state and deploy it through REST/GraphQL
   provider capabilities.
9. [`docs/logic-ir.md`](./docs/logic-ir.md) — portable typed executable IR for
   handlers, tools, workflows, policies, and backend lowering.
10. [`docs/effect-type.md`](./docs/effect-type.md) — `Effect<A, E, R>` as a
    typed computation contract for success values, error values, and required
    capabilities.
11. [`docs/workflows.md`](./docs/workflows.md) — durable workflow declarations,
    steps, retries, approvals, compensation, and runtime semantics.
12. [`docs/policies.md`](./docs/policies.md) — first-class policy declarations
    for authorization, plan gates, redaction, and agent repair.
13. [`docs/agent-tools.md`](./docs/agent-tools.md) — schema-backed agent tools
    that can emit MCP/OpenAI contracts, tests, policies, and runtime bindings.
14. [`docs/runtime-manifest.md`](./docs/runtime-manifest.md) — package manifest
    shape for routes, schemas, tools, workflows, capabilities, policies, and
    backend artifacts.
15. [`docs/support-agents.md`](./docs/support-agents.md) — how the platform
    could model customer-support agents, internal improvement agents, ticket
    workflows, tools, knowledge, guardrails, evals, and activity logs.
16. [`docs/roadmap.md`](./docs/roadmap.md) — current state, the four
    remaining moves, reset guardrails, kill criteria.
17. [`docs/glossary.md`](./docs/glossary.md) — onlang-specific terms.

If you are picking the project back up cold, read
`thesis-gate.md` and `roadmap.md` first. They tell you what to work
on and when to stop.

## Quick Start

**Requirements**

- OCaml 5.1+
- Dune 3.17+
- opam (recommended)
- `js_of_ocaml` (for the JS engine)
- `wasm_of_ocaml-compiler` (for the Wasm engine)

**Build and run**

```bash
opam switch create onlang 5.1.1
eval "$(opam env)"
opam install dune js_of_ocaml wasm_of_ocaml-compiler

dune build
dune exec bin/oo_lang_cli.exe -- request '{"op":"version"}'
```

Expected:

```json
{ "ok": true, "value": { "engine": "oo-lang-ocaml-spike", "version": "0.1.0" } }
```

## ABI Sketch

The engine speaks JSON. Representative operations:

```json
{ "op": "version" }
{ "op": "parse",     "sourceId": "ex", "source": "(+ 1 2)" }
{ "op": "expand",    "sourceId": "ex", "source": "…" }
{ "op": "evaluate",  "sourceId": "ex", "source": "(+ 1 2)" }
{ "op": "typecheck", "sourceId": "ex", "source": "(+ 1 2)" }
{ "op": "elaborate", "sourceId": "ex", "source": "…" }
{ "op": "emit", "backend": "canonical-ir", "sourceId": "ex", "source": "…" }
```

Session operations add `openSession`, `loadPrelude`,
`loadSource`, `loadSourceBundle`, `elaborateMany`, `emitMany`,
`sessionInfo`, `resetSession`, `closeSession`. See
`docs/architecture.md` for the full list.

## Build Targets

```text
dist/native/oo_lang_cli.exe
dist/js/jsoo_entry.cjs
dist/wasm/wasm_entry.cjs
dist/wasm/wasm_entry.bc.wasm.assets/
```

All three run the same parity case list. Target divergence fails
CI.

## Verification Notes

Run package checks through the repository root so Turbo orders the
OCaml build before Node-based verification scripts:

```bash
pnpm build --filter @open-ontology/language-ocaml
pnpm test --filter @open-ontology/language-ocaml
pnpm language-ocaml:emit
```

`pnpm language-ocaml:emit` runs `emit` and `emit-golden` through the
Turbo task graph. Direct package scripts still work after a build, but
emit-family scripts now fail fast with a clear message if
`dist/native/oo_lang_cli.exe` is missing.

The OCaml package has several focused gates:

- `node scripts/meta-hooks.mjs` is the fast structural gate for descriptor,
  protocol, and hosted-meta work.
- `node scripts/golden-vertical.mjs` is the narrow end-to-end proof for the
  currently implemented slice: effect requirement typechecking plus schema,
  error, HTTP API, action, canonical IR, derived manifest, and type summaries.
- `node scripts/reset-gate.mjs` is the architecture ratchet. It prevents
  typed artifact summaries from falling back to OCaml domain knowledge, checks
  the Turbo emit shortcut, and keeps artifact validation centralized.
- `node scripts/architecture-gate.mjs` is a heavier artifact and performance
  gate. It runs `node scripts/bench.mjs`, which first runs
  `node scripts/build.mjs`, which in turn rebuilds the native artifact via
  `dune build bin/oo_lang_cli.exe` and then benchmarks startup and corpus load.

In practice, `architecture-gate.mjs` is not a cheap smoke test. It is a full
rebuild plus benchmark pass, so it can sit in the native dune build path for
minutes without printing progress.

If dune reports an invalid `_build/.lock` file, that is usually a stale or
corrupt lock left behind by an interrupted prior build, not a source-level
failure. Deleting `_build/.lock` and rerunning is the correct recovery.

Artifact summaries are now elaboration-owned. Domain preludes must emit
explicit `:$summary` metadata on declaration payloads; the OCaml engine
validates that summary against descriptor-derived expectations and the typed
payload, then strips it from packaged canonical IR. Generic canonical
declarations receive their result type from that validated elaboration summary,
not by reparsing payload JSON. This keeps domain vocabulary in preludes while
preserving a typed package boundary.

## License

MIT.
