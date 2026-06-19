# The Vision

\*One substrate for the whole product: a configurable, bitemporal fact store whose transaction log is
the event bus — turning hardcoded tables, bespoke workflow engines, and one-off integration plumbing
into the same two things: **facts, and reactions over facts.\***

> These are forward-looking design explorations. They are **vision + brainstorm**, not build specs.
> Each one keeps an ambitious end-state explicitly separate from a conservative, incremental path —
> _get the model right, expand by measurement, never lift-and-shift._ Read this page top to bottom;
> follow the links when you want depth.

> **Substrate note (decided):** these docs were written assuming a Postgres / Prisma / Kysely (SQL) +
> Effect-TS stack. The proof-of-concept is built on **Convex**. [`convex.md`](./convex.md) is the
> authoritative rebasing — what's already shipped, what reframes (SQL→Datalog-in-JS, column-promotion→
> projection tables, Effect→Convex/components, event-bus→`factEvents`+scheduler), and what's cut
> (JIT per-account API, SQL planner/GIN, residency). Where a doc conflicts with `convex.md`, `convex.md`
> wins. The _model_ holds; the _mechanism_ changes.

> **Start here:** [`overview.md`](./overview.md) is the one-page thesis — the
> layers, the product seam (system vs. configured vs. data), and all twelve
> pillars with `[shipped]`/`[reframed]`/`[ahead]` status tags. This README is the
> deeper guided tour beneath it.

---

## Where we are today

The application is built the way most applications are: a set of hardcoded tables — `employers`,
`employees`, `placements`, `tasks` — each with bespoke machinery grown around it. It works. But the
shape of the codebase now creates four recurring frictions, and they compound:

1. **The domain is rigid.** Object types and their fields are columns in the database schema. Every new
   field, and every customer who needs to model their own kind of object, is a code change and a
   migration. Customers cannot describe their own world; we describe it for them, one migration at a
   time.

2. **"When something changes, react" is solved three separate times.** Policies, automations, and forms
   are three products with three data models and three UIs — yet a policy is "when a placement changes,
   if a rule matches, require these forms," an automation is "when an entity changes, if a rule matches,
   do these steps," and a form is the data-collection step those reactions trigger. They are flavors of
   one idea, implemented thrice.

3. **Every integration reinvents its plumbing.** Each integration (verification, background checks, and
   eventually upstream ATS and downstream HRIS systems) invents its own tables and wiring. There is no
   uniform way for an integration to _own and evolve its own schema_ or to expose its data to the rest
   of the system through a single contract.

4. **History is an afterthought.** Audit trails, "what did this look like last month," and "why did this
   happen" are reconstructed from scattered snapshot tables and source-tracking columns — when they can
   be reconstructed at all.

Each of these has been solved locally, again and again. The bet of this vision is that they are not four
problems. They are **one**.

## The insight, from first principles

Look at what all four have in common. A domain object is a bag of attribute values about a subject. A
policy/automation reads those values and reacts. A form writes those values. An integration reads and
writes them across a boundary. History is just the values, over time.

So model the domain as **facts** — `(subject, attribute, value)` — in a store that is:

- **configurable**: types and fields are _data in a registry_, not columns in code;
- **bitemporal**: every fact carries validity and every change is a recorded transaction, so history is
  intrinsic, not bolted on;
- **reactive through its own log**: the transaction log is not an audit byproduct — it is the **event
  bus**. A reaction is a standing pattern over that log.

From those three choices, the four frictions dissolve in the same motion:

- a **schema change** becomes new attribute definitions — no migration;
- **history** becomes a property of the store — free audit and time-travel;
- a **reaction** becomes a subscription to a pattern of transactions — one engine, not three;
- an **integration** becomes a module that owns a namespace of facts and reacts over the same log.

The transaction log is the spine: it connects every change in data to every reaction to that change.
That single reframe is what lets the pieces collapse together instead of stacking up.

## How each step addresses the frictions

| Today's friction                        | Addressed by                           | How                                                                                                                                                                    |
| --------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rigid, migration-gated domain (#1)      | [`triples.md`](./triples.md)           | A configurable `EntityType`/`Attribute` registry over a bitemporal fact store; customer-defined objects with no migration.                                             |
| History as an afterthought (#4)         | [`triples.md`](./triples.md)           | Bitemporality by construction — every fact has validity, every change is a queryable transaction; `asOf` time-travel for free.                                         |
| Three overlapping workflow systems (#2) | [`workflows.md`](./workflows.md)       | Policies, automations, and forms collapse into one reactive **`Flow`** over the transaction feed; forms become attribute projections, submissions become transactions. |
| Integrations reinvent plumbing (#3)     | [`integrations.md`](./integrations.md) | Each integration is a **bounded fact context** that owns its namespace (with its own migration system) and reacts via inbound/outbound Flows over the same log.        |

## The three pillars

### 1. A configurable substrate → [`triples.md`](./triples.md)

A bitemporal fact store with a configurable type/attribute registry, a queryable transaction log, and a
query model where _queries are data_ (a Datalog AST — on Convex it compiles to **indexed reads with
nested-loop joins in JS**, not SQL; see [`convex.md`](./convex.md)). This gives customer-defined objects,
audit and time-travel for free, and a **self-describing** schema in which definitions are themselves facts
— so schema versioning and data versioning become one mechanism. _(On Convex this is already built —
schema-as-facts — not "eventual.")_ This is the foundation the other two pillars stand on.

### 2. Unified workflows → [`workflows.md`](./workflows.md)

Policies, automations, and forms are **already most of the way converged** — policies and automations
share a rule engine today, and automations already create the very obligations policies produce. They
collapse into one reactive **`Flow`** primitive (`on` a transaction-feed pattern · `when` a rule · `do` a
step graph), with forms recast as attribute projections and submissions as transactions. Includes a
worked spec showing that the compliance engine's reuse logic is really a _generated query pattern_,
reproduced end-to-end and validated against the existing behavior before anything is replaced.

### 3. Modular integrations → [`integrations.md`](./integrations.md)

Each integration becomes a **bounded fact context**: it owns a private namespace of entities/attributes
(with an Effect-based migration system that needs no central migration), bridges to the shared domain
through one contract, and participates as **Flows** over the transaction feed. Upstream (ATS), inline
(verification), and downstream (HRIS) integrations become _one module shape, three data-flow directions_.

## What keeps it elegant (not a free-for-all)

The connective tissue across all three pillars is **ownership tiers + role-binding** (detailed in
[`workflows.md`](./workflows.md) §2.5). Everything is a fact, but facts differ by _owner_ — kernel, system-process,
customer, and integration — and by whether the engine has privileged interpretation of them. Crucially,
the engine programs against **roles** (e.g. "the subject obligations attach to," "the principal reuse
keys on"), not concrete types. So `employer`/`employee`/`placement` can become _customer-defined_ while
the compliance machinery stays intrinsic: configurable domain, fixed semantics. That line is what keeps
the system from degenerating into a bare graph database customers must assemble meaning on top of.

## The north star

A product where customers model their own objects, build their own forms over them, and wire their own
reactions — with full audit and time-travel — on a core whose compliance, workflow, and integration
semantics ship intrinsic and battle-tested. The Salesforce/Attio posture: a rich built-in model that is
also deeply extensible.

## How we get there without blowing up the app

The frictions are real, and so are the costs: storing everything as facts regresses hot read paths and
gives up database-level type and referential safety. So the end state is deliberately **hybrid** — a
configurable fact core with native/projected hot paths — and the path to it is disciplined rather than
heroic: **prove the model on a thin slice, run it in shadow against the live system, cut over behind a
flag, and expand only where measurement justifies it.** Each pillar applies exactly this method to its
own domain. Tellingly, the highest-leverage first step — collapsing policies into the workflow engine —
requires _no storage change at all_, because the convergence is already latent in the code.

---

## Documents

| Doc                                      | Question it explores                                                                                                                      | Depth         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| [`overview.md`](./overview.md)           | The one-page thesis: layers, the system/configured/data seam, and all twelve pillars with status tags — **start here**                       | thesis        |
| [`metacrdt-alignment.md`](./metacrdt-alignment.md) | The lens for the whole set: every doc is a fact, a fold, or a reaction over the convergent log — **read first**                  | lens          |
| [`branding.md`](./branding.md)           | The name stack, consolidated: Operational Algebra is the front door (theory + system + product), Operational Algebra Cloud the hosted runtime, Forma/MetaCRDT/Alchemy components, Onboarded the proof | naming        |
| [`domains.md`](./domains.md)             | The neutral inventory: every domain, org, npm scope, and name we hold (or don't), with the *vibe* each one carries — a ledger that takes no side, the counterpart to `branding.md`'s verdict | naming        |
| [`operational-algebra.md`](./operational-algebra.md) | Arguing the algebra down: the paper's five primitives and six operators derived from fact/fold/reaction — two verbs, one rule, two laws | kernel        |
| [`forma-zero.md`](./forma-zero.md)       | The kernel as syntax: McCarthy's seven + `assert`/`fold`/`react`, the surface language derived as macros, and `opeval` written in itself | kernel        |
| [`convex.md`](./convex.md)               | How does the whole vision rebase onto Convex? (decided: reframes, cuts, what's already shipped — now: one target among many)              | decisions     |
| [`triples.md`](./triples.md)             | What is the substrate, and why is it the foundation?                                                                                      | vision        |
| [`workflows.md`](./workflows.md)         | Can policies + automations + forms become one `Flow`?                                                                                     | design + spec |
| [`compliance.md`](./compliance.md)       | What is the compliance engine, end to end? (obligations-as-facts + reconciler + reuse-query)                                              | synthesis     |
| [`library.md`](./library.md)             | Can form/policy/Flow versioning, distribution, and upgrades become one mechanism? (_Are workflows just triples?_)                         | design depth  |
| [`integrations.md`](./integrations.md)   | Can each integration be an isolated module that owns its schema and reacts via Flows?                                                     | design depth  |
| [`authorization.md`](./authorization.md) | Who can read/write which facts? (attribute-level access, rules over the graph)                                                            | design depth  |
| [`performance.md`](./performance.md)     | How does a fact store stay fast? (the hybrid read path — projections & promotion)                                                         | design depth  |
| [`privacy.md`](./privacy.md)             | Retention, erasure & residency under bitemporality (never-destroy vs. right-to-erasure)                                                   | design depth  |
| [`experience.md`](./experience.md)       | The worker onboarding runtime + generated UIs (rendering as a projection of the schema)                                                   | design depth  |
| [`documents.md`](./documents.md)         | Files, generated PDFs & e-signature (blob-referenced entities; signatures as facts)                                                       | design depth  |
| [`notifications.md`](./notifications.md) | Messaging, reminders & escalations as Flows + timing over the tx feed                                                                     | design depth  |
| [`api.md`](./api.md)                     | Type-safety over a dynamic schema — incl. JIT-compiling a per-account `HttpApi` from the registry                                         | stretch       |
| [`ai.md`](./ai.md)                       | Why is this an unusually good — and safe — AI substrate?                                                                                  | stretch       |
| [`config.md`](./config.md)               | Config-as-code for a whole account (Terraform-style `plan`/`apply`); account/form/workflow building as an agentic coding loop             | capstone      |
| [`dsl.md`](./dsl.md)                     | End-to-end demo: a staffing company (I-9/handbook/forklift-quiz/venue-disclosure) defined with the Effect DSLs — the spec for an e2e test | demo / e2e    |
| [`forma.md`](./forma.md)                 | A Lisp authoring surface that elaborates to one shared MetaCRDT DSL/IR, compiles to a Confect-shaped typed runtime, and lowers to Convex/Cloudflare/Node targets | authoring     |
| [`assessment.md`](./assessment.md)       | Holistic review against the current product: value, gaps, steelman/strawman, recommendation, and alternatives                             | assessment    |
| [`convergence.md`](./convergence.md)     | Can the log provably converge multi-replica? Verified research pass: G-Set/Merkle-CRDT/CALM theory, prior art to adopt, verification ladder | research      |

**Reading order:** [`triples.md`](./triples.md) → [`workflows.md`](./workflows.md) →
[`compliance.md`](./compliance.md) → [`library.md`](./library.md) → [`integrations.md`](./integrations.md) →
[`authorization.md`](./authorization.md) → [`performance.md`](./performance.md) →
[`privacy.md`](./privacy.md) → ([`experience.md`](./experience.md), [`documents.md`](./documents.md),
[`notifications.md`](./notifications.md)) → ([`api.md`](./api.md), [`ai.md`](./ai.md)) →
([`config.md`](./config.md), [`dsl.md`](./dsl.md)).

Roughly: the **substrate** ([`triples`](./triples.md)), then what it **unifies**
([`workflows`](./workflows.md), [`library`](./library.md), [`integrations`](./integrations.md)) — with
[`compliance`](./compliance.md) a **synthesis** showing how those compose into the compliance engine
end-to-end — then the **cross-cutting concerns** that make it real ([`authorization`](./authorization.md),
[`performance`](./performance.md), [`privacy`](./privacy.md)), then the **experience layer** that humans
touch ([`experience`](./experience.md), [`documents`](./documents.md), [`notifications`](./notifications.md)),
then **stretch** directions ([`api`](./api.md), [`ai`](./ai.md)), then the **authoring layer** —
config-as-code ([`config`](./config.md)) — and finally a concrete **end-to-end demo** ([`dsl`](./dsl.md)):
a staffing company defined with the Effect DSLs that exercises the whole set and is the spec for an e2e
test. Read [`assessment`](./assessment.md) when you want the cross-cutting critique: what the vision
buys, where it is under-proven, and how to decide whether the next slice is worth building.

**Cross-cutting, may get promoted:** ownership tiers & role-binding currently live in
[`workflows.md`](./workflows.md) §2.5 but are substrate-level. If a third consumer appears, lift them
into a standalone `vision/ownership.md` (not yet written).
