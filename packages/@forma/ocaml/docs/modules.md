# Modules

This document sketches the intended module system for the language. It is a
design target, not the current implementation. Today, sessions load sources and
preludes by `sourceId`; a real module system should make those boundaries
semantic.

The module system should solve four problems:

```text
file boundaries  - how source is split across files
names            - how declarations are referenced without collisions
visibility       - what a module exports
build graph      - how imports affect typechecking, elaboration, caching, IR
```

The language should not copy Common Lisp packages or Clojure namespaces
directly. It needs compiler-grade imports/exports because declarations become
runtime artifacts, agent tools, schemas, actions, views, and APIs.

## Goals

- One file has one module identity.
- Imports are explicit.
- Qualified references always work.
- Public exports are explicit for reusable modules.
- Unqualified ambiguity is a compiler diagnostic, not dynamic behavior.
- Module artifacts record import/export hashes for incremental elaboration.
- Agents can use module summaries instead of loading entire dependency files.

## Basic Syntax

Project-included Markdown files are modules. Fenced `lisp` blocks contain the
semantic source; Markdown headings and prose are documentation/provenance, not
namespace boundaries. Simple files do not need module syntax:

````md
# People

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
```
````

When a file participates in a multi-file module graph, it declares only the
module concerns it needs:

````md
# People

```lisp
(use ontology.alpha)

(export Department Employee employee-directory)

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
```
````

Another file imports it:

````md
# Hiring

```lisp
(import "./people.md" :as people)
(export Candidate)

(define-entity Candidate
  (:field [candidate/person (Ref people/Employee)]))
```
````

The elaborated core representation may still be a `module` form internally, but
authors should not need to write that wrapper.

## Imports

Supported import forms:

```lisp
(import "./people.md" :as people)
(import "./people.md" [Employee Department])
(import "./people.md" :all)
```

Relative file paths are the primary local authoring surface. Editors can jump
from `"./people.md"` to the target file before semantic module resolution
succeeds. The compiler resolves the path to a source module id and records both
the original specifier and resolved module identity in the module artifact.

`:all` should be discouraged and possibly limited to local prototype modules.
Normal source should use aliases or explicit import lists.

Qualified references use slash syntax:

```lisp
people/Employee
people/employee-directory
http/define-api-group
```

This fits the rest of the Lisp surface, where namespaced symbols already use
slash-separated names.

## Exports

The minimal export form is a flat list:

```lisp
(export Employee Department employee-directory)
```

For larger modules, category-aware exports are useful for documentation,
generated artifacts, and agent context:

```lisp
(export
  (:types Employee Department)
  (:schemas EmployeeList)
  (:queries employee-directory active-employees)
  (:actions mark-active)
  (:views employee-table))
```

The compiler can normalize both forms into the same export table.

For app-entry modules, export-all may be tolerable during early development.
For packages and reusable modules, exports should be explicit.

## Name Resolution

References resolve in this order:

```text
local lexical bindings
local declarations
explicit :refer imports
qualified imports
prelude imports
```

Ambiguous unqualified names are errors:

```text
Ambiguous reference Employee.

Found:
  people/Employee
  hr/Employee

Use a qualified reference.
```

Unresolved names should produce import-aware suggestions:

```text
Unbound symbol EmployeeList.

Did you mean:
  people/EmployeeList
  app.hr.schema/EmployeeList
```

That diagnostic shape is important for agentic repair loops.

## Package Entrypoints

New ontology packages use `README.md` as the entry module. Package metadata
lives in frontmatter, while module directives define the reachable source graph:

````md
---
id: company.hr
version: 0.1.0
preludes:
  - core
  - forms
---

```lisp
(export-from "./people.md" [Person Employee])
(export-from "./hiring.md" [Candidate])
```
````

The build system discovers imported modules from the module graph rather than
from manifest order. Legacy `(ontology ...)` manifests can continue as a
migration fallback, but they should not be used for new examples.

Longer term, external package dependencies can become explicit package metadata:

```lisp
(package my-company/people-ops
  (:version "0.1.0")
  (:depends
    [open-ontology/core "0.1.0"]
    [open-ontology/http "0.1.0"])
  (:entry app.people.main))
```

## Module Artifacts

Each module should elaborate to a module artifact:

```text
ModuleArtifact
  moduleName
  sourceId
  sourceHash
  preludeHash
  imports
  exports
  declarations
  diagnostics
  canonicalIR
```

Imports should record the hash of the imported module's public export table.
That enables incremental compilation:

```text
cache key =
  source hash
  + imported export hashes
  + prelude hash
```

If `views.lisp` changes, `schema.lisp` does not need to re-elaborate unless a
public export it depends on changed.

## Module Summaries For Agents

A module should expose a compact summary:

```json
{
  "module": "app.people.schema",
  "exports": [
    {
      "name": "Employee",
      "kind": "Entity",
      "type": "SchemaDecl",
      "doc": "Employee facts"
    },
    {
      "name": "employee-directory",
      "kind": "Query",
      "type": "QueryDef"
    }
  ],
  "imports": ["open-ontology/core"]
}
```

Agents can use summaries to choose the right import or declaration without
loading every source file into context.

## State Of The Art To Borrow From

- **ML / OCaml:** explicit modules, signatures, functors. Strong abstraction,
  but too heavy to copy wholesale at first.
- **Haskell:** qualified imports, import lists, explicit exports. Good source
  ergonomics for this language.
- **Rust:** crate/module build graph and `pub` visibility. Good package
  integration, but path rules are too fussy to copy directly.
- **Clojure:** namespace aliases are pleasant and simple. Too dynamic/global for
  this compiler, but good syntax inspiration.
- **Racket:** modules plus macro phase separation. Relevant because this
  language has macros and prelude-defined forms.
- **Unison:** semantic/content-addressed references. Very interesting for
  future provenance and caching, but too large for the first version.
- **Dhall / Nickel / CUE:** deterministic config imports and schema validation.
  Useful references for reproducible operational models.

## First Version

Implement the smallest useful system:

```lisp
(module app.people.schema
  (:import open-ontology/core :as oo)
  (:export Employee Department employee-directory))
```

Rules:

- One module per file.
- Module name must match the README package metadata or configured source root.
- Imports are explicit.
- Qualified names always work.
- `:refer` is allowed, but ambiguity is an error.
- Exports are explicit for non-entry modules.
- Compiler emits module summary artifacts.

Do not start with:

- functors
- typeclass-style module constraints
- private submodules
- content-addressed names
- implicit global imports outside a designated prelude

Those can be added later if real pressure appears.

## Relationship To Typed IR

Modules should not be implemented as a text-loader feature only. They should be
part of typed IR:

```text
source files
  -> module graph
  -> per-module typed core
  -> per-module canonical IR
  -> package artifact
```

This lets the runtime, docs, editor, and agents all see the same public module
contract.
