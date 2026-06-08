# @metacrdt/schema

Pure schema-as-facts conventions for MetaCRDT. In MetaCRDT, schema is not a
separate registry — entity types and attributes are ordinary facts in the same
convergent event log. This package owns the stable naming and bootstrap rules
for describing that schema, with no knowledge of how any target stores or queries
it.

## What Schema Owns

- **Carrier ids** — the canonical entity-id conventions for schema entities:
  `attr:<name>` and `type:<name>`, with helpers `attrId`, `typeId`, `isAttrId`,
  `isTypeId`, `attrNameOf`, `typeNameOf`.
- **Value/cardinality vocabulary** — the `Cardinality` (`one | many`) and
  `ValueType` (`string | number | boolean | entityRef | date | json`) unions and
  their guards (`isCardinality`, `isValueType`).
- **Builtin cardinalities** — `BUILTIN_CARDINALITY` and `builtinCardinality` /
  `cardinalityOrMany`. Meta-attribute cardinalities are hardcoded so that
  asserting schema facts works before any schema exists (otherwise looking up the
  cardinality of `cardinality` would recurse).
- **Definition lowering** — turning typed definitions into schema facts:
  `attributeDefinitionFacts`, `entityTypeDefinitionFacts`, `metaAttributeFacts`,
  `allMetaAttributeFacts`.
- **Read-model shaping** — `shapeAttributeDefinition` reconstructs an attribute
  shape from visible schema fact rows.
- **Bootstrap meta-attributes** — `META_ATTRIBUTES`, the self-describing
  predicates (`type`, `name`, `valueType`, `cardinality`, `unique`, `indexed`,
  `materialized`, `inverseAttribute`, `description`, `hasAttribute`).

## What Schema Does Not Own

- Storage, transactions, indexes, or authorization — those live in **targets**
  and the reference runtime.
- Query execution / Datalog — that is `@metacrdt/query`.
- The event fold itself — that is `@metacrdt/core`.
- Authoring syntax — that is `@metacrdt/forma`.

## Dependencies

None. Pure constants and functions over plain `{ e, a, value }` fact shapes.

## Relation to SPEC

Schema rides entirely on SPEC §3 facts: every type and attribute definition is a
set of `assert` events like any other. This package defines the *conventions*
(which predicates mean what) layered above the protocol, not new protocol
primitives.

## Usage

```ts
import { attrId, attributeDefinitionFacts, cardinalityOrMany } from "@metacrdt/schema";
```

The Convex reference runtime consumes this package via `convex/lib/meta.ts`,
which re-exports it for compatibility.

## Extraction Boundary

This package must not import from `.context/open-ontology`. It is the first slice
peeled from `convex/lib/meta.ts` and `convex/attributes.ts`; richer schema
lowering is folded in as the boundary stabilizes (see
[docs/package-consolidation.md](../../docs/package-consolidation.md)).
