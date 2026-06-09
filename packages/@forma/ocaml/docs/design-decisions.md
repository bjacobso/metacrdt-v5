# Design Decisions

The choices below are load-bearing. Each one is stated, motivated, and
paired with the condition that would reopen it. If you are picking up
development and are tempted to revisit one of these, read the "What
would reopen it" line first.

## 1. OCaml as the implementation language

**Chosen:** OCaml 5.1+, targeting native via `dune`, JavaScript via
`js_of_ocaml`, and WebAssembly via `wasm_of_ocaml`.

**Considered:** TypeScript (the predecessor implementation), Rust, Zig.

**Why:** the core work of a language implementation is algebraic
pattern matching over trees, Hindley-Milner unification, and typed IR
construction. OCaml's variants, exhaustiveness checking, and cheap
functional updates make these measurably shorter to write and harder
to get wrong than they are in Rust or TypeScript. Zig is a plausible
alternative for artifact size but loses the type-theory fit.

**What would reopen it:** the thesis gate (see `thesis-gate.md`)
failing on scope, drag, or diagnostic quality. Or Wasm artifact size
staying above the 8 MB gzipped budget after targeted effort.

## 2. Elaboration-time handlers over row-polymorphic effects

**Chosen:** the shipping effect substrate is elaboration-time
capability resolution. `!`-suffix calls desugar to capability record
field access. `raise!` / `catch*` desugar to host try/catch.
Typechecking is plain Hindley-Milner.

**Considered:** full row-polymorphic algebraic effects with runtime
continuation capture, in the style of Koka or Eff.

**Why:** row-polymorphic effects are powerful but expensive. They
require row unification (a distinct type-theoretic mechanism on top of
HM) and runtime continuation capture (delimited continuations or CPS
transformation in every target backend). The workloads that motivate
onlang — handler sets installed at process boundary, no multi-shot
continuations, no row-polymorphic reuse — do not need any of that.
Elaboration-time handlers give the same authoring surface and the
same diagnostic quality for roughly one-tenth the implementation
cost.

The surface syntax is identical between the two substrates. If a
future workload genuinely requires dynamic handlers or multi-shot
continuations, the row-polymorphic substrate can be adopted without
changing any DSL surface; only the elaboration target changes. A fresh
design pass would be required if that future arrives; the old row-effect spike
has been removed now that mainline Lisp mechanics own the relevant effect
contracts and diagnostics.

**What would reopen it:** a real workload requiring dynamic handler
installation that depends on runtime values, multi-shot continuations,
or row-polymorphic handler bodies reused across distinct effect sets.
None of the current authoring surfaces need any of the three.

## 3. No domain vocabulary in the engine

**Chosen:** the engine knows syntax, types, evaluation, elaboration,
and diagnostics. It does not know what an "entity," a "query," a
"workflow," or an "HTTP endpoint" is. Those forms are registered by
preludes through the descriptor and meta hook protocol
(`lib/descriptor.ml`, `lib/elaborate.ml`).

**Considered:** baking a core set of ontology forms (`define-entity`,
`define-query`, `define-form`) into the engine for performance and
simpler onboarding.

**Why:** a language that knows what an entity is closes its extension
point at the worst possible spot. The entire value of elaborator
reflection is that hosts add their own typed vocabulary without
forking the engine. onlang's consumers have different vocabularies
(ontology forms, HTTP APIs, UI components, configuration schemas);
the engine must not prefer any of them.

**What would reopen it:** measurable elaboration performance cost
that cannot be addressed by caching expanded and elaborated forms
per source hash. The current descriptor dispatch is not in a hot
enough path to justify breaking the extension model.

### Additive descriptor-authored elaborations

`define-elaboration` is a companion to `meta-fn`, not a replacement.
It registers OCaml-interpretable metadata for an existing construct
hook through `(:hook some/construct)` while keeping its own binding
name, for example `record-elaboration`. The Lisp `meta-fn` body
remains the authoritative implementation until the parity gate proves
the descriptor path equivalent.

That rule kept Plan A additive while TypeScript was still catching up:
TypeScript could ignore the metadata and continue to run the Lisp
hook, while OCaml preferred the descriptor path for performance. Both
engines now understand `define-elaboration`; new construct-hook
authoring should default to descriptors, and `meta-fn` should be the
escape hatch for genuinely imperative elaboration logic.

Elaboration descriptors must not use the hook name as their binding
name, because that would shadow the Lisp body and turn a descriptor
into a second value-level authority. During migration, parity tests run
the descriptor path against the Lisp hook body. Once a body is deleted,
the descriptor becomes the sole implementation for that hook and the
disable-native flag only disables descriptors that still have a Lisp
fallback.

The migration is now in steady-state execution: the open question is no
longer whether descriptors can replace construct hooks, but which hooks
are genuinely structural and which should remain `meta-fn` escape
hatches. Keep the per-form vocabulary analysis in
`elaboration-migration.md` current before adding new descriptor clause
kinds.

Descriptor elaborations may call named primitives for small, shared
decoders that are not themselves structural projection. A primitive is
declared in the prelude and implemented by a closed native registry in
each engine; descriptors can reference it by name, but they cannot call
arbitrary Lisp functions. `attribute-binding` is the first such
primitive, replacing the duplicated flat `:bind` slot parser used by
document and field construction. This keeps the descriptor language from
growing into a second interpreter while still making repeated domain
decoders explicit.

Nested sub-IR reuse belongs to expansion time, not descriptor time.
Fragments such as pages, fields, roles, sections, options, process
nodes, and guards are authored inside parent declarations. If an author
wants to reuse one of those fragments, a macro can expand the shared
form before elaboration runs, leaving the descriptor interpreter to see
the same parent-local child tree as an inline definition. Do not add
shared-shape or include syntax to `define-elaboration` unless a real
declaration-level caller appears; parent descriptors should own their
nested sub-IR projection.

Nested-only forms declare that ownership with `:constructed-by`. For
example, `role`, `section`, and `locale-field` are constructed by
`document-locale-elaboration`, so they do not need standalone
`.../construct` hooks. If the parent slot name differs from the child
form name, the descriptor can say so with `:child`.

The descriptor language describes structural projection from one form
tree to one IR shape. Forms that require cross-form analysis, such as
`query/construct` resolving fields against the entity named by `:from`,
or recursion into a peer compiler, such as `view/construct` compiling a
viewspec descriptor tree, remain `meta-fn` bodies by design. Those hooks
are not migration backlog; they are the imperative escape hatch that
keeps the descriptor vocabulary small.

## 4. CST and semantic AST are separate trees

**Chosen:** the reader produces a lossless concrete syntax tree
(`lib/cst.ml`) preserving whitespace, comments, and exact spans. A
lowering pass produces the semantic AST (`lib/ast.ml`) that the
expander, elaborator, and evaluator consume.

**Considered:** a single tree type carrying optional formatting
trivia, used for both purposes.

**Why:** formatters, editors, and diagnostic renderers need the exact
source text and structure. Compiler passes need a shape that drops
trivia and resolves reader sugar. A single tree either compromises
the editor case (lossy trivia) or the compiler case (every pass has
to remember to ignore trivia). The cost of two trees is a small
lowering pass; the cost of one tree is felt in every pass forever.

**What would reopen it:** no plausible reopen condition. The
separation is cheap and standard.

## 5. Typed canonical IR, not untyped JSON

**Chosen:** the canonical IR is a typed OCaml variant
(`lib/ir.ml`). A single serializer (`lib/ir_json.ml`) produces the
wire format with an explicit `irVersion` field and named hash
algorithm. JSON is how IR leaves the engine; it is not how IR is
constructed.

**Considered:** keeping IR as untyped JSON values throughout the
engine, with string-template construction in the paths that emit it.

**Why:** untyped IR construction is a silent-divergence pit.
Different call sites invent slightly different shapes, the wire
format grows implicit invariants, and consumers duplicate their own
validators. A typed variant makes the invariants compile-time
errors. Serialization becomes a write-once concern rather than a
write-everywhere concern.

**What would reopen it:** no plausible reopen condition. This is
the whole reason for the OCaml implementation.

## 6. Explicit separate passes

**Chosen:** read, expand, elaborate, typecheck, evaluate, and emit
are separate operations with their own ABI entry points and their
own diagnostic streams. Each pass consumes the output of the
previous pass; no pass calls "back into" another.

**Considered:** a fused pipeline that interleaves expansion and
evaluation, matching the current tree-walking evaluator's shape.

**Why:** fused pipelines make it impossible to cache intermediate
results (expanded AST per source hash, elaborated IR per source +
prelude hash), impossible to typecheck without evaluating, and
impossible to surface stage-specific diagnostics cleanly. The
explicit pipeline costs a tiny amount of plumbing and pays for
itself in caching, incremental elaboration, and error attribution.

**What would reopen it:** no plausible reopen condition.

## 7. JSON ABI, not direct OCaml heap exposure

**Chosen:** the engine's public contract is JSON requests in, JSON
responses out. Hosts never see OCaml values. Native, JS, and Wasm
targets all expose the same ABI.

**Considered:** exposing OCaml values directly through
`js_of_ocaml`'s JS-value bindings, or through OCaml's C FFI for
native embedders.

**Why:** a JSON ABI is the only interface that works across all
three target runtimes identically. It also makes parity testing
trivial (the same request produces the same bytes) and makes the
engine safe to embed behind a process boundary if a host needs
isolation. The cost is one serialization/deserialization per
request; this has not been a bottleneck.

**What would reopen it:** measured throughput collapse on a real
workload (large, hot REPL sessions) where the JSON boundary is the
bottleneck. Not likely.

## 8. Portable engine, one codebase, three targets

**Chosen:** one OCaml codebase under `lib/` compiles to native via
`dune`, to JS via `js_of_ocaml`, and to Wasm via `wasm_of_ocaml`. A
target parity runner asserts that all three produce identical
results on a shared case list.

**Considered:** a dedicated JS implementation for the browser
target and an OCaml implementation for the native target.

**Why:** language behavior drift between targets is a debugging
nightmare. Two codebases means two places to fix every bug and two
sources of subtle divergence. One codebase with mechanical target
parity tests keeps the behavior identical by construction.

**What would reopen it:** Wasm artifact size or startup time that
makes the browser case unviable. Fall back to a shared semantic
specification and two implementations with generated parity tests.

## 9. Tree-walking evaluator, VM deferred

**Chosen:** the evaluator walks the expanded AST directly. There is
no bytecode compiler or VM.

**Considered:** compiling to a stack-based bytecode for performance.

**Why:** the evaluator is not the performance frontier of this
project. The hot path is reader, expander, elaborator, and
typechecker — compile-time work that runs during authoring. A VM
would speed up sustained `evaluate` calls on large programs, but
onlang is not a language for that workload.

**What would reopen it:** a real workload running sustained
evaluation where the tree-walking evaluator is the measured
bottleneck.

## 10. Preludes are data, loaded at runtime

**Chosen:** preludes are ordinary Lisp source loaded into a session
through the JSON ABI. The engine has no compiled-in prelude. A
session carries a prelude hash for caching and provenance.

**Considered:** compiling a default prelude into the engine
artifact.

**Why:** a compiled-in prelude bakes host-specific vocabulary into
the engine (violating decision 3) and prevents consumers from
running different preludes in different sessions. Loading preludes
as data at runtime matches the elaborator-reflection model and
keeps the engine host-neutral.

**What would reopen it:** measured startup latency caused by
repeated prelude parsing that caching cannot address. A compiled-in
bootstrap (reader macros only, not domain forms) could be added
without reintroducing domain vocabulary if this becomes real.

## 11. Descriptors define forms, not the engine

**Chosen:** form definitions (`define-entity`, `define-api-group`,
etc.) are declared in preludes using a generic descriptor protocol.
A descriptor names slots, types, validators, and the meta hooks
that run during elaboration. The engine dispatches to the
registered hooks without knowing what the form means.

**Considered:** hard-coding each form in the engine, as most
compilers do.

**Why:** descriptors are the concrete shape of elaborator
reflection. They let hosts ship DSLs without forking the engine.
The tradeoff is that hook authors have to write elaboration logic
in Lisp rather than in OCaml; this has proven tolerable in
practice.

**What would reopen it:** a host whose elaboration logic is too
complex to express in the descriptor protocol. None has appeared.

## 12. Descriptor language is structural projection only

**Chosen:** `define-elaboration` describes structural projection from one
form to one IR shape. Cross-form analysis (a hook reading another
declaration's slots or types) and cross-namespace recursion (a hook
dispatching into a peer elaborator) remain `meta-fn` bodies. Two prelude
hooks live on the imperative side by design: `query/construct` performs
type lookups against the entity referenced by `:from`, and
`view/construct` recursively compiles a layout expression through the
`viewspec` namespace.

**Considered:** growing the descriptor language with cross-form lookup
clauses and a `:descriptor-tree <namespace>` clause to migrate
`query/construct` and `view/construct`.

**Why:** the descriptor language earns its value by being small and
honest about its scope. Adding clause kinds for two callers expands the
language for narrow benefit and risks accretion — every subsequent
exotic hook would press to add another clause. Keeping `meta-fn` as the
deliberate escape hatch lets the descriptor language cover the
structural majority without compromise. A larger typed dataflow
elaborator may be the eventual destination, but it is not the right next
step.

**What would reopen it:** the module system and the content-addressed
query graph have landed; authoring tools need bidirectional projection
from IR to form; or a second peer elaboration namespace appears beyond
`viewspec`. Any of these makes the typed-dataflow elaborator's
foundation strong enough to justify the redesign. Until at least three
such conditions hold, `meta-fn` is the right home for `query` and
`view`.

## 13. Ratcheted line-count budgets

**Chosen:** `scripts/reset-gate.mjs` enforces a hard 557-LOC cap on
OCaml files in `lib/`. The older oversized-module exception list has
been drained away; new work should split responsibilities before any
file reaches the ratchet.

**Considered:** a soft style guide about file size.

**Why:** the project accumulated one 2000+ LOC god-module during
parity work. A soft guide did not prevent it. A mechanical ratchet
does. The pattern costs nothing and makes architectural drift
visible in CI.

**What would reopen it:** no plausible reopen condition. The
ratchet is cheap discipline.
