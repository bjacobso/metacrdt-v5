# Vision — The Learning Loop: the firm's model-portable token capital

> **MetaCRDT primitive →** _provenance + bitemporality as training signal_ — every
> agent action is an audited, replayable transaction, so the log is not just a
> record of what was decided but the raw material for measuring and improving how
> it gets decided next time. See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). Builds directly on
> [`ai.md`](./ai.md) (propose/dispose, provenance-marked AI facts), and on
> [`triples.md`](./triples.md) (the tx log, `asOf`), [`config.md`](./config.md)
> (config-as-code as the firm's declared shape), and the **product seam**
> ([`overview.md`](./overview.md) — system vs. configured vs. data).

> Status: **stretch / directions.** This is the most forward-looking doc in the
> set. It records *where the substrate makes the loop tractable* so the model is
> shaped to allow it — not a design spec. None of it should ship ahead of the core
> substrate.

---

## 0. The thesis this answers

Satya Nadella's "frontier ecosystem, not just a frontier model" argument[^nadella]
draws a line most AI stacks fail to hold: the durable asset of a firm is not the
model it rents but the **learning loop** that encodes its accumulated judgment —
and the test of whether a firm actually owns that asset is whether it can *swap out
a generalist model without losing the company-veteran expertise built into its
system.*

That is, almost exactly, the line this substrate already draws — between the
**configured tier** (the tenant's owned declarations) and whatever model proposes
changes to it ([`overview.md`](./overview.md), [`ai.md`](./ai.md) §0). This doc
makes the claim explicit and names the one pillar the rest of the set leaves
implicit: **the loop that turns provenance-rich traces back into measurably
improving behavior.**

Nadella's vocabulary, mapped onto the substrate:

| His term                          | Where it lives here                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Token capital** (owned AI capability) | the **configured tier** — types, attributes, flows, requirements, corrections, as facts the tenant owns         |
| **"Company veteran" expertise**   | accumulated configured-tier facts + the trace history of how obligations were resolved — **not** model weights   |
| **Queryable institutional memory**| the bitemporal fact store + Datalog ([`triples.md`](./triples.md))                                              |
| **Private evals against outcomes**| replayable agent traces (`actor=agent`, `asOf`) scored against the obligations/facts that did or didn't follow  |
| **Private RL on real traces**     | the tx log as a clean, reversible, provenance-carrying trace corpus                                            |
| **The hill-climbing machine**     | the loop itself — §2 below; the piece not yet built                                                            |

---

## 1. Why this substrate is an unusually good loop host

Three properties, each established elsewhere in the set, are exactly what a private
eval/RL loop needs — and exactly what most agent stacks cannot produce, because
their agent actions are an unaudited side-channel:

- **Clean traces.** Every agent action is a transaction with `actor=agent`,
  `source=automation` ([`ai.md`](./ai.md) §3). The firing facts (what the agent
  saw) and the asserted facts (what it decided) are both in the log. That is a
  labeled (input → action) pair *for free*, on every decision the system ever made.
- **Replayable ground truth.** `asOf` reconstructs precisely the world the agent
  saw when it decided ([`triples.md`](./triples.md) §3). So an eval can ask the
  counterfactual — *given that world, was this the right call?* — against the facts
  that actually followed, not a synthetic benchmark.
- **Reversible, non-destructive.** `revert` undoes an agent transaction without
  erasing it. Bad traces stay in the corpus as negative signal rather than being
  deleted — the loop learns from corrections, which is where the firm-specific
  signal is richest.

The throughline from [`ai.md`](./ai.md) holds: **the model proposes; the
substrate's validator, authorization, and publish gates dispose.** The loop adds
one move on top — *the substrate also remembers, with provenance, how every
proposal turned out, and that memory is the training signal.*

---

## 2. The loop itself (the missing pillar)

The substrate supplies the trace corpus; the loop is the machinery that closes it.
Sketched as a `react`-over-the-log cycle, consistent with the rest of the set:

```
agent proposes facts → validator/authz/publish dispose → outcome facts accrue
   ↑                                                              │
   └──────── private eval scores trace vs. outcome ◄──────────────┘
                         │
              traces below bar → RL/fine-tune signal (or prompt/blueprint revision)
```

1. **Outcome capture.** An obligation resolved, a form was rejected and re-collected,
   a human reverted an agent's transaction. These are already facts. Tag them as
   *outcomes* for a given prior agent action via provenance links.
2. **Private eval.** A scoring pass (itself a `Flow`/cron over the trace corpus)
   that asks, per agent decision, whether the outcome facts that followed met the
   firm's bar — not an external benchmark, *the obligations/SLAs/corrections that
   matter to this tenant.* Eval definitions are config-as-code, so they version and
   diff like everything else.
3. **Improvement.** The below-bar traces become signal. The honest near-term form
   is *prompt and blueprint revision* — the loop surfaces "here are 40 traces where
   the agent mis-classified hourly vs. salaried; here's the corrected blueprint."
   The further form is a private RL environment / fine-tune over the tenant's trace
   corpus, producing a model the *tenant owns*, swappable underneath without losing
   the configured-tier expertise.

The compounding Nadella describes falls out: every resolved obligation improves the
trace corpus, which sharpens the eval, which improves the next proposal. The asset
is the **loop**, and it lives in the firm's own log.

---

## 3. The sovereignty test, passed by construction

The article's "key test of control and sovereignty" — *can you switch the
generalist model without losing the company veteran?* — is a property this
architecture has whether or not the loop in §2 is ever built, because expertise is
encoded as **declarations-as-facts in the configured tier**, not in weights:

- Swap the model → the types, flows, requirements, corrections, and trace history
  are untouched. The "company veteran" is the configured tier plus the log.
- The model is a swappable front-end to an owned body of institutional knowledge —
  which is the inversion the article argues for: *the firm owns the loop, the model
  does not own the firm.*

This is also the **positioning wedge.** Nadella names the problem; Microsoft's
answer is a vertically integrated loop (Copilot + Foundry + Azure evals/fine-tune)
that runs *on Microsoft's substrate*. An open-spec, model-agnostic,
provenance-by-construction fact log is a more credible answer to *"you own it"*:
leaving is possible because the protocol is published and the runtime is a
conforming replica ([`onepager.md`](./onepager.md) — ontology.run), so the
sovereignty claim is structural, not contractual.

---

## 4. Honest framing

This is **directions, not design** — more speculative even than [`ai.md`](./ai.md).
The substrate genuinely is the strong part: clean, replayable, reversible,
provenance-marked traces are rare and hard to retrofit, and we get them for free.
The loop itself (§2) is unbuilt, and the costs are real — eval-definition authoring
UX, the compute of a private RL pass, the question of *who labels outcomes* when an
outcome is itself contested. None of it should precede the core substrate. It is
recorded here so the model is *shaped* to allow it — the same forward-compatibility
discipline the rest of the set follows — and because an external thesis from the
CEO of the largest enterprise-AI vendor has now specified, in his vocabulary, a
product surface the substrate is unusually well-positioned to host.

## Open (non-blocking)

- ❓ What is the minimal *outcome-fact* schema that links a prior agent action to
  the facts that followed it — a provenance edge, or a derived `outcome.*` fact?
- ❓ Are private evals a first-class artifact in config-as-code (versioned eval
  definitions), or a separate harness over exported traces?
- ❓ Where is the line between *prompt/blueprint revision* (cheap, in-loop) and
  *fine-tune/RL over the trace corpus* (expensive, tenant-owned model)?
- ❓ Who labels a contested outcome, and is the label itself a fact with provenance
  (so the eval inherits audit and time-travel like everything else)?
- ❓ Does a tenant-owned fine-tuned model stay portable, or does it re-introduce the
  exact lock-in the configured tier was meant to avoid?

---

[^nadella]: Satya Nadella (CEO, Microsoft), "A frontier without an ecosystem is not
    stable" (2026) — the argument that a firm's durable asset is its owned learning
    loop compounding human capital and token capital, that model-portability is the
    test of sovereignty, and that the priority should be "a frontier ecosystem, not
    just a frontier model." The strongest external statement of the bet this set is
    making — and, from a vendor whose own answer is a closed, vertically integrated
    loop, also the clearest articulation of the wedge.
