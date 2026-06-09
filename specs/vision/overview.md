# Overview — one substrate, many products

> **Naming & layers.** **MetaCRDT** is the umbrella — the primitive and the org.
> The substrate is `@metacrdt/*`; the open spec is *Open Ontology* ([SPEC.md](../reference/protocol.md));
> the default blueprint library is *Alpha Ontology*; the authoring/IDE layer is
> *Schematics* (frontend *Onlang/Forma*); and *Onboarded* is the first application
> (the datarooms/compliance vertical) built on it. The full map is
> [docs/architecture.md](../reference/architecture.md); the founding statement is
> [docs/manifesto.md](../reference/positioning.md).

Read alongside [README.md](../../README.md) (how the engine works) and
[PLAN.md](../../PLAN.md) (the backlog and the vision-vs-Convex assessment). This
document is the *why* and the *where it's going*.

> **Thesis.** Most business software is the same handful of primitives wearing
> different costumes: things, facts about things over time, rules that derive
> new facts, processes that wait for the world to change, and obligations that
> fall out of all three. Build those primitives *once*, correctly, on a reactive
> bitemporal fact log — and specific products (compliance, onboarding, CRM,
> case management) stop being applications you write and become **configurations
> you declare**.

The bet is not "a better database." It's that if the substrate is honest about
**time, provenance, and derivation**, then features that are normally bespoke —
audit trails, "what did we know when," reuse-across-contexts, obligations,
generated UIs — become *emergent properties* of the substrate rather than code.

---

## The layers

```
┌─────────────────────────────────────────────────────────────┐
│  Products        compliance · onboarding · staffing · …       │  ← declared, not coded
│  (configured)    config-as-code lowers to the layers below     │
├─────────────────────────────────────────────────────────────┤
│  Emergence       obligations · reuse · tasks · derived state   │  ← rules over facts
│  (rules + flows) durable workflows · actions · reconcilers     │
├─────────────────────────────────────────────────────────────┤
│  Engine          Datalog (joins/negation/closure/aggregation)  │  ← queries are data
│                  materialization + provenance                  │
├─────────────────────────────────────────────────────────────┤
│  Substrate       bitemporal triples · append-only event log    │  ← time + provenance
│                  schema-as-facts · rebuildable projections      │
├─────────────────────────────────────────────────────────────┤
│  Convex          transactional mutations · reactive reads       │  ← the runtime
│                  indexes · scheduler · crons · components        │
└─────────────────────────────────────────────────────────────┘
```

Each layer is *only* facts (and the projections of facts). That single decision
is what makes the top layer declarative: a "product" is a set of type, attribute,
form, flow, requirement, and action definitions — and those definitions are
themselves facts in the same log as the data they govern.

---

## The product seam: system vs configured vs data

Because everything is facts, "the platform's own machinery" and "a tenant's
declared shape" and "runtime data" are not three storage systems — they are one
store with an **origin facet** (`convex/lib/origin.ts`):

- **`system`** — the engine's own schema-as-facts (`attr:`/`type:`), form/action
  definitions, and the intrinsic reactive processes (reconciler, materializers,
  flow resumer). Shipped with the platform; not editable.
- **`configured`** — a tenant's declared shape: their entity types, flows,
  actions, compliance rules. Authored as config-as-code, stamped `actor=config`.
- **`data`** — the actual instances: Workers, Placements, submissions.

This is the seam a real SaaS lives on (Salesforce standard vs custom objects;
Foundry's ontology vs instances). It's why the product can show "your data /
your workflows" by default and tuck the plumbing behind a disclosure — without a
second database, just a classification read off id-prefix + type.

---

## Pillars

Each pillar below is one of the costumes the primitives wear. Status tags:
**[shipped]** works today · **[reframed]** the vision's mechanism changed for
Convex (see PLAN.md) · **[ahead]** designed, not built.

### 1. Triples — the substrate · [shipped]

Two-axis bitemporality (transaction time *and* valid time), an append-only
`factEvents` log as the source of truth, and `facts`/`currentFacts`/`derivedFacts`
as rebuildable projections. Retract ≠ tombstone ≠ correct. Every write is a
transaction with an actor and reason. The audit trail and "what did we know when"
are not features — they are the shape of the data. See README for the model.

### 2. The query engine — queries are data · [shipped]

Datalog as a JSON AST: pattern joins, comparisons, negation, materialized
transitive closure, aggregation with group-by. Queries read **facts ∪ derived
facts**, so a rule's output is queryable like any base attribute. The AST being
*data* is the safety boundary for everything dynamic above it (generated UIs, an
eventual NL→query) — untrusted input produces an AST that the validator and
bounded engine vet, never raw SQL.

### 3. Schema as facts — meta-circularity · [shipped]

No schema table. Attribute/type definitions are triples about `attr:`/`type:`
entities, so schema inherits history, tombstoning, and as-of queries for free.
"What did this type's shape look like last March?" is the same query as any other
time-travel. Even cardinality is a fact.

### 4. Workflows — durable, reactive · [shipped]

A flow is a named DAG of typed steps. A step is one mutation; a *wait* is a
parked `flowRuns` row resumed by the event path (a `submitted.<form>` fact), a
scheduler tick, or an action callback. This makes "wait for the world to change"
a first-class, durable thing without a separate workflow service. **Actions** are
the synchronous one-transaction cousin — "assert these facts now" — declared per
type so they surface contextually on any entity.

### 5. Compliance — emergence, not code · [shipped]

The proving ground for the thesis: obligations are *derived facts*, not rows. A
requirement rule emits `requires.<form>` keyed by a **scope entity**, so one
submission satisfies every placement sharing that scope — **reuse falls out of
the key**, not out of dedup code. A task is `requirement ∧ ¬submitted` via
negation, carrying provenance ("why is this open?"). Valid-time expiry needs no
triggering write: a submission simply stops being visible, and a cron re-fires
the obligation. Nobody wrote "compliance" — it emerged from rules over facts.

### 6. Config-as-code — products as declarations · [shipped]

One literal (types, attributes, forms, flows, requirements, actions) is *lowered*
by `applyConfig` into schema-facts + flow defs + compliance rules + action defs,
idempotently, stamped `actor=config`. Because it lowers to facts, the declared
shape inherits history — every `applyConfig` is a transaction, so config has
time-travel and diff for free. The staffing demo is now a blueprint, not a pile
of imperative setup calls. *Ahead:* true reconcile (retract dropped config),
arg-taking actions, a config diff/history UI, and a richer authoring DSL — see
[docs/confect.md](../explorations/confect.md) for what the whole backend (schema, the
config DSL, flows, the Datalog engine) looks like rebuilt on Effect + Effect
`Schema` via the [Confect](https://github.com/rjdellecese/confect) wrapper.

### 7. Generated experience · [shipped, growing]

The entity detail page is computed entirely from type + config: state, the flows
runnable on it (matched by `subjectType`), the actions (matched by `appliesTo`),
its obligations, its runs. Add a flow definition and it appears on the right
entities with zero UI changes — the Foundry "ontology + actions" pattern. Convex's
reactive reads mean these generated views are live for free. *Ahead:* fully
schema-driven forms/list views, saved views, per-type layouts — and, taken to its
conclusion, the client itself as a pure projection of the ontology (the
Model/Message/view stack as one replayable state machine end to end). See
[docs/foldkit.md](../explorations/foldkit.md).

### 8. Integrations — the external boundary · [reframed → ahead]

A flow's `action` step is the seam to the outside world (an E-Verify check, a
webhook). Today it's mocked-but-real-shaped: it runs as a Convex action that could
`fetch`, captures a result into run state, and branches. *Ahead:* egress-guarded
HTTP steps, a `notify` step that asserts a `notification.*` fact, and integration
as a **Convex component** (structurally isolated) rather than the vision's
namespace-tag-plus-compiler-guard. Taken further, integrations and edge state
(R2 blobs, Queues for batched jobs, Durable Objects as per-flow/per-session/
per-entity actors) become resources bound into one Effect program via Alchemy,
with Convex as system of record — see [docs/alchemy.md](../explorations/alchemy.md).

### 9. Authorization — the deferred pillar · [ahead]

The honest gap: the live demo takes public writes; the magic-link collection
token is demo-grade. The vision's request-time multi-hop graph authorization is
**reframed** (PLAN.md): precompute per-principal visible-subject projections;
enforce in function code, not row-level security. The compelling target is
**attribute-level** read grants — the i9 SSN is collected here, and PII gating is
the one access-control problem impossible at row granularity.

### 10. AI — the AST as the guardrail · [ahead]

Because queries are a validated JSON AST, an LLM can *emit a query* without
touching SQL: the validator and bounded engine are the safety boundary. The same
holds for config — an assistant proposes a blueprint, `applyConfig` is the typed,
idempotent, reversible apply. Provenance facts make AI output auditable: every
derived/asserted fact says who/what caused it.

### 11. Performance & scale — the Convex contract · [reframed]

The vision's "Datalog AST → one SQL statement," cost-based planner, and GIN reuse
index are **cut** (PLAN.md): nested-loop joins in JS over declared indexes,
explicit projection tables instead of column promotion, no arbitrary EAV filtering.
The constraint the vision under-weights: **a mutation is one transaction with hard
limits**, so every store-sweeping operation (reconciler, `applyConfig`, rebuild,
migration) must be a batched, resumable, scheduler-driven job — never one atomic
statement.

### 12. Privacy, documents, notifications · [reframed → ahead]

Crypto-shredding as primary erasure is downscoped — Convex hard-delete makes
direct erasure feasible; keep crypto-shred for file blobs. Documents/e-sign map to
Convex file storage + actions. Notifications/timers map to the scheduler + crons.
These are "keep, build later" — they fit the substrate without new mechanism.

---

## What's intentionally *not* the goal

- **Not** Datomic-on-Convex or an RDF/SPARQL engine. This is *reactive operational
  Datalog*: bounded live queries plus materialized views for the heavy stuff.
- **Not** a general graph database. No request-time arbitrary traversal; recursion
  is materialized off the live path.
- **Not** a faithful port of the sibling Postgres/Prisma/Effect implementation.
  The vision's **model** survives; its **substrate assumptions** (SQL, Effect
  DSLs, a NATS/BullMQ bus) are rebased onto Convex, not adopted (PLAN.md).

---

## The end state

A permanently **hybrid** system, honest about its layers:

- The substrate never lies about time or provenance.
- The engine keeps live queries bounded and pushes heavy/recursive logic into
  asynchronous, provenance-carrying materialization.
- Products are **declared** and lowered into the substrate, gaining history,
  reuse, obligations, and generated UI as emergent properties.
- The intrinsic machinery (reconcilers, materializers, resumers) is visible and
  read-only — the autonomic layer you don't configure.

The measure of success: adding a new product (a new compliance regime, a new
onboarding flow, a new kind of obligation) should require **a new blueprint, not
new engine code**. Every time we reach for code where a declaration would do,
that's a gap in the substrate worth closing — and the most interesting items in
PLAN.md are exactly those gaps.
