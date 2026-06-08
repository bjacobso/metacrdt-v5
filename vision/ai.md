# Vision — The Fact Store as an AI Substrate

> **MetaCRDT primitive →** _provenance + agent participation_ — agents propose facts, validators dispose; every AI write is an auditable, reversible fact. See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on [`triples.md`](./triples.md)
> (queries-as-data, the tx log), [`workflows.md`](./workflows.md) (Flows, the validator),
> [`library.md`](./library.md) (definitions-as-facts), and [`authorization.md`](./authorization.md)
> (grants). Grounded in `../PLAN.md`.

A configurable, bitemporal fact store where **queries are data**, **definitions are data**, and **every
change is an audited transaction** is an unusually good substrate for AI — not because AI is bolted on,
but because the same properties that make the store flexible make AI _safe and auditable_. For a
compliance product, auditable AI isn't a nice-to-have; it's the bar.

> Status: **stretch / directions.** Sketches where the substrate makes AI tractable; not a design spec.

---

## 0. Why this substrate fits AI

Four properties, each already established elsewhere in the set, line up exactly with what trustworthy AI
needs:

| Substrate property                                                            | What it gives AI                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Queries are data (Datalog AST, `triples.md` §5)                               | a **safe, validated target** — the model emits an AST, never raw SQL           |
| Definitions are data (`library.md` §1)                                        | the model can **author** forms/policies/Flows as facts, gated by the validator |
| Schema is a semantic model (registry + labels/descriptions as facts, Phase 3) | **grounding** — a ready-made ontology to reason over                           |
| Every write is an audited, reversible transaction (`triples.md` §3, §24–25)   | **provenance, explainability, undo** — the compliance requirement              |

The throughline: **the LLM proposes; the substrate's validator, authorization, and human-publish gates
dispose.** AI never bypasses the compiler or the write path.

---

## 1. Natural language → query AST

"Show me employees in CO missing their I-9" → a Datalog AST (`triples.md` §5), run by the existing
compiler. The AST is the guardrail: it is **validated against the registry** (Phase 2 §11 — unknown
attribute, type mismatch, did-you-mean), parameterized (no injection), and authorization-rewritten
(`authorization.md` §4) before execution. The model targets data, not a SQL string, so the blast radius
of a hallucination is "an invalid AST the validator rejects," not "an arbitrary query."

---

## 2. LLM-authored definitions

Because forms, policies, and Flows are facts (`library.md`), an LLM can **draft** them: "build an
onboarding form that collects W-4 fields and requires E-Verify for hourly workers." The draft is a set of
proposed definition-facts, run through the **same validator** and **previewed via shadow/diff**
(`library.md` §4 merge-preview) before a human publishes. The publish gate and version tags mean
AI-authored definitions are reviewable, diffable, and revertable — never silently live.

---

## 3. Agentic automations

A `Flow` step can be an `llm` action (or reach a model via `http`): an agent reads facts, decides, and
**asserts facts back** — entirely within the bounded engine. Crucially, every agent action is a
transaction with `actor = agent`, `source = automation` (the provenance from `PLAN.md` §25). That makes
agentic behavior:

- **Auditable** — the tx log is the complete record of what the agent did and why (the firing facts).
- **Explainable** — `asOf` shows exactly the world the agent saw when it decided.
- **Reversible** — `revert` undoes an agent's transaction non-destructively.

Agents become first-class workflow participants without a separate, unaudited side-channel.

---

## 4. Grounding & retrieval over facts

The registry is a semantic layer for free: types, attributes, REF relationships, labels, and
descriptions (as facts, Phase 3) are an ontology the model can ground on — so "the employee's manager"
resolves to a real REF traversal, not a guess. Retrieval is a query over facts scoped by the requester's
grants (`authorization.md`), so an assistant **cannot surface facts the user can't see** — authorization
and AI share one enforcement path.

---

## 5. Guardrails (the throughline, made explicit)

- **Propose, don't dispose.** The model emits ASTs / proposed facts; the **validator + authorization +
  shadow-preview + human-publish** decide.
- **Never bypass the compiler or write path.** No raw SQL, no direct table writes — the same chokepoints
  that enforce performance and authz enforce AI safety.
- **Provenance marks AI-origin facts**, so AI contributions are always distinguishable, auditable, and
  reversible.
- **Deny-by-default** carries over from authorization — an assistant inherits the principal's grants,
  nothing more.

---

## 6. Honest framing

This is **directions, not design** — the most speculative doc in the set. But the point is precisely that
the substrate makes AI _tractable and safe_ rather than bolted-on: hallucination is bounded by validation
and preview; over-reach is bounded by authorization; opacity is bounded by provenance and `asOf`. The
costs are real (LLM latency in a Flow, token cost, the UX of review/preview), and none of it should ship
ahead of the core substrate. It's recorded here so the model is _shaped_ to allow it — the same
forward-compatibility discipline the rest of the set follows.

## Open (non-blocking)

- ❓ Is `llm` a first-class `Flow` step, or always reached via `http` to a model service?
- ❓ How are AI-proposed definitions queued for human review — a draft tag + diff UI?
- ❓ Retrieval ranking over facts (semantic search / embeddings) vs. structured query — where's the line?
- ❓ Cost/latency budgets for agent-in-the-loop Flows; sync vs. async execution.
