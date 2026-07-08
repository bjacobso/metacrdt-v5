# Vision — WorldVM: the full pitch, end to end

> Part of the `vision/` set — see [`README.md`](./README.md). Companion to
> [`ontologyvm.md`](./ontologyvm.md), [`branding.md`](./branding.md),
> [`domains.md`](./domains.md), and
> [`metacrdt-alignment.md`](./metacrdt-alignment.md).
>
> Status: **the complete WorldVM company pitch — naming and positioning
> exploration, not a canonical rename.** [`branding.md`](./branding.md)'s
> ratified stack (2026-06-18) still names **Open Ontology** as the umbrella;
> this document is the strongest possible case for **WorldVM** as the front
> door instead. If it wins, `branding.md` gets a fourth reversal entry and this
> doc becomes its replacement stack. Until then, treat it the way
> [`domains.md`](./domains.md) treats everything: a live option, fully argued.
>
> Assets backing this (2026-07): `worldvm.com` owned, **`@worldvm` npm org
> owned**, `contextvm.com` owned, `ontologyvm.com` owned. Adjacent explorations
> that fed this doc: ThreadVM (strong developer story, Meta-Threads baggage),
> ContextVM (strongest AI-era keyword, narrower long-term), CaseVM / WorkVM
> (business-first, unexplored). The resolution below: **they are not competing
> brands — they are runtime objects inside a world.**

---

## One-line pitch

> **WorldVM is a virtual machine for organizational reality.**

Every company is a world: people, agents, documents, policies, workflows,
permissions, obligations, history, and state changing together.

Today that world is split across dozens of applications. Each app keeps its own
partial copy. Humans reconcile the differences. AI agents inherit the mess.

WorldVM gives the organization one running model of itself.

## The first-principles argument

A company is not a database. It is not a workflow tool. It is not a CRM, HRIS,
ticketing system, document repository, policy engine, or chat thread.

A company is a live world:

- actors with roles and authority;
- relationships between people, teams, customers, vendors, and systems;
- documents that create obligations;
- policies that constrain action;
- workflows that move work forward;
- events that change what is true;
- agents that observe, decide, propose, and act;
- history that must remain explainable.

Software should model that world directly.

Instead, modern organizations run on fragmented replicas of reality. Salesforce
has one version of the customer. Workday has one version of the employee. Jira
has one version of the work. Google Drive has one version of the documents.
Slack has one version of the conversation. AI tools see whichever slice they
were handed.

The missing primitive is not another app. It is a runtime for the world itself.

## The category

WorldVM is not an application builder. It is a **world runtime** — a virtual
machine for executable organizational models:

```
World definition          Forma source: entities, policies, workflows, agents
      ↓ elaborates to
MetaCRDT IR               a convergent, bitemporal log of facts
      ↓ executes on
WorldVM                   folds state, evaluates constraints, runs reactions
      ↓
Running organization      humans, software, and agents operating in one world
```

The world definition describes the organization. WorldVM runs it as a live
system with shared state, provenance, derived views, and auditable action.

## The primitive hierarchy: World → Context → Thread

The naming explorations of mid-2026 (ThreadVM, ContextVM, WorldVM) kept
circling the same three abstractions. The resolution is that they are **nested
runtime objects, not rival brands** — the way an operating system has
processes, threads, and memory:

```
World          the persistent execution environment — the organization itself
  └── Context  a bounded working set: the facts, documents, participants,
               and rules relevant to one piece of work
        └── Thread  one long-lived flow of coordination inside a context —
                    humans, agents, and systems advancing the same work
```

- A **World** is what the organization deploys. It is almost unbounded —
  everything lives inside it — which is exactly why it works as the top-level
  brand and stays future-proof (simulations, digital twins, multiplayer
  systems all still fit).
- A **Context** is what an agent or a human loads to work: durable, executable
  context — not a bigger prompt window, but state, permissions, history, and
  rules living together. This is the abstraction `contextvm.com` names, kept
  as a defensive/secondary asset.
- A **Thread** is the temporal unit, and it has the one-sentence definition
  the whole system should be held to:

  > **A thread is a long-lived piece of work coordinated between humans,
  > agents, and software.**

  An onboarding, a procurement, an incident, a deal. Every event that advances
  the work — a form submission, an OCR completion, a manager approval, an
  agent's proposal — lands on the thread. Conversation is just one event type,
  and the participants are peers: humans, agents, and systems all advance the
  same thread under the same rules. (This is what Google Wave almost was,
  minus the ontology, the permissions, and the execution model — Wave centered
  on *communication*; a thread here centers on *coordination*.)

The API sketch, in the shape the substrate already supports:

```ts
import { World } from "@worldvm/runtime"

const world = World.open("acme")

world.transact(...)   // assert facts — the append-only, bitemporal log
world.query(...)      // Datalog over facts, asOf any point in time
world.branch(...)     // branch the world, merge it back — MetaCRDT physics
world.spawn(...)      // start a thread: onboarding, procurement, incident

const thread = world.thread("employee-onboarding", { employee })
await thread.waitForHuman(manager)   // approvals are events
await thread.call(agent)             // agents are participants
await thread.call(workday)           // systems are participants
```

And in Forma:

```lisp
(defthread employee-onboarding
  (participants hr hiring-manager employee workday agent)
  (on (EmployeeCreated ?e)
    (require-form i9 ?e)
    (call workday (provision ?e))
    (await (ManagerApproved ?e))
    (assert (OnboardingComplete ?e))))
```

The thread's timeline is not a chat transcript with bots bolted on:

```
Thread: employee-onboarding/ben
  EmployeeCreated
  FormCompleted        (i9, by employee)
  IDUploaded           (by employee)
  OCRCompleted         (by agent, provenance recorded)
  VerificationPassed   (by checkr adapter)
  ManagerApproved      (by hiring-manager)
  PayrollCreated       (by workday adapter)
  LaptopOrdered        (by agent)
  BadgeIssued
```

Every line is a fact in the log. The conversation, where there is one, is just
more facts.

## What already exists — this is not a napkin

The pitch is grounded in a working substrate. This monorepo is the canonical
MetaCRDT reference implementation, and every WorldVM claim maps to a mechanism
that is either built or explicitly staged:

| WorldVM claim | Mechanism in this repo | Status |
| --- | --- | --- |
| One running model of the organization | Append-only, **bitemporal fact log**; state is a deterministic fold of events ([`triples.md`](./triples.md)) | Built (Convex reference runtime) |
| Customers define their own world — no migrations | **Schema-as-facts**: types and attributes are data in a registry, definitions are themselves facts | Built |
| Every fact has authorship and cause | Every change is a recorded transaction; `asOf` time-travel is intrinsic | Built (bitemporal visibility in the read path) |
| Workflows, policies, forms are one thing | One reactive **Flow** primitive over the transaction feed ([`workflows.md`](./workflows.md)) | Designed; convergence already latent in the compliance engine |
| Worlds are authored as code and deployed like infrastructure | **Forma** elaborates to the MetaCRDT IR; plan/apply pipeline ([`forma.md`](./forma.md), [`config.md`](./config.md)) | `@forma/ts`, `@forma/host`, conformance suite built |
| The kernel is minimal and provable | **Operational Algebra**: `assert` / `fold` / `react`, one closure rule, two laws ([`operational-algebra.md`](./operational-algebra.md), [`forma-zero.md`](./forma-zero.md)) | Reduction argued; conformance suite executable |
| Runs anywhere state lives | Convex reference runtime; thin **Cloudflare** (Durable Objects) and **Node** targets over one shared client boundary | Built (demos in `apps/`) |
| Worlds branch, merge, and converge | MetaCRDT: the log is a CRDT; multi-replica convergence runtime ([`convergence.md`](./convergence.md)) | Log is a CRDT today; multi-replica sync is the research frontier |
| Integrations are reflected surfaces, not plumbing | **Bounded fact contexts** owning namespaces, reacting via Flows ([`integrations.md`](./integrations.md)) | Designed |
| Agents operate under the same rules as humans | Attribute-level authorization, ownership tiers, role-binding ([`authorization.md`](./authorization.md), [`ai.md`](./ai.md)) | Designed |

The honest line for the homepage: *the log is a CRDT today; the multi-replica
world is the research frontier — and the convergence demo is the proof
obligation before anything ships under this name.*

## Why AI makes this urgent

AI agents need a world model.

They need to know what exists, who can act, what changed, what rules apply,
what has already happened, and which actions they are allowed to take. Today
that context is scattered across applications that were never designed to
share one operational reality.

Without a shared world, agents are brittle integrations:

- they read stale context;
- they duplicate decisions;
- they act without clear authority;
- they leave weak audit trails;
- they cannot explain why the state changed.

Every serious AI system is already converging on long-lived threads — chat
threads, coding-agent execution threads, support cases, issue threads. What
none of them provide is a runtime that understands the *semantics* of those
threads: state, rules, workflows, permissions, and structured data living
together. That is the leap.

WorldVM makes agents operators inside the same world as humans. An agent
observes facts, proposes actions, executes workflows, and leaves attributable
records under the same runtime rules as every other actor. The substrate is an
unusually good — and unusually *safe* — AI substrate precisely because
authority is scoped, every action is a fact, and every fact has provenance
([`ai.md`](./ai.md)).

## What runs on WorldVM

| Runtime object | Meaning |
| --- | --- |
| **Worlds** | The organization's persistent execution environment. |
| **Contexts** | Bounded working sets: durable, executable context for a piece of work. |
| **Threads** | Long-lived pieces of work coordinated between humans, agents, and software: onboarding, procurement, incidents, deals. |
| **People** | Employees, customers, vendors, reviewers, approvers, operators. |
| **Agents** | AI and automation actors with scoped authority and provenance. |
| **Documents** | Contracts, policies, forms, packets, generated artifacts. |
| **Relationships** | Ownership, reporting, assignment, dependency, consent, access. |
| **Workflows** | Flows: `on` a pattern · `when` a rule · `do` a step graph. |
| **Permissions** | Who can see, change, approve, delegate, or derive what. |
| **Events** | Every state change, preserved with authorship and cause. |
| **Views** | Dashboards, forms, APIs, reports, and agent context — all projections. |

The key is that these are not separate subsystems. They are one world model,
running. Facts change → constraints evaluate → violations surface → processes
trigger → actions execute → new facts are asserted → views update. The runtime
never stops evaluating the operational model. (This is the marketing rendering
of `fact → fold → fact` from
[`metacrdt-alignment.md`](./metacrdt-alignment.md).)

## The stack and the package ecosystem

The product, the language, the substrate, and the theory each keep their own
name — the lesson of the June reversals is *unify the kernel, keep the brands
distinct*:

```
WorldVM                  ← the product / company / front door (worldvm.com)
Forma                    ← the language (authoring surface)
MetaCRDT                 ← the substrate (convergent fact log, protocol)
Operational Algebra      ← the theory and the paper
```

The analogy set: Docker → containerd, React → Fiber, GitHub → Git. The
implementation has a different name than the product — developers say "I'm
building on WorldVM," and advanced users recognize the runtime is powered by
MetaCRDT.

With the `@worldvm` npm org owned, the package story:

```
@worldvm/runtime         ← execution engine (Thread, World, Flow)
@worldvm/metacrdt        ← distributed storage / protocol
@worldvm/forma           ← language

@worldvm/effect          ← Effect integration
@worldvm/convex          ← Convex target
@worldvm/cloudflare      ← Durable Objects target
@worldvm/node            ← Node target
@worldvm/sqlite          ← SQLite backend
@worldvm/postgres        ← Postgres backend
@worldvm/react           ← React bindings
@worldvm/router          ← routing / navigation

@worldvm/agent           ← agent participants
@worldvm/github          ← adapter
@worldvm/slack           ← adapter
@worldvm/openai          ← adapter
```

Two deliberate choices carried over from the naming work:

- **`runtime`, not `core`** — `import { World } from "@worldvm/runtime"` reads
  better, and `core` becomes a catch-all in every ecosystem that uses it.
- **MetaCRDT stays independently usable.** Someone should be able to
  `import { Replica } from "@worldvm/metacrdt"` without caring about worlds or
  threads. It is the repo's live package namespace today (`@metacrdt/*`), and
  it keeps its name as protocol vocabulary either way.

## Wedge products

An infrastructure brand needs a product a buyer can purchase this quarter. Two
already exist in the vision set, and both are *elaborations of the substrate,
not the substrate*:

- **DataRoom** — the shadow-rooms physics (consent + projection +
  bitemporality + redaction) pointed at diligence, fundraising, M&A,
  compliance, and enterprise onboarding
  ([`../explorations/shadow-rooms.md`](../explorations/shadow-rooms.md),
  [`documents.md`](./documents.md)). The landing line writes itself: *"Data
  rooms that can answer questions, run workflows, and prove what changed."*
  A data room is a **world with strict projection rules** — a member sees a
  projection, never raw events. It is the killer first product, not the
  company.
- **Onboarded** — the existence proof: I-9 workflows, violations, approvals,
  forms, dashboards, built from the kernel with no new primitives. An
  onboarding is a **thread**; the compliance engine is a standing set of
  **flows**; Checkr and Salesforce are **adapter contexts** the world
  composes.

Positioning: WorldVM is the platform; DataRoom is the wedge; Onboarded is the
proof. Powered by MetaCRDT.

## How it compares — the honest map

| System | Its primitive | WorldVM's relation |
| --- | --- | --- |
| **Palantir Foundry Ontology** | The closed operational ontology | The open, runnable alternative — this is the wedge [`branding.md`](./branding.md) built around, and it survives intact one layer down: every world *is* an executable ontology ([`ontologyvm.md`](./ontologyvm.md)). |
| **Google Wave** | The wave (communication container) | Wave centered on communication with bots bolted on; a thread centers on coordination where messages are just one event type. Wave also had no ontology — everything was text blobs — and no business runtime. |
| **Nostr** | Signed event | Nostr is transport-layer: append-only signed events, no execution model, no permissions, no workflow. MetaCRDT is closer to Git (branching, merging, convergence) than to Nostr — though a Nostr-like relay could carry MetaCRDT operations as a transport. |
| **Temporal / Durable Objects** | Durable execution | WorldVM shares the durability posture but the unit is the *world model*, not a function invocation. Durable Objects are a deployment target (`@worldvm/cloudflare`), not a competitor. |
| **Workflow engines / BPM** | The process diagram | A flow is one derived form of the kernel, not the product. Leading with "workflow builder" is on the avoid list. |
| **Graph / temporal databases** | Stored facts | Datomic-adjacent on storage (facts, bitemporality, Datalog) but the point is that the log *executes* — constraints, reactions, and agents, not just queries. |

The one-line differentiation: **apps store pieces of the world; databases
store facts about it; WorldVM runs it.**

## Homepage thesis for worldvm.com

### Hero

```
WorldVM
A virtual machine for organizational reality.

Your company already has a world:
customers, employees, contracts, projects, policies, workflows, and AI agents.

Today it is scattered across dozens of tools.
WorldVM turns it into one running system.

Deploy a world. Not another app.

[Start Building] [Read the Spec]
```

### Visual

Simple and structural:

```
People        Documents       Agents
   \              |             /
    \             |            /
     Policies — Workflows — Events
              \   |   /
               WorldVM
                  ↓
          Running Organization
```

One point: the operating model of the organization is no longer scattered
across tools. It is the thing being run.

### Main claim

```
Apps store pieces of the world.
WorldVM runs the world.
```

### The thread section

The second scroll introduces the working primitive, and it is the sentence a
CEO understands in seconds:

```
Inside every world: threads.

A thread is a long-lived piece of work
coordinated between humans, agents, and software.

Customer threads. Hiring threads. Procurement threads.
Incident threads. Deal threads.

AI agents, humans, and systems all advance the same thread —
with shared state, scoped authority, and a timeline that explains itself.
```

### The pipeline section

The deploy lifecycle, in the shape [`config.md`](./config.md) already
specifies:

```
Author      markdown + embedded Forma definitions — Business as Code
Typecheck   the language host validates before anything touches a runtime
Plan        diff the desired world against the running one
Apply       atomic deploy with previews, migrations, and rollback
Run         constraints evaluate, threads advance, every action audited
Explain     every view traces back to the facts that produced it
```

### The footnote that earns technical trust

> Under the hood, every construct on this page — entities, relations, queries,
> workflows, permissions, views, agents — reduces to three forms and two laws:
> `assert`, `fold`, `react`. That reduction is tested on every build.

The conformance suite is a marketable fact.

## What to avoid

- Do not lead with "ontology" on `worldvm.com` — it lives one layer down, for
  technical buyers who inspect the architecture.
- Do not describe it as a workflow builder, a graph database, an app builder,
  or a chat interface for business data.
- Do not reduce it to AI agent infrastructure — agents are participants, not
  the point.
- Do not let "world" drift into fantasy language; always ground it in
  organizational reality.
- Do not let "context" copy imply bigger context windows — a Context here is
  durable and executable, not a prompt.
- Do not brand anything "ThreadVM" publicly — Meta owns Threads.com and the
  consumer association; *thread* survives as the runtime object's name, where
  it is exactly right.

## The naming ledger delta

What this pitch changes relative to [`branding.md`](./branding.md)'s ratified
stack, stated plainly so the next reversal — if it happens — is a recorded
decision and not a drift:

| Layer | Ratified (2026-06-18) | This pitch |
| --- | --- | --- |
| Umbrella / front door | Open Ontology | **WorldVM** |
| Hosted service | ontology.run (registry of ontologies) | worldvm.com (registry of worlds); ontology.run survives as the adapter/domain registry underneath |
| First-party products | shelly.metacrdt.com, dataroom.metacrdt.com | DataRoom as the wedge under the WorldVM brand |
| Package scope | `@open-ontology` / `@metacrdt` | **`@worldvm`** (owned), with `@metacrdt` continuing as the substrate's namespace |
| Language | Forma | Forma (unchanged) |
| Substrate | MetaCRDT | MetaCRDT (unchanged) |
| Theory | Operational Algebra | Operational Algebra (unchanged) |
| Runtime objects | — | **World → Context → Thread** (new, and the real yield of the ThreadVM/ContextVM explorations) |

The test that decided every previous oscillation — *who are the first 1,000
users?* — reads differently here than it did in June. Open Ontology won
because it was legible to both Palantir-aware buyers and OSS devs. WorldVM's
claim is that it is legible to a *third* audience neither name reaches: the
CEO who has never heard the word ontology and never will. "Every customer has
customer threads, hiring threads, procurement threads, incident threads — AI
agents, humans, and software all advance the same thread, inside one world" is
a message that lands in seconds. Whether that audience is the first thousand
users or the ten-thousandth is the actual open question, and it should be
answered with a landing page test, not another reversal by argument.

## Closing pitch

Every organization already has a world. It exists in people, tools, documents,
permissions, workflows, and decisions.

WorldVM makes that world explicit, executable, and shared by humans and
agents. Worlds are authored in Forma, converge on MetaCRDT, and run anywhere —
and every fact in them can explain itself.

> Deploy the world your organization already runs on.
