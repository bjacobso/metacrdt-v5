# convex-triples

A reactive **bitemporal triple store** with a **Datalog query engine**, built on [Convex](https://convex.dev).

Triples are the source of truth. Convex provides transactional writes and reactive,
cached reads. Datalog is the declarative query layer. Materialized projections turn
expensive or recursive logic into live, subscribable UI state.

> An append-only bitemporal fact log with reactive Datalog projections.

This README is the *how* (the engine itself). For the *why* and where it's going:

- **[docs/metacrdt.md](./docs/metacrdt.md)** — the positioning: MetaCRDT, a convergence substrate (the name + the technical spine).
- **[SPEC.md](./SPEC.md)** — the MetaCRDT protocol spec (normative): events, the G-Set merge, the deterministic bitemporal fold, derivation, sync, coordination profiles.
- **[VISION.md](./VISION.md)** — the substrate → engine → emergent-product thesis and pillars.
- **[PLAN.md](./PLAN.md)** — backlog + the vision-vs-Convex assessment.
- Elaboration notes: **[confect.md](./docs/confect.md)** (the app as Effect), **[foldkit.md](./docs/foldkit.md)** (the client as a projection), **[alchemy.md](./docs/alchemy.md)** (infra as the same program).

## Why Convex

Convex is a good substrate for this because:

- **Mutations are transactional** — every write can atomically append to the log *and* update read projections.
- **Queries are reactive and cached** — derived views rerun and push to clients automatically when underlying facts change.
- **Indexed reads are the expected performance path** — `withIndex()` over declared indexes maps cleanly onto triple-pattern lookups.
- **Scheduled / internal functions** let expensive recursive materialization run asynchronously, off the live query path.

The deliberate non-goal: this is **not** "Datomic on Convex" or an RDF/SPARQL engine.
It's *reactive operational Datalog* — bounded live queries plus materialized views for
the heavy stuff.

## Core concepts

| Concept | Meaning |
| --- | --- |
| **Entity** (`e`) | Anything with identity, e.g. `"employee:123"`. |
| **Attribute** (`a`) | A typed predicate, e.g. `"employee.status"`. |
| **Value** (`v`) | A scalar, entity ref, or JSON value. |
| **Fact / triple** | `[e, a, v]` — one assertion. |
| **Transaction time** | When the system *recorded* a fact (`assertedAt`, `retractedAt`, `tombstonedAt`). |
| **Valid time** | When the fact is *true in the modeled world* (`validFrom`, `validTo`). |
| **Retract** | The fact stopped being true. |
| **Tombstone** | The assertion itself was wrong / deleted / redacted — distinct from retraction. |
| **Correction** | Sugar for tombstone-old + assert-new, linked via `supersedes` / `supersededBy`. |

### Bitemporality in one sentence

Every fact answers two independent questions: *when did we know this?* (transaction time)
and *when was it true?* (valid time). That lets you ask "what did we believe on May 1?"
separately from "what is now believed to have been true on May 1?".

## Visibility predicate

A fact is visible for a read at `(txTime, validTime)` when:

```ts
fact.assertedAt   <= txTime
&& (fact.retractedAt === undefined || fact.retractedAt > txTime)
&& fact.validFrom  <= validTime
&& (fact.validTo   === undefined || fact.validTo   > validTime)
&& fact.tombstonedAt === undefined
```

Audit reads may opt into `includeTombstoned` / `includeRetracted`.

## Data model (tables)

- **`transactions`** — one document per write; actor, reason, source, `txTime`.
- **`factEvents`** — append-only, immutable audit trail (`assert` / `retract` / `tombstone` / `untombstone` / `correction`).
- **`facts`** — canonical bitemporal interval records (patched with `retractedAt` / `validTo` / tombstone fields).
- **`currentFacts`** — disposable fast read model: latest visible, non-tombstoned fact per `e`/`a`.
- **`attributes`** — typed schema for predicates (value type, cardinality, uniqueness, inverse).
- **`rules`** + **`derivedFacts`** + **`ruleInvalidations`** — Datalog rules and their materialized output.

## Query API

```ts
// Current entity view (reads currentFacts)
getEntity({ e: "employee:123" })

// Bitemporal point query
queryFacts({
  e: "employee:123",
  a: "employee.status",
  txTime: Date.parse("2026-05-01"),    // defaults to now
  validTime: Date.parse("2026-05-01"), // defaults to now
  includeTombstoned: false,
})

// Reconstruct an entity at any bitemporal coordinate (general form of asOf*)
entityAsOf({ e: "employee:123", txTime, validTime })

// Compare what was visible at two coordinates: "what did we believe on May 1?"
// vs "what is now believed to have been true on May 1?"
compareFacts({
  e: "employee:123",
  a: "employee.status",
  before: { txTime: Date.parse("2026-05-01"), validTime: Date.parse("2026-05-01") },
  after:  { txTime: Date.now(),                validTime: Date.parse("2026-05-01") },
})

// Datalog — patterns, comparisons, and negation
datalog({
  where: [
    ["?e", "type", "Employee"],
    ["?e", "salary", "?s"],
    ["?s", ">", 100000],                    // comparison: > < >= <= == !=
    { not: ["?e", "status", "terminated"] }, // negation
    ["?e", "reportsTo+", "?vp"],             // materialized transitive closure
  ],
  select: ["?e", "?vp"],
  txTime: Date.now(),
  validTime: Date.now(),
})
```

Strings beginning with `?` are variables; everything else is a constant. A
clause is a `[e, a, v]` pattern, a `[term, op, term]` comparison, or a
`{ not: [e, a, v] }` negation. Queries read **facts ∪ materialized derived
facts**, so a rule's output (including transitive closures) is queryable like
any other attribute. Join order is chosen dynamically by selectivity;
comparisons and negations run as soon as their variables are bound.

## Write API

- `assertFact({ e, a, value, validFrom?, validTo?, reason? })`
- `retractFact({ factId, validTo?, reason? })` — no longer true.
- `tombstoneFact({ factId, reason })` — the assertion was invalid.
- `correctFact({ factId, newValue?, newValidFrom?, newValidTo?, reason })` — tombstone + reassert + link.

Every mutation creates a `transactions` row and appends to `factEvents`.

Register a predicate's typed schema (and cardinality) with
`defineAttribute({ name, valueType, cardinality, ... })`. A `cardinality: "one"`
attribute makes `assertFact` retract the prior current value (in transaction
time) before asserting the new one; otherwise multiple values coexist.

## Schema as facts (meta-circular)

There is **no schema table**. Attribute definitions, entity-type definitions,
and type→attribute membership are themselves bitemporal triples about
`attr:<name>` / `type:<Name>` entities — so the schema inherits history,
tombstoning, and as-of queries from the same engine as the data. Even
cardinality is a fact: `assertFact` reads `(attr:<a>, "cardinality", ?)` to
decide supersession, bootstrapped by a small set of built-in meta-attributes
(`convex/lib/meta.ts`).

```ts
defineAttribute({ name: "salary", valueType: "number", cardinality: "one" })
defineType({ name: "Employee", attributes: ["salary", "title"] })

getAttribute({ name: "salary" })                 // current definition
attributeAsOf({ name: "salary", txTime, validTime }) // definition as of a coordinate
attributeLifecycle({ name: "salary" })           // when it was added / removed / redefined
typeSchemaAsOf({ type: "Employee", txTime })     // the type's shape at a point in time
retireAttribute({ name: "salary" })              // recorded in history, recoverable
bootstrapSchema()                                // install self-describing meta-attributes
```

Because schema entities use the same `type` attribute, `Attribute` and
`EntityType` show up as browsable types in the Entities view too.

## Rules & materialization

`defineRule({ name, where, emit, dependsOnAttributes })` persists a Datalog rule
whose output is materialized into `derivedFacts`. On any fact change, rules
depending on the changed attribute are recomputed: **entity-local** rules
(every clause subject is the emitted entity) recompute incrementally for just
that entity; cross-entity rules recompute in full. The `ruleInvalidations` queue
records and clears each pending recomputation.

`defineTransitiveRule({ name, baseAttribute, closureAttribute, maxDepth })`
materializes the transitive closure of a relation (e.g. `reportsTo` →
`reportsTo+`), recomputed when the base attribute changes. Adding an edge takes
a **semi-naive delta** (predecessors × successors of the new edge); removing or
correcting one triggers a full BFS recompute. This is how recursion stays off
the live query path while remaining queryable — the closure attribute is just
another derived fact.

## Entities browser (demo)

The hosted demo includes an "Entities" view that treats the `type` attribute as
a table selector: `listEntityTypes` lists types with counts, `typeAttributes`
discovers a type's columns, and `queryEntities` runs a dynamic filter/sort spec
that is **compiled into Datalog** (filters → pattern/comparison clauses), then
sorted by an attribute and paginated with an opaque cursor. The UI's query
builder is generated per type and shows the compiled `where` it ran.

## Datalog limits (live queries)

Bounded by design — recursion is materialized asynchronously, never run live:

```
maxClauses: 12   maxIntermediateRows: 5_000   maxResultRows: 1_000
maxClauseScan: 2_000   allowRecursion: false
```

## Testing

```bash
npm test        # vitest run (convex-test + edge-runtime)
```

Covers the bitemporal visibility quadrants, append-only event replay,
cardinality-one replacement, tombstones, Datalog joins, and rule
materialization (incremental recompute through a correction).

## Status

M1–M6 implemented and tested — see [PLAN.md](./PLAN.md) for milestones and
what's still open.

## Getting started

```bash
npm create convex@latest      # scaffold (if not already done)
npx convex ai-files install   # make Claude Code Convex-aware
npx convex dev                # leave running in a separate terminal
```

## License

MIT
