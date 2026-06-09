# Architecture

How the engine is put together, top to bottom. Read `vision.md` first
for why the engine exists; this document describes how it is shaped.

## Pipeline

Source text flows through six explicit passes. Each pass has its own
module, its own diagnostic stream, and its own ABI entry point. No
pass calls back into another.

```
source text
  ├─► read     ─► CST (lossless concrete tree with spans)
  │               │
  │               └─► lower to AST (semantic tree)
  │
  ├─► expand   ─► expanded AST (macros applied)
  │
  ├─► elaborate ─► declaration values plus elaboration-owned summaries
  │
  ├─► typecheck ─► annotated AST (types and effects attached)
  │
  ├─► evaluate  ─► runtime value (tree-walking interpreter)
  │
  └─► emit      ─► typed artifact package, serialized as canonical IR JSON
```

Any host may enter at any pass. The JSON ABI surfaces each one as a
named operation. Sessions cache parsed sources and warm artifact
declarations so repeated artifact operations on unchanged sources do not
redo declaration elaboration.

## Module Map

All engine code lives under `lib/`. Every module has a `.mli`
signature file declaring its public surface.

**Source and syntax**

- `source.ml` — source identity, text, line tables, origin provenance
  (direct file or markdown fence).
- `cst.ml` — lossless concrete syntax tree with byte spans, whitespace,
  and comments preserved.
- `ast.ml` — semantic AST consumed by expander, elaborator, evaluator.
- `reader.ml` — tokenizes and parses source text into CST, then lowers
  to AST. Handles quote sugar, keywords, maps, vectors, comments.
- `diagnostic.ml` — span-carrying diagnostic records with severity,
  code, message, notes, and suggested fixes.

**Values and environment**

- `value.ml` — runtime value variant (nil, bool, int, float, string,
  symbol, keyword, list, vector, map, closure, macro).
- `env.ml` — lexical environment: bind, lookup, scope.

**Expansion**

- `expand.ml` — macro expansion pass. Runs after reading, before
  elaboration. Supports `defmacro`, quasiquote, unquote,
  unquote-splicing, gensym.
- `quote.ml` — quote, quasiquote, and unquote handling.
- `pattern.ml` — pattern compilation for `match` and destructuring
  binds.

**Elaboration**

- `descriptor.ml` — descriptor protocol. A descriptor names a form,
  declares its slots, and registers meta hooks (construct, infer,
  check, result-type).
- `elaborate.ml` — elaboration pass. Collects declarations, dispatches
  to registered meta hooks, produces typed IR fragments.

**Type system**

- `type_expr.ml` — surface type syntax (what authors write and the
  elaborator parses).
- `type_env.ml` — type environment for inference.
- `type_unify.ml` — unification algorithm.
- `type_diagnostic.ml` — type-specific diagnostic shapes.
- `typed_core.ml` — typed core AST with per-node annotations.
- `typecheck.ml` — HM inference facade over `Core_ast`, typed-core
  production, descriptor hooks, and the remaining AST-aware surface
  typecheck path.

**IR and artifacts**

- `core_ast.ml` — semantic core AST used by lowering.
- `lower.ml` — lowers AST to `core_ast`.
- `ir.ml` — typed canonical IR variant.
- `ir_json.ml` — serializer from `ir.ml` to JSON.
- `canonical_ir_decl.ml` — generic typed declaration envelope for prelude-owned
  domain declarations (`kind`, optional `name`, required elaboration result
  type, JSON payload).
- `artifact_summary_expectation.ml` — descriptor-derived expectations for
  declaration summary kind/name/result type. Its type is opaque so elaboration
  can carry the expectation without exposing the rules as record fields.
- `http_ir.ml` — richer typed host representation for HTTP schemas and API
  groups.
- `packageable_declaration.ml` — typed payload plus source/form provenance and
  elaboration summary.
- `artifact_validation.ml` — validates typed payloads, HTTP references, and
  summary/payload agreement before packaging.
- `artifact_declaration_packaging.ml` — converts typed declarations into
  packaged JSON payloads and provenance.
- `artifact.ml` — canonical IR package constructor. This is the validation
  choke point for source/prelude hashes, declaration summaries, provenance,
  diagnostics, and manifest data.

**Evaluator**

- `eval.ml` — tree-walking evaluator. Currently 709 LOC and
  shrinking; budget pinned by `reset-gate.mjs`.
- `eval_builtin.ml` — builtin function dispatch.
- `eval_http.ml` — HTTP API form evaluation helpers.
- `eval_meta.ml` — meta-hook application during elaboration.
- `eval_slot.ml` — descriptor slot evaluation.
- `eval_common.ml` — shared helpers.

**Session and ABI**

- `session.ml` — session state: loaded preludes, loaded sources,
  caches.
- `abi.ml` — JSON request dispatcher. It delegates operation families to
  `abi_*_ops.ml` modules; artifact validation and packaging live below the
  ABI.

## Source Model

Every byte of source belongs to a named `source`:

```ocaml
type source = {
  id : string;
  text : string;
  origin : source_origin option;
}

and source_origin =
  | Direct
  | MarkdownFence of {
      file_id : string;
      block_index : int;
      block_start_offset : int;
      block_start_line : int;
      block_start_column : int;
    }
```

Spans reference the source by `id` and carry byte offsets, lines, and
columns. When source originates from a markdown code fence, the
`MarkdownFence` origin records the offset of the fence within the
containing file so diagnostics can map back to the original position.

## Sessions

A session is the unit of caching and isolation:

- A session carries a set of loaded preludes and sources.
- Each prelude and source is content-hashed at load time.
- Parsed ASTs are cached by source ID.
- Validated packageable artifact declarations are cached by source hash
  plus the active sorted prelude hash fingerprint.
- Loading a prelude or a source that updates the session environment
  invalidates the artifact declaration cache conservatively. Prelude
  loads clear the cache. Source loads invalidate the changed source and
  cached sources whose parsed symbols, strings, or keywords reference
  declarations exported by it. If that dependency graph is incomplete,
  invalidation falls back to source load order.
- Sessions can be opened, reset, and closed through the ABI.
- In-process sessions avoid JSON round-trips for the host when the
  engine runs in the same process.

Sessions do not persist across engine restarts. Artifact output
includes the prelude hash so downstream consumers can detect prelude
drift.

## Preludes

Preludes are ordinary Lisp source loaded into a session. The engine
ships no built-in prelude. A host is expected to load at least a
kernel prelude (defining basic combinators) plus whatever domain
vocabulary it needs.

Preludes register:

- macros (`defmacro`),
- form descriptors (`define-form`),
- meta hooks (construct, infer, check, result-type functions),
- effect operations and capabilities.

Elaboration of a source form proceeds by looking up a descriptor in
the session's descriptor registry, applying registered meta hooks,
and producing a typed IR fragment. The engine does not know the name
of any descriptor in advance.

## JSON ABI

The engine speaks JSON on stdin and stdout in CLI mode, and through a
native function export in JS and Wasm mode. Every request has the
shape:

```json
{ "op": "<operation>", ...operation-specific fields }
```

Responses are either:

```json
{ "ok": true, "value": ... }
```

or:

```json
{ "ok": false, "diagnostics": [ ... ] }
```

The operations split into two groups.

**Stateless operations** do a single pass on a single source:

```
version                — engine identity and version
parse, parseAst         — read source to CST/AST
parseSummary            — structural summary of parsed source
expand                  — run macro expansion
evaluate                — evaluate a source
typecheck               — run the type checker
elaborate               — run elaboration
emit                    — emit canonical IR for a source
listEmitBackends        — enumerate registered backends
emitBackends            — backend metadata
```

**Session operations** operate against persistent state:

```
openSession, closeSession, resetSession
sessionInfo             — loaded sources and preludes
loadPrelude             — add a prelude to a session
loadSource              — add a source to a session
loadSourceBundle        — add multiple sources in one request
evaluate, elaborate     — (with sessionId) run against cached state
elaborateMany, emitMany — batch variants
sourceSummary           — inventory of loaded sources
artifactSummary         — inventory of emitted artifacts
```

The ABI is frozen during the current reset: no new operations until
the typed IR path is the durable internal boundary. See
`roadmap.md` Move D.

## Canonical IR and Backends

The canonical IR is a typed variant owned by `lib/ir.ml`. The JSON
wire format carries:

- `irVersion` — schema version for the wire format,
- `engine` — engine manifest (name, version, target),
- `sources` — manifest of loaded sources with hashes,
- `preludes` — manifest of loaded preludes with hashes,
- `declarations` — typed IR nodes with provenance spans,
- `diagnostics` — span-carrying diagnostics from every pass.

Backends are IR consumers. They take a canonical IR package and
produce target-specific artifacts. The reference backend is the
canonical-IR emitter itself, which round-trips the typed variant to
JSON. Additional backends (TypeScript code generation, OpenAPI,
MCP descriptors) are host concerns, not engine concerns.

## Build Targets

One OCaml codebase, three target artifacts.

- **Native.** `dune build` under `bin/` produces
  `dist/native/oo_lang_cli.exe`. Fastest startup and throughput;
  used for local development and server hosts.
- **JavaScript.** `js_of_ocaml` compiles the same `lib/` to
  `dist/js/jsoo_entry.cjs`. Used for Node hosts and any JS runtime
  that does not host Wasm.
- **WebAssembly.** `wasm_of_ocaml` compiles to
  `dist/wasm/wasm_entry.cjs` plus a Wasm module under
  `dist/wasm/wasm_entry.bc.wasm.assets/`. Used for browser hosts
  and Wasm-native runtimes.

`scripts/target-parity.mjs` runs the same case list against all
three artifacts and fails if any produces different results. This
is the guardrail that keeps language behavior identical across
targets.

## Guardrails

Architecture drift is caught by mechanical gates, not discipline:

- `scripts/architecture-gate.mjs` — structural checks on module
  layout and dependencies.
- `scripts/reset-gate.mjs` — 800-LOC cap on new files, ratcheted
  budgets on remaining legacy giants, no `"span": null` in generated JSON, and
  typed IR boundary checks for declaration packaging.
- `scripts/gates.mjs` — aggregates all gates for CI.
- `scripts/target-parity.mjs` — cross-target behavioral parity.
- `scripts/emit-corpus-golden.mjs` — golden comparison of emitted
  canonical IR.
- `scripts/bench.mjs` — parse, expand, elaborate, eval timings per
  target.

All gates run in CI. Any red gate blocks merge.
