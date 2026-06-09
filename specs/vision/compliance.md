# Vision — The Compliance Engine: Emergent from the Substrate

> **MetaCRDT primitive →** _derived coherence_ — an obligation is a *fact*; reuse is a *generated query* (a fold). See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). This is a **synthesis** doc: it introduces
> no new primitives. It tells the compliance story start-to-finish by drawing the relevant threads from
> [`triples.md`](./triples.md) (the store + tx log), [`workflows.md`](./workflows.md) (Flows, the
> reconciler, reuse), [`library.md`](./library.md) (versioning/upgrades), [`authorization.md`](./authorization.md)
> (PII gating), [`performance.md`](./performance.md) (the hot-path projection), and
> [`integrations.md`](./integrations.md) (inline checks as Flows).

> Status: **synthesis / narrative.** The load-bearing specs live in `workflows.md` §6–§7; this doc is the
> map.

> **Package status (2026-06-09).** The collection/compliance seam now lives in
> `@metacrdt/collect`: form-definition facts, submission validation/lowering,
> scope-key helpers, token predicates, and `requires AND NOT submitted` rule
> clauses. Convex re-exports it from `convex/lib/collect.ts`; the actual
> database writes, scheduler wiring, and obligation projection remain target
> responsibilities.

---

## 0. Thesis: compliance is a configuration, not a subsystem

The most important claim in the whole set, for this domain: **we did not design a compliance engine as a
thing. Compliance is an emergent behavior of a few general primitives.** The question every compliance
feature answers —

> _"For this placement, what forms/checks are required, are they satisfied, and what work must happen if
> not?"_

— is answered by **obligations-as-facts + a reconciler Flow + reuse-as-a-generated-query**, running over
the bitemporal triple store. There is no bespoke compliance machinery: today's `SuggestedTask`,
`PlacementReqSource`, `getDuplicateTask`, `reuseCriteria`, `Policy`, and `TaskUpgrade` all **collapse into
substrate primitives** (§6).

That reframe is what makes compliance _configurable_: add an entity type or a form and the same engine
handles it, with no new code.

---

## 1. The primitives it composes

| Primitive                                         | Contribution to compliance                                                                                                                                                                             | Source                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Bitemporal fact store + transaction log           | every fact has validity; the log is the event bus that drives reactions                                                                                                                                | `triples.md`          |
| Role-binding                                      | targets _roles_ — `compliance/subject` (obligations attach here), `compliance/principal` (reuse keys on this; forms are about it), `compliance/principal-ref` — so it runs over customer-defined types | `workflows.md` §2.5.1 |
| Obligations as facts                              | a requirement = `assert (subject, requires-form, formX)`; dedup is idempotent; provenance is the tx; withdrawal is retraction                                                                          | `workflows.md` §2     |
| Policies as Flows                                 | the producer of obligations: `on` placement change → `when` Rule guard → `do: assert requires-form`                                                                                                    | `workflows.md`        |
| The reconciler Flow                               | satisfies-or-materializes each obligation                                                                                                                                                              | `workflows.md` §6.4   |
| Reuse as a generated query                        | `reuseCriteria` is a query pattern, not data; scope-facts generate the match                                                                                                                           | `workflows.md` §6–§7  |
| Forms as projections; submissions as transactions | filling a form asserts facts about the principal, with provenance                                                                                                                                      | `workflows.md`        |

---

## 2. The mental model: three questions

Compliance reduces to three questions, each mapped to one primitive:

1. **What is required?** → **obligations** (`requires-form` facts), produced by **policy-Flows** whose
   guard matched the subject's facts.
2. **Is it satisfied?** → **reuse / match** — a generated query asking whether an existing completed,
   non-expired task for the principal matches on the form's scoped dimensions.
3. **What work happens if not?** → **collect** — the reconciler instantiates the form and assigns it to
   the right actor.

Everything else (expiry, re-verification, audit, integrations) is these three running over time.

---

## 3. The lifecycle, end to end

```
placement created ──tx──▶ [policy-Flows: guard matches?] ──assert──▶ requires-form obligations
                                                                          │  (tx feed)
                                                                          ▼
                                              [reconciler Flow, per (subject, form)]
                                                 generate reuse query from the requirement's scope-facts
                                                 match against the principal's facts
                                          ┌───────────────┴───────────────┐
                                     match found                      no match
                                   assert satisfied-by              collect (create task,
                                   (reuse — no new work)            assign to actor)
                                                                          │
                                   form filled ──submissions = txs──▶ facts about the principal
                                   (inline checks run as Flows: call out, await webhook, assert result)
                                                                          │
                                   satisfaction + progress  ◀── projection (the @> index)
                                                                          │
                                   expiry ──timing Flow retracts satisfied-by──▶ obligation unsatisfied
                                                                          └──▶ reconciler re-fires (re-collect)
```

Step by step:

1. **A placement is created.** A transaction asserts its facts (`placement/employer`, `placement/state`,
   `placement/employee`, …) and lands in the log — the event bus.
2. **Policies fire as Flows.** Policy-Flows subscribed to "placement created/changed" evaluate their
   `Rule` guard against the placement's facts (the `all`/`any`/`condition` engine policies and
   automations already share). Each match does one thing: `assert (placement, requires-form, formX)`.
   A policy may require **several** forms, each optionally behind a **per-form guard** (today's
   form-level `PolicyForm.rule`) — a `branch` before that form's `assert`; and it can **eagerly collect**
   (`createTasks`/`also_create_task`) rather than only suggest. Two policies requiring the same form
   **dedup** (same `(s,a,v)`); **both transactions are retained as the audit of who required it** —
   replacing `PlacementReqSource`. (The full policy/automation → Flow mapping is `workflows.md` §8.6.)
3. **The reconciler reconciles each obligation.** Triggered by `requires-form` facts, for each
   `(subject, form)` it reads the **requirement's** scope dimensions (`requirement/scopes-on:
[placement/employer, …]` — on the requirement binding this subject type to this form, **not** on the
   abstract form), **generates a reuse query**, and runs it against the principal's facts:
   - **match → reuse:** `assert (subject, satisfied-by, existingTask)`; no work created.
   - **no match → collect:** instantiate the form/task, assign it to the right actor (the principal, or
     HR for an employer section).
   - **obligation retracted** (policy stopped matching): withdraw the unstarted task; keep a completed
     one as history.
4. **The form is filled.** Submissions assert facts _about the principal_ in transactions (who/when as
   provenance). **Inline integrations are Flows** (`integrations.md`): on form completion they call out
   (E-Verify, Checkr), await the webhook result on the tx feed, and assert result facts
   (`everify/case/status`) that feed satisfaction.
5. **Satisfaction & progress.** A placement's compliance state = which `requires-form` obligations have a
   `satisfied-by`. Progress/status reads a **projection** (the GIN-indexed `@>` materialization), not raw
   triples — the hot path stays fast (`performance.md`).
6. **Expiry / re-verification = the same loop, reversed.** Expiry is set by a `setExpiry` step (today's
   `set_task_expiration` — `specific` / `relative` / `form-field` strategies), and a `wait` timing Flow
   retracts the satisfying fact at expiry → the obligation is unsatisfied again → the reconciler re-fires
   → re-collects. No separate recurrence engine.
7. **Audit is intrinsic.** "What was required, what was satisfied, by whom, _as of_ the audit date?" is an
   `asOf` query over the log. Every requirement traces to its policy-Flow's transaction; every satisfying
   fact to its submission transaction.

---

## 4. The reconciler, in detail

The heart of the engine, restated from `workflows.md` §6.4 — declarative, using only the primitives above:

```
Flow "materialize-obligations":
  on:   fact (?subject, requires-form, ?form) asserted | retracted
  do:
    on RETRACTED → withdraw the unstarted task for (?subject, ?form); keep completed as history
    on ASSERTED  →
      principal  = follow (?subject, compliance/principal-ref)            // role-bound (§1)
      scopeDims  = query the requirement for (typeOf ?subject, ?form) → scopes-on
      reuseQuery = generateReuseQuery(form, principal, scopeDims)         // §5
      hit        = first completed, non-expired match of reuseQuery
      if hit → assert (?subject, satisfied-by, hit)                       // reuse, no work
      else   → collect { form: ?form, assignee, subject: ?subject }       // create task
               then assert task/scope facts for each dim                  // the reuse identity for next time
```

The same Flow handles initial materialization, withdrawal, and (via the expiry retraction) re-verification
— one mechanism, not three.

---

## 5. Reuse, precisely

Reuse is where today's system is most tangled (two implementations — `getDuplicateTask` and the
`p.facts @> t.reuse_criteria` containment — that can silently disagree on scope-config drift). The design
resolves it with one insight: **`reuseCriteria` is a query pattern, not data.**

- A **requirement** (the subject↔form binding) declares its **scope dimensions** as `scopes-on` facts
  (`placement/employer`, custom attrs); the form itself stays abstract.
- `generateReuseQuery` lowers those to a conjunctive query: _"a completed, non-expired task of `formX` for
  this principal whose scope-facts equal the subject's facts on each scoped dimension."_ That is exactly
  the predicate both legacy paths encode — now as **one generated query**, with `created_at desc` to pick
  the winner.
- **Reuse is configured, not coded** — a three-tier split (`workflows.md` §6.3): the _mechanism_
  (containment match) is built-in; the _dimensions_ are per-form config (scope-facts); a `Rule` is the
  rare escape hatch for "within 12 months" / "score > 80" cases.

The reuse identity travels with the task as scope-facts (`task/scope/employer = …`), so future
placements match it — replacing the snapshotted `reuseCriteria` JSON blob.

---

## 6. What collapses (before → after)

| Today (bespoke)                                                | In the design (substrate)                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `SuggestedTask` (the requirement row)                          | a `requires-form` **fact**                                                     |
| `PlacementReqSource` (which policy required it)                | the asserting **transaction** (provenance, free)                               |
| `Policy` + `Automation` (two engines)                          | one **`Flow`** primitive (`workflows.md`)                                      |
| `getDuplicateTask` + `p.facts @> t.reuse_criteria` (two impls) | one **generated reuse query** (§5)                                             |
| `Task.reuseCriteria` (JSON snapshot)                           | **scope-facts** on the task entity                                             |
| `TaskUpgrade` (per-instance upgrade machine)                   | the **reconciler** re-resolving against the new form + coercion (`library.md`) |
| Snapshot/audit tables                                          | **bitemporal `asOf`** over the tx log                                          |

---

## 7. How the cross-cutting concerns plug in

- **Authorization** (`authorization.md`) — the principal's collected facts include PII (`employee/ssn`,
  `dob`); attribute-level grants gate who can read them. Compliance data is exactly where field-level
  access matters most.
- **Performance** (`performance.md`) — placement-progress is a hot path; it reads the `@>` GIN projection,
  never raw triples. The reuse match likewise hits a projection.
- **Library** (`library.md`) — the forms and policies themselves are versioned, distributed
  platform→account, and upgraded via the 3-way overlay merge; instance upgrades fold into the reconciler.
- **Integrations** (`integrations.md`) — E-Verify / Checkr / IDV are inline Flows whose result facts feed
  satisfaction; their entities (`everify/case`) are integration-owned.
- **Authoring** (`config.md`, `dsl.md`) — policies, forms, and role bindings are authored as
  config/DSL and applied as transactions; an agent can draft them and `plan` shows the diff.
- **AI** (`ai.md`) — an LLM can draft a policy ("require E-Verify for hourly workers in CO") as
  definition-facts, gated by the validator + preview + human publish.

---

## 8. Honest trade-offs

- **Synchronous obligation production.** Today's policy eval is synchronous at placement-save — required
  forms appear immediately. Producing obligations via the async tx feed risks a visible lag. Mitigation
  (`workflows.md` §6): an inline fast-path for `placement.created` obligation Flows; async for the rest.
- **The reconciler is a concentrated correctness point.** One Flow drives all materialization/reuse — good
  for testing, unforgiving if wrong. It earns exhaustive tests (the shadow-diff harness, §9).
- **Projection freshness.** The compliance hot path reads a projection; it must be maintained
  synchronously where staleness would mislead ("is this placement compliant?") — `performance.md` §3.
- **Reuse divergence is being _resolved_, not preserved.** Collapsing the two legacy reuse paths changes
  edge-case behavior (scope-config drift, ordering). The shadow-diff quantifies exactly where, so the
  change is deliberate.

---

## 9. Tactical path

The compliance-specific slice of the set's discipline (façade → shadow → flag → converge):

1. **Collapse policy → Flow (no storage change).** Re-express policy evaluation as Flows on the existing
   automation engine; shadow-diff the `SuggestedTask`/`PlacementReqSource` output against today's
   `getTaskTemplatesForPlacement` (`workflows.md` §4 Stage 1). Highest leverage, lowest risk.
2. **Obligations as facts (shadow).** Mirror requirements as `requires-form` facts alongside
   `SuggestedTask`; diff.
3. **Reuse query vs. `getDuplicateTask` (shadow).** Run `generateReuseQuery` beside the two legacy paths;
   diff the chosen task and bucket mismatches (`scope-config-drift`, `ordering`, real bug) — `workflows.md`
   §7.5. The bonus: quantify how often the two legacy paths _already_ disagree.
4. **The reconciler behind a flag.** Route materialization through the reconciler Flow; dual-run against
   the live path before cutover.

Existing tables stay system-of-record until each projection/Flow provably matches them.

---

## Decisions (resolved)

- ✅ **Compliance is emergent**, not a subsystem — obligations-as-facts + reconciler Flow + reuse-query
  over the bitemporal store. (§0)
- ✅ **Obligations are `requires-form` facts**; dedup is idempotent, provenance is the tx, withdrawal is
  retraction. (§3)
- ✅ **Reuse is a generated query** from per-form scope dimensions — configured, not coded. (§5)
- ✅ **Expiry/re-verification is the reconciler loop reversed**, not a separate engine. (§3)
- ✅ **Audit is `asOf` over the log**, not snapshot tables. (§3)

## Open (non-blocking)

- ❓ Inline vs. async obligation production — which trigger types must be synchronous to preserve UX (§8).
- ❓ Default reuse conflict/ordering policy when the legacy paths disagree (`workflows.md` §7.1).
- ❓ How much of the reconciler is intrinsic vs. customer-overridable (the §6.3 escape hatch).
- ❓ Projection freshness budget for "is this placement compliant?" reads (`performance.md`).
