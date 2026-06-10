# Vision — The MetaCRDT Alignment: one cause behind every doc

> Part of the `vision/` set — see [`README.md`](./README.md). This is the **lens**
> for the rest of the set. The other docs each argue, feature by feature, that the
> product collapses onto a fact substrate. This doc names the single cause they
> share, so they read as consequences of one primitive rather than a pile of good
> ideas. Companion to [`../reference/protocol.md`](../reference/protocol.md) (the protocol), [`forma.md`](./forma.md)
> and [`dsl.md`](./dsl.md) (authoring), and [`../reference/targets.md`](../reference/targets.md)
> (one feature set, many targets). The fact/fold/reaction lens named here is
> taken further by [`operational-algebra.md`](./operational-algebra.md) (the
> kernel reduction: two verbs, one rule, two laws) and
> [`forma-zero.md`](./forma-zero.md) (the kernel as syntax, with an executable
> conformance suite at `packages/@forma/conformance/`).

---

## 0. Three frames, not two

The `vision/` set has been read through two frames: the original **SQL / Prisma /
Effect** model, and the **Convex rebase** ([`convex.md`](./convex.md) is
authoritative). There is a **third frame underneath both**, and it is the deepest:

> Every vision doc describes one of three things over the convergent log — a kind
> of **fact**, a kind of **fold**, or a **reaction** (a fold that emits facts).
> SQL and Convex are just two *targets* of those primitives.

This reframes the whole set from *"SQL model → Convex mechanism"* to
**"feature → MetaCRDT primitive → runtime shape → any target."** It is the same
move [`../reference/targets.md`](../reference/targets.md) makes for runtimes: one feature
set, many targets, guaranteed to converge because every target embeds the same
deterministic `@metacrdt/core`.

---

## 1. The two reductions, and the bridge

Every doc collapses into one of two statements, joined by a third.

**Everything-as-fact.** Schema, definitions (forms / policies / flows), grants,
obligations, document metadata, desired-state config, library versions,
integration namespaces, *and every AI agent action* are immutable, content-addressed
events.
→ *Adding capability is asserting facts, not migrating tables.*

**Everything-as-fold.** Current state, bitemporal reads, obligations, reuse, the
API surface, the rendered UI, authorization filters, generated documents, the
reconciler, notification cadence — all deterministic folds over the log.
→ *Behavior is a standing fold over the log.*

**The bridge — a reaction is a fold that emits facts.** Workflows, compliance,
notifications, and integrations are *the same primitive*: `fact → fold → fact`,
differing only in trigger pattern and guard. There is no separate notification
service, compliance engine, or integration framework — there is one reactive fold.

The deepest unifier the docs under-use is MetaCRDT's **meta-claim**: not just
current state but *every derived value converges*, because they are all the same
fold machinery. That is *why* the substrate collapses N products into one — the
vision docs argue it product-by-product instead of naming the single cause.

---

## 2. What each doc really is

| Doc | Reduces to | One-liner |
| --- | --- | --- |
| [`triples.md`](./triples.md) | facts + bitemporal fold | the substrate itself |
| [`performance.md`](./performance.md) | derived coherence | projections are bounded folds; the compiler chooses which to materialize |
| [`config.md`](./config.md) | facts + reaction | desired-state = facts not yet asserted; `plan` is a diff-fold, `apply` is agent participation |
| [`workflows.md`](./workflows.md) | reaction | a Flow is a fold over the log that emits facts |
| [`compliance.md`](./compliance.md) | derived coherence | an obligation is a *fact*; reuse is a *generated query* (fold) |
| [`notifications.md`](./notifications.md) | reaction + time | an event-sourced state machine; delivery results are inbound facts |
| [`integrations.md`](./integrations.md) | reaction + coordination | a bounded fact context with inbound/outbound Flows |
| [`authorization.md`](./authorization.md) | provenance + §9 grants | a fold: grants are facts; the projection filters by them |
| [`privacy.md`](./privacy.md) | bitemporal fold + provenance | erasure destroys the key, keeps the fact-shape |
| [`ai.md`](./ai.md) | provenance + agent participation | agents propose facts; validators dispose |
| [`api.md`](./api.md) | convergence-as-projection | the API is a projection of schema-as-facts, invalidated by a schema-change tx |
| [`documents.md`](./documents.md) | fact-carrier + fold | metadata/provenance are facts; generated docs are folds; bytes stay content-addressed |
| [`experience.md`](./experience.md) | derived coherence | the UI is a fold of definition-facts + subject-facts + grants |
| [`library.md`](./library.md) | facts + merge | definitions are facts; versions are bitemporal tags; upgrade is a 3-way merge |
| [`dsl.md`](./dsl.md) / [`forma.md`](./forma.md) | facts (authoring) | front-ends that elaborate to one IR that lowers to facts |

Two sub-stories carry most of the weight:

- **Reactions are one engine, not four.** workflows + compliance + notifications +
  integrations are all `fact → fold → fact`.
- **Trust is not a module, it's the model.** authorization + privacy + AI + API all
  reduce to provenance + coordination profiles (SPEC §9) + convergence-as-projection.
  Every grant, schema version, erasure state, and authorization decision is a fact
  or a fold, queryable at any coordinate via `asOf`.

---

## 3. The reversed cuts

Several "cut for Convex" verdicts in the older docs are being **reversed by the
Effect-native turn** (SPEC §1.2, PLAN Goal 111) plus Confect and the multi-target
work. The Effect ambitions were not wrong — they were filed at the wrong layer
(bolted to a backend) instead of at a **target-neutral runtime-shape tier**
(Confect-like), between the shared IR and the targets.

| Older verdict | Reversed by |
| --- | --- |
| [`dsl.md`](./dsl.md): the six Effect-`Schema` DSLs are "ergonomics, not substrate" | [`forma.md`](./forma.md): they are emitters of the one shared ontology IR |
| [`api.md`](./api.md): JIT `HttpApi` infeasible ("no Effect `HttpApi` on Convex") | re-viable as an IR → runtime-shape consumer, target-neutral |
| [`convex.md`](./convex.md): "Effect → Convex validators" | Effect lives at the runtime-shape tier (Confect-like), above the targets |

The model held the whole time; only the *layer* the Effect work belonged to was
wrong.

---

## 4. The frontier that is genuinely open

The MetaCRDT frame closes the *model* questions but not the *operational* ones.
These survive and are target-level, not vision-level (and are the same items
[`assessment.md`](./assessment.md) names):

- **Event-bus contract** — ordering, retries, idempotency, poison transactions,
  scheduled waits, observability, which reactions must be synchronous.
- **Projection discipline** — what gets promoted, sync vs. async, staleness
  budgets, drift detection, debugging across log + projection layers.
- **Erasure vs. bitemporality** — bitemporality is excellent for audit and awkward
  for deletion; the crypto-shred / hard-delete story ([`privacy.md`](./privacy.md))
  must land before large external PII is mirrored in.

---

## 5. How to read the set now

1. Start here, then [`triples.md`](./triples.md) for the substrate.
2. Read every other doc as a **consequence**: ask "is this a fact, a fold, or a
   reaction?" — the §2 table answers it.
3. Treat each doc's "Convex update (decided)" callout as a **target binding**, not
   a model change — and check §3 in case the cut has been reversed.
4. For where it runs, see [`../reference/targets.md`](../reference/targets.md); for how it is
   authored, [`forma.md`](./forma.md) / [`dsl.md`](./dsl.md); for the protocol,
   [`../reference/protocol.md`](../reference/protocol.md).

> The vision was never SQL, and it was never Convex. It was always *a convergent
> graph of facts, constraints, intentions, and effects* — and everything else is a
> fold.
