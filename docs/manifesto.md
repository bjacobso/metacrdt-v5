# The MetaCRDT Manifesto

**Databases store facts. CRDTs synchronize facts. MetaCRDT synchronizes facts,
logic, workflows, permissions, agents, and interfaces.**

That one line is the whole project. Everything else is consequence.

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

---

## The shift

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

## The invitation

MetaCRDT is an open, evolving substrate. The protocol is public
([SPEC.md](../SPEC.md)); the reference implementation is real
([README.md](../README.md)); each domain is a living laboratory
([metacrdt.md](./metacrdt.md)). If your work demands structured coordination that
stays meaningful as it moves across people, services, and agents — build with us.

*The map of how it all fits: [architecture.md](./architecture.md).*
