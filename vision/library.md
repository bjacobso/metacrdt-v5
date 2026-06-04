# Vision — The Compliance Library: Versioning, Distribution & Upgrades on the Triple Store

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on the substrate in
> [`triples.md`](./triples.md) (bitemporality, transactions, definitions-as-facts) and on
> [`workflows.md`](./workflows.md) (the `Flow` primitive, the reconciler). Grounded in `../PLAN.md`.

The library is the catalog of reusable **forms and policies** (and tomorrow, **Flows**) that the
platform authors once and distributes to many accounts — each of which may adopt, customize, and later
upgrade them. This doc asks whether the triple store can give all of that **one** mechanism, and
answers the question that motivates it: _are workflows just triples?_

> Status: **design depth.** End-state and migration path kept separate, per the set's convention.

---

## 0. The central realization

The library already works — but it solves the same problem **two incompatible ways**, and in both the
customization-vs-upgrade story is broken:

- **Forms** version with **immutable semver**. A `TaskVersion` (`major.minor.patch`, status
  `DRAFT`/`PUBLISHED`/`DEPRECATED`) binds 1:1 to an immutable `TaskTemplate`; changing a form means a
  whole new version + template. Customizing means **forking** (`TaskTemplate.copiedFromTaskTemplateId`)
  — and once forked, the link to the parent is gone, so **customizations do not survive an upgrade**.
- **Policies** version with **mutable overwrite**. No versions at all; `Policy.rules` is edited in
  place, with a `parentPolicyId` global→account chain and `autoUpdateEnabled`. When auto-update is on,
  the parent's fields **overwrite** the child's (`evaluatePlatformPolicyStrategy.server.ts:585-602`) —
  so **customizations get clobbered**.

On top of both sits a heavyweight push system (`PlatformFormDistributionStrategy`,
`PlatformStrategyAudience`, `PlatformDistributionResult` + `…Action`, `FormSubscription`) and a
per-instance upgrade machine (`TaskUpgrade`, `enqueueFormAutoUpgrades`, `upgradeTask`). Three structural
pains fall out:

1. **Two versioning models** (immutable-semver vs. mutable-overwrite) — and Flows would be a third.
2. **Customization and upgrade are at war.** Forks lose customizations; auto-update clobbers them.
   Neither is a _merge_ — because customization is whole-template (forms) or whole-field-set (policies),
   too coarse to merge.
3. **Distribution and instance-upgrade are bespoke subsystems**, each with its own tables and jobs.

The triple store collapses all three into one idea, and it starts with a question.

---

## 1. Are workflows just triples?

**Yes — for definition and versioning. No — for execution.** This is the spine of the whole doc.

- **Definition: yes.** A form, a policy, a Flow is an _entity_ (`meta/form`, `meta/policy`,
  `meta/flow`) whose structure is facts: a form's pages/fields are facts (`field/path`,
  `field/valueType`, `field/required`, ordering, assignment); a policy's rule and form list are facts;
  a Flow's trigger/guard/steps (`workflows.md` §2) are facts. Once a definition is facts, **everything
  the library needs comes from the substrate, for free and identically for all three kinds:**
  versioning (a version is a transaction, §3), diff, tags (semver becomes a tag), `asOf` ("the library
  as it stood"), `revert` (rollback), and distribution (definitions propagate like any facts, §4).
- **Execution: no.** A form is _rendered_; a policy/Flow is _run_. You execute a **compiled, validated
  projection** of the definition-facts — exactly what a `PUBLISHED` `TaskVersion`/`AutoVersion` (with
  precomputed `evaluationRules`) is today. Same hybrid pattern as everywhere in the set: author and
  version as facts; promote a projection for the hot path (`triples.md` §6).

So "workflows are triples" is true where it pays — authoring, versioning, distribution, upgrade — and
projected where it must be. The immediate payoff: **forms, policies, and Flows share one versioning,
distribution, and upgrade mechanism** instead of two-going-on-three.

---

## 2. Versioning = bitemporality + tags (one model for all kinds)

Drop the dichotomy. A library item's definition is a set of facts about a definition entity. Then:

- **A "draft" is the current facts.** Editing is asserting/retracting definition-facts in a transaction.
- **A "published version" is a tagged transaction** (`PLAN.md` §25 version tags). `v1.2.0` names the
  transaction at which the definition was published; the facts _as of_ that tx are the version. They are
  immutable not because a row is frozen, but because **the past is immutable** — you cannot change
  history, only assert new facts going forward.
- **Semver becomes tag metadata**, not a schema column. `DEPRECATED` is a status fact on the version
  tag. The whole `major/minor/patch` + `status` apparatus of `TaskVersion` reduces to "a tagged tx with
  a status fact."
- **Reading any version is an `asOf` query.** "Show me `health-screening` at v1.2.0" resolves the tag to
  its tx and queries the definition-facts at that instant.

This single model covers the immutable-semver world (forms) and the mutable world (policies)
simultaneously: a policy that's "just edited in place" is the same as an untagged draft; publish it and
it gets a tag. No more two mechanisms. And there is no whole-template cloning (`copiedFromTaskTemplate`)
— a new version is a transaction, not a deep copy.

---

## 3. Distribution = adoption by reference + overlay facts (not clone)

Today distribution **copies**: a form fork creates a new org `TaskVersion`; a policy deploy creates a
child `Policy` row (`createAccountPolicy`). Copies are why upgrades are hard — once you've copied, the
base and the copy drift with no structured relationship.

The fact model replaces copy with **reference + overlay**:

- The platform library item is **base definition-facts** in a platform/library namespace
  (`workflows.md` §2.5 ownership; the platform is the owner).
- An account **adopts by reference** — it does not clone. Its effective definition is resolved at read:

  ```
  effective(item, account) = base_facts(item)  ⊕  overlay_facts(item, account)
  ```

  where an **overlay fact** is an account-scoped fact on the _same definition entity + attribute_ that
  **shadows** the base (precedence: account overlay > platform base). A customization is simply an
  overlay fact — attribute-grained, not a forked blob.

- **Provenance is free.** Which strategy distributed an item, when, to whom — today's
  `PlatformDistributionResult` + `…Action` log — is the transaction history of the adoption facts.
  `PlatformStrategyAudience` (who receives it) is a query over account facts.

Adoption-by-reference is the move that makes upgrades tractable, because the base can advance _without
touching_ the overlay — which sets up the merge.

---

## 4. The upgrade merge: attribute-grained 3-way merge (git for definitions)

This is the payoff. Because customization is an **overlay of attribute-grained facts** (§3), upgrading
the base is a **3-way merge** — exactly git's model — and it is tractable precisely where today's
whole-blob model makes it impossible.

For each definition attribute `A` of the item, given `base_old(A)`, `base_new(A)`, and the account's
`overlay(A)` (present or absent):

| Case                                          | Resolution                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| no overlay on `A`                             | `effective = base_new(A)` — **auto-upgrade, free**                                                   |
| overlay present, `base_old(A) == base_new(A)` | `effective = overlay(A)` — **customization preserved** (base didn't touch it)                        |
| overlay present, `base_old(A) != base_new(A)` | **conflict** → policy: `overlay-wins` (keep custom) · `base-wins` (take upgrade) · `flag-for-review` |
| `A` removed in `base_new`, overlay present    | **orphaned overlay** → flag/drop per policy                                                          |
| `A` added in `base_new`                       | `effective = base_new(A)` (no overlay yet)                                                           |

This directly dissolves the two pains:

- **Forms no longer lose customizations on upgrade** — the overlay is preserved attribute-by-attribute;
  only genuine conflicts surface (vs. today: fork severs the link, every customization lost).
- **Policies no longer clobber customizations** — `autoUpdateEnabled`'s blunt overwrite
  (`evaluatePlatformPolicyStrategy.server.ts:585-602`) becomes a merge with a conflict policy (vs.
  today: parent fields wholesale-replace child fields).

`autoUpdateEnabled` itself reduces to **the chosen conflict policy** for an adoption: "auto" = `base-wins`
on conflict (and free on the no-overlay/unchanged cases); "frozen" = `overlay-wins` (or "don't advance
the base pointer at all"). One knob, principled.

And the whole thing is **diffable and previewable before applying**, because `base_old`, `base_new`, and
the overlay are all just fact sets — the same `diff(t1, t2)` primitive from `PLAN.md` §25. An admin sees
"upgrading `health-screening` v1.2→v2.0 will: auto-apply 6 changes, preserve your 3 customizations, and
needs your decision on 1 conflict" _before_ committing.

---

## 5. Upgrading existing instances (the data, not just the definition)

A definition upgrade is only half the job — there are live `Task` instances on the old version
(`TaskUpgrade`, `upgradeTask.server.ts` today, with its guards: only `REQUIRES_ACTION`, not started,
serialized per lineage). In the fact model this **folds into machinery the set already has**:

- A form definition is "which attributes to collect about the principal" (`workflows.md` §2.5.1). An
  instance is the obligation + the collected facts. So "upgrade this task to the new form" =
  **re-resolve the obligation against the new definition** — which is the **reconciler Flow**
  (`workflows.md` §6.4) doing materialization, not a separate `TaskUpgrade` subsystem.
- Already-submitted facts under the old form are handled by the \*\*schema-change-as-versioned-transaction
  - coercion\** story (`triples.md` §4, `PLAN.md` §26): added field → newly required collection;
    removed/renamed field → coercion, lossy changes flagged; `asOf` keeps old submissions valid *under the
    old schema\*, so nothing retroactively breaks.
- The upgrade guards (don't disrupt in-progress work) become **Flow conditions**, not bespoke status
  checks: "re-materialize only where the obligation is unsatisfied / not started."

`taskUpgradeMode` (`SKIP` / `UPGRADE_AUTOMATICALLY` / `PROMPT_USER`) and `autoDeployFormVersion` survive
as **adoption policy facts**, read by the reconciler — same knobs, one engine.

---

## 6. Honest trade-offs & sharp edges

- **Resolution cost.** `effective = base ⊕ overlay`, possibly across a tag `asOf`, on every definition
  read. Definitions are read-hot / write-rare, so this is a **per-account cached projection** (the
  Phase 3 schema cache, `PLAN.md` §23) — not a live merge per render. The cache invalidates on any
  base-version publish or overlay change.
- **Conflict UX is a real product surface, not a free win.** The merge makes conflicts _detectable and
  few_; it does not make the human decision disappear. A clear preview/diff UI (what auto-applies, what's
  preserved, what conflicts) is required, or "merge" silently degrades into "base-wins" anyway.
- **Execution-projection staleness.** Publishing a version must atomically (re)compile the executable
  projection (rendered form / `evaluationRules`); a definition-fact write without its projection rebuild
  would let the runtime run a stale version. Tie projection rebuild to the publish transaction.
- **Migrating off two systems is the bulk of the work.** Forms (immutable-semver + fork) and policies
  (mutable + overwrite) must converge onto one model without breaking live distribution. This is staged
  and shadowed (§7), not a flip.
- **Tag governance.** Semver-as-tags needs the same discipline semver-as-columns had (who can publish a
  major; deprecation windows) — now enforced in the write path, not by a unique constraint.

---

## 7. Tactical path (conservative)

Mirrors the set's discipline — façade first, shadow-validate, converge.

- **Stage L0 — Definitions as facts, read-only shadow.** For one library item kind (start with
  **policies** — mutable, no immutable-version baggage), project the existing rows into definition-facts
  and resolve `effective = base ⊕ overlay` _alongside_ the live `parentPolicy`/`autoUpdateEnabled` path.
  Diff the resolved definition against what the live system produces. Ships nothing.
- **Stage L1 — Merge engine in shadow.** Implement the §4 3-way merge; for every real upgrade/auto-update
  event, compute the merge result and diff it against what the live overwrite/fork produced. The expected
  residue is _exactly the customizations today silently loses or clobbers_ — quantify it; that number is
  the case for the cutover.
- **Stage L2 — Versioning via tags.** Represent published versions as tagged transactions for that one
  kind; reads resolve through tags; compare `asOf`-resolved definitions against `TaskVersion`/`Policy`
  history. Prove "version = tagged tx."
- **Stage L3 — Instance upgrades through the reconciler.** Route one form's instance upgrades through the
  reconciler Flow + coercion (§5) behind a flag; dual-run against `upgradeTask`; diff side effects.
- **Stage L4 — Converge the second kind + Flows.** Bring forms onto the same model, then Flow definitions
  — at which point the two-going-on-three versioning systems are one.

Throughout, the existing distribution-strategy tables remain the system of record until a projection
provably replaces them.

---

## Decisions (resolved)

- ✅ **Workflows are triples for definition; projections for execution.** One versioning/distribution/
  upgrade mechanism for forms, policies, and Flows. (§1)
- ✅ **Version = bitemporal tag**, not a semver column or a cloned template; reading a version is `asOf`.
  (§2)
- ✅ **Adopt by reference + overlay facts**, never clone; customization is attribute-grained overlay.
  (§3)
- ✅ **Upgrade is a 3-way merge** with an explicit conflict policy; `autoUpdateEnabled` becomes that
  policy. (§4)
- ✅ **Instance upgrades fold into the reconciler + schema-coercion** — no bespoke `TaskUpgrade`
  subsystem at the model level. (§5)

## Open (non-blocking)

- ❓ **Default conflict policy** per item kind / per account (overlay-wins vs. base-wins vs. always-flag),
  and whether it's settable per attribute.
- ❓ **Orphaned-overlay handling** when the base removes a customized attribute (drop silently, flag, or
  retain as dead config?).
- ❓ **Tag namespace & governance** — are version tags global, per-org, or per-account; who may cut a
  major; deprecation lifecycle as facts.
- ❓ **How much of the distribution-strategy surface** (`audience`, `testMode`, staged rollout) is
  intrinsic vs. expressible as Flows over the adoption facts.
