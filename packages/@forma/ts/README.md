# @forma/ts

Forma is the MetaCRDT authoring language package: a generic Lisp/sexpr surface for
describing shapes that can later lower into MetaCRDT IR, packages, or target
runtimes.

This package is extracted from the pinned Open Ontology language implementation
and is now owned by the `@metacrdt/*` monorepo. It is intentionally
runtime-neutral.

## What Forma Owns

- The Lisp / S-expression authoring language.
- Source identity, spans, parser, formatter, AST, and syntax-tree utilities.
- The direct evaluator, macro expander, bytecode VM, and standard builtins.
- Hindley-Milner type inference and the typed core expression boundary.
- Language-owned elaboration, form, descriptor, artifact, and code-generation
  utilities.

## What Forma Does Not Own

- Convex bindings or Convex schema/function code.
- MetaCRDT protocol event storage, sync, or projection persistence.
- Datalog/runtime execution for facts.
- Cloudflare, local-first, Node platform targets, or transport bindings.
- Product UI.

Those concerns belong to sibling packages such as `@metacrdt/core`,
`@metacrdt/convex`, future runtime/target packages, and product apps.

## Public Surfaces

The root export groups the language modules:

```ts
import { Reader, Evaluator, Type } from "@forma/ts";
```

Subpaths are also exported for direct consumers:

```ts
import { parseManyToSExpr } from "@forma/ts/reader";
import { evaluate, makePreludeLayer } from "@forma/ts/evaluator";
import { inferSourceStr } from "@forma/ts/type";
```

## Legacy Names

Older Open Ontology materials may call this layer `language-ts`, `Onlang`, or the
Open Ontology language. In MetaCRDT, the durable package name is **Forma**:
`@forma/ts`. Onlang can remain a historical alias for the authoring idea,
but new code should import from `@forma/ts`.

## Extraction Boundary

This package must not import from `.context/open-ontology`. Source and selected
fixtures are copied into this package so it can stand on its own in the MetaCRDT
workspace.
