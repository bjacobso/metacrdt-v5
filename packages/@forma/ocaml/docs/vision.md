# onlang — Vision

A typed Lisp built to host domain DSLs.

## What onlang Is

onlang is a small, homoiconic, macro-first programming language. It takes
the parts of Clojure that most users agree were right — immutable data,
macros, REPL — and integrates three things Clojure users have spent a
decade patching in from the outside:

- **A real type system.** Bidirectional elaboration with typed macros.
  Macros produce typed intermediate representation, not just syntactic
  expansions. Errors point at the source form the author wrote, not at
  the expanded shape.
- **An effect system.** Operations that do I/O are `!`-suffixed and
  resolve to handlers in scope. The shipping substrate is
  elaboration-time capability resolution (see `design-decisions.md`);
  the surface is compatible with a future row-polymorphic substrate if
  a workload ever demands it.
- **Elaborator reflection.** Host programs can register descriptors and
  meta hooks that participate in elaboration, producing their own typed
  IR nodes from Lisp source. Host-specific forms (`define-entity`,
  `define-api-group`, and so on) are preludes, not built-ins. The
  engine ships with no domain vocabulary.

onlang compiles via OCaml to native, JavaScript, and WebAssembly. The engine is
a portable frontend: source and preludes go in, diagnostics and canonical IR
come out. Backends over that IR produce target-specific code, schemas, tools,
plans, and generated review documents.

## Relationship To Open Ontology

onlang is the language engine. Open Ontology is the reference runtime,
ontology/prelude ecosystem, and product surface built around onlang's output.

The repo-wide direction is documented in
[../../../LISP.md](../../../LISP.md). In that split, onlang owns language tooling
and canonical IR emission; Open Ontology's TypeScript packages consume that IR
for runtime services, web/API/MCP surfaces, storage, connectors, generators,
planners, and agent workflows.

For Open Ontology, Lisp is the canonical reviewable source format over this
contract. Agents author it, humans review it, and the compiler lowers it to
canonical IR. Visual editors, natural-language flows, SDKs, and importers
remain important, but they should produce, inspect, or project Lisp source and
canonical IR rather than becoming separate permanent language substrates.

## Why This Combination

Each of the three pieces has decades of prior art. The bet is that the
_combination_ — all three in the same small Lisp — is different:

- A Lisp without a type system accretes schema libraries, spec systems,
  and runtime validators until the types are back, just ad-hoc. A Lisp
  with typed macros lets every DSL author the surface they want without
  giving up error quality.
- Effects without elaboration-time handler resolution force every call
  site to thread rows explicitly, or pay for runtime continuation
  capture everywhere. With elaboration-time resolution, the type system
  is plain Hindley-Milner and effect calls are direct function calls
  after expand.
- A DSL without elaborator reflection either bakes its vocabulary into
  the host language (closing the extension point) or reduces to an
  interpreter over untyped data (losing error quality). With
  reflection, hosts register their own typed forms and diagnostics
  flow back to the author's source.

None of the individual ideas are new. Racket and Turnstile have typed
macros; Koka and Eff have algebraic effects; Lean 4 has elaborator
reflection. onlang's bet is that these belong in the same small language,
not in three libraries glued together.

## Design Principles

1. **Data is more important than functions. Functions are more important
   than macros.** Clojure's axiom. onlang keeps it.
2. **No domain vocabulary in the engine.** Entity, relationship, query,
   workflow, endpoint: none of these are built-in. They are preludes the
   host supplies. The engine knows syntax, types, evaluation, and
   elaboration; it does not know what the program is about.
3. **Lossless source.** The reader preserves whitespace, comments, and
   spans on every node. Formatters, editors, and diagnostics read the
   concrete tree; elaboration reads the semantic tree.
4. **Passes are explicit.** Read, expand, elaborate, typecheck,
   evaluate, and emit are separate operations. Each runs independently.
   Each produces its own diagnostics.
5. **Diagnostics carry spans.** Always. No `null` location after the
   reader succeeds.
6. **Typed all the way down.** Canonical IR is a typed variant, not
   untyped JSON that happens to round-trip. JSON is the wire format, not
   the internal representation.
7. **Elaboration-time handlers over runtime continuations.** Effects are
   resolved to direct calls at expand time wherever possible. Runtime
   effect machinery is the escape hatch, not the default.
8. **Portable engine.** One codebase compiled to native, JS, and Wasm.
   The same bytes of program behave the same across targets, or a parity
   test fails.
9. **Reviewable source.** The source should be concise enough for a
   non-programmer reviewer to understand what changed when the prelude is
   domain-appropriate. Generated runtime code is output, not the review
   medium.

## Non-Goals

onlang is not:

- **A Clojure replacement.** onlang does not aim for Clojure source
  compatibility. The surface is Clojure-shaped; the semantics are not.
- **A general-purpose production language.** The target audience is
  authors of operational workflow systems, domain-specific DSLs, and
  schema-heavy APIs. If your program is CPU-bound numeric code, use a
  different language.
- **A research vehicle for novel type theory.** onlang uses Hindley-Milner
  plus capability-based handlers because both are understood. Earlier
  row-effect research has been subsumed by the mainline mechanics fixtures and
  is no longer a live implementation lane.
- **A competitor to mainstream typed FP.** If Haskell, OCaml, or
  F\* fits, use them. onlang's reason to exist is the combination — typed
  Lisp plus elaborator reflection plus cheap effect handling — not the
  type theory.

## Reference Consumer

onlang was extracted from an operational workflow platform called Open
Ontology, which uses onlang to model entities, relationships, rules,
workflows, and HTTP APIs as declarative Lisp over a time-traveling
triple store. That platform is the reference consumer and the source
of the current test corpus. None of its vocabulary — entity types,
Datalog queries, time-travel semantics, triple storage — is part of
onlang itself. They are preludes and host services registered through
the ABI.

A different consumer could use onlang to author configuration files, UI
component libraries, build pipelines, or any other structured domain where typed
macros, span-carrying diagnostics, and concise reviewable source are
load-bearing. Open Ontology's substrate is onlang's motivating example, not
onlang's implementation.

## Status

Pre-alpha, research-stage. Reading the code is welcome; depending on it
is not. The language has a working reader, expander, evaluator, JSON
ABI, native/JS/Wasm builds, and a parity-checked corpus. The
Hindley-Milner typechecker is the load-bearing open item; see
`thesis-gate.md` for the concrete test that decides whether the
OCaml-hosted implementation is the right long-term home.
