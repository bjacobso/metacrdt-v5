# Vision — Notifications, Reminders & Escalations

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on [`workflows.md`](./workflows.md)
> (the `notify`/`wait` steps, timing), [`compliance.md`](./compliance.md) (the obligation state that
> drives nudges), [`integrations.md`](./integrations.md) (delivery providers as modules),
> [`library.md`](./library.md) (templates as versioned items), [`experience.md`](./experience.md)
> (localization), and [`triples.md`](./triples.md) (delivery events as facts). Grounded in `../PLAN.md`.

Getting workers to _finish_ onboarding is half the product. That means messaging: invites, reminders for
incomplete tasks, deadline warnings, and escalations to admins. Today this is `send_email` automation
actions, templates, and ad-hoc reminder logic. This doc shows the notification engine is **not a
subsystem** — it's Flows + timing over the tx feed, with delivery as an integration.

> Status: **design depth.** End-state and migration path kept separate, per the set's convention.

---

## 0. The central realization

A notification is a **Flow effect** (`notify`, `workflows.md` §2), and a reminder/escalation is a
**timing Flow that re-checks state**. So the whole engine falls out of primitives already defined:

> trigger on a tx pattern (obligation created, task overdue) → optionally `wait` → check the obligation
> is _still_ unsatisfied → send → record the delivery as a fact → branch on delivery.

Four pieces, each mapped to an existing primitive:

- **Triggers & cadence** → Flows + `wait`/timing over the tx feed.
- **Templates** → versioned, localized library items (`library.md`).
- **Delivery** → an outbound integration (email/SMS provider as a module, `integrations.md`).
- **Delivery results** → inbound facts (sent/delivered/bounced/opened) that close the loop.

No bespoke notification service; the same engine that runs compliance runs the nudges.

---

## 1. Reminders & escalations are timing Flows that re-check state

The defining feature of a _good_ reminder is that it doesn't fire if the thing is already done. That's
the reconciler pattern (`compliance.md`) again — re-check, don't blindly send:

```
Flow "nudge-incomplete-i9":
  on:   fact (?subject, requires-form, form:i9) asserted        // an obligation appeared
  do:
    wait 3 days
    if obligation still unsatisfied (query) → notify(principal, template: i9-reminder)
    wait 4 more days
    if still unsatisfied → notify(principal, template: i9-final) ; notify(role:hr, template: i9-escalation)
```

- **Reminders re-query the obligation state** before sending, so a worker who finished yesterday never
  gets "you still owe us an I-9." The nudge cadence reads the same `satisfied-by` facts the compliance
  engine writes.
- **Escalations are just a later branch** to a different recipient (the principal's manager, HR). No
  separate escalation engine.
- **Deadlines** (`dueAt`/`expiredAt` today) are timing-Flow anchors: warn N days before, escalate on
  miss — the `wait` node's baseline/offset (`workflows.md`).

---

## 2. Templates are versioned, localized library items

A message template is a definition, so it lives in the library (`library.md`):

- **Versioned & distributable** — the platform ships default templates; accounts adopt and customize via
  overlays; upgrades are the 3-way merge. Same mechanism as forms/policies.
- **Localized** — template copy is localized facts keyed by locale (`FormLanguage` → facts), picked by
  the principal's locale, exactly like the worker UI (`experience.md`).
- **Rendered from facts** — a template interpolates the subject's/principal's facts (the worker's name,
  the form, the deadline), scoped by the recipient's grants (`authorization.md` — a reminder to an
  employer assignee must not leak the worker's SSN).

---

## 3. Delivery is an integration; results are facts

Sending is an **outbound integration** (`integrations.md`): an email/SMS provider (SendGrid, Twilio) is a
module with a credential and a `send` action. Crucially, **delivery results come back as inbound facts**:

- The provider webhook (sent / delivered / bounced / opened / failed) is an inbound Flow that asserts
  `notification/status` facts on the notification entity.
- This **closes the loop**: a Flow can `branch` on delivery — bounce → try another channel; not opened →
  escalate; delivered → stop nudging. "Did they get the reminder?" is a queryable fact, not a guess.
- A notification is itself an **entity** (`notification/channel`, `/template`, `/to`, `/sentAt`,
  `/status`, `/of`), so the full messaging history is auditable and queryable like everything else.

Channel fallback (email → SMS), multi-channel, and provider failover are all just Flow branches over
these delivery facts.

---

## 4. The hard parts notifications must respect (and the substrate helps with)

Messaging has its own compliance and UX traps:

- **Preferences & consent** — channel opt-in/out, unsubscribe, **TCPA** (SMS consent) and **CAN-SPAM**
  (unsubscribe) obligations. Preferences are facts on the principal; the `notify` step checks them
  (deny-by-default for SMS without consent). Consent itself is a fact with provenance.
- **Quiet hours & rate-limiting** — don't text at 3am; don't send 10 reminders in an hour. Cadence Flows
  honor a per-principal/per-account rate budget and quiet-hours window (facts/config).
- **Dedup & storms** — many obligations created at once shouldn't fan out to many messages; batch/coalesce
  by principal within a window. The risk is the same "notification storm" every event-driven system
  faces — coalescing is a deliberate Flow concern.
- **Idempotency** — a send retried after a crash must not double-send; the send is keyed by the
  triggering tx/causation id (`triples.md`), and the `notification/status` fact makes "already sent"
  observable.
- **Deliverability** — bounces/complaints feed back as facts and should suppress further sends to a bad
  address (a suppression fact), protecting domain reputation.

---

## 5. Honest trade-offs & sharp edges

- **Timing Flows need a durable scheduler.** "wait 3 days then re-check" requires reliable scheduled
  wake-ups at scale (today's BullMQ/cron analog). The Flow runtime owns this; it's real infrastructure,
  not free.
- **Re-check-before-send is essential but adds a read.** Every nudge re-queries obligation state — that's
  the point (no false reminders), but it's load; it reads projections (`performance.md`), not raw
  triples.
- **Coalescing vs. immediacy is a genuine tension.** Batch too aggressively and urgent messages lag;
  batch too little and you spam. The cadence policy is a real product decision, expressed as Flow config.
- **Consent/quiet-hours/rate-limit are deny-by-default and legally load-bearing** — a missing check is a
  TCPA violation, not a cosmetic bug. Model them as guards on the `notify` step, not afterthoughts.
- **Localization correctness** — a reminder in the wrong language is worse than none; template locale
  coverage must be validated (the `library.md`/validator story).

---

## 6. Tactical path (conservative)

- **Stage N0 — Notifications as entities + delivery results as facts.** Wrap today's sends so each
  emits a `notification` entity and ingests provider webhooks as `notification/status` facts. No
  behavior change; instant observability.
- **Stage N1 — One reminder as a timing Flow** that re-checks obligation state before sending; shadow
  against the existing reminder logic; confirm it never nudges a finished worker.
- **Stage N2 — Templates as library items** (versioned + localized) for that reminder; adopt/overlay.
- **Stage N3 — Delivery as an integration module** with channel fallback branching on delivery facts.
- **Stage N4 — Preferences/consent/quiet-hours/rate-limit guards** on the `notify` step;
  suppression facts from bounces/complaints.

---

## Decisions (resolved)

- ✅ **The notification engine is Flows + timing over the tx feed**, not a separate subsystem. (§0)
- ✅ **Reminders/escalations re-check obligation state before sending** (the reconciler pattern) — never
  nudge a finished worker. (§1)
- ✅ **Templates are versioned, localized library items** rendered from facts and grant-scoped. (§2)
- ✅ **Delivery is an outbound integration; results are inbound facts** that close the loop (branch on
  delivered/bounced/opened). (§3)
- ✅ **Consent/quiet-hours/rate-limit/idempotency are deny-by-default guards** on the `notify` step.
  (§4)

## Open (non-blocking)

- ❓ Coalescing policy — the batching window and urgency override for storms.
- ❓ Channel model — is SMS/push a first-class channel set, and how does fallback order get configured?
- ❓ The durable-scheduler guarantees for timing Flows (at-least-once + idempotent sends).
- ❓ How much cadence is intrinsic (a default nudge schedule) vs. customer-authored per form/Flow.
