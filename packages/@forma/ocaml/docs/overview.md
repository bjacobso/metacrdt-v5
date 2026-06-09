# Overview

This package is the OCaml implementation of the Open Ontology language engine.
It is a typed Lisp runtime/compiler substrate for hosting domain DSLs. The
engine itself knows about syntax, expansion, evaluation, typechecking,
elaboration, diagnostics, sessions, and artifact packaging. It does not know
what an entity, query, action, view, workflow, or HTTP API means until a prelude
registers those forms.

The short version:

```text
source text
  -> read / parse
  -> expand macros
  -> lower to Core_ast
  -> typecheck with HM + descriptor hooks
  -> elaborate forms through prelude registries
  -> package canonical IR artifacts
  -> future backends emit JS, OpenAPI, MCP tools, runtime packages, etc.
```

The language is not trying to be a general-purpose Common Lisp or Clojure
replacement. It is a typed, extensible language for compiling operational
intent into runtime artifacts. A source file should be able to describe the
shape of a business domain, the facts seeded into it, the queries people ask,
the actions that mutate it, the views that expose it, and the capabilities
agents are allowed to use.

## Mental Model

The engine is split into two layers:

```text
generic language engine
  reader, CST/AST, expansion, HM inference, evaluator, diagnostics, ABI

prelude-defined domain language
  define-entity, define-record, define-query, define-action, define-view, ...
```

Preludes are ordinary Lisp files loaded into a session. They define macros,
form descriptors, protocol registries, and meta hooks. When the engine sees a
form like `(define-entity ...)`, it does not special-case that name in OCaml.
It asks the descriptor registry installed by the loaded preludes how that form
should be checked, elaborated, and packaged.

That split is the main platform idea:

```text
OCaml owns the language machinery.
Preludes own the domain vocabulary.
Canonical IR owns the runtime contract.
```

## A Real Example

Here is a small operational slice for an employee directory. It defines two
entities, one query, and two seed records.

```lisp
(define-entity Department
  (:field [department/name String {:required true}]))

(define-entity Employee
  (:field [employee/name String {:required true}])
  (:field [employee/department (Ref Department)])
  (:field [employee/active Bool]))

(define-query employee-directory
  (:from Employee)
  (:where employee/active)
  (:select [employee/name employee/department]))

(define-record "department:platform" Department
  (:field [department/name "Platform"]))

(define-record "employee:ada" Employee
  (:field [employee/name "Ada Lovelace"])
  (:field [employee/department "department:platform"])
  (:field [employee/active true]))
```

This source is not just evaluated as a script. Each top-level form is a
declaration. The declarations are checked and elaborated into structured
artifacts:

- `Department` and `Employee` become entity/schema declarations.
- `employee-directory` becomes a typed query declaration.
- the two `define-record` forms become seed-data declarations.
- source spans and provenance are preserved so diagnostics and generated
  artifacts point back to the author-written source.

## Pass 1: Read And Parse

The reader turns source bytes into parsed syntax with spans. It understands
Lisp forms, vectors, maps, strings, keywords, symbols, quote syntax, comments,
and malformed input diagnostics.

For the example, the reader sees five top-level forms:

```text
0: (define-entity Department ...)
1: (define-entity Employee ...)
2: (define-query employee-directory ...)
3: (define-record "department:platform" Department ...)
4: (define-record "employee:ada" Employee ...)
```

Every form carries a span:

```text
sourceId: example/employee-directory.lisp
startOffset: byte offset of the opening paren
endOffset: byte offset after the closing paren
line/column: reconstructed from the source table
```

Those spans matter later. A type error in `employee/active` should point at the
field or query clause the author wrote, not at a generated expansion.

## Pass 2: Expand

Expansion applies macros before semantic lowering and typechecking. Macros are
loaded from preludes or user source. Expansion is separate from runtime
evaluation; it is a compile-time pass over syntax.

For the example above, the ontology forms are mostly descriptor-handled forms,
not ordinary function calls. Some supporting syntax may still be macro-expanded
by the loaded preludes. The important invariant is that expansion preserves
useful source spans for diagnostics.

## Pass 3: Lower To Core AST

After expansion, the engine lowers the surface AST into `Core_ast`. The core
tree is the shape consumed by the typed path. It normalizes surface conveniences
into a smaller set of expression forms:

```text
literals
variables
records
field access
lambda
application
let
if
match
type definitions
descriptor/domain forms
```

The example's `define-query` remains recognizable as a descriptor/domain form,
but its slots are now available to the descriptor protocol in a normalized
shape.

## Pass 4: Typecheck

Typechecking runs HM-style inference over `Core_ast`, with descriptor hooks in
scope. Ordinary expressions infer ordinary types:

```text
"Ada Lovelace" -> Str
true           -> Bool
(fn [x] x)     -> 'a -> 'a
```

Descriptor forms participate through prelude-defined hooks. For the employee
example:

- `define-entity Department` contributes an entity/type binding.
- `define-entity Employee` contributes another entity/type binding.
- `(Ref Department)` resolves because `Department` is in the descriptor/type
  environment.
- `define-query employee-directory` can check that `employee/active` is a
  boolean-ish predicate slot and that selected fields exist on `Employee`.
- `define-record "employee:ada"` can check that supplied fields exist and that
  literal values match their declared field types.

If we mutate the source like this:

```lisp
(define-record "employee:ada" Employee
  (:field [employee/name "Ada Lovelace"])
  (:field [employee/department "department:platform"])
  (:field [employee/active "yes"]))
```

the typed path should reject it with a diagnostic equivalent to:

```text
typecheck/type-mismatch
Expected Bool to match String.
span: the "yes" field value or the enclosing offending field form
```

This is the thesis gate in practical form: descriptor-aware domain mistakes are
caught by structured types and reported against source the author can fix.

## Pass 5: Elaborate

Elaboration turns top-level source forms into declaration values. This is where
prelude-defined forms become domain artifacts.

Conceptually, the example elaborates to:

```text
Entity Department
  fields:
    department/name : String required

Entity Employee
  fields:
    employee/name       : String required
    employee/department : Ref Department
    employee/active     : Bool

Query employee-directory
  from: Employee
  where:
    employee/active
  select:
    employee/name
    employee/department

Record department:platform
  type: Department
  fields:
    department/name = "Platform"

Record employee:ada
  type: Employee
  fields:
    employee/name = "Ada Lovelace"
    employee/department = "department:platform"
    employee/active = true
```

Today, elaboration routes declaration objects through a typed artifact
boundary instead of packaging raw runtime values. The active roadmap is to
keep that boundary generic so the engine owns envelopes and validation,
while declaration-family schema knowledge stays in elaboration and
descriptors.

## Pass 6: Emit Canonical IR

The implemented backend today is `canonical-ir`. It packages the elaborated
declarations into an artifact envelope:

```json
{
  "name": "ir.json",
  "mediaType": "application/vnd.open-ontology.ir+json",
  "content": {
    "irVersion": "1",
    "kind": "CanonicalIr",
    "engine": {
      "name": "oo-lang-ocaml-spike",
      "version": "0.1.0"
    },
    "hashAlgorithm": "md5",
    "sourceIds": ["example/schema", "example/data"],
    "declarationCount": 5,
    "declarations": ["..."],
    "declarationProvenance": ["..."],
    "declarationTypeSummaries": ["..."],
    "diagnostics": []
  }
}
```

The important fields:

- `sourceHashes` and `preludeHashes` make artifacts reproducible and cacheable.
- `declarationProvenance` maps generated declarations back to source forms.
- `declarationTypeSummaries` let hosts inspect the package without decoding
  every declaration.
- `diagnostics` carries structured failures instead of throwing host-specific
  exceptions.

## Sessions And Preludes

Most serious operations should use a session:

```text
openSession
  -> loadPrelude kernel/compiler/ontology files
  -> loadSource source files
  -> typecheck / elaborate / emit
  -> closeSession
```

The session owns:

- loaded source text and source hashes
- loaded prelude text and prelude hashes
- runtime environment for macros and meta hooks
- type environment contributed by loaded declarations
- caches for repeated operations

This is why `emit` requires a session: the source alone is not enough. The
preludes define the domain forms and the hooks that elaborate them.

## Running The Engine

From the repository root:

```bash
pnpm build --filter @open-ontology/language-ocaml
```

Or from this package:

```bash
cd packages/language-ocaml
pnpm --dir . build
```

Check the engine version:

```bash
cd packages/language-ocaml
dune exec bin/oo_lang_cli.exe -- request '{"op":"version"}'
```

Expected shape:

```json
{
  "ok": true,
  "value": {
    "engine": "oo-lang-ocaml-spike",
    "version": "0.1.0"
  }
}
```

Evaluate a small expression:

```bash
cd packages/language-ocaml
dune exec bin/oo_lang_cli.exe -- request \
  '{"op":"evaluate","sourceId":"scratch","source":"(+ 1 2)"}'
```

Typecheck a small expression:

```bash
cd packages/language-ocaml
dune exec bin/oo_lang_cli.exe -- request \
  '{"op":"typecheckCoreTyped","sourceId":"scratch","source":"(let [x 1] (+ x 2))"}'
```

## Elaborating The Example

The easiest way to see elaboration today is to run the package check:

```bash
cd packages/language-ocaml
pnpm --dir . elaborate
```

That script opens a daemon session, loads the standard preludes, loads an
employee/workspace example, calls:

```json
{
  "op": "elaborate",
  "sessionId": "...",
  "sourceId": "elaborate/basic"
}
```

and asserts that seven declarations elaborate:

```text
Entity
Relation
Query
Record
Link
Action
Workspace
```

For canonical IR emission:

```bash
cd packages/language-ocaml
pnpm --dir . emit
```

That script loads schema and data sources, then sends:

```json
{
  "op": "emit",
  "sessionId": "...",
  "backend": "canonical-ir",
  "sourceIds": ["emit/schema", "emit/data"]
}
```

The response contains one artifact named `ir.json`.

## JavaScript Today Versus JS Source Emission

There are two different "JavaScript" ideas:

1. **Implemented today:** the OCaml engine itself can be compiled to a
   JavaScript runtime artifact with `js_of_ocaml`.
2. **Future backend:** source programs can be elaborated to canonical IR and
   then emitted as JavaScript source modules.

The first exists now:

```bash
cd packages/language-ocaml
pnpm --dir . build
node dist/js/jsoo_entry.cjs '{"op":"version"}'
```

The second is the intended backend shape, but it is not implemented yet. The
ABI already has the right conceptual hook: named emit backends. Today, asking
for a non-`canonical-ir` backend returns `abi/unsupported-backend`.

Future request shape:

```json
{
  "op": "emit",
  "sessionId": "session-1",
  "backend": "js-source",
  "sourceIds": ["example/employee-directory.lisp"]
}
```

Future response shape:

```json
{
  "ok": true,
  "value": {
    "backend": "js-source",
    "artifactCount": 2,
    "artifacts": [
      {
        "name": "employee-directory.schema.js",
        "mediaType": "text/javascript",
        "content": "export const schema = ..."
      },
      {
        "name": "employee-directory.runtime.js",
        "mediaType": "text/javascript",
        "content": "export function employeeDirectory(...) { ... }"
      }
    ],
    "diagnostics": []
  }
}
```

A generated JavaScript module for the example might look like this:

```javascript
export const entities = {
  Department: {
    fields: {
      "department/name": { type: "String", required: true },
    },
  },
  Employee: {
    fields: {
      "employee/name": { type: "String", required: true },
      "employee/department": { type: { ref: "Department" } },
      "employee/active": { type: "Bool" },
    },
  },
};

export const records = [
  {
    id: "department:platform",
    type: "Department",
    fields: {
      "department/name": "Platform",
    },
  },
  {
    id: "employee:ada",
    type: "Employee",
    fields: {
      "employee/name": "Ada Lovelace",
      "employee/department": "department:platform",
      "employee/active": true,
    },
  },
];

export function employeeDirectory(store) {
  return store
    .entitiesOfType("Employee")
    .filter((employee) => employee.fields["employee/active"] === true)
    .map((employee) => ({
      name: employee.fields["employee/name"],
      department: employee.fields["employee/department"],
    }));
}
```

That JavaScript should be generated from canonical IR, not directly from source.
The source-to-IR path is where parsing, macro expansion, typechecking,
descriptor validation, and provenance happen. Backends should consume typed IR
and produce artifacts.

## Why This Architecture Matters

The package is valuable because it can make operational models executable and
inspectable:

```text
source declarations
  -> typed diagnostics agents can repair
  -> canonical IR hosts can trust
  -> runtime artifacts apps can execute
  -> provenance users can audit
```

That makes the language a control plane for Open Ontology:

- entities define what exists
- relations define how things connect
- records seed facts
- queries define named read models
- actions define controlled mutations
- processes define workflow shape
- views define user-facing surfaces
- protocol entries define host/runtime compatibility

The engine should stay small and generic. The power comes from loading typed
domain vocabularies as preludes and compiling them into durable IR.

## Current Architectural Priority

The current package can already read, expand, typecheck, elaborate, and emit
canonical IR. The main remaining architectural gap is typed IR dominance.

The bad path to eliminate:

```text
descriptor output -> Eval.value -> Ir_json.t -> artifact
```

The target path:

```text
descriptor output -> typed Ir.declaration -> Ir_json serializer -> artifact
```

Once that boundary is strong, adding backends like `js-source`, OpenAPI, MCP
tools, or runtime deployment packages becomes routine backend work instead of
another compiler rewrite.
