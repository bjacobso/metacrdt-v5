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
multi-replica pieces are emerging as reusable target packages: browser/local
persistence, Durable Object storage/relay shells, and structural peer-to-peer
DataChannel anti-entropy exist; live deployment, auth, signaling, and production
coordination remain the frontier tracked in [TODO.md](./TODO.md).

---

## Package Graph

This repo is becoming the canonical `@metacrdt/*` monorepo.

Current packages:

- **`@metacrdt/core`** (`packages/core`) — pure, dependency-free convergence
  kernel: SHA-256, base32, canonical values, HLC, events, `≺`, G-Set merge, and
  the bitemporal fold.
- **`@metacrdt/schema`** (`packages/schema`) — pure schema-as-facts conventions:
  canonical `attr:` / `type:` carrier ids, builtin bootstrap cardinalities,
  value/cardinality guards, self-describing meta-attribute definitions,
  canonical lowering for attribute/type/meta-schema definition facts, and
  attribute-shape reconstruction from visible schema rows. The Convex reference
  runtime consumes it through `convex/lib/meta.ts` / `convex/attributes.ts`.
- **`@metacrdt/query`** (`packages/query`) — first pure Datalog/query slice:
  clause and term types, bounded parser for pattern/comparison/compute/negation/
  disjunction, deterministic compute/comparison helpers, pattern unification,
  projection, cursor pagination, aggregation, explain descriptions, and
  entity-local rule analysis, plus rule emit-term resolution and deterministic
  derived-row shaping for read-only rule previews and the pure clause-pick
  planner used by the Datalog scheduler, plus provenance-preserving solved-binding
  dedupe/source merging, pattern-input construction for target triple sources,
  provenanced pattern extension, candidate expansion, and guarded accumulated
  row-limit checking for positive joins, negation candidate checking over fetched
  triples, plus compare/compute state transitions over solved bindings, and the
  shared intermediate-row limit guard. It also owns bound-variable advancement,
  initial solver-frame construction, and solver work-list clause
  selection/removal for scheduler state. The Convex
  engine consumes and re-exports it while keeping triple fetching, read
  authorization, provenance, and async join execution in `convex/lib/engine.ts`.
- **`@metacrdt/convex`** (`packages/convex`) — Convex target adapters:
  protocol metadata validators, Convex/core event construction, row
  reconstruction/verification, projected-row visibility, cardinality-one
  reconcile selection by `≺`, protocol append/verification helper factories, a
  packaged component that can either summarize host-owned rows or own a durable
  protocol transaction/event log plus current-state projections with opt-in
  cardinality-one reconciliation, projection rebuild from the component log, and
  grouped entity current-state reads plus typed entity lists. The reference UI
  now has a component-backed New Entity path that writes through the host wrapper
  and an Entities-page component-owned browser/detail/action path that reads the
  component projection/event log and can run configured host actions into
  component-owned state, including actions that open collection-token forms whose
  definitions and submissions fold back into component-owned current state. The
  component detail path can also run configured host flow definitions over
  component-owned state as a bounded starter/resumer with persisted
  component-owned DAG run/timeline rows, scheduled wait-step wakeups, and
  component-owned collection reminder/escalation/expiry timer state.
  Includes Confect sidecar guidance.
- **`@metacrdt/forma`** (`packages/forma`) — runtime-neutral Lisp / S-expression
  authoring language extracted from Open Ontology: reader, formatter, evaluator,
  VM, type inference, and language-owned elaboration utilities.
- **`@metacrdt/runtime`** (`packages/runtime`) — target-neutral service contracts
  and memory harness: injected HLC clock, optional per-replica sequencer,
  operation helpers, version-vector delta calculation, BroadcastChannel
  anti-entropy, and p2p DataChannel anti-entropy.
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
@metacrdt/schema      schema-as-facts, types, attributes (definition lowering shipped)
@metacrdt/query       Datalog, rules, derivation (query helpers + emit shaping + planner + dedupe + pattern inputs + join expansion + negation/state/limit/bound-var/frame helpers shipped)
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
- production entity reads (`api.facts.getEntity`) now fold current state directly
  from protocol-shaped `factEvents` and schema cardinality facts while preserving
  the existing `{ id, attributes, denied }` shape and read-authorization behavior;
  `entityFromEventLog` remains as the explicit proof/debug wrapper with
  coordinate and skipped-legacy counts
- production bitemporal entity reads (`entityAsOf`, `entityFactsAsOf`) now fold
  from protocol-shaped `factEvents`, preserving read authorization and provenance
  annotations for the time-travel UI
- production fact comparison reads (`api.facts.compareFacts`) now compare two
  bitemporal coordinates by folding protocol-shaped `factEvents`, preserving
  read authorization and the existing `{ before, after, changed, denied }` shape
- production typed entity table reads (`api.entities.queryEntities`) now use
  event-log-backed Datalog for membership/filters and fold table row attributes
  + sort values from protocol-shaped `factEvents`
- production type discovery and picker reads (`listEntityTypes`, `listEntities`,
  `typeAttributes`) now discover current type/name/attribute facts from
  protocol-shaped `factEvents`
- configured action registry reads (`actionsForType`, `listActions`,
  `entityDetail.actions`, and `runAction` action-definition loading) now fold
  action definition facts from protocol-shaped `factEvents`
- Overview dashboard counts now fold current type/submission/placement-scope
  facts and compliance obligation rule output from protocol-shaped `factEvents`
  instead of reading `currentFacts` or `derivedFacts`
- config history/diff reads now fold `config:default` ownership manifest
  snapshots from protocol-shaped `factEvents` instead of reading the `facts`
  projection
- read authorization policy lookups now fold PII/sensitive schema markers and
  `grants.read` facts from protocol-shaped `factEvents` instead of reading
  `currentFacts`
- System process compliance-obligation counts now derive enabled requirement/
  task rule output from protocol-shaped `factEvents` instead of reading
  `derivedFacts`
- user-facing compliance obligation reads (`workerCompliance`,
  `entityDetail.obligations`, and `flows.issueAllOpen`) derive enabled
  requirement/task rule output from protocol-shaped `factEvents` instead of
  reading materialized `derivedFacts`
- Confect compliance dry-run planning (`api.complianceConfect.dryRunWorkerCompliance`)
  now folds current worker/placement/submission state from protocol-shaped
  `factEvents`, not `currentFacts`
- System process flow-resumer counts now read mirrored `flow.run.status` facts
  from protocol-shaped `factEvents` instead of scanning host `flowRuns`
- production fact point queries (`api.facts.queryFacts`) now fold base facts
  directly from protocol-shaped `factEvents` while preserving the old array
  return shape and read-authorization behavior; `queryFactsFromEventLog` remains
  as the explicit proof/debug wrapper with skipped-legacy counts
- event-log-backed Datalog proof queries (`api.datalog.datalogFromEventLog`,
  `datalogPageFromEventLog`, `aggregateFromEventLog`,
  `aggregatePageFromEventLog`, `datalogFromEventLogWithDerived`,
  `datalogPageFromEventLogWithDerived`, `aggregateFromEventLogWithDerived`,
  `aggregatePageFromEventLogWithDerived`) via injected triple sources over
  protocol-shaped `factEvents`, including mixed proof sources that join event-log
  base facts with materialized `derivedFacts`
- production Datalog reads (`datalog`, `datalogPage`, `aggregate`,
  `aggregatePage`) now use the same event-log-base + materialized-derived source
  for base facts, rather than reading base facts from the `facts` projection
- read-only rule-output proof query (`api.datalog.deriveFromEventLog`) that
  solves a rule body against protocol-shaped `factEvents` and resolves its
  `emit` shape into derived triples without writing `derivedFacts`
- non-closure Datalog rule materialization solves base facts from
  protocol-shaped `factEvents` while still writing the existing `derivedFacts`
  projection for production reads
- full transitive-closure recompute reads base edges from protocol-shaped
  `factEvents`, preserving path provenance through compatibility `factId`s while
  still materializing closure rows into `derivedFacts`
- closure incremental-add jobs receive the changed edge's protocol assertion
  `eventId` and resolve compatibility `sourceFactIds` through `factEvents`,
  rather than receiving the changed projection `factId`
- materialized derived rows carry protocol `sourceEventIds` alongside existing
  compatibility `sourceFactIds`, and `api.rules.explainDerived` resolves those
  event ids first (falling back to fact ids for legacy rows), so derived
  explanations are now protocol-addressed without dropping old provenance
- Datalog query engine with joins, comparisons, computed arithmetic/string
  predicates, negation, aggregation, cursor-paged result APIs, and materialized
  transitive closure
- rule materialization with entity-local and affected-output cross-entity
  recompute; transitive-closure rows track path support counts so deletions
  reconcile alternate-path reachability correctly
- schema-as-facts: entity types and attributes are facts too
- rules and provenance: derived facts explain why they exist
- compliance obligations as derived facts
- durable flow DAGs and synchronous actions
- config-as-code blueprints
- generated entity detail pages
- route-aware guided demo tour for the research-preview shell
- configured actions with optional typed inputs (`$arg.*` placeholders resolved
  into asserted facts)
- form-opening actions that issue/reuse `/collect` magic links through the same
  `flowRuns` path as flow collect steps
- component-owned configured actions that issue/reuse component-owned `/collect`
  tokens and submit evidence into the installed `@metacrdt/convex` component log
- standalone component-owned collect runs, listed on component entity pages and
  submitted through the same public `/collect` route
- component-owned compliance issue/reuse: component Worker pages compute
  `reuse`/`collect` decisions from configured host requirement rules over
  component-owned placement/scope/evidence state, then issue missing evidence as
  component-owned collection links
- component-owned compliance materialization: the same Worker page can write
  component-owned `requires.<form>` and open `task.<form>` facts, and retract
  stale task facts once submitted evidence becomes reusable
- component-owned DAG flow starter/resumer: component detail pages can run
  configured host flow definitions over component-owned state, park at
  component-owned collection tokens, and resume by rerunning after submission
  without creating host `flowRuns` rows
- persisted component-owned DAG process history: flow executions write
  component-owned run rows plus child timeline rows and render them on component
  entity pages
- component-owned DAG wait steps: waits park the component-owned run, schedule a
  host internal wake, resume that same run, and continue writing component-owned
  facts
- component-owned collection timers: newly issued component collection links
  schedule reminder/escalation ticks, optional explicit expiry marks waiting runs
  expired, and completed runs ignore later ticks
- single-use, expiring collection tokens for the public `/collect` page
- Tailwind + React Router research-preview UI
- `@metacrdt/core` wired into the Convex read path for bitemporal visibility
- `@metacrdt/runtime` harness groundwork: target-neutral services plus an
  in-memory convergence test target
- Confect/Effect sidecars for typed read/planning/protocol inspection:
  `metacrdt.verifyEvents`, `metacrdt.explainDerived`, and a read-only compliance
  dry-run planner. The dry-run planner is now event-log-backed and
  projection-wipe tested, while protocol writes remain plain Convex.

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
| `flowDefs` / host `flowRuns` | durable workflow definitions and host-owned executions |
| `@metacrdt/convex` component `flowRuns` | component-owned collection capabilities for component-owned actions and standalone collects |

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

Write authorization is server-side. General public write mutations require a
Convex auth identity and derive the transaction actor from
`ctx.auth.getUserIdentity().tokenIdentifier`; caller-supplied `actorId` values are
ignored for raw public fact writes. The isolated `/collect` flow is the intentional
exception: possession of a valid, unexpired, unconsumed collection token is the
write capability, so external evidence collection can remain login-free. The
frontend is auth-aware and routes protected controls through one sign-in-required
modal instead of firing anonymous writes, but the actual production provider
choice and `convex/auth.config.ts` wiring remain a deployment decision.

Generated UI reads the same schema facts. `typeSchemaAsOf` returns declared
columns with attribute definitions, the entity browser uses those columns for
tables, entity detail orders state by the primary type schema, and collection
forms render from `formDef`.

Component-owned collection follows the same public `/collect` API. Host tokens
are resolved from the app's `flowRuns` table; component-owned action tokens are
resolved from the installed `@metacrdt/convex` component, whose submission path
appends evidence facts into component-owned state and consumes the component
token. Standalone component-owned collect runs use the same component token path
and are listed on `/component/e/:id`.

Component-owned compliance now uses the existing configured host requirement
rules as semantics while keeping operational data inside the component. For a
component-owned Worker, the reference wrapper reads component-owned placements
and scope entities, checks component-owned `submitted.<form>` evidence, returns
`reuse`/`collect` decisions, and issues missing component-owned collection
links without creating host `flowRuns` rows. It can also materialize those
decisions as component-owned `requires.<form>` facts plus open `task.<form>`
facts, then retract stale task facts when a later submission satisfies the
requirement. The older host `collectionTarget: "component"` bridge remains
supported for already-issued transition tokens.

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
    ["?e", "name", "?name"],
    { compute: ["lower", "?name"], as: "?lowerName" },
    { compute: ["contains", "?lowerName", "maria"] },
    {
      or: [
        [["?e", "worker.status", "active"]],
        [["?e", "worker.status", "pending"]],
      ],
    },
    { not: ["?e", "worker.status", "terminated"] },
  ],
  select: ["?e", "?name"],
})

// Cursor-paged Datalog result rows
datalogPage({
  where: [["?e", "type", "Worker"]],
  select: ["?e"],
  paginationOpts: { numItems: 50, cursor: null },
})

// Cursor-paged aggregate group rows
aggregatePage({
  where: [
    ["?e", "type", "Worker"],
    ["?e", "worker.status", "?status"],
  ],
  groupBy: ["?status"],
  aggregates: [{ op: "count", as: "workers" }],
  paginationOpts: { numItems: 50, cursor: null },
})

// Arithmetic computed predicate
datalog({
  where: [
    ["?e", "salary", "?salary"],
    ["?e", "bonus", "?bonus"],
    { compute: ["+", "?salary", "?bonus"], as: "?totalComp" },
    ["?totalComp", ">", 100000],
  ],
  select: ["?e", "?totalComp"],
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
