# Vision — WorldVM: the company pitch

> Part of the `vision/` set — see [`README.md`](./README.md). Companion to
> [`ontologyvm.md`](./ontologyvm.md), [`branding.md`](./branding.md), and
> [`metacrdt-alignment.md`](./metacrdt-alignment.md).
>
> Status: **naming and company-positioning exploration, not a canonical
> rename**. `worldvm.com` and `ontologyvm.com` are owned. This document writes
> the cleanest standalone pitch for **WorldVM** as the brandable company and
> primitive.

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

WorldVM is not an application builder.

It is a runtime for operational worlds:

```
World definition
      ↓
    Compile
      ↓
    WorldVM
      ↓
Running organization
```

The world definition describes the organization: entities, relationships,
permissions, workflows, documents, events, and agents. WorldVM runs it as a live
system with shared state, provenance, derived views, and auditable action.

That makes the category:

> **World runtime.**

Or, more technically:

> **A virtual machine for executable organizational models.**

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

The homepage visual should be simple and structural:

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

The visual should make one point: the operating model of the organization is no
longer scattered across tools. It is the thing being run.

### Main claim

```
Apps store pieces of the world.
WorldVM runs the world.
```

Traditional SaaS creates isolated systems of record. Each system stores a slice
of reality and exposes a workflow around that slice.

WorldVM starts one layer lower. It gives the organization a shared operational
model that humans, software, and AI agents can all operate against.

## What runs on WorldVM

| Runtime object | Meaning |
| --- | --- |
| **People** | Employees, customers, vendors, reviewers, approvers, operators. |
| **Agents** | AI and automation actors with scoped authority and provenance. |
| **Documents** | Contracts, policies, forms, packets, generated artifacts. |
| **Relationships** | Ownership, reporting, assignment, dependency, consent, access. |
| **Workflows** | Onboarding, procurement, compliance, approvals, reviews. |
| **Permissions** | Who can see, change, approve, delegate, or derive what. |
| **Events** | Every state change, preserved with authorship and cause. |
| **Views** | Dashboards, forms, APIs, reports, and agent context as projections. |

The key is that these are not separate subsystems. They are one world model,
running.

## Why AI makes this urgent

AI agents need a world model.

They need to know what exists, who can act, what changed, what rules apply, what
has already happened, and which actions they are allowed to take. Today that
context is scattered across applications that were never designed to share one
operational reality.

Without a shared world, agents become brittle integrations:

- they read stale context;
- they duplicate decisions;
- they act without clear authority;
- they leave weak audit trails;
- they cannot explain why the state changed.

WorldVM makes agents operators inside the same world as humans. An agent can
observe facts, propose actions, execute workflows, and leave attributable
records under the same runtime rules as every other actor.

## Product shape

The product is not a blank canvas. It should feel like infrastructure that comes
with a useful standard world.

### Build

Author the world as code: entities, relationships, policies, workflows, forms,
views, and agents.

### Deploy

Deploy the world into a runtime with previews, diffs, migrations, validation,
and rollback.

### Run

Humans, services, and agents operate against shared state. Workflows trigger,
permissions evaluate, documents generate, obligations surface, and views update.

### Explain

Every fact has authorship and cause. Every derived view can be traced back to
the events that produced it.

## Architecture story

WorldVM is the brandable primitive. OntologyVM is the precise technical category.
MetaCRDT is the substrate underneath.

```
WorldVM
  the company / primitive / front door

OntologyVM
  the executable ontology runtime

MetaCRDT
  the convergent fact log and derivation substrate
```

Put differently:

- **WorldVM** is what the market remembers.
- **OntologyVM** is what technical buyers inspect.
- **MetaCRDT** is what makes the runtime converge.

## Relationship to OntologyVM

WorldVM and OntologyVM should not compete.

They answer different first-contact questions:

| Question | Name |
| --- | --- |
| What is the company / primitive? | **WorldVM** |
| What does it technically run? | **OntologyVM** |
| How does it synchronize and derive state? | **MetaCRDT** |
| Where do named ontologies run? | **ontology.run** |

The simplest public story:

> WorldVM runs organizational worlds. Under the hood, each world is an
> executable ontology running on OntologyVM, backed by MetaCRDT.

## What to avoid

- Do not lead with "ontology" on `worldvm.com`.
- Do not describe it as a workflow builder.
- Do not describe it as a graph database.
- Do not make it sound like a chat interface for business data.
- Do not reduce it to AI agent infrastructure.
- Do not let "world" become vague fantasy language; always ground it in
  organizational reality.

## Closing pitch

Every organization already has a world. It exists in people, tools, documents,
permissions, workflows, and decisions.

WorldVM makes that world explicit, executable, and shared by humans and agents.

> Deploy the world your organization already runs on.

