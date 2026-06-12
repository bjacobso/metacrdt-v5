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

## A foundation that keeps the whole story

The bet only works if the foundation carries three things most systems
drop. Not through any fault of theirs — every database does exactly what
it was asked to do — but no single application ever needed the entire
scope to be correct at once, so the connective tissue got discarded: when
things were true, where facts came from, why conclusions followed. This
foundation is asked to be correct about all three, all the time:

- **Time.** Every fact records both when it became true in the world and
  when the system learned it.[^bitemporal] These are different dates, and most software
  conflates them. Kept separate, "what did we know on March 3rd?" is an
  ordinary query — not a forensic project.
- **Provenance.** Every fact knows who asserted it and why — a person, a
  rule, an integration, an AI agent. Nothing enters the system without an
  answer to "where did this come from?"
- **Derivation.** Conclusions — obligations, permissions, task lists, the
  screens users see — are computed from facts by explicit rules, never
  stored as mysterious side effects. Change the facts, and every
  consequence updates itself, carrying an explanation of why.

Concretely, the foundation is an append-only log of facts.[^log] Nothing is ever
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
possible, by writing the evaluator in itself.[^mccarthy] Lisp was not designed so much
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
mutations, actions, processes, constraints, views — each is defined *in terms of*
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

The four parts of the stack are four ways of touching this kernel. A map
for what follows: operational algebra is the physics; Forma, the language;
MetaCRDT, the machine; Schematics, the workshop; ontology.run, the grid.

## Forma — the language

Forma is how people and machines write an ontology. It is a small formal
language designed to live inside ordinary documents: the prose explains the
policy, and the code block *is* the policy. A staffing policy — the entity
and the rule that governs it:

```lisp
(define-entity Worker
  (:field (field :worker/name String (:required true)))
  (:field (field :worker/status
    (Enum "active" "terminated")
    (:required true))))

(define-constraint background-check-current
  (:description "Active hospital workers must hold a current background check")
  (:find ?worker-name ?expires)
  (:where
    [?worker :worker/name ?worker-name]
    [?worker :worker/status "active"]
    [?placement :placement/worker ?worker]
    [?placement :placement/site "hospital"]
    [?check :check/worker ?worker]
    [?check :check/expires-at ?expires]
    [(< ?expires $now)]))
```

If this query ever returns results, the business has a violation[^datalog] — and the
runtime evaluates it continuously, so the violation surfaces the moment it
becomes true, routed as an obligation with its explanation attached.

We call this pattern a **literate ontology**[^knuth]: the memo and the system are
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

Beneath the friendly surface, the language is doing quieter, harder work.
Definitions are **typed**: a module is checked against the declared model
before anything touches a runtime, moving whole classes of operational
error from production to the editor. Definitions are **data**: the language
is homoiconic — programs and the structures they describe share one form —
so the same machinery that validates a module can inspect, transform, and
generate one, which is what makes agent authorship tractable rather than
terrifying. And definitions are **portable**: a module elaborates to the
kernel, not to any particular runtime, so the ontology you write is not
married to the infrastructure it first runs on. The language is held to
the same standard as the theory: independent implementations, one shared
conformance suite, identical behavior required.

## MetaCRDT — the substrate

MetaCRDT is the fact log itself: the storage and synchronization layer that
makes the foundation's three honesty properties real. The name is literal —
CRDTs (conflict-free replicated data types)[^crdt] are the established technique
for letting independent copies of data merge without conflicts; MetaCRDT
applies that discipline not just to data but to everything above it: logic,
schema, workflows, and permissions are all facts in the same log.

Mechanically: every fact is an immutable event with a content-derived
identity, a hybrid timestamp,[^hlc] and its provenance. A replica's state is a
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
- in the **browser itself** — fully offline, syncing when reconnected.[^localfirst]

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
infrastructure-as-code,[^terraform] aimed at ontologies instead of servers:

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
stays governable. Model vendors compete above this layer; business
operations become stable underneath it.

**The category is validated — behind a closed door.** Palantir's Foundry[^foundry]
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

## Open questions — research needed

In the same spirit of tagging claims, here is what we do not know yet.
These are research questions, not roadmap items — and each doubles as a
test of the theory, because every answer must be expressible in the
existing kernel. The day one of them requires a new primitive, the algebra
has been falsified and needs revision.

**Modular ontologies.** How does a large ontology decompose into modules
with clean boundaries? An ontology that cannot be broken apart cannot be
reused, but the boundary semantics are genuinely open: what a module
exports (entity types, rules, facts, or all three), how modules depend on
and version against each other, and whether composition is closed — does
importing two well-formed modules always yield a well-formed ontology?

**Distributed query.** A question that spans modules must be answerable
when the facts live in separate logs — two SQLite files, two Durable
Objects, two backend deployments. Datalog over a single log is solved;
Datalog *across* logs is a real research problem: how much of a query
pushes down to each replica versus joins at the edge, what the cost model
looks like, and — harder — what a cross-log answer even claims, when each
log has its own clock and its own notion of "as of now."

**Federation across organizations.** "My HR system, plus Stripe, plus
ADP": composing ontologies you do not own. Vendor systems are foreign
ontologies with their own identities and access rules, which opens three
problems at once — entity resolution (the same employee exists in three
systems under three identifiers), provenance across trust boundaries (a
fact asserted by a vendor is evidence, not gospel — how is foreign
assertion weighted and audited?), and authorization when the querying
party is not the data's owner.

**Scale, and the lifecycle of facts.** Append-only forever meets physical
reality. At what volume do projections need tiering, and how does a log
vacuum without breaking the conservation law? The candidate shape — fold
a segment to a checkpoint, archive the segment to cold storage, keep a
verifiable link from checkpoint to archive — preserves "no fact is
destroyed" while admitting that not every fact stays hot. Whether that
shape survives contact with compliance retention schedules and
right-to-erasure is exactly the kind of question the first deployments
will answer.

**Evolving the model itself.** Ontologies change: attributes are renamed,
entity types split, cardinalities tighten. Because the schema is itself
facts, the old shape stays queryable at its own place in history — but
derivation across versions is open. Does a rule written against today's
schema evaluate over facts asserted under last year's? And is migration
itself expressible as facts — an assertion mapping old shape to new —
rather than as a script that rewrites history?

**Acting on absence.** The most valuable conclusions are derived from
what is *missing*: an obligation is "required, and no fact satisfies it."
Under convergence, absence is unstable — the satisfying fact may exist on
a replica that has not synced yet. Theory draws the line precisely:
monotonic derivations are coordination-free, negation is not.[^calm] So
when is it safe to act on a derived absence, when must the system
coordinate first, and when is it cheaper to act and compensate when the
late fact arrives? We suspect the answer should be declarable per rule —
riskier conclusions buy more coordination — but that is a conjecture.

**Privacy and provenance, composed.** Provenance says every derived fact
can name its inputs; attribute-level permissions say some inputs are
restricted. Together they force a question most systems never face: does
a conclusion inherit the secrecy of its premises? If a derived flag
depends on a social security number, who may see the flag — and may they
see *why* it was raised? Information flow through derivation needs a real
policy, not an accident.

**The blast radius of a declaration.** Plan/apply can diff facts; the
harder diff is consequences. A one-line rule change can create or retract
ten thousand obligations. Before applying, the workbench should answer
"what would this change derive?" — counterfactual evaluation against the
live log, at plan time, fast enough to be routine.

**The boundary of the fold.** Not all business logic is derivation.
Scheduling, matching, and optimization are search problems: a fold can
verify an assignment, but not necessarily find one. Where exactly is the
boundary between what the kernel derives and what an external solver —
reached through a governed action — decides? The theory requires that
boundary to exist; the engineering has to find where it lies.

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

Businesses are already ontologies — informal ones, scattered across wikis,
spreadsheets, inboxes, and the heads of the people who keep things running.
We are making them executable.

*Databases store facts. CRDTs synchronize facts. This animates facts —
logic, workflows, permissions, agents, and interfaces, one living system.*

---

[^mccarthy]: John McCarthy, "Recursive Functions of Symbolic Expressions
    and Their Computation by Machine, Part I," *Communications of the ACM*
    3(4), 1960. Paul Graham's "The Roots of Lisp" (2002) is the accessible
    reconstruction this section leans on.

[^log]: The log-as-source-of-truth has deep prior art: event sourcing in
    the domain-driven-design tradition, and Jay Kreps, "The Log: What every
    software engineer should know about real-time data's unifying
    abstraction" (2013).

[^bitemporal]: Two-axis time is a mature result of the temporal-database
    literature — see Richard Snodgrass's bitemporal work of the 1990s —
    with production lineage in Datomic (immutable facts with time-travel)
    and XTDB (bitemporal Datalog). We stand on that work; the contribution
    here is what is layered above it.

[^crdt]: Marc Shapiro, Nuno Preguiça, Carlos Baquero, and Marek Zawirski,
    "Conflict-free Replicated Data Types," *SSS 2011* — the paper that
    formalized strong eventual consistency, the convergence guarantee this
    section relies on.

[^hlc]: Sandeep Kulkarni, Murat Demirbas, Deepak Madappa, Bharadwaj
    Avva, and Marcelo Leone, "Logical Physical Clocks" (hybrid logical
    clocks), *OPODIS 2014*.

[^localfirst]: Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, and
    Mark McGranaghan, "Local-first software: You own your data, in spite
    of the cloud," *Onward! 2019* — the design ideals the browser replica
    aims to satisfy.

[^knuth]: After Donald Knuth, "Literate Programming," *The Computer
    Journal*, 1984. "The memo and the system are the same file" is Knuth's
    idea, applied to operations.

[^datalog]: The query and constraint language is Datalog — see Ceri,
    Gottlob, and Tanca, "What You Always Wanted to Know About Datalog (And
    Never Dared to Ask)," *IEEE TKDE*, 1989. Constraints-as-queries-that-
    should-be-empty is the classic integrity-constraint reading.

[^terraform]: The plan/apply/drift discipline is HashiCorp Terraform's
    contribution to operations culture; we aim it at ontologies instead of
    cloud resources.

[^foundry]: Palantir Foundry's Ontology (palantir.com/platforms/foundry)
    — the closed prior art this project positions against, and the
    strongest commercial evidence that the category is real.

[^calm]: Joseph M. Hellerstein and Peter Alvaro, "Keeping CALM: When
    Distributed Consistency Is Easy," *Communications of the ACM*, 2020 —
    consistency-as-logical-monotonicity, the result that makes "acting on
    absence" a precise question rather than a vague worry.
