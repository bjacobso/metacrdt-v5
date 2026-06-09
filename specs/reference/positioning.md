# MetaCRDT — positioning & manifesto

**Databases store facts. CRDTs synchronize facts. MetaCRDT synchronizes facts,
logic, workflows, permissions, agents, and interfaces.**

That one line is the whole project. Everything else is consequence.

> Research Preview. This is the canonical positioning for the project and the
> honest technical spine beneath it. The reference implementation is this repo:
> a bitemporal fact store + Datalog engine + durable flows + an emergent
> compliance engine on Convex. What is *built* vs. what is *research frontier*
> is marked explicitly throughout — see [Status](#status).

Companion docs: [overview.md](../vision/overview.md) (the thesis & pillars),
[engine.md](./engine.md) (how the engine works), [protocol.md](./protocol.md)
(the normative spec), [architecture.md](./architecture.md) (the naming/layer
map), and the technology explorations [confect.md](../explorations/confect.md),
[foldkit.md](../explorations/foldkit.md), [alchemy.md](../explorations/alchemy.md),
and [physics.md](./physics.md).

---

## Why MetaCRDT

Operational systems are edited by humans, services, workflows, and agents. Those
edits are not just document changes. They are **facts, tasks, reviews, violations,
proposals, messages, and decisions** that need to remain meaningful as they move
across distributed runtimes.

MetaCRDT is a substrate for making those structures **converge**. It combines
CRDT-style merge semantics, append-only fact logs, typed coordination objects, and
deterministic derivation. Together these primitives let us express arbitrarily rich
workflows — from compliance data rooms to generative group games — while preserving
four properties:

- **Fact Convergence** — operational facts, tasks, documents, violations, and
  proposals merge across distributed runtimes.
- **Provenance** — every assertion carries authorship, causality, replay history,
  and enough context to explain *how* state changed.
- **Derived Coherence** — queries, constraints, violations, workflows, and views
  are *recomputed* from shared facts rather than copied between tools.
- **Agent Participation** — agents observe facts, propose actions, and leave
  mergeable records under the *same semantics* as human operators.

Ontologies, data rooms, conversations, response surfaces, and collaborative worlds
are not separate products in this model. They are **elaborations over the same
convergent substrate** — different *physics*, one engine.

---

## What we believe

**1. The organization is the program.**
A company is not a pile of apps wired to a database. It is a set of facts changing
over time, rules that derive new facts, processes that wait for the world to move,
and decisions made by people and agents. Model *that* directly and the apps stop
being things you write. They become things you *declare*.

**2. State should be a value, not a mess.**
React hides state in closures and hooks. Microservices hide it in a dozen
databases that disagree. We believe the live state of a system should be a
**serializable value** — a log of facts you can persist, replay, time-travel,
inspect, sync, and hand to an agent. If you can't serialize your organization, you
don't understand it.

**3. Convergence is a projection, not a merge.**
A plain CRDT converges to one "now" and throws away the path. We keep the path.
Every fact carries two time axes — *when it was true* and *when we knew it* — and
its full provenance. Convergence becomes a **fold** you compute at any coordinate,
not a destructive merge. History is conserved. Truth has a tense.

**4. Derivation converges for free.**
This is the leap past CRDTs. If derivation is a *deterministic fold* of shared
facts, then obligations, violations, permissions, views, and agent conclusions
**converge without being synchronized** — they are recomputed, never copied
between tools. The same machinery that merges a fact merges a workflow. That is
the "meta."

**5. Every change has an author and a cause.**
No fact appears from nowhere. Every assertion names who made it and links to what
justified it. "Why is this true? Why do I have access? Why did the agent do that?"
must always be answerable — by the system, not by an engineer reading logs at 2am.

**6. Agents are operators, not bolt-ons.**
An agent observes facts, proposes actions, and leaves mergeable, attributable
records under the *exact same semantics* as a human. No separate "AI integration."
The substrate is agent-legible by construction, and provenance makes agent behavior
auditable after the fact.

**7. One substrate, many physics.**
Compliance data rooms, small-group coordination, co-signing, agent swarms,
narrative worlds — these are not separate products. They are different *laws* over
the same engine: a blueprint, not a rewrite. If a regulated dataroom and a
multiplayer story run on one substrate, the substrate is the product.

**8. Write once, converge everywhere.**
The same program should run in a server, an edge actor, and a browser — and
*agree*, because they are the same deterministic core over a convergent log.
Centralized today; offline, peer-to-peer, and local-first as the runtime matures.
The topology is a deployment choice, not a rewrite.

**9. Honesty is a feature.**
We mark what is built and what is frontier. The log *is* a CRDT today; the
multi-replica convergence runtime is research. We say so. A substrate that
overclaims dies on contact with its first serious reader; one that shows its work
earns trust — the same trust the provenance gives its users.

### The shift

```
from                                   to
────                                   ──
apps that store state            →     organizations that converge
rows as of now                   →     facts across two time axes
business logic in code           →     rules as deterministic folds
"trust me" software              →     provenance for every change
AI as an integration             →     agents as first-class operators
one app, one runtime             →     one program, many runtimes
```

---

## The pillars, mapped to the engine

These are not aspirations; each pillar is backed by code in this repo today.

| Pillar | What backs it |
| --- | --- |
| **Fact Convergence** | `factEvents` — an append-only, immutable log; the canonical grow-only-set CRDT (merge = union). Projections (`facts`/`currentFacts`/`derivedFacts`) are deterministic folds of it. |
| **Provenance** | `explainDerived` / `sourceFactIds` — every derived fact links to the source facts and the asserting transaction (actor, reason, time). |
| **Derived Coherence** | `rules` → `derivedFacts` + materialization; obligations, tasks, and views are recomputed from facts, never copied. |
| **Agent Participation** | every transaction names an actor; `actorType: "agent"` is first-class — an agent writes transactions under the same contract as a human. |

## The technical spine

The claim "MetaCRDT" has to earn is *convergence*. Here is the honest version; the
formal, normative version is the protocol spec in [protocol.md](./protocol.md).

**The log is a CRDT.** `factEvents` is append-only and immutable — a **grow-only set
(G-Set)**, the canonical state-based CRDT. Merging two replicas is set union: no
coordination, no conflict, commutative and idempotent by construction.

**State is a deterministic fold.** `facts` / `currentFacts` / `derivedFacts` are
pure folds of that set. Given the same set of events, every replica derives the same
projection — *provided the fold is order-independent.* Convergence is therefore a
**projection**, computed, not a merge outcome baked in.

**The "meta": a CRDT that remembers *when* and *why*.** A plain CRDT converges to a
single now-state and discards the path that produced it. MetaCRDT keeps **every
event, across two time axes (transaction time and valid time), with provenance**.
Conflicting writes are not resolved-and-forgotten — they are *recorded and
superseded*, queryable forever. A conventional CRDT is then just **one projection**
of this richer structure: the "merge to now" fold. Convergence is opt-in; history is
conserved.

```
plain CRDT:     ops ─▶ merge ─▶ one converged state          (path discarded)

MetaCRDT:       facts ─▶ fold ─▶ any projection at any (tx, valid) coordinate
                  │                         │
            (G-Set, provenance)      ("merge to now" is one such projection)
```

### The frontier (what is *not* built)

The reference runtime is [Convex](https://convex.dev) — centralized and reactive.
So today the G-Set union **never actually runs across replicas**: the structure is
CRDT-correct, the execution is single-writer. Honest consequences and the work the
name obligates:

1. **Commutative supersession — a concrete to-do.** Cardinality-one assertion
   currently retracts the prior current value *at arrival time* (order-dependent).
   For the convergence claim to hold under concurrent replicas, the surviving value
   must be chosen by a deterministic, replica-independent tiebreak
   (`txTime → actorId → factId`), not by arrival order. Small change; makes "the log
   is a CRDT" *true* even before a second replica exists.
2. **A merge/transport runtime.** Multi-replica sync (offline, peer-to-peer,
   Durable-Object-per-group) is the open research surface — see
   [foldkit.md](../explorations/foldkit.md) (the client as a per-session fold) and
   [alchemy.md](../explorations/alchemy.md) (DO-per-group edge actors). Small,
   bounded groups are the regime where this is tractable.

This gap is *licensed* by the Research-Preview framing — but it is named here so the
positioning is a roadmap, not a bluff.

## Research elaborations — one substrate, many physics

Each elaboration is a different **physics** (a config-as-code blueprint) over the
one substrate. They are living laboratories, not separate products. (See
[physics.md](./physics.md) for the three-worlds argument in depth.)

| Subdomain | Elaboration | Status in this repo |
| --- | --- | --- |
| **`ontology`** | operational ontologies: entities, facts, relationships, constraints, workflows, views, agent proposals | the schema-as-facts engine itself — **built** |
| **`datarooms`** | structured coordination for compliance, onboarding, due diligence — every artifact, review, task, decision a mergeable fact | the compliance engine + demo — **built; the commercial wedge** |
| **`groupchat`** | conversation systems where every message, reply, reaction, and agent intervention is first-class replicated state | small-group / co-signer / agent coordination — **designed** |
| **`prompt-response`** | prompt-native surfaces: forms become conversations, submissions become facts, agents route structured outcomes | the `/collect` magic-link page + `submitCollection` — **built (seed)** |
| **`threadquest`** | procedural narrative worlds: an AI Dungeon Master orchestrates branching story graphs, persistent world state, multiplayer chat | the range proof — **lab** |

**Focus discipline:** a research preview can hold all five; a company ships one.
`datarooms` (compliance) is the elaboration with a paying buyer and the proven
slice; the rest are proof of range. ThreadQuest earns its place precisely *because*
it looks off-thesis — if a narrative game and a regulated dataroom are the same
substrate, the generality argument is undeniable.

## Architectural stack

- **Append-Only Facts** — entity, task, document, and proposal facts recorded as
  replayable operations with explicit merge semantics (`factEvents`).
- **Identity & Provenance** — actors, authorship, timestamps, and causal references
  make every change inspectable and attributable (`transactions`, `explainDerived`).
- **Deterministic Derivation** — queries, constraints, violations, rules, and typed
  views derive coherent interpretations from shared state (Datalog + materialization).
- **Intent & Coordination** — tasks, workflows, approvals, and proposal objects
  express *why* state changes, not just the resulting mutations (flows, obligations).
- **Agent Participation** — agents analyze, synthesize, propose, and merge changes
  alongside humans while preserving provenance (`actorType: "agent"`).
- **Transport & Execution** — distributed runtimes propagate shared state across
  browsers, servers, Durable Objects, background workers, and peer-to-peer sessions.
  *(Frontier: today this is Convex's reactive single-writer runtime; multi-replica
  transport is the open research surface.)*

## Status

| Layer | State |
| --- | --- |
| Append-only bitemporal fact log + rebuildable projections | **built** |
| Datalog engine (joins, negation, closure, aggregation) + provenance | **built** |
| Derived coherence: rules, materialization, obligations-as-facts | **built** |
| Durable flows + actions + config-as-code blueprints | **built** |
| Agent-legible substrate (AST-as-data, actor attribution) | **built (substrate); agent UX ahead** |
| Commutative supersession (deterministic tiebreak) | **to-do (small)** |
| Multi-replica convergence runtime (offline / p2p / DO-per-group) | **research frontier** |

---

## The invitation

MetaCRDT is an open, evolving substrate. The protocol is public
([protocol.md](./protocol.md)); the reference implementation is real
([engine.md](./engine.md), [README.md](../../README.md)); each domain is a living
laboratory. If your work demands structured coordination that stays meaningful as
it moves across people, services, and agents — build with us.

*The map of how it all fits: [architecture.md](./architecture.md).*

---

*MetaCRDT Research Incubator · Research Preview · © 2026*
