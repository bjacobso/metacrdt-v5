# Physics — three worlds, one substrate

MetaCRDT's generality claim is not that every product has the same UI. It is that
very different coordination worlds can share one substrate:

> a convergent graph of facts, constraints, intentions, and effects.

This document is the capstone for that claim. It compares three deliberately
different "physics" over the same engine:

- **Compliance datarooms** — regulated evidence collection and obligation
  tracking.
- **Small-group co-signing** — bounded groups making shared decisions under
  quorum.
- **Agent swarms** — human/agent systems where autonomous operators propose,
  review, and merge changes.

The point is not to ship all three now. The point is to keep the architecture
honest: a new world should be a blueprint and target choice, not a new database,
workflow engine, permissions model, and audit system.

Read with [SPEC.md](../SPEC.md), [architecture.md](./architecture.md), and
[metacrdt.md](./metacrdt.md).

---

## What "physics" means

A physics is the set of rules that makes a domain feel real:

- **Entities** — what exists.
- **Facts** — what can be asserted about those entities.
- **Rules** — what follows from those facts.
- **Intentions** — tasks, actions, proposals, obligations, and flow state.
- **Access** — who can read or write which facts.
- **Time** — how transaction time and valid time matter.
- **Merge policy** — which conflicts coexist, which resolve by `≺`, and which
  require coordination.
- **Runtime target** — centralized Convex, Durable Object group, local-first
  browser, or a hybrid.

In this repo, a physics is mostly config-as-code plus reusable feature packages:
schema-as-facts, Datalog/rules, forms, workflows, actions, read grants, and
runtime target bindings. The protocol does not change.

## Shared substrate

All three worlds use the same primitives.

| Primitive | Role |
| --- | --- |
| `factEvents` / `@metacrdt/core` events | immutable G-Set log |
| `≺` order | deterministic conflict resolution where a single value must win |
| bitemporal fold | current state and as-of reads |
| Datalog / derivation | obligations, permissions, views, conclusions |
| flows / actions | durable intentions and synchronous transitions |
| forms / collection | structured prompts that become facts |
| actor/provenance | human, agent, system, and migration authorship |
| read grants | attribute-level authorization as facts |
| version vectors | anti-entropy delta exchange across replicas |

Different physics choose different entities, rules, and target capabilities, but
they do not get a different source of truth.

---

## Physics 1: compliance datarooms

This is the current working elaboration.

**What exists**

- Worker, employer, client, venue, job, placement.
- Form submissions such as `w4`, `i9`, `forklift-cert`.
- Requirements derived from placement scope.
- Obligations/tasks derived from missing reusable evidence.
- Collection links and flow runs.
- PII attributes such as `i9/ssn`.

**What makes it feel like compliance**

- Valid time matters. A certificate can have been submitted in the past and still
  stop satisfying an obligation after its valid interval lapses.
- Evidence is reused by scope. An existing worker submission can satisfy a new
  placement if the form/scope rules allow it.
- PII is attribute-level. Reads can show "denied" for one field while showing the
  rest of the entity.
- Provenance is not optional. Every obligation and derived status needs an answer
  to "why is this required?" and "which evidence satisfied it?"

**Merge policy**

- Most facts are cardinality-many: submissions, requirements, placements, tasks.
- State facts such as `worker.status` are cardinality-one and resolve by `≺`.
- Deleting a requirement from config is a reconcile operation: retract/deactivate
  config-owned facts and derived obligations, not runtime data.

**Best target**

- **Convex** as system-of-record. Compliance needs centralized audit, durable
  history, reactive dashboards, and low operational risk more than offline-first
  edits.

**Where it exists today**

- `convex/appconfig.ts` staffing blueprint.
- `convex/compliance.ts`, `convex/forms.ts`, `convex/flows.ts`.
- `confect/compliance.*` dry-run planning sidecar.
- React pages under `src/pages`.

---

## Physics 2: small-group co-signing

This is the natural bounded distributed case: a handful of people, one shared
object, explicit membership, and a decision that needs quorum.

**What exists**

- Group/domain.
- Members and roles.
- Proposal.
- Signature/approval facts.
- Quorum policy.
- Decision/result.
- Revocation and expiry.

**What makes it feel like co-signing**

- Membership is evaluated at signature time, not just now.
- A proposal can gather signatures offline, then converge when peers reconnect.
- Quorum is derived, not hand-updated. "Approved" is the fold of signatures,
  membership, and policy.
- Revocation is a fact too. A signature can be retracted or invalidated with
  provenance.

**Merge policy**

- Signatures are cardinality-many facts.
- Proposal status can be a derived fact:
  `proposal.approved = true` when valid signatures satisfy quorum.
- Some operations are convergent: add signature, retract signature, add comment.
- Some are coordinated: claim a unique proposal number, spend a shared balance,
  or finalize a real-world irreversible action. Those require a coordinator
  capability, not pure peer merge.

**Best target**

- **Durable Object per group** plus local/browser replicas.
- The DO is the small coordinator and WebSocket fan-out point.
- Local/browser replicas can still author convergent facts and exchange deltas by
  version vector.

**Protocol shape**

SPEC §9.3 already names quorum/co-signing as a coordination profile. It does not
need a different event log. It needs:

- a membership ontology,
- a quorum rule,
- a target with `transport` and, for finalization, `coordinated-writes`,
- a generated view that explains which signatures counted and why.

---

## Physics 3: agent swarms

This is the largest proof of range: many autonomous operators acting in a shared
fact world while leaving evidence and causality behind.

**What exists**

- Human actors.
- Agent actors.
- Skills/capabilities.
- Observations.
- Proposals.
- Critiques/reviews.
- Accepted/rejected actions.
- Derived confidence, risk, and task state.

**What makes it feel like agents**

- Agents do not mutate hidden state. They emit facts and proposals under
  `actorType = "agent"`.
- A proposal is not the same as a committed action. It can be reviewed, amended,
  co-signed, or rejected.
- Explanations are ordinary provenance: the agent's inputs, cited facts, prompt
  context, tool results, and chosen action all become inspectable.
- Permissions are facts. "This agent may read SSNs" or "this agent may only
  propose, not apply" is represented and derived like any other grant.

**Merge policy**

- Observations and proposals are cardinality-many.
- Accepted action state may be cardinality-one and resolved by `≺`, or may
  require coordination depending on the domain.
- Agent conclusions should usually be derived or proposal facts, not silent
  replacement of human-authored truth.

**Best target**

- Hybrid:
  - Convex or another central system-of-record for durable audit and product UI.
  - Durable Object/session runtimes for bounded agent workrooms.
  - Local/browser replicas for interactive review and partial offline work.

**Protocol shape**

No special "AI database" is needed. The core requirements are stricter
provenance and clearer capability modeling:

- actor identity for agents,
- causal references to source facts/tool outputs,
- proposal vs accepted-action distinction,
- review/quorum rules,
- attribute-level read grants,
- replayable generated views.

---

## Comparison

| Axis | Compliance dataroom | Small-group co-signing | Agent swarm |
| --- | --- | --- | --- |
| Primary buyer/user | operations/compliance team | bounded group or DAO-like team | human operators supervising agents |
| Dominant objects | workers, placements, forms, obligations | proposals, signatures, policies | observations, proposals, actions |
| Time emphasis | valid-time expiry and audit | signature-time membership | causal replay and review |
| Access model | attribute-level PII grants | membership/role facts | capability grants per human/agent |
| Main derivation | required/missing/satisfied obligations | quorum reached / not reached | risk, recommendation, next action |
| Conflict model | mostly centralized, `≺` for state | convergent signatures + coordinated finalization | proposals coexist; accepted state may coordinate |
| Best target | Convex system-of-record | DO-per-group + local replicas | hybrid central + bounded agent sessions |
| Built status | working demo | designed profile | substrate-ready, UX ahead |

## Why this matters

Without MetaCRDT, these look like three products:

- a compliance SaaS,
- a co-signing app,
- an agent operations platform.

With MetaCRDT, they are three blueprints over the same runtime law:

1. append facts,
2. merge by G-Set union,
3. derive state by deterministic fold,
4. express intentions as flows/actions/proposals,
5. explain every conclusion by provenance.

That is the architectural payoff. The platform does not get more general by
making the UI abstract. It gets more general by making the substrate precise
enough that each domain can bring its own physics without bringing its own
database.

## Implementation implications

- `@metacrdt/core` remains the shared deterministic kernel.
- `@metacrdt/runtime` owns target-neutral services and anti-entropy shape.
- `@metacrdt/convex` remains the reference system-of-record target.
- `@metacrdt/cloudflare` should prove the small-group physics first: one Durable
  Object per bounded domain with WebSocket fan-out and version-vector deltas.
- `@metacrdt/agent` should start with proposal/capability facts, not autonomous
  mutation of arbitrary triples.
- The current datarooms app stays the commercial wedge; co-signing and agents are
  range proofs until the substrate work earns them.
