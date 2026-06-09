# Vision — The Experience Layer: Worker Onboarding Runtime & Generated UIs

> **MetaCRDT primitive →** _derived coherence_ — the UI is a fold of definition-facts + subject-facts + grants; interactions become transactions. See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on [`triples.md`](./triples.md)
> (the registry + facts), [`workflows.md`](./workflows.md) (forms as attribute projections, the
> reconciler), [`compliance.md`](./compliance.md) (obligations), [`api.md`](./api.md) (the JIT/IR
> pattern, applied here to UI), [`authorization.md`](./authorization.md) (what a viewer may see), and
> [`config.md`](./config.md) / [`dsl.md`](./dsl.md) (definitions are data).

The rest of the set is backend-deep: it defines forms, Flows, and obligations as _data_. But Onboarded's
largest surface is the part a human touches — **the worker filling out onboarding, and the admin
building and watching it.** This doc covers the two experience surfaces the substrate must render: the
**worker onboarding runtime** and the **generated admin UI**.

> Status: **design depth.** End-state and migration path kept separate, per the set's convention.

---

## 0. The central realization

The set already turned the _definition_ of a form into facts (an attribute projection, `workflows.md`)
and the _result_ into transactions (submissions). What's missing is the **runtime that sits between
them** — and it is, structurally, **the UI analogue of the JIT API (`api.md`)**: a renderer that
compiles a form/list/detail definition into a live, validated, resumable experience, driven entirely by
the registry and the principal's facts.

So the experience layer is not bespoke screens; it's **rendering as a projection of the schema**:

> definition-facts (form/list/detail) + the subject's facts + the viewer's grants → a rendered,
> validated, resumable surface; interactions → transactions.

Two audiences, one renderer family:

- **Worker (hosted onboarding).** Focused, resumable, mobile, localized, trust-critical. Today:
  `EmployeeRegistrationLink` (shareable, pre-filled links), hosted sessions (`AuthFormSession`), the
  page-by-page wizard (`Subtask`/`FieldTemplate`), `FormLanguage` localization, repeatable groups,
  quizzes, file upload, progress.
- **Admin (dashboard).** Configure types/forms/Flows, browse and act on entities. Today: the React
  Router dashboard, atom-based preview routes, list/detail views.

---

## 1. The worker onboarding runtime

A worker session is a thin, stateful loop over the substrate:

1. **Resolve the work.** A registration link or invite resolves to a **principal** and the set of
   **open obligations** for them (`compliance.md`): "what forms does this person still owe?" That's a
   query — no bespoke per-link state.
2. **Pre-fill from existing facts (this is reuse, surfaced).** Before rendering, the runtime fills
   fields from the principal's already-known facts (`reuse` from `workflows.md` §6 isn't just
   task-dedup; it's _the worker doesn't re-enter what we already know_). Prefill is a read query, not a
   copy.
3. **Render the form definition.** The form is an attribute projection; the renderer maps each
   attribute's `valueType` + UI metadata to an input, sections to steps, assignment to "who fills this."
   Validation is the **registry schema** (`dsl.md`), so client and server validate against the same
   definition.
4. **Capture as transactions.** Each save asserts facts about the principal in a transaction with
   provenance (who/when/IP — today's `SubtaskSubmission` audit becomes tx metadata). **Save-and-resume
   is free**: progress is the difference between required and asserted facts; there's no separate draft
   store.
5. **Satisfy obligations.** When a form's required facts are present, the obligation is satisfied
   (`compliance.md`); inline checks (E-Verify, `integrations.md`) fire as Flows.

Everything stateful about the session (progress, resume point, what's left) is **derived from facts**,
not a parallel session model.

---

## 2. Rendering is a projection of the schema (the UI analogue of the JIT API)

`api.md` JIT-compiles a per-account `HttpApi` from the registry. The UI is the same move: **generate the
rendering spec from the registry + definition-facts, cached and invalidated on schema change.**

- **Inputs from `valueType` + metadata.** `STRING`→text, `DATE`→date picker, `REF`→entity picker,
  `BOOLEAN`→toggle, `pii: true`→masked, enum→select. The form definition's section/assignment/ordering
  facts drive layout and steps.
- **Generated list & detail views.** A list view is the List View model (`PLAN.md` Phase 2 §12) rendered
  as a table with filters/sort/cursor; a detail view is an entity's facts grouped by attribute. Both
  generate from the registry — the `generateListView(type)` idea (`triples.md` §5), rendered.
- **Builders are front-ends over the IR.** The form builder and Flow builder edit definition-facts; per
  `config.md` §3 and `dsl.md`, the visual builder, the YAML, and the TS DSL are three encoders of one IR
  — so what an admin builds and what the renderer shows can't diverge.
- **Authorization shapes the render.** The viewer's grants (`authorization.md`) decide which attributes
  render at all — a recruiter's detail view simply has no `ssn` field, because the compiler never
  returns it.

Bespoke, hand-polished screens still exist for the few high-touch surfaces; but the _long tail_ of
per-type, per-customer screens is generated, the same way the long tail of API endpoints is.

---

## 3. What the worker experience demands (and the substrate must respect)

The worker UX bar is high and unforgiving — these are requirements, not nice-to-haves:

- **Resumability & idempotency.** Workers leave and return; saves retry on flaky mobile networks. Each
  save is a transaction keyed so retries are idempotent (tx/causation ids, `triples.md`). Resume point =
  a query.
- **Localization.** `FormLanguage` (locale `es-MX`, …) becomes localized label/help facts on the
  definition; the renderer picks by the principal's locale. Notifications share this (`notifications.md`).
- **Trust & clarity.** Onboarding collects SSNs and signs documents; the surface must feel secure and
  official — masking (`pii`), clear provenance ("why are we asking this"), and document review
  (`documents.md`).
- **Accessibility & mobile-first.** Most workers are on phones; the generated renderer must be a11y- and
  mobile-correct by construction, not per-form.
- **Speed.** The runtime reads the principal's facts via projections (`performance.md`), never raw
  triples on the render path.

---

## 4. Honest trade-offs & sharp edges

- **Generated ≠ polished.** A schema-driven renderer gets coverage and consistency, but the worker
  funnel is conversion-critical; expect an **escape hatch for bespoke components** per attribute/section
  (a `component` hint on the definition, as today's `entityCards`). Don't force the highest-touch flows
  through generic rendering.
- **Client/server validation parity.** Both must validate against the _same_ registry schema, or the
  worker hits server errors the client missed. The `dsl.md` "one Schema, both ends" property is what
  makes this safe — lean on it.
- **Prefill is authorization-sensitive.** Pre-filling from existing facts must respect the _worker's_
  view (they can see their own SSN; an employer assignee filling a section cannot). Prefill is a grant-scoped query.
- **Offline / poor connectivity.** True offline is hard against a tx log; the pragmatic target is
  resumable + retry-idempotent, not a full offline CRDT story (flag if customers need more).
- **Builder power vs. safety.** A visual builder that emits arbitrary definition-facts can produce
  invalid/again-unrenderable forms; the validator (`dsl.md`) gates publish, and `plan`/preview
  (`config.md`) shows the rendered result before it goes live.

---

## 5. Tactical path (conservative)

- **Stage E0 — Render one generated detail view** from the registry over projected data, read-only,
  beside the existing screen; diff visually.
- **Stage E1 — One form, end-to-end, schema-rendered.** A low-traffic form: render from the definition,
  validate against the registry schema, capture as transactions; dual-write against
  `SubtaskSubmission`/`FieldSubmission`; compare.
- **Stage E2 — Resumability & prefill from facts** on that form; verify resume point and prefill are pure
  queries.
- **Stage E3 — The builder as a front-end over the IR** for that form type; round-trip builder ↔ YAML ↔
  IR (`config.md`).
- **Stage E4 — Generalize** to list/detail generation per type, with bespoke-component escape hatches for
  the high-touch surfaces.

Existing screens stay the system of record until the generated surface provably matches them.

---

## Decisions (resolved)

- ✅ **Rendering is a projection of the schema** — the UI analogue of the JIT API; generated from the
  registry + definition-facts + viewer grants. (§0, §2)
- ✅ **The worker runtime is a thin loop over facts** — resolve obligations → prefill (reuse) → render →
  capture as transactions → satisfy; session state is derived, not stored. (§1)
- ✅ **Validation is the registry schema, both ends** (`dsl.md`); save-and-resume is free from the tx
  log. (§1, §3)
- ✅ **Bespoke components are an escape hatch**, not the default; the high-touch funnel is not forced
  through generic rendering. (§4)

## Open (non-blocking)

- ❓ How much of the worker funnel is generated vs. bespoke — where's the line for conversion-critical
  steps?
- ❓ Offline depth — resumable+idempotent only, or a richer offline story?
- ❓ Localization model — localized facts on definitions vs. a separate translation layer keyed by attribute.
- ❓ Builder UX — does the admin edit the IR directly (advanced) or only through guided affordances?
