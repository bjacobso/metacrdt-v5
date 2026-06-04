# Vision — Unifying Forms, Policies & Automations on the Triple Store

> Part of the `vision/` set — see [`README.md`](./README.md) for the map. Builds on the substrate in
> [`triples.md`](./triples.md); companion: [`integrations.md`](./integrations.md). Grounded in
> `../PLAN.md` (the triple-store PoC).

> **Convex update (decided — reframe + sequencing):** (1) **Event bus** — "a Flow fires when a fact lands"
> is **not** free from Convex reactivity (that's a client-read feature); server reactions run off the
> append-only `factEvents` log + the **scheduler/materialization** path we built. (2) **Reconciler must
> batch** — a single mutation can't sweep all obligations (transaction limits); fan out one scheduled job
> per `(subject, form)` / small page. (3) **No native Flow DAG runner** — build the **compliance
> reconciler** first as a scheduler-driven state machine (`wait` = a parked doc resumed by cron, external
> calls in actions); defer the general step graph or adopt the Convex **Workflow component**; accept async
> (scheduler-latency) obligation production over the synchronous inline fast-path. (4) **Reuse-as-query**
> works against our Datalog engine, but restrict reuse scope dimensions to a **finite declared set per
> form** (indexed equality), and back the hot progress view with a **projection table**, not a GIN `@>`
> index. Obligations-as-facts, dedup, provenance, and forms-as-attribute-projections map as-is. See
> [`convex.md`](./convex.md) §4.

A companion to `PLAN.md`. Where `PLAN.md` specifies the triple-store proof-of-concept,
this document answers a larger question: **once our core entities live in a configurable
fact store, can policies, automations, and forms collapse into a single, elegant abstraction
— and how do we get there without destabilizing the application?**

> **Cross-cutting note.** §2.5 (Ownership tiers & role-binding) is referenced by the other vision
> docs and is really substrate-level, not workflow-specific. If the set grows, promote it to its own
> `vision/ownership.md`.

> Status: **vision + brainstorm.** Not a build spec. The end-state (§3) is deliberately
> ambitious; the migration path (§4) is deliberately conservative. The two are kept separate
> on purpose — mirroring `PLAN.md`'s "build now vs. keep the door open" discipline.

---

## 0. The central realization

These three systems are **already ~70% converged in the codebase.** This is not a greenfield
unification — it is finishing a merge that is already underway.

- **Policies and automations already share one rule engine.** Both evaluate the same `Rule` AST
  (`packages/domain/src/shared/schemas/Rule.ts` — recursive `all`/`any`/`condition` with a shared
  operator set) through the same evaluator (`execute()` in `apps/web/app/lib/conditions.ts`).
- **Automations already do what policies do.** The automation engine has action types
  `create_suggested_task`, `create_task`, and `assign_task`
  (`packages/domain/src/internal/resources/AutomationsApi.ts`). Producing a compliance obligation
  (a policy's entire job) and instantiating a form are _already automation actions_.
- **Forms already store data as EAV.** `FieldTemplate.path` (e.g. `"personal.first_name"`) reduced
  into a `facts` object via lodash `set()` (`apps/web/app/models/Onboarding.server.ts`) is a
  triple in all but name. `Placement.facts` (Json) and `Task.data` (Json) are pre-existing,
  denormalized attribute→value bags.

So the customer intuition — "they're all flavors of workflow" — is correct, with one refinement:

> **Policies and automations are the _same reactive primitive_. A form is not a workflow at all —
> it is the _schema-and-capture primitive_ that the reactive primitive operates through.**

---

## 1. What each system actually is

Strip the table names and every one is a slice of a single loop:
**facts change → something reacts → it reads or writes more facts (sometimes by asking a human).**

| System         | Trigger (When)                                                                 | Guard (If)                                                               | Effect (Then)                                                                                                                 | Versioned                           | Engine      |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------- |
| **Policy**     | placement created/updated — _synchronous_, at compliance-eval time             | `Rule` AST over placement facts                                          | ensure required forms exist (`SuggestedTask` + `PlacementReqSource`)                                                          | no                                  | `execute()` |
| **Automation** | any entity `.created`/`.updated` — _async_, via `broadcastEvent` → NATS/BullMQ | `Rule` AST over entity facts (+ compiled `evaluationRules` early filter) | DAG of `branch`/`wait`/`action` (email, http, **create_task**, **create_suggested_task**, assign…)                            | yes (draft/published `AutoVersion`) | `execute()` |
| **Form**       | — (_invoked by_ the above)                                                     | per-`FieldTemplate` `rule`                                               | captures typed facts from an actor; stored as `data` JSON merged by `path`; audited via `SubtaskSubmission`/`FieldSubmission` | yes (`TaskLineage` → `TaskVersion`) | —           |

Read top to bottom:

- A **policy is a degenerate automation** — fixed trigger (`placement.*`), same guard engine, a single
  effect the automation engine _already supports_ (`create_suggested_task`). It is a synchronous,
  non-versioned special case of the general engine.
- An **automation is the general reactive primitive** already.
- A **form is the data-capture step** plus a **schema fragment**. Its field definitions are attribute
  definitions; its submissions are fact assertions with provenance.

---

## 2. The unifying frame: three layers, one substrate

The triple store has exactly three layers, and each system belongs to one of them. That alignment is
the whole argument.

```
┌─ SCHEMA layer ──────────────────────────────────────────────┐
│  EntityType + Attribute registry  (PLAN.md §1)               │
│  → A FORM is a *projection*: an ordered, sectioned,          │
│    presentation-decorated SELECTION of a type's attributes,  │
│    plus who fills which section, plus validation.            │
│    (FieldTemplate → Attribute.  Form ≈ a "view" over a type.)│
├─ FACT layer ────────────────────────────────────────────────┤
│  Triple + TripleTransaction, bitemporal  (PLAN.md §1, §13)   │
│  → A FORM SUBMISSION is a *transaction* asserting those      │
│    attributes' facts on a subject, with provenance           │
│    (actor / IP / source) in tx.meta.                         │
│    The SubtaskSubmission/FieldSubmission audit trail is      │
│    then *free* — it is just bitemporal triples + tx metadata.│
├─ REACTION layer ────────────────────────────────────────────┤
│  Flow  — the one reactive primitive  (Policy ∪ Automation)   │
│     on:   Trigger    — a pattern over the transaction feed   │
│     when: Rule       — the existing all/any/condition AST    │
│     do:   Step graph  — branch | wait | assert | notify |    │
│                         http | collect(form) | require(form) │
└──────────────────────────────────────────────────────────────┘
        ▲ the TRANSACTION LOG is the spine. Every fact write
          emits a tx; Flows subscribe to tx patterns. Data
          changes and the reactions to them speak ONE language.
```

**The linchpin: the transaction log becomes the event bus.** `PLAN.md` Phase 3 already lists
"change feed / subscriptions (tx log → webhooks)" as a future direction. That is the keystone of this
whole vision. Today `broadcastEvent.server.ts` emits bespoke `task.created` / `placement.updated`
events into NATS/BullMQ. In the unified world, _every_ `assertFact` / `retractFact` lands in
`TripleTransaction`, and a Flow's trigger is simply a **standing query over that feed**:
"fire when a fact `(any placement, placement/status, *)` is asserted." Policy's
"placement created/updated" and automation's "entity `.updated` with dependency X" become the _same
kind of subscription_ — they differ only in the pattern, not the mechanism.

### The unified primitive — `Flow`

```ts
Flow {
  on:   Trigger          // { entityType, event, attrs?, guard?, rerun? } — see §8.1
  when: Rule             // the SHARED all/any/condition AST — unchanged
  do:   Step[]           // outlet-linked graph: today's Auto*Node model, complete set below
}

Step =                                                    // every current automation action maps here:
  | { branch: Rule, truthy: ref, falsy: ref }            // = AutoCondition
  | { wait: { baseline, offset, recalc? } | { onFacts } } // = AutoTiming (+ fact-arrival "await")
  | { notify: { template, to, fields? } }                 // = send_email
  | { http: { method, url, headers?, params?, body? } }   // = http_request
  | { collect: { form, assignee, subject, await? } }      // = create_task (the data-collection step)
  | { assignWork: { task, to } }                          // = assign_task (assign existing work)
  | { issueLink: { kind, assignee, locale, otp?, … } }    // = create_onboarding_link
  | { setExpiry: { task, strategy, … } }                  // = set_task_expiration
  | { assert: { subject, attr, value } }                  // write a fact — also expresses "obligations"
```

The complete, implementation-ready IR — trigger, every step's params, the facts/templating model,
versioning, and execution semantics — is **§8**, with a coverage matrix (§8.6) proving every current
policy and automation ability maps. The two genuinely _new_ steps are `collect` and `assert`; the rest
are today's `AutoAction` types, named.

> **Obligations are facts, not a step.** An earlier draft had a separate `require` step
> (= `create_suggested_task`). It is redundant: a requirement is just a fact —
> `assert (placement, requires-form, formX)` — with the asserting **transaction as its provenance**.
> Two policies requiring the same form dedup naturally (same `(s,a,v)`); both transactions are
> retained as the audit trail. Withdrawal is **retraction** (bitemporal history for free). Dedup +
> provenance + withdrawal are exactly what `SuggestedTask` + `PlacementReqSource` give today —
> here they fall out of the substrate. Materialization (turning a `requires-form` fact into a real
> Task, with reuse) is a **standing reconciler Flow**, not a step (see §6). And "collect and block"
> vs. "collect async" is not two steps either — it is the `await?` flag / a `wait: { onFacts }`
> continuation that fires when the resulting facts arrive on the tx feed. So the only genuinely new
> step is `collect`; `require` was `assert` wearing a costume.

- **Policy** ⟶ `Flow { on: {entityType: placement, event: created|attr-changed}, when: <its rules>, do: [{ assert: requires-form }] }`.
  Needs nothing new — the obligation is a fact; a reconciler Flow materializes it (§6).
- **Automation** ⟶ already _is_ this shape; rename and absorb policy.
- **Form** ⟶ stays a first-class **schema** object referenced by `collect` / `require` steps. Its
  definition (sections, fields, assignees, validation) becomes attribute-group metadata in the
  registry. `PLAN.md` Phase 3's meta-circular definitions let the form _definition itself_ be facts.

### Why this is genuinely elegant (not merely tidy)

1. **It ratifies convergence that already exists** rather than inventing a paradigm — shared
   `execute()`, shared `Rule` AST, automations already creating suggested-tasks/tasks. We delete a
   special case; we do not add an abstraction.
2. **Bitemporality subsumes three separate versioning/audit mechanisms** — `TaskVersion`/`AutoVersion`
   (template versioning), `SubtaskSubmission`/`FieldSubmission` (submission audit), and
   `PlacementProgressSnapshot` (progress audit) all become "query the tx log at `asOf`."
3. **`PlacementReqSource` ("why was this form required?") becomes free provenance** — the requiring
   Flow's transaction is the causal link; `AutoTriggerEvent` already records this for automations.
4. **Two customer-facing concepts instead of three.** Today: learn Policies _and_ Automations _and_
   Forms. Tomorrow: "**Forms** are what you collect. **Flows** are what happens when facts change."

---

## 2.5 Ownership tiers — what's intrinsic vs. customer-defined

Everything in the store is a fact (§2). Facts differ only by **who owns them** and **whether the engine
has privileged interpretation of them**. PLAN.md already carries the hooks: `isSystem` on
`EntityType`/`TripleAttribute`, the reserved `<namespace>/<ident>` convention, and the Phase 3
meta-circular bootstrap. Three tiers:

| Tier                            | Examples                                                                                                                                                                                                                    | Owned by                          | Customer can…                       | Engine interprets?       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------- | ------------------------ |
| **1. Kernel / primordial**      | `meta/type`, `meta/attribute`, `attribute/valueType`; `entity/uid`, `fact/validFrom`, `tx/at`; the Flow step kinds (`collect`/`assert`/`branch`/`wait`); the reuse _mechanism_ (containment match); bitemporal/tx semantics | System, immutable                 | nothing — it's the substrate        | yes, hardcoded           |
| **2. System process machinery** | `task`, `form` types; `requires-form`, `satisfied-by`, `task/lineage`, `task/status`, `task/scope/*`; the `materialize-obligations` reconciler Flow                                                                         | System (`isSystem: true`), seeded | add facts, **not redefine meaning** | yes, privileged contract |
| **3. Customer / userland**      | custom object types; custom attributes on any type; forms (fields/dims); Flows (triggers + Rules + steps); reuse scope dimensions                                                                                           | Customer (`isSystem: false`)      | define freely                       | no — opaque data         |

**The line that matters — one test:** _does built-in machinery need to interpret this attribute's
meaning?_ If yes (the progress projection reads `task/status`; the reconciler reads `requires-form`),
it is a **reserved system contract** (Tier 1/2) in a reserved namespace — customers add facts but
cannot redefine its meaning, like a keyword. If no, it is opaque userland data (Tier 3). The elegance
(Datomic-style): even reserved attributes are _stored as facts_, so the schema browser is "just a
query" — they are merely bootstrap-seeded, `isSystem`, and semantically privileged.

**Where our specced concepts land:** the reuse _mechanism_ is intrinsic (Tier 1); the reuse
_dimensions_ (the **requirement's** `scopes-on` facts — the subject↔form binding, not the abstract form)
are customer config (Tier 3); `requires-form`/`satisfied-by`/
`task/scope/*` are intrinsic system attributes (Tier 2); the reconciler is a system Flow (Tier 2) —
forkable in principle (the §6.3 escape hatch), but almost nobody will. A custom field can live _inside_
a system type's namespace (`placement/myField`, `isSystem: false`): namespace ownership is at the
**type** level, individual attributes within it can be system or custom.

### 2.5.1 Can employer / employee / placement be customer-defined? (Roles, not types)

The tempting worry: the compliance machinery (reuse, the reconciler, progress) seems to "know about"
placement and employee — so they look stuck in Tier 2. **They aren't, and §7 already proves it:**
`scopeDims(F)` is _queried from the requirement's `scopes-on` facts_ (§7.2) — the engine never hardcodes
"employer/client/jobType." The party types are already opaque to reuse.

What the machinery _actually_ needs is not specific types but a thin vocabulary of **roles** that
customer types **bind to** via reserved facts:

- **`compliance/subject`** — the entity obligations attach to. Today: `placement`.
- **`compliance/principal`** — the entity reuse keys on and forms are _about_ (the "same employee +
  same lineage" key). Today: `employee`.
- **`compliance/principal-ref`** — the attribute on the subject that points at the principal. Today:
  `placement/employee`.

> **Not a role: the assignee.** "Who _fills_ a form" is a third, distinct concept — often the employer
> filling a form _about_ the employee — and it is deliberately **per-`collect`-step config (§2)**, not
> a global role. This is why the role above is `principal` ("the party the work concerns"), not
> "worker" (too domain-specific) or "actor" (which reads as the filler/assignee and would conflate the
> two).

A customer then defines `placement` and `employee` as **their own Tier-3 types**, and binds:

```jsonc
(placementType, plays-role, "compliance/subject")               // system fact, isSystem
(employeeType,  plays-role, "compliance/principal")
(placement/employee, plays-role, "compliance/principal-ref")    // exactly-one cardinality required
```

Now the intrinsic reconciler and reuse query are written against _roles_: "attach obligations to the
`subject`; key reuse on the `principal` reached via `principal-ref`, plus the requirement's `scopes-on` dims."
A customer with `contractor` instead of `employee`, or `worksite`/`contract` instead of `placement`,
just binds their types to the same roles. **Employer, client, jobType need no role at all** — they are
merely entities referenced by subject attributes that forms scope on (already Tier-3 config). So the
reserved role vocabulary is **2–3 markers**, not a type hierarchy.

### 2.5.2 Why this is _not_ "full homoiconic"

The distinction is exact and worth holding onto:

- **Full homoiconic (rejected):** the _semantics themselves_ — what "obligation" means, what the
  reconciler does — become runtime-configurable. The engine must interpret runtime-defined meaning;
  slow, and a footgun.
- **Role-binding (this proposal):** the semantics stay fixed and intrinsic. There is still exactly
  **one** notion of obligation / reuse / materialization. Only the _binding of customer types to fixed
  roles_ is configurable. Customers choose **which of their nouns plays the subject**; they cannot
  change **what being the subject means.**

This is the standard extensible-platform move — program against an interface, let customers supply the
implementation (cf. Salesforce activity polymorphism, Shopify metaobjects). It cleanly splits:

> **Business nouns** (the parties and the thing being onboarded) → **customer-defined + role-bound.** > **Process machinery** (obligation, form, task, reuse, audit, tx) → **intrinsic.**

That split is also the right product line: the process machinery _is the product_ (same for everyone);
the nouns differ per customer. And it operationalizes the PLAN.md §8 north star — it is precisely _how_
the compliance engine keeps working once the domain types become configurable.

**Sharp edges to honor (role contracts, not free-for-all):**

- **Cardinality is part of the contract.** Reuse assumes exactly-one `principal` per `subject`. A
  subject type with zero/many principals breaks the reuse key — so the role binding must _enforce_
  `principal-ref` cardinality, not just suggest it.
- **`task` and `form` stay intrinsic types, not role-bound.** They are the materialized
  work-item/projection wired into the reconciler, progress, and UI. The line is "parties are
  role-bound; the process objects are fixed."
- **Binding validation.** Exactly one type per role per account (or per Flow); consistent ref kinds;
  reject a type bound to conflicting roles.

---

## 3. End-state vision (ambitious — the north star)

> This section is intentionally unconstrained by migration friction. It describes the most elegant
> end-state to steer by, not a thing to ship next quarter.

- **One reactive engine.** The policy executor (`getTaskTemplatesForPlacement`) no longer exists as a
  separate path. Every reaction — compliance obligations, expirations, re-verifications, emails,
  webhooks, task assignment — is a `Flow` running on one engine, authored in one builder, versioned
  and queryable through the transaction log.
- **Forms are views over the schema.** A form is a saved projection of a type's attributes with
  layout, assignment, and validation. Adding a field to a form is adding (or surfacing) an attribute —
  no bespoke `FieldTemplate` tree, no migration. Localization, repeatable groups, and quizzes are
  presentation metadata on attribute groups.
- **Everything is facts, including definitions** (`PLAN.md` §23). Types, attributes, forms, and Flows
  are themselves entities-of-facts. The schema browser is _just a query_. A Flow definition is data; a
  visual builder, an EDN/text syntax, or an LLM can all target the same AST.
- **Full bitemporality** (`PLAN.md` §24). "What forms were required for this placement _as we believed
  last month_?" and "what did this employee's record look like at hire date?" are the same `asOf`
  query. Corrections are backdated transactions; nothing is destroyed.
- **One provenance graph.** Every fact traces to the transaction that asserted it; every transaction
  traces to the Flow (and trigger) that caused it; every Flow traces to the facts that fired it. Audit,
  compliance, and "why did this happen?" become graph traversals, not bespoke join tables.
- **Customer-configurable everything.** A customer defines their own object types, their own forms
  over them, and their own Flows reacting to them — the Salesforce/Attio/Airtable end-state from
  `PLAN.md`'s north star, with workflows folded in.

---

## 4. Tactical migration path (conservative — don't blow up the app)

> This section is intentionally constrained. Every step is flag-gated and shadow-validated. **At no
> point does the application depend on a half-migrated store.** Existing tables stay system-of-record
> until a projection provably replaces them. Steps are ordered lowest-risk first.

**Stage 0 — Probe (the current `PLAN.md` PR).** Triple store + transaction log + `asOf` at `/triples`.
No real data. _Already planned._

**Stage 1 — Collapse policy into the automation engine (app-layer only, ZERO storage change).**
This is the highest-leverage, lowest-risk step, and it needs no triple store at all.

- Build a `policyToFlow()` adapter: policies already share `execute()`; automations already have
  `create_suggested_task`. Re-express policy evaluation as Flows on the _existing_ automation executor.
- Run it in **shadow mode** behind a flag: for each placement create/update, compute the
  `SuggestedTask`/`PlacementReqSource` set both ways (today's `getTaskTemplatesForPlacement` and the
  Flow path) and diff them. Log mismatches; ship nothing user-visible.
- When the diff is clean for a representative window, flip the flag. The DB schema is untouched — we
  have proven policies _are_ automations.

**Stage 2 — Unify the event surface.** Route `broadcastEvent` and (later) `TripleTransaction` writes
through one feed shape so triggers are expressed in one vocabulary. Still no data migration — we are
standardizing the trigger language, not moving storage.

**Stage 3 — Custom fields → triples (the `PLAN.md` §8 step-2 bridge).** `CustomProperty`/`CustomValue`
and the JSON `facts`/`data` blobs are our pre-existing EAV. Migrate **custom fields only**, keyed off
**native record ids** (this resolves the open question in `PLAN.md` §949: for the bridge phase, key off
native ids, not a generic `TripleEntity`). High value, zero hot-path risk. Forms that capture custom
fields now write triples via a transaction; `FieldTemplate.path` becomes the attribute name.

**Stage 4 — One form, end-to-end, as attribute-schema.** Pick one low-traffic form. Model its fields as
registry attributes; submissions write triples; render from a denormalized projection. Dual-read against
`FieldSubmission` and compare. This proves "Form = schema projection + capture transaction."

**Stage 5 — Promote `collect` / `require` to first-class Flow steps.** The full
Forms-Policies-Automations trio is now authored in one builder over one engine. Native form/policy
tables become projections maintained by the engine — droppable only when nothing reads them directly.

---

## 5. Honest trade-offs (where to push back on ourselves)

In the candid spirit of `PLAN.md` §7–§8:

- **Synchronous vs. async semantics differ, and it matters.** Policies run _synchronously_ at
  placement-eval time — the UI shows required forms immediately. Automations are eventually-consistent
  via a queue. Re-expressing policies as Flows over the async tx feed risks a visible lag ("I created
  the placement but the required forms aren't there yet"). **Mitigation:** keep a synchronous
  "evaluate obligation-producing Flows inline" fast-path for `placement.created`; async for the rest.
  Do not force everything through the queue on day one.
- **Forms-as-EAV inherit all of `PLAN.md` §8's read-perf costs.** A form render today is one `Task.data`
  JSON read; over raw triples it is an N-attribute fetch. Keep the denormalized `data`/`facts` JSON as
  a **materialized projection** (`PLAN.md` §8 step 4, "promote hot attributes") — never read raw triples
  on the hot render path.
- **The DAG executor is the crown jewel — do not rebuild it.** `executeAutomationNode` + outlets +
  `triggerRerunBehavior` + the trace-depth limit + facts accumulation is real, battle-tested machinery.
  The unification must _feed policies into it_, not reimplement it over triples.
- **Loss of FK/column type-safety** — same caveat as `PLAN.md` §7. The Flow engine and write path must
  re-impose the integrity that Postgres constraints gave the bespoke tables.

---

## 6. Deep dive: obligations & reuse as facts and patterns

The hardest part of the unification is **suggested tasks + reuse criteria**, because that is where
"compliance state" lives today. Modeled naively it would be a mess of EAV joins. Modeled correctly
it is one of the most natural fits for the substrate — _if_ we recognize what `reuseCriteria`
actually is.

### 6.1 The kernel: `reuseCriteria` is a query pattern, not data

Today's reuse runs on a single Postgres operator
(`apps/web/app/models/placement/calculatePlacementProgress.server.ts`):

```sql
p.facts @> t.reuse_criteria      -- "this task's criteria is a subset of this placement's facts"
```

`reuse_criteria` is a **partial fact pattern matched by JSONB containment**. A task with
`{ employer: {id:123}, placement: {custom_attributes: {region:"west"}} }` is reusable by _any_
placement whose facts contain those pairs. That is precisely a conjunctive `where` clause — the exact
shape of the Datalog query in `PLAN.md` §3. The app-layer twin (`getDuplicateTask.server.ts`) does the
same match imperatively: same employee + same lineage + scoped dims match + not expired.

So in the triple-store direction `reuseCriteria` **does not survive as a stored JSON column.** It
decomposes into three things, each with a clear home:

1. **Obligation** — a fact: `(placement, requires-form, formX)`. Idempotent (two policies → one
   logical requirement, dedup'd by `(s,a,v)`; the `(taskLineageId, placementId)` unique constraint,
   for free). Provenance = the asserting transactions (= `PlacementReqSource`, for free). Withdrawal
   = retraction (bitemporal history, for free).
2. **Reuse identity** — scope-facts asserted **on the task entity** at materialization:
   `(taskT, scope/employer, 123)`, `(taskT, scope/region, "west")`. This _is_ the `reuse_criteria`
   snapshot, but as facts rather than a denormalized blob. Bitemporality keeps it stable even as the
   placement's facts later change.
3. **Reuse decision** — a **generated** conjunctive query: "find a completed task of `formX` for
   employee E whose scope-facts match this placement's facts on `formX`'s scoped dimensions." It is
   `generateListQuery` (`PLAN.md` Phase 2 §14) applied to the form's scope config.

### 6.2 What is homoiconic vs. what stays a table

The dividing line follows `PLAN.md`'s own rule: **flexible / declarative / auditable → facts;
hot-path matching → a derived projection.**

| Concept                                       | Lives as                            | Why                                                                                                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Obligation (`requires-form`)                  | **Fact**                            | Declarative, retractable, want history; dedup + provenance from the tx log                                                                                                                                                            |
| Form scope config (which dims to scope on)    | **Fact** (on the form entity)       | Customer config; read-rare/write-rare; Phase 3 meta-circular                                                                                                                                                                          |
| Task reuse identity (scope-facts)             | **Fact** (on the task entity)       | It _is_ the snapshot; bitemporality stabilizes it                                                                                                                                                                                     |
| Provenance (which Flow required it)           | **Transaction**                     | Free — it is the asserting tx                                                                                                                                                                                                         |
| The `@>` match, progress rollups, task status | **Native projection (GIN-indexed)** | Hot path. Raw-triple matching is an N-way self-join — keep the denormalized `reuse_criteria` JSONB + GIN as a _derived index maintained from the facts_ (`PLAN.md` §8 step 4). Never read raw triples on the placement-progress path. |

The facts are the source of truth; the JSONB-containment index is a **materialization** of them for the
hot query.

### 6.3 Built-in mechanism, or custom logic a customer writes?

Neither extreme — a **three-tier split**, which is also how the code already behaves
(`getDuplicateTask` is generic; the _scope_ is customer config):

1. **Built-in primitive (every customer gets it):** "match a subject against a pattern of facts"
   (containment / unification) + "reconcile obligations → reuse-or-materialize." Generic engine
   plumbing, no per-customer code.
2. **Declarative config (per form — the sweet spot):** _which_ dimensions to scope on
   (employer / client / `placement.custom.region`) is scope-facts on the form. The customer picks the
   dimensions; the engine generates the match query. No code. This is exactly today's
   `TaskLineage.scope*` + `FormAttributeScope`, relocated into facts.
3. **Rule escape hatch (rare):** reuse rules that aren't "match these dims" — "reuse only if completed
   within 12 months", "score > 80" — are expressed as a guard in the reconciler Flow using the
   **shared `Rule` AST**, not arbitrary code.

**Punchline: reuse is configured, not coded.** The mechanism is built in; the customer declares
dimensions (facts) and, at most, a `Rule`. Arbitrary imperative reuse logic stays an escape hatch one
rarely reaches, because pattern-match + `Rule` already covers what `getDuplicateTask` does.

### 6.4 The reconciler Flow (where it all comes together)

A single standing Flow closes the loop — declarative, using only primitives defined above:

```
on:   fact (*, requires-form, *) asserted OR retracted      // obligation changed
do:   for the (subject, form):
        generate reuse query from form's scope-facts          // 6.1 #3
        match against subject's facts (containment)            // 6.2 projection
        if a completed, non-expired task matches → satisfy (reuse it)
        else → collect: instantiate the form for the assignee  // the one new step
```

- **Expiry / re-verification** is the same loop running backwards: a `wait`/timing Flow retracts the
  satisfying fact at expiry → the obligation is unsatisfied again → the reconciler re-materializes.
  No separate recurrence engine.
- **Withdrawal**: when the policy-Flow's guard stops matching, it retracts `requires-form`; the
  reconciler removes the unstarted task (or leaves a completed one as historical fact). Today's
  "delete the SuggestedTask" becomes a retraction with an audit trail.

This is the whole compliance engine expressed as: _facts_ (obligations + scope identity), one
_generated query_ (reuse match), one _projection_ (the hot `@>` index), and one _Flow_ (the
reconciler) — no bespoke `SuggestedTask`/`getDuplicateTask`/`reuseCriteria` machinery.

---

## 7. Spec: the reuse-query generator & reconciler Flow

This section makes §6 concrete: it extracts the _exact_ reuse predicate from today's code, defines a
pure `generateReuseQuery(form, placement)` that reproduces it as a List View AST (`PLAN.md` Phase 2
§12), specifies the reconciler Flow, and gives a shadow-diff harness to prove equivalence — the same
discipline as Stage 1's policy collapse (§4).

### 7.1 The exact predicate today (two implementations, one rule)

Reuse is implemented **twice**, and the spec's job is to collapse both into one generated query.

**(A) Materialization-time, app-layer — `getDuplicateTask.server.ts`.** Decides reuse when a
suggested task is materialized:

- `:22-36` — candidate tasks: `employeeId` equal; `taskLineageId` equal (via template);
  `employerId`/`clientId`/`jobTypeId` equal **only for the dims where `lineage.scope* === true`**;
  `status != EXPIRED`.
- `:40` — if no `placementId`, return the first candidate (no custom-attr matching).
- `:46-70` — load the lineage's `FormAttributeScope`s for `customProperty.entityType="placement"` and
  the placement's `CustomValue`s; if none, return the first candidate.
- `:72-97` — otherwise a candidate matches iff, for **every** attribute scope, the placement has a
  custom value **and** the task has a `TaskAttribute` with the same `formAttributeScopeId` whose
  `value` is `isEqual` to it. First fully-matching candidate wins.

**(B) Progress-time, SQL — `calculatePlacementProgress.server.ts:68-75`.** The hot path:

```sql
leftJoin tasks t
  on t.employee_id = p.employee_id
 and t.task_lineage_id = st.task_lineage_id
 and p.facts @> t.reuse_criteria          -- containment
-- ranked: row_number() over (partition by st.id order by t.created_at desc), status != EXPIRED
```

`reuse_criteria` is built at `createTask.server.ts:357-406` from exactly the lineage's scoped dims:
`{ employer:{id}, client:{id}, job_type:{id} }` (each only if scoped) merged with each placement
custom-attr scope `set()` at its `attributeFieldPath` (prefix `placement.custom_attributes.`,
`CustomAttributesSchema.ts:7`). `p.facts` (the `PlacementTaskAssociationFactsSchema`) has the same
nested shape — which is _why_ `@>` works.

**The unified predicate both encode:**

```
reusable(task T, placement P, form F) :=
      T.employee = P.employee
   ∧  T.lineage  = F
   ∧  T.status  ≠ expired
   ∧  ∀ dim ∈ scopeDims(F):  T.scope[dim] = P[dim]      // employer/client/jobType + placement custom attrs
  pick: max by T.createdAt                               // (B) ranks created_at desc; (A) takes first)
```

> **Latent divergence worth surfacing.** (A) reads `lineage.scope*` and `FormAttributeScope`s **live**
> (current config); (B) matches the **snapshotted** `reuse_criteria`. If a form's scope config changes
> after a task is created, the two paths can disagree. (A) also returns an arbitrary "first"; (B) ranks
> `created_at desc`. The unification is an opportunity to collapse to **one** rule. Recommended: current
> scope (matches the materialization decision (A)) + `created_at desc` (matches (B)); the snapshot
> becomes a _derived projection_ rebuilt on scope change, never the source of truth (§6.2).

### 7.2 Triple-store representation

| Native today                                                                        | Triple-store fact                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `lineage.scopeEmployer/Client/JobType` (bool)                                       | `(form, scopes-on, "employer")` … — scope-facts on the **form** entity                                              |
| `FormAttributeScope.attributeFieldPath` (e.g. `placement.custom_attributes.region`) | `(form, scopes-on, "placement/region")` — scope-fact on the **form**                                                |
| `Task.reuseCriteria.employer.id`                                                    | `(task, task/scope/employer, <employerUid>)` — scope-fact on the **task**                                           |
| `TaskAttribute.value` (per `FormAttributeScope`)                                    | `(task, task/scope/placement/region, "west")` — scope-fact on the **task**                                          |
| `Placement.facts.employer.id` / custom attrs                                        | the placement entity's own facts: `(placement, placement/employer, <ref>)`, `(placement, placement/region, "west")` |
| `Task.status != EXPIRED`                                                            | `(task, task/status, …)` + the operator filter                                                                      |

`scopeDims(F)` is then just _"query the requirement's `scopes-on` facts."_ Task scope-facts are asserted at
materialization (the §6.1 "reuse identity"). Nothing here is a bespoke column.

### 7.3 `generateReuseQuery(form, placement)` → List View AST

A pure function (repo module style, `PascalCase` module + `generate`/`run`):

```ts
// apps/web/app/models/triples/reuse/ReuseQuery.ts
export function generate(args: {
  formUid: string;
  employeeUid: string;
  scopeDims: ScopeDim[]; // from the requirement's `scopes-on` facts (§7.2)
  placementFacts: Record<string, TripleValue>; // resolved value per scoped dim
}): ListView;
```

returns the Phase 2 List View (`PLAN.md` §12/§20):

```jsonc
{
  "type": "task",
  "select": ["entity/uid"],
  "filters": [
    { "attr": "task/lineage", "op": "eq", "value": "<formUid>" },
    { "attr": "task/employee", "op": "eq", "value": "<employeeUid>" },
    { "attr": "task/status", "op": "neq", "value": "expired" },
    // one per scoped dim, value = the placement's resolved value:
    { "attr": "task/scope/employer", "op": "eq", "value": "<employerUid>" },
    { "attr": "task/scope/placement/region", "op": "eq", "value": "west" }
  ],
  "sort": [{ "attr": "entity/createdAt", "dir": "desc" }],
  "page": { "limit": 1 }
}
```

The **first row is the reusable task** — exactly the `row_number()=1` of path (B). Empty result ⇒ no
reuse ⇒ `collect`. This is the entire reuse decision as data: one generated List View, run by the
existing compiler. The dual implementation (A)+(B) collapses to one.

> **Containment vs. equality.** `@>` is subset-containment; the generated filters are per-dim
> equality. They are equivalent because `scopeDims(F)` is finite and known — enumerating equality on
> each scoped dim _is_ the containment check. The faithful-to-snapshot variant (iterate the _task's_
> scope-facts instead of the form's current dims) is the §7.1 divergence; the recommendation picks
> current-dims.

### 7.4 The reconciler Flow

```
Flow "materialize-obligations":
  on:   fact (?subject, requires-form, ?form) asserted | retracted
  when: —                                  // unconditional; the trigger pattern is the guard
  do:
    on RETRACTED → if the unstarted task for (?subject, ?form) exists, retract it (keep completed as history)
    on ASSERTED  →
      scopeDims  = query (?form, scopes-on, ?dim)                  // §7.2
      lv         = ReuseQuery.generate({ formUid, employeeUid, scopeDims, placementFacts })  // §7.3
      hit        = first row of run(lv)                            // existing compiler
      if hit → assert (?subject, satisfied-by, hit)               // reuse; no work created
      else   → collect { form: ?form, assignee, subject: ?subject } // the one new step (= create_task)
               then assert task/scope facts for each dim           // the reuse identity for future matches
```

Expiry/re-verification (§6.4) is the same Flow re-firing after a `wait` retracts `satisfied-by`.

### 7.5 Shadow-diff validation harness (prove equivalence before trusting it)

Mirror Stage 1. With real data still in native tables, run both deciders side-by-side and diff —
**read-only, ships nothing**:

1. For each real `(employee, lineage, placement)` that hits materialization, capture the task
   `getDuplicateTask` chose (or `null`).
2. Project that triple's scope config + facts into the §7.2 fact shape (in memory, from the native
   rows — no migration needed), run `ReuseQuery.generate` + the compiler, capture the chosen task uid.
3. Diff the two choices. Log mismatches with the cause bucket: `scope-config-drift` (the §7.1
   snapshot divergence), `ordering` (first vs. `created_at desc`), `missing-custom-value`, or a real
   bug. The expected residue is _only_ drift/ordering — both of which the unified rule deliberately
   resolves. A clean diff (modulo the two known buckets) is the green light.
4. Bonus: also diff against path (B) (`p.facts @> t.reuse_criteria` over the same rows) to quantify
   how often (A) and (B) already disagree today — that number is the argument for collapsing them.

Acceptance: the generator reproduces (A) on every case except the two documented buckets, and matches
(B) wherever (A) and (B) agree. Then the generated query can replace `getDuplicateTask` behind a flag
(materialization) and back the progress projection (read path) — one rule, two call sites.

### 7.6 Edge cases the generator must preserve

- **No scoped dims** (`scopeDims(F) = ∅`) → filters reduce to `lineage + employee + status`; any
  non-expired task for that employee+lineage is reused. Matches (A):40 / (A):70.
- **Placement missing a scoped custom value** → in (A), `hasAllDuplicateAttributes=false` (no reuse).
  In the generator, the filter `task/scope/region eq <undefined>` must compile to "no match," not be
  dropped — encode as a value the data can't equal, or short-circuit to "no reuse" when a scoped dim
  is unresolved. **Call out explicitly in tests.**
- **Expired** → `task/status neq expired`. Re-verification creates a _new_ task; the expired one never
  re-matches (matches today).
- **REF cells** (employer/client/jobType) compare by **target uid** (`PLAN.md` §18), so the eq filter
  is a uid equality, consistent with `reuse_criteria.employer.id` being an entity reference.

---

## 8. The Flow IR — an implementation-ready spec

This section is the contract a `Flow` engine implements. It is exhaustive against today's policy +
automation capabilities — §8.6 is a coverage matrix proving every current ability maps. The IR is data
(authored via the DSL in [`dsl.md`](./dsl.md) §2.3 or YAML), validated by Effect `Schema`, versioned and
executed as below.

### 8.1 Trigger

```ts
Trigger = {
  entityType: string                 // = Automation.triggerEntity (today: "placement" | "task"; generalized to any type)
  event: "created" | "attr-changed"  // created ⇒ Automation.isDependentOnCreate; attr-changed ⇒ an AutoDependency match
        | "fact-asserted" | "schedule"//   + (new) raw tx-feed subscription and cron, for Flows beyond today's two events
  attrs?: string[]                   // = AutoDependency.property — fire only when one of these attributes changed
  guard?: Rule                       // = AutoVersion.evaluationRules — the compiled early-filter, run before any step
  rerun: "run-once" | "always" | "restart"  // = triggerRerunBehavior (run_once | always_run | restart_on_trigger)
}
```

`attrs` generalizes `AutoDependency`'s system properties (`status`, `due_at`, `expired_at`, `next_action`,
`progress`) to _any_ attribute. `rerun` is mandatory in the IR (today's three behaviors); `restart`
cancels in-flight runs for the same `(flow, subject)`. Dedup key for rerun = `(flowVersion, entityType,
entityId)`.

### 8.2 The step union (complete, with params)

Every step lowers to a current `AutoAction`/`Auto*Node` or to a fact write. `Tmpl` = a templated value
(§8.3).

```ts
Step =
  // control flow (= AutoCondition / AutoTiming)
  | { branch: { when: Rule, truthy?: Ref, falsy?: Ref } }
  | { wait: { baseline: "now" | "task/dueAt" | "task/expiredAt" | AttrRef,  // = AutoTiming.baselineType
              offset: { value: number, unit: "minute" | "hour" | "day" },   // = baselineTransformSeconds/transformTimeUnit
              recalc?: boolean }                                            // = recalculateFacts
              | { onFacts: FactPattern } }                                   // (new) await: continue when matching facts arrive
  // effects (= AutoAction types, named) — every one carries an optional `then?: Ref` outlet
  | { notify:    { to: "principal" | "assignee" | { email: Tmpl }, template: string, fields?: Record<string, Tmpl> } }  // send_email
  | { http:      { method: "GET"|"POST"|"PUT"|"PATCH"|"DELETE", url: Tmpl, headers?: Record<string,Tmpl>, params?: Record<string,Tmpl>, body?: Tmpl } } // http_request
  | { collect:   { form: FormRef, subject: Ref, assignee: "principal" | "employer" | { role: string }, await?: boolean } }       // create_task
  | { requireForm: { form: FormRef, alsoCollect?: boolean } }              // create_suggested_task — sugar for `assert requires-form` (+ eager collect if alsoCollect)
  | { assignWork: { task: Ref, to: { user: string } | { group: string } } } // assign_task
  | { issueLink: { kind: "employee" | "task", assignee: "employee" | "employer",
                   locale: string | "auto", otp?: { required: boolean, methods?: string[] }, theme?: string, redirectTo?: Tmpl } } // create_onboarding_link
  | { setExpiry: { task: FormRef,                                          // set_task_expiration
                   strategy: "specific" | "relative" | "form-field",
                   at?: Tmpl, afterDays?: number, fieldPath?: string, earliest?: boolean } }
  // data
  | { assert:    { subject: Ref, attr: string, value: Tmpl } }              // write a fact (obligations = `assert requires-form`)
  | { retract:   { subject: Ref, attr: string } }
```

`requireForm` is retained as **sugar** for the common `assert (subject, requires-form, form)` (with
`alsoCollect` = today's `also_create_task`/`createTasks`) — it reads better in the builder, but lowers to
an `assert`. Control-flow steps use named outlets (`truthy`/`falsy`); effect steps use a single `then`
outlet — exactly today's `outletType`/`outletId` and `truthy/falsy` outlets.

### 8.3 Facts & templating

A Flow run carries a **facts** object, threaded across steps:

```ts
facts = {
  <entityType>: { …attributes },     // the trigger entity (placement/task/…)
  <related>:    { …attributes },     // entities reachable by REF (employee, employer, client, job)
  form?:        { fields: { "<path>": value } },  // form-field submissions, by path
  state:        { "<stepName>": output }          // accumulated step outputs (= mergeActionOutputToState)
}
```

- **References** in step params are `Tmpl` — either a fact path or a template string:
  `{{ employee.email }}`, `{{ form.fields.start_date }}`, `{{ state.openCase.caseId }}` (today's Liquid
  syntax). `Ref` resolves an entity (e.g. `$trigger.subject`, `$trigger.principal`); `AttrRef` /
  `FactPattern` reference attributes/patterns for `wait`/`branch`.
- **At publish**, the engine extracts every referenced path from the Rules and templates (= `AutoVariableRef`)
  so a run computes only the facts it needs (the optimized-facts pass) — `recalc` on a `wait` refreshes
  them mid-run.

### 8.4 The Rule sub-language (shared, unchanged)

`guard`, `branch.when`, and policy guards all use the one `Rule` AST (`Rule.ts` / `execute()`):

- **Composition:** `{ all: Rule[] }`, `{ any: Rule[] }`, `{ not: Rule }`, and the literals `true`/`false`.
- **Condition:** `{ fact: string, operator: Operator, value: unknown }`.
- **Operators (12):** `equal, notEqual, lessThan, lessThanInclusive, greaterThan, greaterThanInclusive,
in, notIn, contains, doesNotContain, exists, doesNotExist`.
- Fact paths resolve by dot-path (lodash `get`); a reserved `{ true: true }` fact gives a match-all.
  This is _reused verbatim_ — no new condition engine.

### 8.5 Versioning, pinning & execution

The runtime contract (today's `AutoVersion`/`AutoTriggerEvent`/`AutoEval` semantics, generalized):

- **Versioned & pinned.** Flows are `draft → published → deprecated` (`library.md`). A run **pins the
  published version + a facts snapshot at trigger time**, so republishing never disturbs in-flight runs
  (= `AutoTriggerEvent.autoVersionId` + `initFactId`). Publish precomputes the `guard` and the referenced
  paths (§8.3).
- **Rerun** per §8.1; **loop safety** = cycle detection on `(version, entityType, entityId)` in the
  causation chain + a max trace depth (today: 5).
- **Run/step states:** a run is `processing | success | error | cancelled | skipped` (skip reasons:
  rerun, guard-failed, `cycle`, `max-depth`); a step is `processing | waiting | success | error |
cancelled`. `waiting` is a `wait`/`await` parked on a timer or a fact pattern.
- **Scheduling.** A `wait` resolves to an instant; near-term waits enqueue a delayed job, far-future
  waits park as `waiting` and a sweeper resumes them (today: 48h threshold).
- **Errors:** steps distinguish **fatal** (bad params, missing entity → fail the run) from **retryable**
  (`http` transient → bounded retries, then exhausted). Provenance: every effect/assert is a transaction
  with `actor`/`causation`, so a run is fully reconstructable (`asOf`).

### 8.6 Coverage matrix — every current ability maps

| Today (policy / automation)                                             | Flow IR                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Policy `rules` (required)                                               | a Flow `guard` / `when`                                                                                 |
| `PolicyForm.rule` (form-level, flag-gated)                              | a `branch.when` gating that form's `requireForm`/`assert` (per-form guard within a multi-form policy)   |
| Policy matches → `SuggestedTask`                                        | `requireForm` / `assert requires-form`                                                                  |
| `createTasks` / `also_create_task` (eager)                              | `requireForm { alsoCollect: true }`                                                                     |
| Form scope (`scopeEmployer/Client/JobType`, `FormAttributeScope`)       | reuse `scopes-on` (§6) **and** an applicability `branch` (skip the form if the scoped entity is absent) |
| `globalPolicyRuleCustomization` (account path-remap)                    | an account **overlay** on the Flow's guard (`library.md` §3)                                            |
| `aiSummary` of a policy                                                 | a derived label on the Flow definition (`ai.md`)                                                        |
| Trigger entity / created / updated-property                             | `on.entityType` / `on.event` / `on.attrs`                                                               |
| `triggerRerunBehavior`                                                  | `on.rerun`                                                                                              |
| `evaluationRules` early filter                                          | `on.guard`                                                                                              |
| `AutoCondition` (truthy/falsy)                                          | `branch`                                                                                                |
| `AutoTiming` (now / task_due / task_expired, unit, recalc)              | `wait` (baseline / offset / recalc)                                                                     |
| `send_email`                                                            | `notify`                                                                                                |
| `http_request`                                                          | `http`                                                                                                  |
| `create_task`                                                           | `collect`                                                                                               |
| `create_suggested_task`                                                 | `requireForm` (sugar for `assert`)                                                                      |
| `assign_task` (user / group)                                            | `assignWork`                                                                                            |
| `create_onboarding_link` (kind, assignee, locale, otp, theme, redirect) | `issueLink`                                                                                             |
| `set_task_expiration` (specific / relative / form-field)                | `setExpiry`                                                                                             |
| Facts (entity + related + form fields + `state`)                        | §8.3 facts object                                                                                       |
| Liquid templating / `AutoVariableRef`                                   | `Tmpl` + publish-time path extraction (§8.3)                                                            |
| draft/published/deprecated, version+facts pinning, cycle/trace-depth    | §8.5                                                                                                    |

No current ability is dropped; the three additions over today are `collect`/`assert` as first-class
steps (§2) and the `fact-asserted`/`schedule` triggers and `wait: onFacts` await (§8.1–§8.2) that the
unified tx-feed makes possible.

---

## 9. Open questions (non-blocking)

- ❓ **Inline vs. queued obligations.** Which Flow trigger-types must run synchronously to preserve
  today's UX, and which can be eventually-consistent? (Drives Stage 1's fast-path design.)
- ❓ **Form definition: registry metadata vs. meta-circular facts.** Stage 4 implies attribute-group
  metadata; the end-state (§3) implies definitions-as-facts (`PLAN.md` §23). When do we cross over?
- ❓ **Versioning reconciliation.** `TaskVersion`, `AutoVersion`, and bitemporal `asOf` are three
  versioning models. Which survive as authoring concepts once the tx log is the source of truth?
- ❓ **Bridge key (carried from `PLAN.md` §949).** Confirmed here as _native record ids_ for the
  custom-field bridge (Stage 3); revisit before any full type migration.
- ❓ **SuggestedTask/Task fork (§6).** Two clean ways to model obligations: (1) **requirement-as-fact**
  — a retractable `requires-form` fact + a reconciler Flow that materializes/reuses (recommended;
  declarative, withdrawable, uses bitemporality); or (2) **requirement-as-unmaterialized-Task** —
  collapse `SuggestedTask` into `Task` with a "proposed" status. (1) keeps dedup/reuse-matching cheap
  _before_ creating work; (2) is one fewer concept but loses that. Decide before Stage 4.
- ❓ **Reuse-match projection maintenance.** The hot `@>` index (§6.2) is derived from scope-facts —
  when/how is it kept in sync (synchronously on assert, or via the reconciler Flow)? Drives whether
  placement-progress can ever read stale.
- ❓ **Intrinsic vocabulary: convention-driven vs. fully homoiconic (§2.5).** Recommended: draw the
  line at Tier 2 — ship a reserved domain vocabulary + system reconciler Flow; customers extend on
  top. The alternative (even reconciler trigger attributes runtime-configurable) is maximally flexible
  but hands customers a footgun and forces the engine to interpret runtime-defined semantics. Decide
  before committing the reserved namespaces.
- ❓ **Role-binding scope (§2.5.1).** Confirm the reserved role vocabulary is the minimal
  `compliance/subject` + `compliance/principal` + `compliance/principal-ref` (2–3 markers), and that
  `principal-ref` cardinality is enforced as part of the binding. Open: is `subject`/`principal` bound
  per-account, or per-Flow (allowing one account to run compliance over several subject types)?
- ❓ **`subject` naming reframe (§2.5.1).** Optional: swap to `compliance/subject` = the principal
  (the data subject / person) and rename the obligation-bearer to `compliance/context` (or
  `engagement`/`case`). Cleaner in the data-protection sense; bigger rename. Decide before reserving
  the namespace.

```

```
