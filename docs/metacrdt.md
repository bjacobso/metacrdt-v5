# MetaCRDT

**A convergence substrate for structured coordination across distributed runtimes.**

> Research Preview. This document is the canonical positioning for the project and
> the honest technical spine beneath it. The reference implementation is this repo
> (a bitemporal fact store + Datalog engine + durable flows + an emergent
> compliance engine on Convex). What is *built* vs. what is *research frontier* is
> marked explicitly throughout — see [Status](#status).

Companion docs: [VISION.md](../VISION.md) (the thesis & pillars),
[README.md](../README.md) (the engine), and the elaboration notes
[confect.md](./confect.md), [foldkit.md](./foldkit.md), [alchemy.md](./alchemy.md).

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
formal, normative version is the protocol spec in [SPEC.md](../SPEC.md).

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
   [foldkit.md](./foldkit.md) (the client as a per-session fold) and
   [alchemy.md](./alchemy.md) (DO-per-group edge actors). Small, bounded groups are
   the regime where this is tractable.

This gap is *licensed* by the Research-Preview framing — but it is named here so the
positioning is a roadmap, not a bluff.

## Research elaborations

Each elaboration is a different **physics** (a config-as-code blueprint) over the
one substrate. They are living laboratories, not separate products.

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

## Participate

- **Read the docs** — fact models, merge semantics, derived views, agent proposals
  (this repo's `docs/`).
- **Join the alpha cohort** — access reference implementations and private registries.
- **Propose a lab** — a two-page abstract on how convergent facts unlock your domain.

MetaCRDT is an open, evolving substrate; each sub-domain is a living laboratory. If
your work demands structured coordination under real-world distributed conditions,
build with us.

---

*MetaCRDT Research Incubator · Research Preview · © 2026*
