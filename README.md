# convex-triples

A reactive **bitemporal triple store** with a **Datalog query engine**, built on [Convex](https://convex.dev).

Triples are the source of truth. Convex provides transactional writes and reactive,
cached reads. Datalog is the declarative query layer. Materialized projections turn
expensive or recursive logic into live, subscribable UI state.

> An append-only bitemporal fact log with reactive Datalog projections.

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

// Datalog
datalog({
  where: [
    ["?e", "type", "Employee"],
    ["?e", "employee.status", "active"],
    ["?e", "employee.manager", "?m"],
    ["?m", "user.email", "ben@example.com"],
  ],
  select: ["?e"],
  asOf: { txTime: Date.now(), validTime: Date.now() },
})
```

Strings beginning with `?` are variables; everything else is a constant.

## Write API

- `assertFact({ e, a, value, validFrom?, validTo?, reason? })`
- `retractFact({ factId, validTo?, reason? })` — no longer true.
- `tombstoneFact({ factId, reason })` — the assertion was invalid.
- `correctFact({ factId, newValue?, newValidFrom?, newValidTo?, reason })` — tombstone + reassert + link.

Every mutation creates a `transactions` row and appends to `factEvents`.

## Datalog limits (live queries)

Bounded by design — recursion is materialized asynchronously, never run live:

```
maxClauses: 12   maxIntermediateRows: 5_000   maxResultRows: 1_000
maxClauseScan: 2_000   allowRecursion: false
```

## Status

Early — see [PLAN.md](./PLAN.md) for the MVP build order and milestones.

## Getting started

```bash
npm create convex@latest      # scaffold (if not already done)
npx convex ai-files install   # make Claude Code Convex-aware
npx convex dev                # leave running in a separate terminal
```

## License

MIT
