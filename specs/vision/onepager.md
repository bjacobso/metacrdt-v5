# Open Ontology

*An open language, substrate, and workbench for running a business as
declarations instead of code.*

## Abstract

Most business software rebuilds the same five primitives — things, facts
about things over time, rules that derive new facts, processes that wait,
and obligations that fall out of all three — and every rebuild also
re-implements audit trails, history, permissions, and dashboards around
them. We are building those primitives once, on a foundation that is honest
about time, provenance, and derivation: an append-only log of facts whose
every consequence — current state, obligations, workflows, even user
interfaces — is computed from explicit rules rather than stored as side
effects. On such a foundation, the expensive parts of business software
become emergent properties instead of features, and a product becomes a set
of declarations: documents, versioned in git, reviewed like code, deployed
like infrastructure. We call the result an **operating ontology** — a model
of your operations that doesn't sit in a binder but runs. The stack:

- **Operational algebra** — the theory: every user-facing primitive
  reduces to three verbs and two laws, and the reduction is not an
  analogy — it is executed as a test suite on every build.
- **Forma** — the language: formal definitions living inside ordinary
  documents, written by humans and AI agents, gated by one validator.
- **MetaCRDT** — the substrate: the append-only, bitemporal,
  provenance-carrying fact log, with a published protocol anyone can
  implement and prove conformant.
- **Schematics** — the workbench: one typed surface for authoring,
  validating, and deploying ontologies, with infrastructure-style
  plan/apply/drift.
- **ontology.run** — the hosted runtime, and the commercial surface that
  funds the open layers above.

The language, substrate, and workbench are open source. A real product —
compliance datarooms — already runs on the kernel with zero special-case
primitives. One company has validated this category at scale, behind a
closed platform. This is the open one.

## The same five ideas, wearing costumes

Look underneath any CRM, HR system, compliance tool, or case-management
product and you find the same machinery, rebuilt from scratch every time:

- **Things** — workers, contracts, accounts, placements.
- **Facts about things over time** — this worker was hired on this date;
  we learned it two days later; it stopped being true in March.
- **Rules that derive new facts** — anyone placed at a hospital needs a
  background check.
- **Processes that wait for the world to change** — onboarding pauses
  until the form comes back, then continues.
- **Obligations that fall out of all three** — the check is required, no
  fact satisfies it, someone must act.

Every company pays to rebuild these five. Worse, every rebuild also
re-implements the same supporting cast — audit trails, history,
permissions, task queues, reporting — and each copy is subtly wrong in its
own way: the audit log that misses the one table that mattered, the
"effective date" bolted onto a schema that only knows the present tense,
the permission check that lives in four places and agrees in three.

Our bet: **build the five primitives once, correctly, and products stop
being applications you write. They become declarations you make.**

## A foundation that doesn't lie

The bet only works if the foundation is honest about three things most
systems lie about:

- **Time.** Every fact records both when it became true in the world and
  when the system learned it. These are different dates, and most software
  conflates them. Kept separate, "what did we know on March 3rd?" is an
  ordinary query — not a forensic project.
- **Provenance.** Every fact knows who asserted it and why — a person, a
  rule, an integration, an AI agent. Nothing enters the system without an
  answer to "where did this come from?"
- **Derivation.** Conclusions — obligations, permissions, task lists, the
  screens users see — are computed from facts by explicit rules, never
  stored as mysterious side effects. Change the facts, and every
  consequence updates itself, carrying an explanation of why.

Concretely, the foundation is an append-only log of facts. Nothing is ever
updated in place; new facts supersede old ones, and the old ones remain,
queryable at their place in history. Everything else the user sees —
current state, dashboards, alerts, history views — is a deterministic
computation over that log.

When the foundation works this way, the expensive features of business
software stop being features:

- **The audit trail is not built.** It is the shape of the data.
- **Compliance is not coded.** An obligation is simply "a rule requires
  this, and no fact satisfies it." It appears when facts change, explains
  itself, and resolves itself when the satisfying fact arrives. We have a
  running system in which nobody wrote a compliance engine — and
  compliance emerged anyway.
- **Reuse falls out of keys, not deduplication code.** One submitted
  document satisfies every obligation that shares its scope.
- **The UI is not designed screen by screen.** It is generated from the
  declared model: add a workflow, and the right screens grow it.

## Operational algebra — the theory

In 1960, John McCarthy showed that seven primitive operators suffice to
express all of computation — and proved it in the most convincing way
possible, by writing the evaluator in itself. Lisp was not designed so much
as *discovered*: a kernel small enough to hold in your head, with
everything programmers actually use derived from it. **Operational algebra
is the same move, aimed at operations instead of computation.**

The kernel is small enough to state in a paragraph. There are three verbs:
**assert** appends an immutable, timestamped fact that carries its origin;
**fold** derives state from facts, deterministically — same facts, same
conclusions, on any machine; and **react** is a fold whose output is new
assertions, which is what makes the model *run* rather than merely
describe. Two laws hold it together. **Convergence:** two copies of the log
that have seen the same facts compute identical state — so collaboration,
offline work, and distributed deployment merge cleanly instead of
conflicting. **Conservation:** facts are never destroyed, only superseded —
so history is permanent, and every past state of the system remains
queryable.

Everything users touch is a derived form. Entities, relations, queries,
mutations, processes, constraints, views — each is defined *in terms of*
the three verbs, the way Lisp's `cond` and `let` are defined in terms of
its primitives. And in McCarthy's tradition, the strongest evidence is
self-description: the system's own admission loop — the machinery that
decides whether an assertion is allowed and what follows from it — is
itself expressible in the algebra it governs.

We hold the theory to falsifiability rather than decoration. The reduction
from every derived form down to the kernel is executed as a conformance
test suite, on two independently written engines, on every build — and the
standing rule is that if shipping a feature ever requires a new primitive,
the theory is wrong. So far it isn't. This is what "the math unlocks the
language" means concretely: Forma can guarantee that its definitions add
legibility without adding power only because the algebra fixed, in advance,
what power there is.

The four parts of the stack are four ways of touching this kernel.

## Forma — the language

Forma is how people and machines write an ontology. It is a small formal
language designed to live inside ordinary documents: the markdown file
explains the policy in prose, and the fenced code block *is* the policy.

````markdown
# Staffing

Workers must hold a current background check while placed at a hospital.

```forma
(define-entity Worker
  (:field worker/name String)
  (:field worker/status (enum active terminated)))

(define-rule hospital-placement-check
  (:when    (placement/site ?p :hospital))
  (:require (background-check ?p.worker :current)))
```
````

We call this pattern a **literate ontology**: the memo and the system are
the same file. The document is versioned in git, reviewed in pull requests,
and deployed like infrastructure — which means the operating model of the
business has an owner, a history, and a diff for every change.

Two properties matter more than the syntax. First, Forma definitions
**elaborate** into the same small kernel everything else uses — the
language adds no power, only legibility, and a conformance suite holds its
multiple implementations to identical behavior. Second, the language is
**validated, not free-form**: a definition either type-checks against the
declared model or is rejected with a precise error pointing into the
document. That property is what makes the next claim safe: humans write
Forma, and AI agents write Forma, and the same validator gates both.

## MetaCRDT — the substrate

MetaCRDT is the fact log itself: the storage and synchronization layer that
makes the foundation's three honesty properties real. The name is literal —
CRDTs (conflict-free replicated data types) are the established technique
for letting independent copies of data merge without conflicts; MetaCRDT
applies that discipline not just to data but to everything above it: logic,
schema, workflows, and permissions are all facts in the same log.

Mechanically: every fact is an immutable event with a content-derived
identity, a hybrid timestamp, and its provenance. A replica's state is a
pure computation over its set of events, and merging two replicas is set
union — an operation that is commutative, associative, and idempotent,
which is the mathematical reason two copies that have seen the same facts
*must* agree. Bitemporality (world-time vs. learned-time) is part of the
event, not an afterthought, so as-of queries and retroactive corrections
are native operations.

Because state is a pure computation over the log, the same ontology runs
in very different places without porting:

- on a **centralized backend** — the replica you trust: the system of
  record, transactional writes, reactive reads;
- on **edge infrastructure** — small authoritative replicas near your
  users, for collaboration and presence;
- on a **server you own** — on-premise, air-gapped, or in CI;
- in the **browser itself** — fully offline, syncing when reconnected.

These are not four products. They are one kernel under four physics,
differing only in who sequences events, where facts persist, and how events
travel.

MetaCRDT is published as a protocol specification with graded conformance
levels and a test harness: anyone can implement the substrate independently
and prove their implementation correct. The protocol is the part of the
system we most want to outlive us.

## Schematics — the workbench

Schematics is where ontologies are authored, validated, and deployed — by
humans and AI agents working on the same surface.

The core idea: in a Schematics project, every file routes to a schema, and
every edit — whether a person typing or an agent proposing — passes through
the same typed validation before it lands. Diagnostics point to exact
locations, down to the individual Forma form inside a markdown document.
There is no separate "AI mode" with weaker guarantees: the agent reads
through the same views, writes through the same validators, and its patches
are reviewable diffs like anyone else's.

Deployment borrows the discipline operations teams already trust from
infrastructure-as-code, aimed at ontologies instead of servers:

- **plan** — elaborate the documents, diff the desired model against the
  live one, and show exactly what would change: which entity types, rules,
  forms, processes, and permissions — before anything changes.
- **apply** — commit the change as a single transaction of facts, carrying
  provenance: which files, which commit, which author.
- **drift** — continuously compare the deployed model against its source,
  and surface changes that happened outside the loop.

Because deployment writes facts into the same log as everything else, the
ontology's own history gets audit, time travel, and "who changed this and
why" for free — the deploy pipeline inherits the substrate's guarantees
rather than reimplementing them.

## Ontology.run — the hosted runtime

Ontology.run is where an operating ontology lives if you don't want to run
the infrastructure yourself — and it is the commercial surface that funds
the open layers.

Deploy a versioned ontology and it stays live: facts stream in from forms,
integrations, people, and agents; rules evaluate continuously; obligations
appear with explanations and resolve themselves when satisfied; durable
workflows wait — for days or months — and resume when the world changes;
interfaces are generated from the model; and every read is governed by
permissions declared as part of the ontology itself, down to individual
attributes. The audit trail requires no configuration, because it is the
data.

Architecturally, the hosted service holds no privileged position: it is one
more conforming replica of the protocol — the one we operate, with the
reliability, scale, and support that businesses pay for. Everything it runs
on is the same open kernel, which keeps the incentives honest: leaving is
possible, so staying has to be worth it.

## Why now

Two shifts make this the right decade for this architecture.

**AI agents are about to write a great deal of business software**, and
free-form code is a dangerous thing to let them write at scale. In this
stack, an agent's output is declarations into a validated, typed model:
every proposal is checkable before it applies, every applied change carries
provenance, every consequence is explainable from the rules that derived
it. The same properties that give humans audit and history give agents
guardrails. We believe substrates like this are how agent-built software
stays governable.

**The category is validated — behind a closed door.** Palantir's Foundry
made "the ontology" the center of some of the world's most demanding
operations, and proved that modeling operations as a living, executable
graph is worth extraordinary amounts of money. That validation is real. It
is also closed, bundled, and priced like a fighter jet. The open version —
open language, published protocol, portable runtimes — is not a clone of
the idea; it is the form the idea needs in order to become infrastructure.

## What is real today

We tag our own claims (`✅ shipped · 🚧 building · 📐 designed ·
💭 conjecture`) and hold ourselves to proof by construction:

- `✅` **The kernel is proven.** The reduction to three verbs and two laws
  runs as a conformance suite on two independently written engines on
  every commit.
- `✅` **The substrate is running.** Bitemporal fact log, derivation
  engine, durable workflows, schema-as-facts, and config-as-code — live on
  a centralized runtime today.
- `✅` **A real product emerged from it.** A complete compliance dataroom
  product — I-9s, certifications, obligations, approvals — built from the
  kernel with zero new primitives.
- `🚧` **Convergence, demonstrated.** Two databases in a browser, no
  server, disagreeing offline and reconciling on contact — verified live
  by recomputation, not animation.
- `📐` **The authoring loop.** Literate ontologies elaborating into
  deployed models through plan/apply; the deploy engine exists and is
  tested, the ontology adapter is designed.
- `💭` **The horizon.** Many ontologies, many runtimes, one protocol — an
  ecosystem where an operating model is as portable, forkable, and
  reviewable as source code.

## Conclusion

The claim, compressed: business software keeps rebuilding five primitives
and their supporting cast, badly, because the foundation underneath —
databases that update in place, forget their history, and store
conclusions without explanations — cannot support building them once. A
foundation honest about time, provenance, and derivation can. On it,
products become declarations; audit, history, compliance, and interfaces
become properties instead of projects; and humans and AI agents maintain
the same model through the same validated surface.

For the team at Onboarded, this is not a side quest from the product — it
is why the product compounds. Every feature built as a declaration makes
the next product a configuration instead of a codebase. Onboarded is to
this platform what the first killer app is to any substrate: the existence
proof, and the standard for what "declared, not coded" has to mean.

For everyone else: the language, the substrate, and the workbench are open
source; the protocol is published with a conformance suite; and the design
notes — including the wrong turns — are public. If your business runs on
facts, rules, processes, and obligations (it does), we would like to show
you what it looks like when those are primitives instead of projects.

*Databases store facts. CRDTs synchronize facts. This animates facts —
logic, workflows, permissions, agents, and interfaces, one living system.*
