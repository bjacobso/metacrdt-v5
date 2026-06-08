# MetaCRDT

**A convergence substrate for structured coordination across distributed runtimes.**

MetaCRDT starts from one primitive:

> a convergent graph of facts, constraints, intentions, and effects.

Databases store facts. CRDTs synchronize facts. **MetaCRDT synchronizes facts,
logic, workflows, permissions, agents, and interfaces.**

This repository is the canonical MetaCRDT reference implementation and package
monorepo. It currently runs on [Convex](https://convex.dev) as a centralized,
reactive reference runtime, with the pure convergence kernel already extracted as
`@metacrdt/core`.

---

## First Principles

Operational systems are edited by humans, services, workflows, and agents. Those
edits are not only rows in a database or messages in a queue. They are facts,
tasks, reviews, violations, proposals, forms, signatures, decisions, and derived
views that need to remain meaningful as they move across runtimes.

MetaCRDT models those changes as immutable events in an append-only fact log.
State is not mutated in place. State is a deterministic fold of events.

That gives the substrate four properties:

| Property | Meaning |
| --- | --- |
| **Fact Convergence** | Operational facts merge as a grow-only set of events. |
| **Provenance** | Every assertion records who made it, when, and why. |
| **Derived Coherence** | Rules, obligations, views, and workflows are recomputed from facts rather than copied between tools. |
| **Agent Participation** | Agents write proposals and actions under the same merge/provenance semantics as humans. |

The "meta" in MetaCRDT is that derivation also converges. If every derived value
is a pure deterministic fold over the same event set, then constraints, tasks,
permissions, workflow state, and UI projections converge without being separately
synchronized.

---

## The Model

MetaCRDT has two layers:

1. **The log is a CRDT.** Events are immutable and content-addressed. Merging two
   replicas is set union: commutative, associative, idempotent.
2. **Everything else is a fold.** Current state, bitemporal reads, Datalog
   derivations, obligations, flow state, generated views, and agent explanations
   are deterministic projections of that event set.

```text
events (G-Set CRDT)
  ├─ current facts
  ├─ bitemporal facts at (txTime, validTime)
  ├─ derived facts and rule output
  ├─ obligations, tasks, violations
  ├─ workflow runs and actions
  ├─ generated views
  └─ agent-readable provenance
```

Convergence is therefore a projection, not a destructive merge. A normal CRDT
converges to one "now" state and discards the path. MetaCRDT keeps the path:
valid time, transaction time, causal references, actor identity, and provenance.

Truth has a tense.

---

## Protocol

The normative protocol is [SPEC.md](./SPEC.md).

It defines:

- immutable events (`assert`, `retract`, `tombstone`, `untombstone`)
- content-addressed `EventId`s
- Hybrid Logical Clock timestamps
- the `≺` total order (`hlc → actorId → eventId`)
- the grow-only-set log merge
- the deterministic bitemporal visibility predicate
- pure derivation rules
- provenance and actor identity
- version-vector anti-entropy sync
- coordination profiles: capability links, membership, quorum, read grants

The current Convex runtime implements the centralized reference path. The
multi-replica sync runtime (browser / Durable Object / peer-to-peer) is the
research frontier, tracked explicitly in [TODO.md](./TODO.md).

---

## Package Graph

This repo is becoming the canonical `@metacrdt/*` monorepo.

Current packages:

- **`@metacrdt/core`** (`packages/core`) — pure, dependency-free convergence
  kernel: SHA-256, base32, canonical values, HLC, events, `≺`, G-Set merge, and
  the bitemporal fold.
- **`@metacrdt/convex`** (`packages/convex`) — Convex target adapters:
  protocol metadata validators, Convex/core event construction, row
  reconstruction/verification, projected-row visibility, cardinality-one
  reconcile selection by `≺`, protocol append/verification helper factories, and
  Confect sidecar guidance.
- **`@metacrdt/forma`** (`packages/forma`) — runtime-neutral Lisp / S-expression
  authoring language extracted from Open Ontology: reader, formatter, evaluator,
  VM, type inference, and language-owned elaboration utilities.
- **`@metacrdt/runtime`** (`packages/runtime`) — target-neutral service contracts
  and memory harness: injected HLC clock, optional per-replica sequencer,
  operation helpers, version-vector delta calculation, and anti-entropy exchange.
- **`@metacrdt/cloudflare`** (`packages/cloudflare`) — Durable Object / Worker
  target helpers: storage-backed event log, HLC, per-replica sequencer,
  WebSocket relay shell, Worker router, and example Wrangler config.
- **`@metacrdt/local`** (`packages/local`) — browser/local-first target package:
  localStorage-backed event/HLC/seq services composed with BroadcastChannel
  anti-entropy, IndexedDB-compatible async persistence, SQLite-compatible local
  persistence, plus browser defaults and lifecycle helpers.

Planned package graph:

```text
@metacrdt/core        protocol kernel: events, ids, order, fold
@metacrdt/forma       Lisp authoring language
@metacrdt/schema      schema-as-facts, types, attributes
@metacrdt/query       Datalog, rules, derivation
@metacrdt/workflow    processes, flows, obligations
@metacrdt/forms       forms, collection, prompt-response
@metacrdt/views       ViewSpec / generated response surfaces
@metacrdt/agent       agent actors, proposals, skills
@metacrdt/runtime     IR + service interfaces
@metacrdt/convex      Convex target / component / bindings
@metacrdt/cloudflare  Durable Object / Worker target
@metacrdt/local       browser/local-first target
@metacrdt/node        Node target
```

Open Ontology is vendored as a context submodule at
[.context/open-ontology](./.context/open-ontology). The fold plan is documented
in [docs/package-consolidation.md](./docs/package-consolidation.md):

- Open Ontology's Lisp layer becomes `@metacrdt/forma`.
- ViewSpec becomes `@metacrdt/views`.
- The old triple-store/database concepts split into `@metacrdt/core`,
  `@metacrdt/query`, and target packages.
- Migration is extraction by proven package boundary, not bulk copy.

---

## Reference Implementation

The running reference implementation is a Convex app that demonstrates MetaCRDT
as a live operational substrate.

Built today:

- append-only bitemporal fact log
- rebuildable projections (`facts`, `currentFacts`, `derivedFacts`)
- Datalog query engine with joins, comparisons, negation, aggregation, and
  materialized transitive closure
- schema-as-facts: entity types and attributes are facts too
- rules and provenance: derived facts explain why they exist
- compliance obligations as derived facts
- durable flow DAGs and synchronous actions
- config-as-code blueprints
- generated entity detail pages
- configured actions with optional typed inputs (`$arg.*` placeholders resolved
  into asserted facts)
- form-opening actions that issue/reuse `/collect` magic links through the same
  `flowRuns` path as flow collect steps
- single-use, expiring collection tokens for the public `/collect` page
- Tailwind + React Router research-preview UI
- `@metacrdt/core` wired into the Convex read path for bitemporal visibility
- `@metacrdt/runtime` harness groundwork: target-neutral services plus an
  in-memory convergence test target
- Confect/Effect sidecar for typed compliance planning: a read-only dry-run
  planner answers collect-vs-reuse for hypothetical placements without moving
  protocol writes behind Effect

The demo elaboration is **datarooms**: compliance/onboarding as a mergeable fact
log. That product surface is intentionally just one physics over the substrate,
not the substrate itself.

---

## Bitemporality

Every fact answers two independent questions:

- **Transaction time:** when did the system record or learn this?
- **Valid time:** when was this true in the modeled world?

That lets the system ask different questions precisely:

- What did we believe on May 1?
- What do we now believe was true on May 1?
- Why was this worker considered compliant at that time?
- Which facts caused this obligation, permission, or workflow step?

The core visibility predicate is implemented in `@metacrdt/core` and used by the
Convex runtime:

```ts
visible(event, { txTime, validTime }, log)
```

The old row-level form is equivalent:

```ts
fact.assertedAt <= txTime
&& (fact.retractedAt === undefined || fact.retractedAt > txTime)
&& fact.validFrom <= validTime
&& (fact.validTo === undefined || fact.validTo > validTime)
&& fact.tombstonedAt === undefined
```

---

## Convex Runtime

Convex is the current reference target because it gives the demo the operational
properties needed to prove the substrate:

- transactional mutations for appending events and updating projections
- reactive cached queries for live generated views
- indexed reads for triple-pattern lookup
- scheduled/internal functions for materialization, flow resumption, and
  reconciler work

Important tables:

| Table | Role |
| --- | --- |
| `transactions` | one document per write: actor, reason, source, transaction time |
| `factEvents` | immutable audit log |
| `facts` | bitemporal interval projection |
| `currentFacts` | disposable current read model |
| `derivedFacts` | materialized rule output with provenance |
| `attributes` / schema facts | predicate and type metadata |
| `flowDefs` / `flowRuns` | durable workflow definitions and executions |

New writes already stamp `eventId` + HLC metadata onto `factEvents`, lifecycle
events target protocol assert ids, and cardinality-one current projections
reconcile by the core `≺` order. Config-as-code now also reconciles the configured
shape: dropping an owned type, attribute, form, flow, requirement, or action from
an explicitly applied config section retracts or deactivates the old configured
artifact without deleting runtime data.

Read authorization is also fact-native. Form fields can mark attributes as PII
(`i9/ssn` in the staffing blueprint); public read projections derive the reader
from Convex auth identity, check grant facts on that principal
(`grants.read`), and omit/redact ungranted values with `Denied` markers. Internal
materializers still fold raw facts so system derivations stay coherent.

Generated UI reads the same schema facts. `typeSchemaAsOf` returns declared
columns with attribute definitions, the entity browser uses those columns for
tables, entity detail orders state by the primary type schema, and collection
forms render from `formDef`.

---

## Query and Write Surface

Examples from the current Convex API:

```ts
// Current entity view
getEntity({ e: "worker:maria" })

// Bitemporal point query
queryFacts({
  e: "worker:maria",
  a: "worker.status",
  txTime: Date.parse("2026-05-01"),
  validTime: Date.parse("2026-05-01"),
})

// Datalog over facts + derived facts
datalog({
  where: [
    ["?e", "type", "Worker"],
    ["?e", "worker.status", "active"],
    { not: ["?e", "status", "terminated"] },
  ],
  select: ["?e"],
})

// Writes
assertFact({ e, a, value, validFrom, validTo, reason })
retractFact({ factId, validTo, reason })
tombstoneFact({ factId, reason })
correctFact({ factId, newValue, reason })
```

Every write creates a transaction and appends event history. Projections are
rebuildable from that history.

---

## Documentation Map

- [docs/manifesto.md](./docs/manifesto.md) — founding statement.
- [docs/architecture.md](./docs/architecture.md) — package/layer map.
- [docs/package-consolidation.md](./docs/package-consolidation.md) — Open
  Ontology → MetaCRDT fold plan.
- [docs/metacrdt.md](./docs/metacrdt.md) — positioning and research preview.
- [SPEC.md](./SPEC.md) — protocol specification.
- [VISION.md](./VISION.md) — product/substrate thesis and pillars.
- [PLAN.md](./PLAN.md) — full backlog and milestone plan.
- [TODO.md](./TODO.md) — running worklog and near-term next steps.
- [docs/confect.md](./docs/confect.md) — backend as Effect via Confect.
- [docs/foldkit.md](./docs/foldkit.md) — client as projection.
- [docs/alchemy.md](./docs/alchemy.md) — infrastructure as the same program.
- [docs/physics.md](./docs/physics.md) — compliance, co-signing, and agent
  swarms as three blueprints over one substrate.

---

## Development

Install dependencies:

```bash
npm install
```

Run the Convex backend:

```bash
npx convex dev
```

Run the Vite frontend:

```bash
npm run dev:web
```

Run tests:

```bash
npm test        # Convex backend suite
npm run test:core
```

Build frontend:

```bash
npm run build
```

Deploy notes are tracked in [TODO.md](./TODO.md). In short: `npx convex dev
--once` pushes functions to the dev deployment, and `npx @convex-dev/static-hosting
upload` uploads static assets to the dev `.convex.site` host.

---

## Status

Research Preview.

Built:

- Convex reference runtime
- datarooms/compliance elaboration
- `@metacrdt/core`
- bitemporal visibility via core in the read path
- docs/spec/architecture package plan

Frontier:

- commutative supersession in the write path
- HLC + version-vector sync across replicas
- Durable Object and local-first targets
- `@metacrdt/forma` extraction
- runtime harness and target packages

See [TODO.md](./TODO.md) for the running pulse.

## License

MIT
