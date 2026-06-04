# Vision — Config as Code: An Account as a Declarative, Agent-Authorable Artifact

> Part of the `vision/` set — see [`README.md`](./README.md). The **capstone**: an authoring layer over
> everything the other docs turned into facts. Builds on [`triples.md`](./triples.md) (facts + the tx
> log as state), [`library.md`](./library.md) (versioning, overlays, the 3-way merge),
> [`workflows.md`](./workflows.md) (Flows), [`authorization.md`](./authorization.md) (grants),
> [`integrations.md`](./integrations.md) (the per-module schema manifest — already config-as-code),
> [`api.md`](./api.md) (the fact-AST as IR), and [`ai.md`](./ai.md) (propose/validate/preview/apply).

> **Convex update (decided — reframe):** the plan/apply model survives; `plan` (3-way diff) and `import`
> are read-only and fine. But **`apply` cannot be one atomic transaction** — a large account plan exceeds
> Convex mutation read/write/time limits. Make `apply` a **batched, resumable, scheduler-driven job** with
> an apply-status fact and per-batch progress; you lose all-or-nothing atomicity (compensate with the
> status fact / a rollback step). The TS DSL stays an authoring front-end that lowers to the fact-AST IR;
> the Effect runtime is replaced by Convex validators. See [`convex.md`](./convex.md) §5.

Treat **building an entire account** — its object types, fields, forms, workflows, policies, grants, and
integration bindings — as a **coding problem**: a declarative, version-controlled artifact that compiles
to changes against the store, with `plan`/`apply` semantics. Form-building and workflow-building stop
being bespoke UI flows and become _editing typed resources_ — which is exactly the shape an agent is good
at. This doc brainstorms the format and the pipeline.

> Status: **brainstorm.** Options surveyed (§3) with a recommendation; end-state and path kept separate.

---

## 0. The central realization

By the time the rest of the set lands, **an account's entire configuration is already facts**: entity
types + attributes (`triples.md`), forms as attribute projections and Flows as reactions
(`workflows.md`), policies, authorization grants (`authorization.md`), role bindings
(`compliance/subject` etc.), library adoptions + overlays (`library.md`), and integration schemas
(`integrations.md`, whose `defineIntegrationSchema` manifest is _already_ config-as-code for one module).

If the configuration is facts, then **"config as code" is just a declarative, VCS-friendly representation
of the desired facts that compiles to a transaction.** And the moment configuration is a typed artifact
with validation and a preview, _authoring it is a coding problem_ — editable by humans in an IDE, or by
an agent in a read → edit → validate → plan → apply loop.

---

## 1. The mental model: Terraform for an account

The analogy is exact, and it's worth leaning on because the semantics are well-understood:

| Terraform       | Here                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| provider        | the fact store (+ integration modules)                                                                                   |
| resource        | an entity type, attribute, form, Flow, policy, grant, role binding, integration binding                                  |
| **state file**  | **the store's current facts** — bitemporal, so _state history is intrinsic_; there is no separate, corruptible statefile |
| `plan`          | diff desired-config vs current facts — the `library.md` §4 3-way merge / the reconciler                                  |
| `apply`         | a single transaction (atomic, tagged as a version)                                                                       |
| module          | a library item — a reusable form/Flow/policy template (`library.md`)                                                     |
| drift detection | continuous `plan`: where has the store diverged from config?                                                             |
| `import`        | the reverse — generate config _from_ an existing account's facts                                                         |

Two of these are unusually clean here: **state is the store itself** (no statefile to manage, and `asOf`
gives you every past state for free), and **`plan` is a mechanism we already need** for library upgrades
and the reconciler — config `plan` is the same 3-way merge pointed at a whole account.

---

## 2. What's in an account config (the resource catalog)

Everything the other docs made into facts, now authored declaratively:

- **Schema** — entity types + their attributes (`valueType`, `required`, `cardinality`, REF targets).
- **Forms** — attribute projections: which attributes, sections, assignment, validation, localization.
- **Workflows** — Flows (trigger / guard / steps), i.e. today's policies _and_ automations
  (`workflows.md`).
- **Authorization** — roles + grants (rules over the fact graph, `authorization.md`).
- **Role bindings** — which types play `compliance/subject` / `compliance/principal` (`workflows.md`
  §2.5.1).
- **Library adoptions** — which platform items the account adopts, plus its **overlay** customizations
  (`library.md` §3).
- **Integration bindings** — which integrations are enabled and their config (credentials _referenced_,
  never inlined — §6).

---

## 3. Format options (the brainstorm)

The real question is the _authoring surface_. Five candidates, then a recommendation.

| Option                 | What it is                                                                   | Strengths                                                                                                                                 | Weaknesses                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **A. YAML/JSON**       | declarative data files (`forms.yaml`, `flows.yaml`)                          | simplest; human- _and_ LLM-friendly; trivially diffable; no eval runtime                                                                  | stringly-typed; no logic/reuse; weak validation until apply; ref-by-name fragility                        |
| **B. Typed TS DSL**    | `defineAccount(a => { a.type(…); a.form(…); a.flow(…) })` (CDK/Pulumi-style) | Effect `Schema` types + IDE + compile errors; composable; loops/conditionals/reuse; mirrors `integrations.md`'s `defineIntegrationSchema` | needs a runtime to evaluate; Turing-complete (less statically analyzable); less approachable for non-devs |
| **C. Lisp/EDN**        | homoiconic config (Open Ontology's precedent)                                | macros / code-as-data; powerful templating                                                                                                | niche; learning curve; tooling                                                                            |
| **D. HCL-like DSL**    | a purpose-built config language                                              | native `plan`/`apply`/modules feel                                                                                                        | you build and maintain a language                                                                         |
| **E. Fact-AST (JSON)** | the desired-facts document directly                                          | the canonical lowering target; what agents + the JIT API already speak                                                                    | not meant for humans to hand-author                                                                       |

**Recommendation: one IR, many front-ends.** Make the **fact-AST (E) the canonical intermediate
representation** — the thing `plan`/`apply` operate on, the thing the JIT API (`api.md`) and an agent
emit. Then offer **a typed TS DSL (B) as the primary authoring layer** (it lowers to the fact-AST), with
**YAML (A) as an optional lighter surface** for simple cases. This mirrors the whole vision — _queries are
data, definitions are data_ — so config is just the authored form of definition-facts, and the authoring
_syntax_ is a front-end choice, not an architectural one.

Crucially, **the dashboard UI becomes a third front-end over the same IR.** A form built in the UI emits
the same fact-AST as a form written in the DSL. If the UI and the code are not two views of one IR, they
_will_ diverge — so this is a constraint, not a nicety (§6).

---

## 4. The pipeline: compile → validate → plan → apply

```
authoring surface (TS DSL | YAML | UI | agent)
        │  compile / lower
        ▼
   fact-AST IR  ──validate──▶  (registry + the Phase 2 validator: unknown attr, type mismatch, did-you-mean)
        │
        ├── plan  ── diff desired-facts vs current store facts (3-way merge w/ overlays) ──▶  a reviewable diff
        │
        └── apply ── one transaction, tagged as a version ──▶  bitemporal state (revert available)
```

- **`plan` is a dry run.** It shows adds / changes / removed / conflicts before anything is written —
  the same merge-preview as `library.md` §4, scoped to a whole account.
- **`apply` is one transaction.** Atomic, tagged (a version, `library.md` §2), revertable (`PLAN.md`
  §25). A bad account change rolls back like a bad migration.
- **Drift detection = continuous `plan`** against the live store.
- **`import` = facts → config** (the reverse compiler) — invaluable on day one for backup, account
  cloning, audit, and giving an agent the _current_ state to edit.
- **Dependency ordering.** A plan creates a type before an attribute before a form that references it —
  a resource dependency graph, exactly like Terraform.

---

## 5. Account-building as an agentic coding problem (the heart of it)

Config-as-code turns account/form/workflow building into the loop agents are _best_ at — because every
property a good coding agent relies on is present:

- **The artifact is code/text** → an agent reads and edits it directly (the DSL or YAML), or emits the
  fact-AST.
- **A type-checker and validator give a tight feedback loop** → the registry + Phase 2 validator are the
  agent's "compile errors": unknown attribute, type mismatch, did-you-mean. The agent iterates against
  them like a type-checker or failing test.
- **`plan` is a dry-run/preview** → the agent (and a human reviewer) see the exact diff _before_ apply.
  No blind mutation.
- **Bitemporal state + tags + `revert`** → safe experimentation and one-step rollback; the agent can try,
  inspect, and undo.
- **The loop is literally an agentic coding loop:**
  `import` current config → propose edits → validate → `plan` → **human review** → `apply` — i.e.
  _read → edit → typecheck → diff → PR → merge._

So **form building** = an agent writing/editing a `form` resource, checked by the validator and rendered
by the preview. **Workflow building** = editing `flow` resources through the same loop. This is the `ai.md`
contract made operational: _the agent proposes (edits to config); the validator, `plan`/preview,
authorization, and human-apply dispose._ The agent never mutates the store directly — it edits config and
runs `plan`.

A natural product surface falls out: **"describe the account you want" → agent drafts the config →
`plan` shows what it'll build → you review and `apply`.** Onboarding a new customer becomes generating and
reviewing a config, not clicking through dozens of screens.

---

## 6. Honest trade-offs & sharp edges

- **Source-of-truth & drift (the classic Terraform problem).** If config lives in VCS _and_ the store is
  editable via the UI, they drift. Three stances: **(a) config-is-truth** (UI edits are drift to
  reconcile away — clean, but the UI becomes read-mostly); **(b) store-is-truth** (config is a generated
  snapshot — loses the VCS-authoring win); **(c) hybrid via overlays** (config manages the _base_; UI
  edits become account **overlay facts**, `library.md` §3, that survive re-apply). (c) is the most
  promising and reuses machinery we already have — but it's the central decision.
- **The UI and the code must be one IR.** If "build a form in the UI" and "write a form in the DSL" don't
  both lower to the same fact-AST, you've built two diverging systems. The UI must be _a front-end over
  the IR_, round-tripping through `import`/`apply` — non-negotiable, and not free.
- **Resource addressing.** Config refers to resources by stable logical names; the store keys on entity
  uids. You need a durable name→uid mapping (Terraform's resource addresses / state bindings), or renames
  and re-applies create duplicates.
- **Expressiveness vs. analyzability.** A TS DSL is powerful but Turing-complete — a config that runs
  arbitrary code is hard to reason about, diff, and trust from an agent. Mitigate by having the DSL
  _produce data_ (the fact-AST) with no side effects, so the analyzable artifact is always the lowered IR,
  not the program.
- **Non-technical authors.** Code-as-config alienates admins who aren't developers — which is _why_ the
  UI-as-front-end-over-the-IR (above) matters: same IR, different surface.
- **Secrets.** Integration credentials must be _referenced_, never inlined in VCS config (Terraform's
  lesson) — they live in the credential store (`integrations.md`), config holds a handle.
- **Partial failure & big plans.** Atomic apply is good, but a large account plan needs ordering and may
  warrant staged applies; surface the dependency graph.

---

## 7. Tactical path (conservative)

- **Stage C0 — `import` (read-only, useful immediately).** Build the facts→config reverse compiler. Zero
  risk, and instantly valuable: account backup, cloning, audit, and the substrate for agent editing.
- **Stage C1 — `plan` (dry run).** Diff a config against the live account; render adds/changes/conflicts.
  Still writes nothing.
- **Stage C2 — `apply` for one resource kind.** Start with **Flows** (most code-like, lowest UI-coupling);
  `apply` behind a flag; dual-check against the existing authoring path.
- **Stage C3 — The TS DSL front-end** lowering to the fact-AST; YAML as the lighter surface.
- **Stage C4 — The agentic loop**: `import → edit → validate → plan → review → apply`, with the LLM
  authoring config and a human gating apply (`ai.md`).
- **Stage C5 — UI as a front-end over the IR**, resolving the source-of-truth stance (§6) via overlays.

---

## Decisions (resolved)

- ✅ **An account config is declarative desired-state facts**; `apply` is a transaction; `plan` is the
  3-way merge; state is the bitemporal store (no statefile). (§1, §4)
- ✅ **One IR (the fact-AST), many front-ends** — TS DSL primary, YAML lighter, UI as a front-end, agent
  as an emitter; the DSL produces data, not side effects. (§3)
- ✅ **Account/form/workflow building is an agentic coding loop** — validator as type-checker, `plan` as
  preview, `revert` as undo; the agent edits config and runs `plan`, never mutates the store. (§5)
- ✅ **Credentials are referenced, never inlined.** (§6)

## Open (non-blocking)

- ❓ **Source-of-truth stance** — config-is-truth vs. store-is-truth vs. hybrid-overlay (§6). The biggest
  decision; leaning hybrid-overlay.
- ❓ **Primary front-end** — TS DSL vs. YAML vs. both from day one.
- ❓ **Resource addressing** — the durable logical-name→uid scheme for renames and re-applies.
- ❓ **UI ↔ IR round-trip** — how the dashboard becomes a front-end over the fact-AST without a second
  divergent model.
- ❓ **Module ecosystem** — are shared config modules the same thing as `library.md` items, or a layer
  above them?

---

## Appendix — Example account config (YAML)

The YAML front-end (§3, option A) for a small staffing account. It lowers to the fact-AST IR; the TS DSL
would express the same thing with types and reuse. Split across files for readability — `plan` treats
them as one desired-state document.

```
account/
  account.yaml          # account meta · role bindings · integrations · library adoptions
  types/
    employer.yaml
    employee.yaml
    placement.yaml      # references a custom `worksite` type (types/worksite.yaml omitted)
  forms/
    i9.yaml
  flows/
    require-i9.yaml      # a policy, expressed as a Flow
    everify-on-i9.yaml  # an automation, expressed as a Flow
  grants/
    recruiter.yaml
```

**`account.yaml`** — meta, the role bindings that let intrinsic compliance run over _customer-defined_
types (`workflows.md` §2.5.1), integrations (secrets referenced, never inlined — §6), and a
library adoption with an overlay (`library.md` §3):

```yaml
account: acme-staffing
schemaVersion: "3" # a version tag (library.md §2)

roles: # which of THIS account's types play the intrinsic roles
  subject: placement #   obligations attach here
  principal: employee #   reuse keys on this; forms are "about" it
  principal-ref: placement/employee # exactly-one (cardinality enforced)

integrations:
  everify: { enabled: true, credential: ref:secrets/everify }
  bullhorn: { enabled: true, credential: ref:secrets/bullhorn }

library:
  adopt:
    - item: platform/forms/i9 # adopt by reference, not clone
      version: "2.1.0"
      overlay: forms/i9.overlay.yaml # attribute-grained customizations that survive upgrades
```

**`types/placement.yaml`** and **`types/employee.yaml`** — entity setup: namespaced attributes with
value types, REF targets, `required`, and attribute-level `sensitive` (gated by `authorization.md`):

```yaml
# types/placement.yaml
type: placement
label: Placement
attributes:
  - { ident: employer, valueType: REF, refType: employer, required: true }
  - { ident: employee, valueType: REF, refType: employee, required: true }
  - { ident: worksite, valueType: REF, refType: worksite } # custom type
  - { ident: startDate, valueType: DATE, required: true }
  - { ident: state, valueType: STRING }
  - { ident: status, valueType: STRING, default: pending }
```

```yaml
# types/employee.yaml
type: employee
label: Employee
attributes:
  - { ident: firstName, valueType: STRING, required: true }
  - { ident: lastName, valueType: STRING, required: true }
  - { ident: email, valueType: STRING }
  - { ident: workAuthorization, valueType: STRING }
  - { ident: ssn, valueType: STRING, sensitive: true } # invisible without an explicit grant
  - { ident: dob, valueType: DATE, sensitive: true }
```

**`forms/i9.yaml`** — a form is an attribute _projection_: which attributes, in which sections, filled by
which assignee. `scopesOn` declares the reuse dimensions that drive the generated reuse query
(`workflows.md` §6–§7):

```yaml
form: i9
label: Form I-9
about: employee # the principal the form collects about
scopesOn: [placement/employer] # a completed I-9 is reusable across placements w/ the same employer
sections:
  - title: Employee
    assignee: principal # the employee fills this section
    fields:
      - employee/firstName
      - employee/lastName
      - { attr: employee/ssn, required: true }
  - title: Employer
    assignee: role:hr # HR fills this section, about the employee
    fields:
      - { attr: employee/workAuthorization, required: true }
```

**`flows/require-i9.yaml`** — a **policy as a Flow**. Trigger = a pattern over the tx feed; guard = the
shared `Rule` AST; the obligation is an `assert` of a `requires-form` fact, _not_ a bespoke `require`
step (`workflows.md` §2). Materialization (reuse-or-collect) is the system reconciler — not configured
here:

```yaml
flow: require-i9
description: I-9 is required for every placement in a covered work state.
on:
  entityType: placement
  event: created # also re-evaluates when a guarded attribute changes
when:
  all:
    - { fact: placement/state, operator: in, value: [CA, CO, NY, TX] }
do:
  - assert:
      subject: $trigger.subject # the placement
      attr: requires-form
      value: form:i9
```

**`flows/everify-on-i9.yaml`** — an **automation as a Flow**: call the E-Verify integration when an I-9
completes, `wait` for the webhook result on the tx feed (the `await` continuation, `workflows.md` §2),
then branch:

```yaml
flow: everify-on-i9-complete
description: When an I-9 completes, open an E-Verify case and notify the employee on the result.
on:
  entityType: task
  event: attr-changed
  attrs: [task/status]
when:
  all:
    - { fact: task/form, operator: equal, value: i9 }
    - { fact: task/status, operator: equal, value: completed }
do:
  - http: # integrations.md — inline integration call
      action: everify/openCase
      with: { principal: $trigger.principal }
      as: case
  - wait: # await the webhook fact, not a thread block
      onFacts:
        subject: $case.entity
        attr: everify/case/status
        anyOf: [employment_authorized, tentative_nonconfirmation]
      as: settled
  - branch:
      when:
        {
          fact: $settled.value,
          operator: equal,
          value: tentative_nonconfirmation,
        }
      then:
        - notify: { template: tnc-next-steps, to: principal }
      else:
        - notify: { template: i9-complete, to: principal }
```

**`grants/recruiter.yaml`** — authorization as a rule over the fact graph; sensitive attributes omitted →
invisible by default (`authorization.md` §2–§3):

```yaml
role: recruiter
grants:
  - read: [employee/firstName, employee/lastName, employee/email, "placement/*"]
    where: # graph reachability: employees who are on a placement
      all:
        - { subject: "?p", type: placement }
        - { subject: "?p", attr: placement/employee, value: "?e" }
    # employee/ssn and employee/dob are NOT listed → not readable by recruiters
```

**Running `plan`** against an account that doesn't yet have the I-9 Flow or the `sensitive` flag on `ssn`
might print:

```
plan: acme-staffing  (schema v3, 1 transaction)

  + type        worksite                         (new)
  + attribute   employee/workAuthorization       (new, required)
  ~ attribute   employee/ssn                     sensitive: false → true
  + form        i9                               (new, scopesOn: [placement/employer])
  + flow        require-i9                        (new)
  + flow        everify-on-i9-complete            (new)
  ~ grant       recruiter                         + read employee/email
  ↑ library     platform/forms/i9  2.0.0 → 2.1.0  (3 auto, 2 overlay preserved, 1 conflict → review)

8 to add, 3 to change, 0 to destroy.  1 conflict needs review before apply.
```

The conflict line is the `library.md` §4 3-way merge surfacing where the account's I-9 overlay collides
with the upstream upgrade — exactly the preview an agent (or a human) reviews before `apply`.
