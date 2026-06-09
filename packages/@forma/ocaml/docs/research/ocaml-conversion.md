---
title: Language OCaml Conversion
status: proposed
created: 2026-04-17
updated: 2026-04-18
layer: meta
capabilities: [language, compiler, migration, ocaml, wasm, javascript, native]
tags: [meta, language, compiler, migration, ocaml, wasm, javascript]
---

# Language OCaml Conversion

## Purpose

This document is an implementation-ready migration plan for an
OCaml-based Open Ontology language system from first principles.

The target is not merely an OCaml port of the current TypeScript code. The
target is a cohesive language compiler and interpreter that can:

- read and preserve Open Ontology Lisp source
- expand macros and custom meta elaboration preludes
- run compile-time and runtime Lisp in clearly separated phases
- typecheck programs with the language's Hindley-Milner/effect system
- interpret programs for tooling, tests, REPLs, and host-driven workflows
- compile source into canonical intermediate representations
- export the compiler/interpreter engine itself as native binaries, Wasm, and JS
- accept preludes and Lisp source as runtime inputs to that engine and return
  JSON results

The immediate goal is still a scoped spike. The broader goal is to answer
whether OCaml should become the canonical implementation language for the
generic language kernel and compiler pipeline.

## Thesis Gate

The OCaml engine earns continued investment only when this concrete mutation
test passes: change `preludes/ontology.lisp:310` from `(:type Bool)` to
`(:type String)` in the `define-query` `where` slot contract, then load the
existing ontology corpus unchanged; the OCaml engine must reject the affected
source with a spanful Hindley-Milner diagnostic naming the offending form and
expected/actual types, and the implementation must not rely on string-label
matching to discover the failure.

## Executive Summary

Open Ontology is moving from a TypeScript implementation toward a serious
language platform:

- lossless reading and syntax preservation
- macros and phase-aware expansion
- custom meta elaboration at compile time and runtime
- pattern matching and algebraic data modeling
- Hindley-Milner inference with effects, constraints, and rows
- handlers, continuations, and host effects
- diagnostics, editor services, and source maps
- compiler integration for ontology artifacts
- portable execution in local tools, browsers, workers, and embedded hosts

OCaml may be a strong long-term implementation language for the full semantic
system because the core problems are language-implementation problems: ASTs,
typed IR, pattern matching, inference, expansion, diagnostics, and compiler
passes.

The first implementation step was a new `packages/language-ocaml` package that
implements a vertically thin but architecturally honest slice:

```text
source -> read -> expand -> elaborate -> typecheck -> interpret/compile
```

The TypeScript implementation remains the semantic oracle during the spike. The
OCaml implementation should prove the architecture with real build outputs and
shared parity tests before any replacement decision is made.

## Scope

This spec covers an OCaml implementation of the generic language substrate and
the compiler-facing language pipeline. It intentionally spans the boundary
between the `language` and `compiler` layers because the migration question is
about implementation ownership, build targets, and artifact strategy.

### In Scope

- generic Lisp reader/parser
- lossless concrete syntax and semantic AST
- macro expansion
- custom meta elaboration preludes
- phase-separated compile-time and runtime environments
- interpreter and VM strategy
- typechecker architecture
- compiler IR boundaries
- extensible IR backend/emitter architecture
- host ABI and session lifecycle
- native/JS/Wasm engine exports
- parity testing against TypeScript behavior
- artifact and performance measurements

### Out Of Scope For The First Spike

- replacing existing `packages/language-ts` consumers
- completing every language feature
- implementing the full ontology compiler
- building a full LSP
- exposing OCaml heap values directly to JS or Wasm callers
- optimizing artifact size before proving the target matrix

### Long-Term Scope

If the spike succeeds, the OCaml system should primarily own:

1. **Language engine exports** - the compiler/interpreter engine compiled to
   native, Wasm, and JS for use by hosts.
2. **Runtime input execution** - host-provided preludes and Lisp source loaded
   into the engine at runtime, then read, expanded, elaborated, typechecked,
   interpreted, or compiled to IR on demand.

The first-class deliverable is not a per-program native/Wasm/JS binary compiled
from a specific source bundle. It is a portable engine that accepts source and
preludes as data at runtime and returns results through the JSON ABI.

### Runtime Interpreter Model

The intended deployment model is:

```text
engine binary / JS module / Wasm module
  + runtime-provided preludes
  + runtime-provided Lisp source
  -> JSON request
  -> read / expand / elaborate / typecheck
  -> interpret or produce IR
  -> JSON result
```

The engine is compiled ahead of time. The user's preludes and Lisp source are
not compiled into a new native, JS, or Wasm binary as part of the main workflow.

### IR And Output Backend Model

The compiler/interpreter engine should separate **IR production** from **IR
consumption**.

The OCaml engine's first responsibility is to be a portable language frontend:

```text
runtime preludes + runtime Lisp source
  -> read
  -> expand
  -> elaborate
  -> typecheck
  -> canonical IR package
```

Outputs are then produced by backends over that canonical IR:

```text
canonical IR
  -> canonical JSON IR
  -> runtime interpreter input
  -> Datalog/triple artifacts
  -> ViewSpec/UI artifacts
  -> TypeScript artifacts
  -> documentation
  -> tests
  -> future language/backend artifacts
```

This means TypeScript IR output is not the immediate architecture target.
TypeScript can become one backend later, and may remain useful as a behavior
oracle for selected semantics, but it should not define the compiler boundary.

The stable contracts should be:

1. **Language frontend contract** - source/prelude inputs become elaborated,
   typed, diagnostic-rich canonical IR.
2. **Canonical IR contract** - a versioned JSON shape with source provenance,
   type summaries, diagnostics, and no OCaml runtime values.
3. **Backend contract** - a backend consumes canonical IR plus options and
   returns named artifacts.

Backends may eventually be:

- OCaml modules compiled into the engine
- Lisp/prelude-defined emitters that run inside the engine
- external host plugins invoked through JSON

The first backend should be `canonical-ir`. Additional backends should be
registered by name rather than hardcoded as a closed target enum.

## Layer Boundaries

The OCaml implementation should preserve the architectural layer model even if
some code lives in a single spike package initially.

### Language Layer

The language layer owns generic, open-sourceable language semantics:

- source identity, spans, tokens, and concrete syntax
- reader/parser and syntax normalization
- macro expansion mechanics
- phase-aware environments
- evaluator/interpreter semantics
- generic effect and continuation semantics
- type inference, kinds, constraints, and effect rows
- generic diagnostics and source maps
- stable language service contracts

It must not depend on Open Ontology product code.

### Compiler Layer

The compiler layer owns ontology-facing meaning:

- ontology source forms and form families
- custom elaboration rules for ontology declarations
- compile-time prelude loading and validation
- typed ontology IR
- runtime artifact generation
- deployment payload boundaries

It can depend on the language layer, but the generic language layer must not
depend on ontology-specific forms.

### Runtime Layer

The runtime layer owns deployed execution semantics:

- activation of compiled artifacts
- workflow/action execution
- runtime service effects
- authorization and sync integrations
- HTTP/CLI/MCP/SDK interfaces

The language interpreter may execute runtime Lisp, but runtime service meaning
belongs to the runtime layer and should be injected through host capabilities.

## First Principles

The OCaml system should be designed around a few stable ideas rather than around
the current file layout.

### Source Is Preserved

The reader should preserve enough information to support diagnostics, formatting
and editor services:

- source id
- byte offsets
- line/column positions
- comments and whitespace where needed
- token stream
- concrete syntax tree
- semantic AST

The semantic AST is for evaluation and compilation. The concrete syntax tree is
for tooling and faithful source operations.

### Language Execution Has Phases

Open Ontology Lisp needs at least two semantic phases:

| Phase        | Purpose                                          | Examples                                   |
| ------------ | ------------------------------------------------ | ------------------------------------------ |
| compile time | read, expand, elaborate, typecheck, generate IR  | macros, meta forms, schema/type derivation |
| runtime      | execute compiled or interpreted program behavior | workflows, actions, handlers, queries      |

Compile-time code may run Lisp, but it runs in a controlled compile-time
environment. Runtime code may also run Lisp, but it runs with runtime
capabilities and session state.

Phase separation is mandatory. Do not let runtime host effects accidentally
become available to compile-time expansion. Do not let compile-time mutable
state leak into runtime sessions unless it is explicitly serialized into an IR
artifact.

### Preludes Are Explicit Inputs

The language system should support multiple preludes:

| Prelude                  | Phase         | Purpose                                                      |
| ------------------------ | ------------- | ------------------------------------------------------------ |
| core prelude             | both          | primitive syntax, builtins, standard values                  |
| macro prelude            | compile time  | generic macro and syntax utilities                           |
| meta elaboration prelude | compile time  | ontology-aware expansion and declaration elaboration         |
| runtime prelude          | runtime       | runtime helper functions and effect wrappers                 |
| runtime meta prelude     | runtime       | dynamic source loading, REPL elaboration, runtime validation |
| host prelude             | host-specific | injected capabilities and environment bindings               |

Preludes should be versioned, content-addressable where possible, and included
in compile artifacts so compilation is reproducible.

### Elaboration Is A Compiler Pass

Macro expansion rewrites syntax. Elaboration gives forms meaning.

The compiler should model these as distinct passes:

```text
source
  |
  v
tokens / CST
  |
  v
surface AST
  |
  v
macro-expanded AST
  |
  v
elaborated typed IR
  |
  +--> interpreter
  |
  +--> compiler backends
```

Custom meta elaboration preludes should plug into the elaboration phase through
typed, explicit contracts. They should not be unstructured callbacks that mutate
compiler internals.

Elaboration is primarily a compile-time concern, but runtime hosts may accept
dynamic Lisp source through a REPL, script field, workflow override, or test
harness. That path should still run through a runtime-safe elaboration boundary:
read, expand with runtime-allowed preludes, validate, typecheck where possible,
then evaluate in a session. Runtime elaboration must not gain access to
compile-time-only capabilities.

### Host Interop Is Serialized

The engine should expose a stable request/result envelope to all hosts:

- native CLI
- Node.js
- browser JS
- Wasm hosts
- future embedded runtimes

The early host boundary should use JSON. Internal OCaml values, closures,
environments, and continuations must not cross the ABI.

### Sessions Own Mutable Runtime State

Interpreter sessions own:

- loaded sources
- intern tables
- module cache
- macro cache
- diagnostics cache
- effect records
- continuation records
- host capability bindings

Hosts should receive opaque handles and tokens, not pointers to OCaml values.

## Target Architecture

The full architecture has five main subsystems:

```text
+-------------------+      +---------------------+
| Source manager    | ---> | Reader / syntax     |
+-------------------+      +----------+----------+
                                      |
                                      v
+-------------------+      +---------------------+
| Prelude manager   | ---> | Expander / macro    |
+-------------------+      +----------+----------+
                                      |
                                      v
+-------------------+      +---------------------+
| Meta elaborators  | ---> | Elaborator / typer  |
+-------------------+      +----------+----------+
                                      |
                  +-------------------+-------------------+
                  |                                       |
                  v                                       v
        +-------------------+                   +-------------------+
        | Interpreter / VM  |                   | Compiler backends |
        +---------+---------+                   +---------+---------+
                  |                                       |
                  v                                       v
        +-------------------+                   +-------------------+
        | Host effects ABI  |                   | Artifacts         |
        +-------------------+                   +-------------------+
```

### Source Manager

Responsibilities:

- track source ids and source text
- maintain source maps and line tables
- support incremental replacement later
- resolve module/import references
- associate diagnostics with stable source locations

### Reader And Syntax

Responsibilities:

- tokenize Lisp source
- build lossless CST
- build semantic AST
- recover from malformed input where possible
- normalize reader forms like quote syntax
- preserve spans for all nodes

Initial syntax:

- integers
- floats
- booleans
- strings with escapes
- symbols and keywords
- lists
- vectors
- maps
- quote/quasiquote/unquote forms
- comments and whitespace in CST

### Expander And Macro System

Responsibilities:

- expand macros in a compile-time environment
- provide hygienic naming strategy or an explicit non-hygienic contract
- preserve source maps through expansion
- expose macro diagnostics
- support staged evaluation without runtime capability leakage

The first implementation may start with simple explicit macro expansion. The
architecture should still leave room for hygienic expansion and syntax objects.

### Prelude Manager

Responsibilities:

- load core, macro, meta, runtime, and host preludes
- load runtime meta preludes for dynamic source evaluation
- order prelude evaluation by phase
- cache compiled preludes
- include prelude versions/hashes in artifacts
- expose deterministic inputs to tests and builds

Preludes should be normal language inputs, not magical hardcoded behavior, once
the bootstrapping slice is complete.

### Meta Elaboration

Responsibilities:

- turn expanded source forms into compiler IR
- validate declaration shape
- resolve names and namespaces
- attach inferred or declared types
- produce ontology-specific IR when running compiler-layer forms
- produce generic typed core IR for language-only forms

The meta elaboration prelude should be able to define how domain forms lower
without changing the language kernel for each new ontology feature.

### Typechecker

Responsibilities:

- infer types for expressions and declarations
- model kinds and higher-kinded type constructors
- solve typeclass/constraint obligations
- model effect rows and host effects
- typecheck macro and elaboration boundaries
- produce diagnostics with source spans and suggested fixes where possible

The first spike can return simple known types. The go/no-go decision requires a
credible plan for porting the full type system, because OCaml's main advantage
is strongest here.

### Interpreter And VM

Responsibilities:

- evaluate pure Lisp programs
- execute compile-time macros and elaborators
- execute runtime code in isolated sessions
- support closures, lexical environments, pattern matching, and continuations
- suspend on host effects
- resume or cancel tokenized effects
- expose a deterministic stepping/debug interface later

The first implementation can be a tree-walking interpreter. The architecture
should allow a bytecode VM or optimized interpreter later without changing the
host ABI.

### Compiler Backends

There are two backend categories.

#### Engine Backends

These build the OCaml compiler/interpreter engine itself:

| Target        | Purpose                                       |
| ------------- | --------------------------------------------- |
| native binary | local CLI, CI, server tools, offline compiler |
| JS module     | Node/browser embedding, editor tooling        |
| Wasm module   | browser/worker embedding, sandboxed hosts     |

#### Engine Response Shapes

These are outputs produced by the engine after it receives preludes and Lisp
source at runtime:

| Target   | Purpose                                    |
| -------- | ------------------------------------------ |
| typed IR | canonical compiler/runtime contract        |
| value    | interpreter result returned through JSON   |
| effects  | suspended host requests returned as tokens |
| artifact | serialized runtime/deployment payloads     |

The spike should prove engine backends first. The engine should then load
preludes and source at runtime and produce values, diagnostics, suspensions, or
IR/artifact payloads through the JSON ABI.

## Package Shape

Create the spike package as:

```text
packages/language-ocaml/
|-- package.json
|-- dune-project
|-- language_ocaml.opam
|-- README.md
|-- bin/
|   |-- dune
|   `-- oo_lang_cli.ml
|-- lib/
|   |-- dune
|   |-- source.ml
|   |-- source.mli
|   |-- span.ml
|   |-- span.mli
|   |-- token.ml
|   |-- token.mli
|   |-- cst.ml
|   |-- cst.mli
|   |-- ast.ml
|   |-- ast.mli
|   |-- diagnostic.ml
|   |-- diagnostic.mli
|   |-- reader.ml
|   |-- reader.mli
|   |-- syntax.ml
|   |-- syntax.mli
|   |-- prelude.ml
|   |-- prelude.mli
|   |-- expand.ml
|   |-- expand.mli
|   |-- env.ml
|   |-- env.mli
|   |-- value.ml
|   |-- value.mli
|   |-- effects.ml
|   |-- effects.mli
|   |-- eval.ml
|   |-- eval.mli
|   |-- type_expr.ml
|   |-- type_expr.mli
|   |-- infer.ml
|   |-- infer.mli
|   |-- ir.ml
|   |-- ir.mli
|   |-- elaborate.ml
|   |-- elaborate.mli
|   |-- package.ml
|   |-- package.mli
|   |-- session.ml
|   |-- session.mli
|   |-- abi.ml
|   `-- abi.mli
|-- preludes/
|   |-- core.oolisp
|   |-- macro.oolisp
|   |-- meta.oolisp
|   `-- runtime.oolisp
|-- js/
|   |-- dune
|   `-- jsoo_entry.ml
|-- wasm/
|   |-- dune
|   `-- wasm_entry.ml
|-- scripts/
|   |-- build.mjs
|   |-- bench.mjs
|   `-- smoke.mjs
`-- test/
    |-- dune
    |-- reader_test.ml
    |-- expand_test.ml
    |-- eval_test.ml
    |-- infer_test.ml
    |-- elaborate_test.ml
    `-- abi_test.ml
```

This package is an implementation candidate, not a public replacement for
`@open-ontology/language-ts` until the migration is approved.

## Core Data Model

Use OCaml ADTs aggressively. This is the main reason to try OCaml.

### Spans

```ocaml
type source_id = string

type span = {
  source_id : source_id;
  start_offset : int;
  end_offset : int;
  start_line : int;
  start_column : int;
  end_line : int;
  end_column : int;
}
```

### Phases

```ocaml
type phase =
  | Read
  | Expand
  | CompileTime
  | Runtime
```

### Surface Syntax

```ocaml
type expr =
  | Nil of span
  | Int of span * int
  | Float of span * float
  | Bool of span * bool
  | String of span * string
  | Symbol of span * string
  | Keyword of span * string
  | List of span * expr list
  | Vector of span * expr list
  | Map of span * (expr * expr) list
  | Quote of span * expr
  | Syntax of span * syntax
```

`syntax` is the expansion-facing representation of source plus lexical context:

```ocaml
type syntax = {
  expr : expr;
  context : syntax_context;
  original_span : span option;
}

type syntax_context = {
  scopes : string list;
  phase : phase;
}
```

### Runtime Values

```ocaml
type value =
  | VNil
  | VInt of int
  | VFloat of float
  | VBool of bool
  | VString of string
  | VSymbol of string
  | VKeyword of string
  | VList of value list
  | VVector of value array
  | VMap of (string * value) list
  | VClosure of closure
  | VMacro of macro
  | VSyntax of expr
  | VEffectDef of effect_def
  | VContinuation of continuation_id
```

The first implementation should keep the referenced runtime structures simple
and explicit:

```ocaml
type closure = {
  params : pattern list;
  body : expr list;
  env : env;
}

type macro = {
  params : pattern list;
  body : expr list;
  env : env;
}

type effect_def = {
  name : string;
  payload_type : type_expr option;
}

type continuation_id = int
```

`pattern`, `env`, and `type_expr` can start as minimal representations and grow
with evaluator and typechecker parity.

### Evaluation Result

```ocaml
type eval_result =
  | Value of value
  | Suspended of suspension
  | Abort of value
```

Suspensions are serialized at the ABI boundary. The internal representation
should keep the continuation opaque:

```ocaml
type suspension = {
  token : int;
  op : string;
  payload : value option;
  continuation : continuation_id option;
}
```

### Diagnostics

Diagnostics are a core output of the compiler/interpreter and should be modeled
early:

```ocaml
type severity =
  | Error
  | Warning
  | Info
  | Hint

type diagnostic_note = {
  span : span option;
  message : string;
}

type text_edit = {
  span : span;
  replacement : string;
}

type fix = {
  title : string;
  edits : text_edit list;
}

type diagnostic = {
  span : span option;
  severity : severity;
  code : string;
  message : string;
  notes : diagnostic_note list;
  fixes : fix list;
}
```

Editor-facing APIs can refine `text_edit` later, but diagnostics should always
include stable `code`, `severity`, `message`, and optional `span`.

### Effect State

Do not rely on host state for effect lifecycle. Sessions own effect records.

```ocaml
type effect_state =
  | Pending
  | Resumed
  | Cancelled

type effect_record = {
  token : int;
  op : string;
  payload : value option;
  state : effect_state;
}

type session = {
  mutable next_token : int;
  effects : (int, effect_record) Hashtbl.t;
}
```

### ABI Values

`abi_value` is target-neutral and serialized. It is not the internal value
model:

```ocaml
type abi_value =
  | AbiNil
  | AbiBool of bool
  | AbiInt of int
  | AbiFloat of float
  | AbiString of string
  | AbiArray of abi_value list
  | AbiObject of (string * abi_value) list
```

## ABI Operations

The ABI should start boring and stable:

```ocaml
type request = {
  op : string;
  session_id : string option;
  source_id : string option;
  source : string option;
  prelude_ids : string list;
  token : int option;
  payload : abi_value option;
}

type result =
  | OkValue of abi_value
  | OkType of string
  | OkAst of abi_value
  | OkIr of abi_value
  | Suspended of suspension
  | Error of diagnostic list
```

Initial operations:

| Operation          | Input fields                                   | Result                                    |
| ------------------ | ---------------------------------------------- | ----------------------------------------- |
| `version`          | none                                           | engine metadata                           |
| `openSession`      | optional capability policy                     | session id                                |
| `closeSession`     | `sessionId`                                    | nil or diagnostics                        |
| `resetSession`     | `sessionId`                                    | nil or diagnostics                        |
| `sessionInfo`      | `sessionId`                                    | session metadata                          |
| `loadPrelude`      | `sessionId`, `source`, `sourceId`              | prelude id or diagnostics                 |
| `loadSource`       | `sessionId`, `source`, `sourceId`              | source id or diagnostics                  |
| `loadSourceBundle` | `sessionId`, source records                    | per-source load results                   |
| `read`             | `source`, optional `sourceId`                  | CST or reader diagnostics                 |
| `parse`            | `source`, optional `sourceId`                  | AST or diagnostics                        |
| `parseAst`         | `source`, optional `sourceId`                  | semantic AST or diagnostics               |
| `expand`           | `source`, optional `preludeIds`                | expanded AST or diagnostics               |
| `elaborate`        | `source`, optional `preludeIds`                | typed IR or diagnostics                   |
| `elaborateMany`    | `sessionId`, source ids                        | per-source elaboration results            |
| `typecheck`        | `source`, optional `preludeIds`                | type summary or diagnostics               |
| `evaluate`         | `source`, optional `sessionId`                 | value, suspension, or diagnostics         |
| `emit`             | `sessionId`, source ids, backend name, options | named backend artifacts or diagnostics    |
| `emitMany`         | `sessionId`, source ids, backend name, options | per-source backend artifacts              |
| `sourceSummary`    | `sessionId`                                    | loaded source/prelude counts              |
| `artifactSummary`  | `sessionId`, source ids                        | emitted declaration/artifact counts       |
| `resume`           | `sessionId`, `token`, optional payload         | resumed value, suspension, or diagnostics |
| `cancel`           | `sessionId`, `token`                           | nil or diagnostics                        |

The `emit` operation replaces the ambiguous idea of compiling a new native,
JS, or Wasm binary from user source. It asks an extensible backend to consume
canonical IR and return artifacts. The first backend should be
`"canonical-ir"`; later backends can produce runtime packages, Datalog/triple
payloads, ViewSpec/UI artifacts, TypeScript, documentation, tests, or other
language-specific outputs.

Example `emit` request:

```json
{
  "op": "emit",
  "sessionId": "session:1",
  "sourceIds": ["examples/staffing/schema.md"],
  "backend": "canonical-ir",
  "options": {}
}
```

Example response:

```json
{
  "ok": true,
  "value": {
    "backend": "canonical-ir",
    "artifacts": [
      {
        "name": "ir.json",
        "mediaType": "application/vnd.open-ontology.ir+json",
        "content": {}
      }
    ],
    "diagnostics": []
  }
}
```

The native CLI can expose:

```bash
oo-lang-ocaml request '{"op":"evaluate","source":"(+ 1 2)"}'
oo-lang-ocaml read '(+ 1 2)'
oo-lang-ocaml parse '(+ 1 2)'
oo-lang-ocaml expand '(when ok (save! x))'
oo-lang-ocaml elaborate ./ontology.oolisp
oo-lang-ocaml typecheck ./ontology.oolisp
oo-lang-ocaml evaluate '(+ 1 2)'
oo-lang-ocaml emit --backend canonical-ir ./ontology.oolisp
```

During the spike, `.oolisp` is a placeholder extension for Open Ontology Lisp
source files. The extension can change once package and source conventions
settle.

JS/Wasm entry points can start as:

```text
oo_request(json_string) -> json_string
```

Low-level pointer/length APIs should wait until the JSON target matrix works.

### Session Lifecycle

Sessions are required for effects, continuation tokens, cached preludes, loaded
source, and repeated runtime evaluation.

There are three execution modes:

| Mode             | Session behavior                                                            |
| ---------------- | --------------------------------------------------------------------------- |
| one-shot CLI     | request contains source/preludes; process exits after one result            |
| daemon CLI       | process reads JSON lines on stdin and keeps sessions in memory              |
| embedded JS/Wasm | host owns an engine instance and uses session ids returned by `openSession` |

Rules:

- `openSession` creates an isolated session and returns a `sessionId`.
- `loadPrelude` and `loadSource` attach runtime inputs to a session.
- `evaluate`, `resume`, and `cancel` use `sessionId` when they need persisted
  state.
- one-shot requests may omit `sessionId`; the engine creates a temporary session
  and discards it after the result.
- daemon and embedded modes must expose `closeSession` and `resetSession` so
  hosts can control memory and lifecycle.
- tokens are scoped to a session and must not be valid across sessions.

## Compile-Time And Runtime Lisp

The OCaml engine must support Lisp execution in both compile-time and runtime
contexts.

### Compile-Time Lisp

Compile-time Lisp powers:

- macro expansion
- syntax transformation
- custom meta elaboration
- derived declaration generation
- schema/type derivation
- static validation
- compiler plugins later

Compile-time Lisp should run with:

- deterministic source and prelude inputs
- a compile-time environment
- restricted host capabilities
- diagnostics tied to source spans
- explicit outputs: expanded AST, typed IR, or generated declarations

### Runtime Lisp

Runtime Lisp powers:

- workflow/action execution
- runtime helper functions
- host effect requests
- dynamic rule evaluation
- runtime-safe elaboration of dynamic Lisp source
- REPL/session workflows
- tests and simulations

Runtime Lisp should run with:

- isolated session state
- host capabilities injected explicitly
- effect suspension/resume/cancel semantics
- runtime prelude bindings
- runtime meta prelude bindings when dynamic source is accepted
- compiled artifact loading where available

### Shared Semantics

Compile-time and runtime execution should share:

- reader syntax
- core value model
- lexical scoping rules
- function application semantics
- pattern matching semantics
- typechecking semantics where possible

They should not share unrestricted effects or mutable global state.

## Prelude Bootstrap

Preludes are explicit inputs, but the system still needs a trusted bootstrap
sequence. The initial OCaml engine may provide a small primitive base in OCaml:

- reader/parser primitives
- minimal evaluator primitives
- builtin value constructors
- basic arithmetic/comparison/string/list/map builtins
- phase and capability checks

Bootstrap sequence:

1. install the trusted primitive base into an empty engine
2. read the core prelude with the primitive reader
3. evaluate core prelude definitions into compile-time and runtime base
   environments
4. read and evaluate the macro prelude into the compile-time environment
5. read and evaluate the meta elaboration prelude into the elaboration
   environment
6. read and evaluate the runtime prelude into the runtime environment
7. load host-provided preludes through `loadPrelude`
8. load host-provided source through `loadSource` or direct request payloads

The bootstrap process should record prelude ids, hashes, phase, diagnostics, and
whether each prelude was loaded from the built-in package or supplied by the
host. Compile-time host effects remain denied unless explicitly granted by the
session capability policy.

## Initial Semantic Scope

The first meaningful OCaml slice should cover enough language semantics to
validate the architecture.

### Reader

- integers
- floats
- booleans
- strings with escapes
- nil
- symbols
- keywords
- lists
- vectors
- maps
- quote forms
- source spans for diagnostics
- malformed input diagnostics matching existing smoke tests

### Evaluator

- literals
- symbol lookup
- `quote`
- `do`
- `if`
- `when`
- `cond`
- `and`
- `or`
- `not`
- `let`
- destructuring patterns
- `match`
- `lambda` / `fn`
- function application
- minimal builtin registry

### Builtins

- arithmetic: `+`, `-`, `*`, `/`, `mod`
- comparison: `=`, `<`, `<=`, `>`, `>=`
- value helpers: `nil?`, `bool?`, `number?`, `string?`, `symbol?`
- collection helpers: `list`, `first`, `rest`, `count`, `append`, `map`
- string helpers: `str`
- map helpers needed by parity fixtures

### Effects

- `define-effect`
- `perform` for handled effects
- `handle`
- one-shot continuation values
- host effect suspension for colon operations like `(perform :io/read-line)`
- token-aware `resume`
- token-aware `cancel`
- session isolation

### Typechecking

Minimum first-pass type responses:

- literals: `Int`, `Float`, `Bool`, `Str`, `Nil`
- list/vector shape as a simple collection type
- arithmetic result types
- comparisons as `Bool`
- host effects as `Effect` if matching current normalized output

Go/no-go requires a plan for:

- Hindley-Milner inference
- row effects
- typeclasses/constraints
- pattern exhaustiveness
- typed macros/elaboration boundaries

## Build Strategy

### Native Engine

Use Dune for native first:

```bash
cd packages/language-ocaml
dune build
dune exec bin/oo_lang_cli.exe -- evaluate "(+ 1 2)"
```

Native engine output should include:

- CLI compiler/interpreter
- JSON request mode
- local smoke tests
- artifact measurement support

### JavaScript Engine

Try `js_of_ocaml` first because it pairs naturally with `wasm_of_ocaml` through
the bytecode pipeline:

```text
(executable
 (name jsoo_entry)
 (modes js)
 (libraries language_ocaml))
```

Evaluate Melange after `js_of_ocaml` if JS-native output or tree-shaking becomes
important enough to justify separate bindings.

### Wasm Engine

Try `wasm_of_ocaml` through Dune:

```text
(executable
 (name wasm_entry)
 (modes wasm)
 (libraries language_ocaml))
```

The initial Wasm entry can accept and return strings. Do not design the final
ABI before seeing the generated Wasm wrapper shape.

### Runtime Input Artifacts

The engine receives source and preludes at runtime and can return several
artifact shapes:

| Target | Initial strategy                                        |
| ------ | ------------------------------------------------------- |
| IR     | serialize typed core/ontology IR                        |
| value  | serialize interpreter result through the JSON ABI       |
| effect | serialize suspended host request with token and payload |
| emit   | serialize named backend artifacts produced from IR      |

The first spike should not promise per-program native/JS/Wasm output. Native,
JS, and Wasm refer to the engine targets. Preludes and Lisp are runtime inputs
to that engine.

### Manifests

Engine artifacts and runtime results need separate manifests.

Engine manifest:

- engine artifact format and version
- compiler engine version
- target backend and backend version
- build hash
- OCaml compiler/toolchain versions
- ABI version
- supported operations
- bundled prelude ids and hashes, if any

Runtime result manifest:

- source ids and hashes
- prelude ids and hashes
- session id, when applicable
- phase that produced the result
- result kind: value, diagnostics, suspension, IR, or emitted artifacts
- type summary, when available
- required host capabilities/effects
- source map references, when available
- diagnostics produced while processing the request

For engine artifacts, the manifest describes the built compiler/interpreter. For
runtime input artifacts, the manifest describes the source/prelude inputs and
the produced IR/value/effect/backend-artifact output. These should not be
conflated.

## Test Strategy

Use both OCaml unit tests and TypeScript parity tests.

OCaml tests should validate local invariants:

- reader tokenization
- CST/AST spans
- macro expansion
- evaluator behavior
- type unification primitives
- ABI JSON encode/decode

TypeScript tests should compare candidates:

```text
packages/language-ts/test/ocaml-spike/
|-- ocaml-spike.test.ts
|-- load-ocaml.ts
`-- parity-runner.ts
```

Candidate targets:

1. native CLI
2. js_of_ocaml JS module
3. wasm_of_ocaml Wasm module

Target adapters:

- native CLI adapter: spawn the CLI from Node, pass a JSON request over argv or
  stdin, and parse stdout as a JSON result
- daemon CLI adapter: spawn the CLI once, send newline-delimited JSON requests
  over stdin, and keep session ids alive across requests
- `js_of_ocaml` adapter: dynamically import the generated JS module in Node and
  call `oo_request(json)`
- `wasm_of_ocaml` adapter: instantiate the generated Wasm wrapper/module and
  call `oo_request(json)` through its exported binding

Normalize all outputs:

```typescript
type SpikeResult =
  | { ok: true; value: unknown }
  | { ok: true; type: string }
  | { ok: true; ast: unknown }
  | { ok: true; ir: unknown }
  | { ok: false; diagnostics: Diagnostic[] }
  | { suspended: true; token: number; op: string; payload: unknown };
```

Start by reusing existing TypeScript language fixtures where possible. Do not
duplicate large fixture sets manually. Prefer shared fixtures and a target
adapter.

Float parity should normalize `NaN`, infinities, `-0`, and finite float
rounding differences before comparison, or exclude edge-case floats until
numeric semantics are specified.

## Artifact Measurements

The spike must report:

- native binary size
- JS artifact size
- JS artifact Brotli size
- Wasm artifact size
- Wasm wrapper JS size if generated
- Wasm + wrapper Brotli size
- cold startup time in Node
- parse/evaluate/typecheck microbenchmarks for small and medium programs
- compile-time prelude load time
- runtime prelude load time
- compile pipeline latency for representative ontology source

Add `packages/language-ocaml/scripts/bench.mjs` with output like:

```json
{
  "native": {
    "bytes": 1234567,
    "startupMs": 12.3,
    "evalSmallOpsPerSec": 10000
  },
  "js": {
    "bytes": 123456,
    "brotliBytes": 34567,
    "startupMs": 8.1
  },
  "wasm": {
    "wasmBytes": 123456,
    "wrapperBytes": 12345,
    "brotliBytes": 45678,
    "startupMs": 4.2
  },
  "compiler": {
    "readMs": 1.2,
    "expandMs": 2.4,
    "elaborateMs": 4.8,
    "typecheckMs": 5.1
  }
}
```

The question is not whether OCaml artifacts are minimal in absolute terms. The
question is whether size and latency are acceptable for product needs.

## Implementation Status - 2026-04-18

The OCaml spike now has a real package, a runtime-input pipeline, and explicit
architecture gates. The implementation has moved beyond a thin evaluator proof:
the package now enforces target availability, canonical IR emission shape, and
corpus-level declaration counts in CI-style scripts.

Implemented in `packages/language-ocaml`:

- Dune package skeleton with native CLI, `js_of_ocaml`, and `wasm_of_ocaml`
  build outputs
- JSON request ABI with `version`, session lifecycle, source/prelude loading,
  `parse`, `parseAst`, `expand`, evaluate, typecheck, elaborate, emit, and
  batch source/artifact operations
- daemon mode for repeated JSON requests over one process
- source records with stable `sourceId` values and CST/AST separation
- reader/parser for the current prelude/example corpus, including Clojure-ish
  literal forms used by the ontology preludes
- span-carrying diagnostics for reader, expansion, evaluation, elaboration, and
  ABI failures
- standalone expansion before evaluation; macro dispatch is no longer embedded
  in runtime evaluation
- pure evaluator slice with functions, closures, macros, maps, vectors, lists,
  higher-order helpers, and descriptor application values
- core/compiler/ontology prelude loading
- descriptor-driven construct hook resolution through `:construct-fn`
- meta helper builtins sufficient to elaborate the current example corpus
- minimal view layout helper stubs so ViewSpec-heavy examples elaborate
- target parity smoke coverage across native, JS, and Wasm outputs
- typed canonical IR packaging with `irVersion`, declaration records,
  provenance, diagnostics, source references, and deterministic package hashes
- first `emit`/`emitMany` ABI operations with a `canonical-ir` backend artifact
  envelope
- Hindley-Milner typechecker skeleton for expression-level feasibility work
- corpus parse verifier for `/preludes` plus `/examples`
- corpus elaboration verifier for all example Lisp blocks
- corpus golden verifier with centralized declaration-count and manifest-hash
  thresholds
- architecture gate asserting native/JS/Wasm build outputs, benchmark metadata,
  corpus counts, zero diagnostics, and Wasm Brotli size ceilings

Current verification result:

```text
pnpm test --filter @open-ontology/language-ocaml

smoke ok
target parity ok (20 cases x 3 targets)
kernel prelude ok (4 cases)
descriptor preludes ok (3 preludes, 4 examples)
meta hooks ok (6 cases)
elaborate ok (7 declarations)
emit ok (canonical-ir)
emit-golden ok
emit-corpus ok: emitted 55/55 sources with 456 declarations
emit-corpus-golden ok
corpus elaborate ok: loaded 55/55, elaborated 55/55
corpus parse ok (68 source blocks)
architecture gate ok
```

The current corpus golden gate sees these canonical IR declaration counts:

| IR declaration kind | Count |
| ------------------- | ----: |
| `Record`            |   124 |
| `Link`              |    76 |
| `Entity`            |    49 |
| `Query`             |    47 |
| `Action`            |    33 |
| `View`              |    28 |
| `Constraint`        |    21 |
| `DocumentLocale`    |    17 |
| `Document`          |    16 |
| `DocumentLocalized` |    14 |
| `Relation`          |    14 |
| `Workspace`         |     6 |
| `Schema`            |     4 |
| `Process`           |     3 |
| `TaskDefinition`    |     2 |
| `HttpApi`           |     1 |
| `PdfMapping`        |     1 |

This does **not** mean full compiler parity. It means the runtime-input engine
can read, load, and elaborate the current example corpus without crashing and
without hardcoding construct dispatch per form. Remaining high-risk gaps:

- no full Hindley-Milner/effect-row typechecker yet
- no host effect suspension/resume/cancel lifecycle yet
- canonical IR exists for current declaration artifacts, but it is not yet the
  final cross-runtime ontology IR schema
- view layout helpers are currently permissive stubs, not complete ViewSpec
  lowering
- diagnostics carry spans, but source map fidelity through every expansion and
  lowering step is still shallow
- backend registry is currently minimal and only supports `canonical-ir`
- output snapshot assertions now cover representative artifacts and corpus
  totals, but not semantic equivalence for every declaration field

### Recommended Next Steps

1. Add the shared schema algebra to the language layer so ontology fields,
   HTTP APIs, tagged errors, and generated descriptors use one representation
   instead of ad hoc symbol conventions.
2. Extend `preludes/ontology-ir.lisp` with the HTTP API and schema IR nodes so
   the current value-shaped `Schema` and `HttpApi` artifacts become typed IR
   variants.
3. Expand the `emit` backend registry beyond the initial `canonical-ir` case
   once the HTTP API IR translator needs target-specific artifacts.
4. Replace permissive ViewSpec helper stubs with real lowering in small slices.
5. Continue typechecker feasibility in parallel; effect rows remain the
   strongest OCaml go/no-go lever and the handler gate for HTTP authoring.
6. Add explicit effect/session lifecycle support after the pure
   frontend/elaboration path stabilizes.

## Migration Phases

### Phase 0 - Toolchain Proof

Goal: prove that this repository can build OCaml artifacts through pnpm/Turbo.

Tasks:

- [x] Add `packages/language-ocaml`.
- [x] Add `dune-project`.
- [x] Add minimal `lib` and `bin`.
- [x] Add package scripts.
- [x] Make `pnpm build --filter @open-ontology/language-ocaml` work.
- [x] Document required local tools in `packages/language-ocaml/README.md`.

Done when:

- Native `version` request builds and runs through pnpm.

Pause or abandon if:

- the repo cannot build a minimal OCaml package through pnpm/Turbo without a
  repository-level dependency decision

### Phase 1 - Engine Target Matrix Proof

Goal: confirm native, JS, and Wasm engine build outputs exist.

Tasks:

- [x] Add native CLI entry.
- [x] Add `js_of_ocaml` entry.
- [x] Add `wasm_of_ocaml` entry.
- [x] Add smoke script that calls each artifact with `{"op":"version"}`.
- [ ] Measure artifact sizes.
- [ ] Record target-specific limitations.

Done when:

- One command builds all available engine targets.
- One smoke test runs all available targets.

Pause or abandon if:

- native, JS, or Wasm cannot expose `oo_request(json) -> json`
- Wasm output is far above the agreed size/startup budget before any language
  code is added
- target-specific bindings force different semantic cores

### Phase 2 - Source And Reader Slice

Goal: parse enough Lisp syntax to run shared reader parity cases.

Tasks:

- [x] Implement source manager and spans.
- [ ] Implement token model.
- [ ] Implement CST.
- [x] Implement semantic AST.
- [x] Implement scanner/parser with spans.
- [x] Implement parse diagnostics.
- [x] Encode AST into normalized ABI values.
- [ ] Add TypeScript parity tests against existing reader fixtures.

Done when:

- Basic reader parity passes for native CLI.
- JS/Wasm targets either pass or have documented target blockers.

Pause or abandon if:

- lossless source spans cannot be preserved across native, JS, and Wasm targets
- parser recovery or diagnostics require target-specific behavior

### Phase 3 - Interpreter Slice

Goal: evaluate useful pure programs.

Tasks:

- [x] Implement `Value`.
- [x] Implement `Env`.
- [x] Implement literal evaluation.
- [x] Implement special forms listed in the initial parity scope.
- [x] Implement function values and application.
- [x] Implement minimal builtin registry.
- [ ] Add normalized evaluator parity tests.

Done when:

- Pure evaluation fixtures pass against the TypeScript oracle.

Pause or abandon if:

- the evaluator cannot run pure programs consistently across native, JS, and
  Wasm engine targets
- JSON value serialization forces loss of required language values

### Phase 4 - Typed Core IR And Type System Feasibility

Goal: determine early whether the existing HM/effect type system ports cleanly
and whether typed IR is a good compiler boundary.

Tasks:

- [ ] Define typed core IR.
- [ ] Model type AST as OCaml ADTs.
- [ ] Port type parser subset.
- [ ] Port inference state.
- [ ] Port unification.
- [ ] Port effect row representation.
- [ ] Port representative typeclass/constraint cases.
- [ ] Typecheck a small set of pure expressions and declarations.

Done when:

- A written estimate exists for full typechecker parity.
- Representative generic typing/effect typing cases pass.
- Typed core IR can represent the minimal evaluator slice.

Pause or abandon if:

- HM/effect-row representation is not materially clearer or safer than the
  current TypeScript implementation
- typed IR cannot serve as the shared boundary for elaboration, diagnostics, and
  runtime output

### Phase 5 - Compile-Time Expansion And Preludes

Goal: prove compile-time Lisp can expand source deterministically.

Tasks:

- [ ] Add phase-aware environments.
- [ ] Add core prelude loading.
- [ ] Add macro prelude loading.
- [ ] Add simple macro definition and expansion.
- [ ] Preserve source maps through expansion.
- [ ] Add prelude version/hash metadata.
- [ ] Add tests showing compile-time effects are restricted.

Done when:

- A source file can be read, expanded through a prelude, and returned as
  normalized expanded AST.

Pause or abandon if:

- prelude bootstrap requires uncontrolled host effects or hidden global state
- compile-time and runtime environments cannot be kept separate

### Phase 6 - Meta Elaboration Slice

Goal: prove custom meta elaboration can lower forms into IR.

Tasks:

- [ ] Define generic core IR.
- [x] Define elaborator contract.
- [x] Add meta elaboration prelude.
- [x] Lower a small ontology-like declaration subset.
- [ ] Attach source spans and diagnostics.
- [x] Return typed or partially typed IR through the ABI.

Done when:

- A small source module lowers to deterministic IR through `elaborate`.

Pause or abandon if:

- meta elaboration requires hardcoding ontology-specific form behavior in the
  generic language engine
- source spans and diagnostics cannot survive expansion and elaboration

### Phase 7 - Effects And Runtime Sessions

Goal: prove effect behavior and runtime isolation.

Tasks:

- [ ] Implement `define-effect`.
- [ ] Implement handled `perform`.
- [ ] Implement continuation values.
- [ ] Implement host suspension for colon operations.
- [ ] Implement session-owned effect records.
- [ ] Implement token-aware `resume`.
- [ ] Implement token-aware `cancel`.
- [ ] Add session isolation tests.

Done when:

- Effect lifecycle tests cover suspension, resume, cancel, and session
  isolation.

Pause or abandon if:

- effect tokens cannot be kept session-scoped
- resume/cancel semantics differ across native, JS, and Wasm targets
- explicit language effects cannot model the host effect lifecycle cleanly

### Phase 8 - Emit Backend Contract And ABI Stabilization

Goal: stabilize JSON request/result payloads for runtime-provided preludes,
source, values, diagnostics, suspensions, IR, and named backend artifacts.

Tasks:

- [ ] Define JSON request payloads for runtime-provided preludes and source.
- [ ] Define JSON result payloads for values, diagnostics, suspensions, and IR.
- [ ] Define runtime input artifact manifest shape.
- [ ] Prototype IR serialization.
- [x] Define the `emit` backend request/result contract.
- [x] Implement the first `canonical-ir` backend.
- [ ] Expand the backend registry so future outputs are added by name rather than by
      changing a closed target enum.
- [x] Prototype loading `/preludes` and `/examples` through the runtime ABI.
- [ ] Document why per-program native/JS/Wasm output is out of scope.

Done when:

- The engine can accept preludes and Lisp as runtime inputs and return
  normalized JSON results, IR, or backend artifacts.

Pause or abandon if:

- the ABI cannot represent sessions, diagnostics, values, suspensions, and IR
  without target-specific branches
- JSON payloads become too unstable to support parity tests

### Phase 9 - Go/No-Go Decision

Goal: decide whether OCaml should become the canonical language/compiler
implementation.

Decision inputs:

- parity percentage
- implementation LOC and complexity
- artifact sizes
- startup/throughput numbers
- target compatibility
- ABI complexity
- typechecker port cost
- compile-time prelude complexity
- meta elaboration clarity
- runtime input artifact roadmap

Possible outcomes:

- **Go OCaml:** OCaml becomes the candidate canonical language/compiler engine.
- **Continue spike:** OCaml remains promising but needs more parity or target
  proof.
- **No-go:** OCaml spike is archived and TypeScript remains canonical while the
  language design stabilizes.

## Decision Hypothesis

OCaml should become the canonical language/compiler implementation if the spike
shows that:

1. The core interpreter/typechecker/compiler code is clear, maintainable, and
   materially simpler than the current TypeScript implementation.
2. One semantic core can produce native, Wasm, and JS engine artifacts.
3. The artifacts are acceptable for product use.
4. The host ABI can be kept stable and small.
5. Compile-time and runtime preludes can be modeled cleanly.
6. Custom meta elaboration is easier to express than in TypeScript.
7. The parity suite can run the OCaml candidate beside the TypeScript oracle.

OCaml should not become canonical yet if:

1. OCaml Wasm or JS artifacts are too large or slow for browser/editor use.
2. The `wasm_of_ocaml`/`js_of_ocaml`/Melange split causes too much target drift.
3. Host interop requires target-specific code that erodes the "one core"
   benefit.
4. OCaml runtime behavior makes effect/session lifecycle hard to control.
5. Compile-time prelude execution is too difficult to sandbox or reproduce.

## Initial Commit - Complete

The first commit was intentionally small:

```text
Add OCaml language package skeleton
```

Initial files:

- `packages/language-ocaml/package.json`
- `packages/language-ocaml/dune-project`
- `packages/language-ocaml/language_ocaml.opam`
- `packages/language-ocaml/README.md`
- `packages/language-ocaml/lib/dune`
- `packages/language-ocaml/lib/abi.ml`
- `packages/language-ocaml/bin/dune`
- `packages/language-ocaml/bin/oo_lang_cli.ml`
- `packages/language-ocaml/scripts/build.mjs`
- `packages/language-ocaml/scripts/smoke.mjs`

The implementation can be a simple version request:

```json
{ "op": "version" }
```

Expected response:

```json
{ "ok": true, "value": { "engine": "oo-lang-ocaml-spike", "version": "0.1.0" } }
```

That first commit proved package integration. Subsequent commits have added the
reader, interpreter, prelude loading, descriptor-driven elaboration, corpus
elaboration checks, and the first `emit`/`canonical-ir` backend. Effects, a
real typechecker, finalized typed IR, and additional output backends remain
future slices.

## Prompt To Start The Effort

Use this as the opening prompt for a coding agent:

```text
We are evaluating an OCaml language compiler/interpreter that can build the
engine to native, JavaScript, and WebAssembly. The engine should accept preludes
and Lisp source as runtime inputs through the JSON ABI and return values,
diagnostics, suspensions, or IR.
Phase 0/1 should prove the engine target matrix only; do not build per-program
native, JS, or Wasm outputs from the user source.

Read:
- AGENTS.md
- specs/meta/language-ocaml-conversion.md
- specs/language/language-runtime.md
- specs/language/type-system.md
- specs/compiler/ontology/language-contract.md
- specs/compiler/ontology/compiler-pipeline.md
- packages/language-ts tests and fixtures that describe current TypeScript
  behavior

Do not rewrite existing consumers. Continue the existing package at
packages/language-ocaml and implement the next small verified slice from the
current status section.

Constraints:
- Keep TypeScript as the behavior oracle.
- Keep the host ABI serialized and target-neutral.
- Use JSON for the first ABI and smoke-test path.
- Use Dune for OCaml builds.
- Integrate with pnpm/Turbo through package scripts.
- Keep compile-time and runtime phases separate in the design.
- Treat preludes as explicit inputs, even if the first implementation stubs
  them.
- Commit in small, verified slices.

Initial deliverables:
1. packages/language-ocaml builds through
   pnpm build --filter @open-ontology/language-ocaml.
2. A native CLI accepts a request envelope and returns a result envelope.
3. A README explains required OCaml/opam/Dune setup and current target status.
4. A smoke script exercises the native CLI.
5. If toolchain setup is available, add JS and Wasm engine stubs and document
   whether they build.

Verification:
- pnpm build --filter @open-ontology/language-ocaml
- pnpm test --filter @open-ontology/language-ocaml if a package-local smoke
  test is added
- pnpm format before committing
- git diff --check

Stop and report only if the OCaml toolchain is unavailable or the target matrix
requires a repository-level dependency decision.
```

## Open Questions

- Should the JS engine target use `js_of_ocaml` first, or should Melange be
  tested first because of JS-native integration?
- Is `wasm_of_ocaml` artifact size acceptable for the browser/editor target?
- Should macro expansion be hygienic from the start, or should explicit syntax
  objects come after parity?
- What is the minimal meta elaboration prelude that proves the architecture?
- How should compile-time host capabilities be sandboxed and audited?
- Can OCaml 5 effects simplify runtime effect-handler implementation, or should
  effects be modeled explicitly for portability across targets?
- Should the typechecker port be prioritized before full evaluator parity?
- What runtime input/result artifact shape should carry source, preludes,
  diagnostics, values, suspensions, IR, and backend-emitted artifacts?

## Open Question Analysis

This section records the current working answers to the open questions. These
are not final decisions, but they should guide the first OCaml implementation
slices.

### Parity Definition

Parity should mean more than passing narrow unit fixtures. The practical parity
target is:

- every source bundle in `/examples` can be read, expanded, elaborated,
  typechecked where applicable, and either interpreted or packaged as the
  expected canonical IR/backend artifact shape
- every source bundle in `/preludes` can be loaded in the correct phase and
  used by the compiler/interpreter
- diagnostics are stable enough to compare by normalized code, span, severity,
  and message category
- runtime results are normalized through the JSON ABI before comparison
- compile-time outputs include prelude versions/hashes so parity failures can be
  tied to exact runtime inputs

Early parity can be staged:

1. read/parse all `/preludes`
2. read/parse all `/examples`
3. expand all `/preludes`
4. expand all `/examples` with the required preludes
5. elaborate examples into IR
6. typecheck representative examples
7. emit canonical IR artifacts for representative examples
8. interpret representative runtime examples

### JS Engine Target

Working answer: start with `js_of_ocaml`; evaluate Melange later if JS-native
integration becomes a product constraint.

`js_of_ocaml` advantages:

- shares the bytecode-oriented path with `wasm_of_ocaml`
- supports a broad subset of OCaml and the standard library
- is the more direct proof for one OCaml semantic core across native, JS, and
  Wasm targets

`js_of_ocaml` risks:

- generated JS is less idiomatic for JavaScript consumers
- JS interop is wrapper-oriented
- effect support may require flags that increase output size or reduce
  performance

Melange advantages:

- emits more JS-native module output
- has stronger ergonomics for direct JavaScript integration
- may fit browser/editor bundling better if the engine becomes deeply embedded
  in frontend code

Melange risks:

- creates a separate target path from `wasm_of_ocaml`
- can introduce target drift earlier than necessary
- may require JS-specific bindings before the semantic core is proven

Decision rule:

- Use `js_of_ocaml` for Phase 1.
- Add Melange only after native, JS, and Wasm engine targets can all answer
  basic JSON requests.

### Wasm Artifact Size

Working answer: measure before deciding.

The initial question is not whether the Wasm artifact is minimal. The question
is whether it is acceptable for editor and browser use.

Initial budget:

| Result     | Brotli size | Cold startup |
| ---------- | ----------- | ------------ |
| good       | `< 2 MB`    | `< 50 ms`    |
| acceptable | `2-5 MB`    | `< 150 ms`   |
| concerning | `> 5 MB`    | `> 150 ms`   |

These thresholds are placeholders. The benchmark script should report raw and
Brotli sizes, startup time, and first request latency for native, JS, and Wasm.

### Macro Hygiene

Working answer: design for syntax objects immediately, but do not implement
full hygiene before basic parity.

Full hygiene advantages:

- avoids accidental identifier capture
- improves long-term macro correctness
- forces source-map and lexical-context design early

Full hygiene risks:

- slows the first reader/evaluator/typechecker proof
- can overfit the macro model before real meta elaboration examples exist
- makes the first implementation much larger

Minimal first step:

- represent syntax objects and lexical context in the data model
- implement simple macro expansion with explicit generated names
- preserve source maps through expansion
- add full hygiene after basic macro and meta elaboration parity

### Minimal Meta Elaboration Prelude

Working answer: the minimal meta prelude should prove that custom source forms
can lower into deterministic IR without hardcoding every form in OCaml.

The first useful slice should cover a tiny declaration set such as:

```clojure
(defentity Person
  (field name String)
  (field email String))

(defaction greet
  (params [person Person])
  (returns String)
  (str "Hello " person.name))
```

This should prove:

- custom forms are recognized
- names and namespaces resolve
- declarations lower to IR
- field and type references validate
- diagnostics point to source spans
- IR includes prelude version/hash metadata

Do not start with workflows, authz, connectors, or full ontology semantics. The
first prelude should prove the pipeline:

```text
Lisp form -> macro expansion -> meta elaboration -> typed IR
```

### Compile-Time Capability Sandbox

Working answer: compile-time host access should be deny-by-default and
capability-based.

Strict sandboxing advantages:

- reproducible builds
- safer browser/editor execution
- easier artifact caching
- clear audit trail for host access during compilation

Strict sandboxing costs:

- more ceremony for useful compile-time tools
- type providers and schema importers need explicit policies
- host capability design must start earlier

Compile-time host calls should be modeled as explicit effects, for example:

```text
:clock/now
:fs/read
:http/get
:schema/inspect
:runtime/catalog
```

Each capability should declare:

- phase permission
- input/output JSON schema
- deterministic/cache policy
- timeout and resource budget
- audit log entry
- source span that requested it

Default compile-time mode should allow no network, no arbitrary filesystem, no
real clock, no random, and no process execution.

### OCaml Effects Versus Explicit Language Effects

Working answer: model Open Ontology effects explicitly. OCaml 5 effects may be
used internally later, but they should not define the language or ABI contract.

Explicit language effect advantages:

- portable across native, JS, and Wasm
- easy to serialize as JSON suspension records
- aligns with session-owned resume/cancel semantics
- easier to audit and test

Explicit language effect costs:

- more interpreter boilerplate
- continuations must be represented manually
- may be slower until optimized

OCaml 5 effect advantages:

- can simplify internal interpreter control flow
- may make handlers and continuations more natural in native builds

OCaml 5 effect risks:

- JS/Wasm target behavior may require target-specific compiler flags or runtime
  support
- generated artifacts can become larger or slower
- implementation details could leak into the host ABI if used too directly

Decision rule:

- Explicit language effects are the semantic model.
- OCaml effects are an implementation option after the portable model works.

### Typechecker Priority

Working answer: build a minimal evaluator first, then prioritize typechecker
feasibility before full evaluator parity.

Reason:

- compile-time macros and preludes need enough evaluator to run
- the typechecker is where OCaml should provide major leverage
- typed IR and meta elaboration should not be delayed until the evaluator is
  complete

Recommended order:

```text
reader
minimal evaluator
minimal macro/prelude execution
typed core IR
typechecker feasibility slice
broader evaluator parity
```

### Runtime Input Artifact Shape

Working answer: make the engine artifact canonical and pass preludes plus Lisp
source into it at runtime. The engine should return JSON-serialized values,
diagnostics, suspensions, or typed IR. Do not compile a new native/Wasm/JS
binary from each source bundle.

Runtime input advantages:

- one engine artifact can serve many source bundles
- browser/editor hosts can evaluate changed source without rebuilding binaries
- preludes can be versioned and supplied explicitly
- tests can run `/preludes` and `/examples` through the same ABI as production
- host effects and suspension records stay visible as JSON

Runtime input risks:

- repeated parsing/expansion/typechecking may add latency without caching
- source and prelude versions must be tracked carefully
- hosts need clear limits for input size, CPU, memory, and effect permissions

Typed IR role:

- typed IR remains the durable compiler/runtime boundary
- IR can be returned by the engine for inspection, caching, deployment, or
  runtime activation
- IR is not the same thing as a per-program native/Wasm/JS binary
- IR is the input to output backends; backends should be extensible rather than
  a fixed list of language targets

Bytecode role:

- bytecode may be useful later as an internal cached execution format
- bytecode should not become the first public artifact contract
- bytecode is optional until interpreter and IR semantics are stable

Recommended runtime path:

```text
engine binary / JS / Wasm
  + runtime preludes
  + runtime Lisp source
  -> read / expand / elaborate / typecheck
  -> interpret or return typed IR
  -> JSON result
```

The engine target is compiled ahead of time. The user's preludes and Lisp source
are data inputs evaluated by that engine at runtime.

Backend role:

- the first backend should be `canonical-ir`
- TypeScript, Datalog/triples, ViewSpec/UI, docs, tests, and future language
  outputs should be ordinary backends over canonical IR
- backend outputs should return named artifacts with `name`, `mediaType`,
  `content` or `bytes`, provenance, and diagnostics
- adding a backend should not require changing the reader, evaluator, or
  elaborator contracts
