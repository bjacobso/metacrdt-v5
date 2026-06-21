# Vision — OntologyVM: category name and homepage thesis

> Part of the `vision/` set — see [`README.md`](./README.md). Companion to
> [`branding.md`](./branding.md), [`domains.md`](./domains.md), and
> [`metacrdt-alignment.md`](./metacrdt-alignment.md).
>
> Status: **naming exploration, not a canonical rename**. The current decided
> stack remains whatever [`branding.md`](./branding.md) says. This document
> preserves the strongest version of the **OntologyVM** direction so it can be
> evaluated against Open Ontology, ontology.run, MetaCRDT, and WorldVM without
> losing the argument.

---

## The naming bar

The target is a name that can plausibly become a category, not merely describe a
feature. The reference set is:

- ChatGPT
- DocuSign
- Salesforce
- Databricks
- Snowflake
- VMware
- GitHub
- Datomic

The pattern is not "perfectly explains itself." The stronger pattern is:

- sounds like a thing, not a feature;
- can become a noun;
- does not trap the company in today's implementation;
- has enough weirdness to be ownable;
- gives technical buyers a primitive they can repeat.

That distinction matters here because the stack has several names doing
different jobs: a protocol name, a product/category name, a hosted-service name,
and a homepage domain. Collapsing those into one name has repeatedly made the
story worse. The strongest naming stack may be layered.

## Candidate map

### Primitive / substrate names

These feel like Git, Docker, Kubernetes, or Datomic: technical primitives that
can earn category status over time.

| Name | Strength | Risk |
| --- | --- | --- |
| **MetaCRDT** | Weird, ownable, protocol-shaped; strong for the substrate. | Too technical for the front door; CRDT frames the implementation. |
| **MetaGraph** | Broader than CRDT; a graph of graphs / worlds. | Less precise; "graph" is crowded. |
| **WorldDB** | Simple, database-shaped, DynamoDB-like. | Possibly too generic and storage-constrained. |
| **WorldOS** | Very strong ambition: every company has an invisible operating system. | Big claim; may over-index on OS metaphor. |
| **WorldCore** | Infrastructure-like, less tied to one mechanism. | Less vivid than WorldOS or WorldVM. |
| **WorldMesh** | Shared worlds connected together. | Could read as networking infrastructure. |

### Coordination names

These point at the human/system/agent coordination problem rather than the
runtime architecture.

| Name | Strength | Risk |
| --- | --- | --- |
| **Coord** | Short, Stripe-like, broad. | Sparse; needs copy to explain the category. |
| **Converge** | Aligns with CRDTs and with humans/agents/systems converging. | Descriptive and likely crowded. |
| **Synapse** | Connection point; familiar startup naming pattern. | Crowded; biology metaphor may be generic. |
| **Nexus** | Where things meet. | Very crowded. |
| **Orbit** | Things organized around shared state. | Softer; less obviously operational. |

### Execution / runtime names

These names make the "ontology that runs" idea explicit.

| Name | Strength | Risk |
| --- | --- | --- |
| **WorldVM** | Category-like, technical, VMware-adjacent, bigger than one ontology. | Slightly vague: what is a "world"? |
| **OntologyVM** | Precise: an ontology that executes. Strong technical credibility. | "Ontology" has academic / Semantic Web baggage. |
| **OntologyOS** | Strong system metaphor. | More abstract than VM; likely heavier than needed. |
| **ActorOS** | Fits actors, agents, workflows, permissions. | Narrows the story to actors. |
| **Runtime** | Surprisingly strong if ownable. | Too generic; availability and trademark risk likely high. |
| **Operate** | Strong SaaS energy. | Less primitive-shaped. |
| **Orchestrate** | Describes the workflow surface. | Long and feature-like. |
| **Kernel** | Every world runs on a kernel. | Technical, but generic and overloaded. |

### Reality / world names

These names point at the deepest ambition: modeling operational reality.

| Name | Strength | Risk |
| --- | --- | --- |
| **Atlas** | A map of reality; strong, broad, human-readable. | Very crowded. |
| **Cosmos** | Shared world, expansive. | Very crowded and broad. |
| **Terrain** | The environment actors inhabit. | Softer, less category-like. |
| **Habitat** | Where actors live. | Warm but less enterprise-infrastructure. |
| **Domain** | Every business has a domain. | Underrated but generic. |
| **Reality** | Directly names the ambition. | Almost too ambitious; likely impossible to own cleanly. |

## Why OntologyVM is stronger than it first sounds

**OntologyVM** fuses the two halves of the product:

```
Ontology + VM = an ontology that executes
```

Most ontology products imply model, store, and query. OntologyVM implies:

- model;
- execute;
- run;
- deploy;
- host;
- lifecycle.

That is close to the deepest claim in this project. The system is not merely a
knowledge graph, schema registry, workflow builder, or database. It is an
executable model of an organization: actors, workflows, agents, permissions,
rules, forms, tasks, documents, events, and views all operating against shared
state.

The CTO read is:

> A runtime for operational ontologies.

That is different from:

> Another graph database.

The `VM` suffix does useful work. It brings state, execution, deployment,
hosting, lifecycle, and isolation into the name without requiring a long
explanation. People know what VMs do. The new claim is that the thing being run
is not a machine image; it is the organization's operational ontology.

## The ontology tax

The downside is real: **ontology** carries baggage.

Many CTOs know the word, but many CEOs do not. Many developers associate it with:

- Semantic Web;
- RDF;
- OWL;
- academic knowledge graphs;
- modeling without execution.

That means the homepage should not lead with a lesson on what an ontology is.
It should make the ontology feel like source code and the VM feel like the
running system.

The copy move is:

> Every company already has an ontology. Today it is scattered across dozens of
> tools. OntologyVM turns it into a running system.

## WorldVM vs. OntologyVM

| Name | Pros | Cons |
| --- | --- | --- |
| **WorldVM** | Memorable, big-vision, AI-native, human-friendly. | Slightly vague; needs definition. |
| **OntologyVM** | Precise, technical, explains the architecture. | Academic baggage; less friendly to nontechnical buyers. |

The strongest fundraising sentence may combine both:

> We're building an Ontology VM — a runtime for organizational worlds.

In that sentence:

- **OntologyVM** becomes the product/category.
- **World** becomes the explanation.
- **MetaCRDT** remains the protocol/substrate.
- **ontology.run** can remain the hosted service or deployment surface.

## The layered stack

The strongest internally consistent stack from this exploration is:

```
MetaCRDT
  ↓
OntologyVM / WorldVM
  ↓
ontology.run
```

Each name has a different job:

| Layer | Name | Job |
| --- | --- | --- |
| Protocol / substrate | **MetaCRDT** | The convergent event/fact substrate; Git-like technical primitive. |
| Product / category | **OntologyVM** or **WorldVM** | The executable runtime category; VMware-like product name. |
| Hosted surface | **ontology.run** | The place where named ontologies run; GitHub-like service surface. |

This is compelling because the names do not compete. MetaCRDT says how
convergence works. OntologyVM says what kind of machine it is. ontology.run says
where customers deploy.

## Homepage thesis for ontologyvm.com

Domain status: `ontologyvm.com` and `worldvm.com` are owned. This means the
choice is not only semantic; it can be expressed as two real public surfaces.
`ontologyvm.com` can carry the precise technical category. `worldvm.com` can
carry the broader, more brandable company or primitive.

The homepage should not make the first screen about ontologies as an academic
concept. People do not buy ontologies. They buy systems that run.

### Hero

```
OntologyVM
Run your organization as code.

Every company already has an ontology:
customers, employees, contracts, projects, policies, workflows, and AI agents.

Today that ontology is scattered across dozens of applications.
OntologyVM turns it into a running system.

Deploy a world. Not an app.

[Start Building] [Read the Spec]
```

### First visual

The hero visual should show transformation rather than forms or screenshots:

```
Organization Ontology
        ↓
      Compile
        ↓
     OntologyVM
        ↓
   Running World
```

The running world contains:

- people;
- agents;
- workflows;
- documents;
- permissions;
- relationships;
- events.

### Big idea

```
Software models applications.
OntologyVM models reality.
```

Traditional software creates isolated copies of the world:

- CRM;
- HRIS;
- ticketing;
- documents;
- AI tools.

Each maintains its own version of reality. OntologyVM provides a shared
operational model that humans, software, and AI agents can operate together.
Ontologies provide the vocabulary and domain model; the runtime makes that model
executable.

### What runs on OntologyVM

| Runtime object | Meaning |
| --- | --- |
| **Actors** | People, teams, organizations, services, and AI agents. |
| **Relationships** | Reporting structures, ownership, permissions, dependencies. |
| **Workflows** | Hiring, onboarding, procurement, approvals, reviews. |
| **Documents** | Policies, contracts, forms, artifacts, generated outputs. |
| **Events** | Everything that happens, preserved with authorship and cause. |
| **Agents** | Automations and AI systems operating against shared state. |

### Example copy

Instead of treating data, process, and agents as separate systems:

```lisp
(define-entity Employee)
(define-workflow Onboarding)
(define-agent Recruiter)
```

Deploy it. A running world appears.

The point is not the syntax. The point is that the ontology is executable:
definitions become state, workflows, permissions, views, and agent affordances
inside one runtime.

### Why now

AI needs a shared world model. Today's agents operate with fragmented context
because every tool contains a different version of reality.

OntologyVM gives humans and AI agents a shared operational world: one model, one
history, one set of permissions, one place where actions become attributable
facts.

### Architecture

```
MetaCRDT
    ↓
OntologyVM
    ↓
Your World
```

| Layer | Homepage explanation |
| --- | --- |
| **MetaCRDT** | Distributed synchronization: facts, history, derivation, merge. |
| **OntologyVM** | Execution runtime: deploy ontologies as running systems. |
| **Your World** | Your organization operating as code. |

### Closing line

```
Every organization is a world.
Deploy yours.

[Get Started]
```

## Copy rules

- Do not spend the homepage teaching "ontology" as a term.
- Make ontologies feel like source code.
- Make the VM feel like a running system.
- Keep MetaCRDT in the architecture section, not the hero.
- Use "world" as the human explanation, not necessarily the product name.
- Avoid presenting this as a database, workflow tool, or knowledge graph.
- The core analogy is: **VMware for organizations**.

## WorldVM.com from first principles

If **OntologyVM** is the precise technical category, **WorldVM** may be the more
brandable company and primitive. See [`worldvm.md`](./worldvm.md) for the clean
standalone pitch.

Start from first principles:

1. A company is not an app.
2. A company is a world: people, agents, documents, rules, permissions,
   workflows, obligations, history, and state changing together.
3. Today's software splits that world into many partial replicas.
4. AI makes the split worse because agents need shared context, shared authority,
   and shared memory.
5. The missing primitive is a runtime for the world itself.

That primitive is a **World VM**:

> A virtual machine for organizational reality.

This gives the two owned `.com`s distinct jobs:

| Domain | Job | First-contact read |
| --- | --- | --- |
| `worldvm.com` | Company / primitive / front door | A runtime for worlds; broad, ownable, brandable. |
| `ontologyvm.com` | Technical category / spec surface | The executable ontology runtime; precise, CTO-legible. |

The copy stack becomes:

```
WorldVM
A virtual machine for organizational reality.

OntologyVM
The runtime that executes your organization's ontology.

MetaCRDT
The convergent substrate underneath.
```

In this framing, `WorldVM.com` is allowed to be bigger and simpler. It does not
ask the reader to know what an ontology is. It names the thing the buyer already
feels: the business has a world, and that world should run as one system.

`OntologyVM.com` then becomes the technical proof: how the world is modeled,
compiled, deployed, synchronized, audited, and run.

## Verdict

**MetaCRDT** remains the strongest protocol name. **OntologyVM** may be the
strongest product/category name for technical founders and CTOs because it names
the missing primitive: not an ontology, but an ontology that runs.

If this direction wins, the simplest public story is:

> WorldVM is the company and the primitive: a virtual machine for organizational
> reality. OntologyVM is the technical category: the runtime that executes the
> organization's ontology. Both run on MetaCRDT.
