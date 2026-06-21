# agent — the agent boundary: an agent is an actor, its context is a ledger

> `💭` Exploration, not a decision — see [`README.md`](./README.md). This is the
> promotion [`meta-framework.md`](./meta-framework.md) §4 earned, the same way
> [`machine.md`](./machine.md) was promoted out of [`effect-cluster.md`](./effect-cluster.md)
> §3. It consolidates the two earlier `define-agent` sketches —
> [`phase-space.md`](./phase-space.md) §2.1 (forma → MCP harness) and
> [`meta-framework.md`](./meta-framework.md) §4 (agent = sharded actor) — into one
> surface, and specs the single genuinely-unsolved piece both deferred: **how a
> bounded LLM context window is materialized from an unbounded triple ledger.**
> Companion to [`effect-cluster.md`](./effect-cluster.md) §1.5/§4 (the sharding
> plane + actor=SQLite+triples), [`phase-space.md`](./phase-space.md) §3.2
> (`define-decay`) and §2.4 (consent-scoped recall), and
> [`../reference/positioning.md`](../reference/positioning.md) ("Agent
> Participation"). Naming per [`../vision/branding.md`](../vision/branding.md).

---

## 0. The claim, in one line

`define-agent` is a fifth `define-*` head whose elaboration target is **the agent
boundary** — alongside `define-integration` (data), `define-workflow`
(execution), and `define-machine` (machine). The agent it emits is a **sharded
actor whose context window is a bounded, deterministic *materialization* of an
actor-owned triple ledger**, and whose tools, authority, and guardrails are a
Forma elaboration of the same ontology the rest of the platform runs on.

Three claims, each inherited from a proven seam, plus one new:

1. **Scale is the sharding plane.** An agent is an `@effect/cluster` entity
   ([`effect-cluster.md`](./effect-cluster.md) §1.5) — addressable, single-writer,
   placed, rebalanced. N agents is N entities; the fleet scales the way the
   cluster scales.
2. **Memory is an actor-owned ledger.** Each agent owns a local SQLite+triples
   store ([`effect-cluster.md`](./effect-cluster.md) §4) — bitemporal, provenanced,
   convergent.
3. **The harness is an elaboration.** Entities → typed memory, actions → MCP
   tools, grants → tool allowlist, constraints → guardrails
   ([`phase-space.md`](./phase-space.md) §2.1).
4. **NEW — the context window is a fold.** What the model sees on a turn is a
   *projection* of the ledger under a token budget, and that projection is itself
   in the substrate: queryable, auditable, mergeable. §3 is the spec for it.

---

## 1. The surface — one `define-agent`, reconciled

Two docs sketched this head with different field names. The canonical surface
unifies them; the lineage is noted so neither prior doc reads as wrong.

```lisp
(define-agent room-companion
  (:over     shadow-room)                    ; the ontology slice this agent inhabits
  (:context  (ledger :scope room))           ; actor-owned triple store (the memory)
  (:recall   (materialize                    ; §3 — how the window is folded from the ledger
               (:budget 120k)                ;   token ceiling for the working set
               (:select  (relevant-to task)) ;   a Datalog query over facts ∪ derived
               (:rank    recency salience)   ;   ordering before truncation
               (:decay   (ref activity))))   ;   reuse a define-decay law (phase-space §3.2)
  (:tools    (from-actions))                 ; define-action → MCP tool
  (:may      (from-grants companion))        ; typed authority = the tool allowlist
  (:goals    ((surface-memories weekly) (answer-queries on-demand)))
  (:must-not (violate consent)))             ; not a prompt — a compile-time guardrail
```

Field provenance: `:over` / `:tools` / `:may` / `:goals` / `:must-not` are from
[`phase-space.md`](./phase-space.md) §2.1; `:context` / `:recall` are the
[`meta-framework.md`](./meta-framework.md) §4 additions made first-class here.
`(:may (from-grants …))` and `(:must-not …)` carry the §2.1 pitch verbatim —
**the privacy policy and the agent's tool permissions are the same compiled
artifact** — and it is the reason this boundary is interesting rather than just
"run an agent loop."

`define-agent` is not a new engine. Like `define-machine`, it is a head over the
same [`@forma/ts`](../vision/forma.md) compiler; its IR lowers to an Effect
program plus an MCP surface (§6).

---

## 2. The two boundaries this sits between

To keep the seam honest, name what the agent boundary is *not*:

- It is **not** the execution boundary. A long-running agent plan that must
  survive a crash is a `define-workflow` with a durability descriptor
  ([`effect-cluster.md`](./effect-cluster.md) §2); `define-agent` *uses* that for
  durable steps but does not redefine it. An agent's turn is a step; its plan is
  a flow.
- It is **not** the integration boundary. An agent's tools that reach external
  systems are `define-integration`s ([`n8n.md`](./n8n.md)) surfaced as MCP tools;
  the agent doesn't get its own ad-hoc HTTP. The dumb-pipe rule applies — an
  agent tool that side-effects the world goes through the contract, not around
  it.

So `define-agent` composes the other three heads; it adds exactly one new thing —
**a managed, materialized context** — and that is the whole of §3.

---

## 3. Context as a bounded materialization of an unbounded ledger

This is the spec contribution. The problem every agent framework hits: the model
window is bounded (say 120k tokens) but the agent's memory is unbounded (a full
bitemporal log). Today that gap is filled by ad-hoc RAG plumbing — embeddings, a
vector DB, a hand-rolled summarizer — sitting *outside* any principled model.

The substrate already has the right primitive: **a materialized view is a fold
over the log.** So the context window is not special. It is a projection:

```text
ledger (unbounded, provenanced)
   │  recall fold  (Datalog select → rank → summarize → truncate to :budget)
   ▼
working set (≤ :budget tokens)   ← what the model sees this turn
```

Four properties fall out, none of which an external RAG stack gives you:

1. **Deterministic and replayable.** Given (ledger state, task), the working set
   is a pure function — the same `as-of` query the substrate uses for
   time-travel. *"What did the agent see when it decided X?"* is answerable by
   replaying the recall fold at that transaction time. This is the audit story
   from [`positioning.md`](../reference/positioning.md) applied to agent cognition.
2. **Incremental.** A new fact updates the working set by the same incremental
   materialization the engine uses for `derivedFacts` — no full re-embed.
3. **Summaries are facts.** When recall summarizes ("these 40 events → this
   digest"), the summary is *asserted back* as a derived fact with provenance to
   its sources. The agent's compressed memory is itself queryable and explainable,
   and survives across turns instead of being regenerated.
4. **Decay is a law, not a config.** Eviction from the working set reuses
   `define-decay` ([`phase-space.md`](./phase-space.md) §3.2): old facts lose
   *ranking weight* (not existence), curation rehearses them, curated facts floor
   to permanent. The ambient-stream failure mode (infinite memory) is fixed by
   the same physics that fixes it for human-facing projections.

### The consent invariant (load-bearing)

[`phase-space.md`](./phase-space.md) §2.4's warning is non-negotiable here: recall
**MUST** be consent-scoped *at query time*, or the context window becomes a
consent-bypass side channel — the agent "remembers" something it was never
authorized to see. Because recall is a Datalog query and authority is middleware
at admission ([`algebra-dsl.md`](./algebra-dsl.md)), the scope is enforced by the
same guard that gates every read. The working set can only contain facts the
agent's grants already permit. That is the `define-grant` → tool-allowlist
pitch extended from *actions* to *perception*.

> The open part (honest): the *summarize* step inside recall is an LLM call, so
> the materialization fold is only deterministic up to that model's determinism.
> The fix is to treat a summary like any boundary effect — the §5 residue / `R`
> channel of [`algebra-dsl.md`](./algebra-dsl.md) — and pin it: the summary fact
> records the model, prompt, and source set, so it *replays as data* even though
> it didn't *compute* deterministically. Provenance substitutes for purity.

---

## 4. Scale — the sharding plane, one agent per entity

"Manage context at scale" resolves to: **the fleet is `@effect/cluster`
entities** ([`effect-cluster.md`](./effect-cluster.md) §1.5).

- **One agent = one entity.** Addressable by ID, single-writer over its own
  ledger, placed by the ShardManager, rebalanced on membership change. No bespoke
  agent-orchestrator — placement and routing are the cluster's job.
- **Each agent's context is local.** Its ledger is the actor's SQLite store
  ([`effect-cluster.md`](./effect-cluster.md) §4). Recall reads local; no shared
  hot vector DB to contend on. Scaling agents scales storage linearly with the
  fleet, by construction.
- **Fleets federate by anti-entropy.** When two agents must share context, their
  ledgers exchange facts by version-vector anti-entropy (SPEC §8) — the same
  mechanism that makes a Convex replica, a DO, and a browser tab converge. Shared
  agent memory is a federation of actor ledgers, not a central store.

This is why the boundary is "actor-based" rather than "a queue of prompts": the
unit of scale is a *stateful addressable agent*, and the platform already runs
that primitive ([`effect-cluster.md`](./effect-cluster.md) §1.5 — DO is one
backend, Rivet another, an Effect-Cluster pod fleet a third).

---

## 5. Convergence and provenance — agents merge like humans

[`positioning.md`](../reference/positioning.md)'s "Agent Participation" is the
property that makes a *fleet* coherent rather than a race:

- **An agent's output is a fact** with an author (`actor=agent:room-companion`),
  mergeable under the same CRDT semantics as a human edit. Two agents proposing
  over overlapping facts converge; no last-writer-wins data loss.
- **A proposal is not an apply.** An agent `assert!`s a *proposal* fact; whether
  it becomes binding is an authority/flow decision, exactly as a human submission
  is. The guardrail (`:must-not`) is a compile-time property the agent cannot
  plan across, not a runtime prayer.
- **Audit is free.** "Which agent asserted this, from what context, under which
  grant, at what time" is one query — because all four are facts in the same log.

---

## 6. What it emits — `forma → MCP` + an Effect entity

The elaboration produces two artifacts behind the IR seam:

| `define-agent` clause | Emitted artifact |
| --- | --- |
| `(:tools (from-actions))` | an MCP tool per `define-action`, schema from the action's typed shape |
| `(:may (from-grants …))` | the MCP tool allowlist + the recall consent scope (§3) |
| `(:must-not …)` | guardrails compiled into admission middleware — refused at the boundary, not filtered in a prompt |
| `(:context …)` / `(:recall …)` | the actor's `EventStoreService` binding + the recall fold (a derived-view definition) |
| the whole agent | an `@effect/cluster` entity (`Sharding` address + mailbox) running the turn loop |

The MCP surface is the [`phase-space.md`](./phase-space.md) §2.1 target unchanged;
the cluster entity is the [`effect-cluster.md`](./effect-cluster.md) §4 actor
unchanged. The new code is only the recall fold (§3) and the wiring between them.

---

## 7. Worked example — the shadow-room companion

```lisp
(define-decay room-activity
  (:half-life 90d) (:rehearse (on reaction curate pin)) (:floor (curated → permanent)))

(define-agent room-companion
  (:over     shadow-room)
  (:context  (ledger :scope room))
  (:recall   (materialize
               (:budget 120k)
               (:select [?e room/member ?m] [?e activity/visible-to ?m])  ; consent-scoped
               (:rank    recency salience)
               (:decay   (ref room-activity))))
  (:tools    (from-actions surface-digest answer-query))
  (:may      (from-grants companion))
  (:goals    ((surface-memories weekly) (answer-queries on-demand)))
  (:must-not (violate consent)))
```

What converges at runtime: a `room-companion` entity per room (sharded), each
holding a room-scoped ledger; each turn folds a ≤120k working set out of that
ledger through the consent-scoped `:select`, ranked and decayed; the agent's
digests are asserted back as provenance-carrying facts; and the same
`define-grant companion` that allowlists its tools also scopes what it can ever
recall. One ontology slice → memory, tools, authority, and perception, all from
one declaration.

---

## 8. Honest caveats

- **The recall fold is the whole bet, and its hard half is the summarizer.** §3
  makes context a principled projection, but the *compression* step is an LLM
  call — non-deterministic, lossy, and the place a consent leak or a hallucinated
  "memory" would actually originate. Provenance-pinning (record model + prompt +
  sources) makes it *replayable as data*, not *correct*; validating that a
  summary faithfully represents its sources is unsolved and probably needs the
  §2.2 simulation harness to property-test.
- **Consent-scoping at query time is necessary, not sufficient.** It bounds what
  enters the working set, but an agent that *writes* a summary fact can leak a
  scoped detail into a less-scoped projection. The summary's authority must be
  the *intersection* of its sources' scopes, not the agent's own grant — a
  derivation-level constraint the engine doesn't enforce yet.
- **Actor-per-agent inherits every distributed-systems caveat of its parent.**
  [`effect-cluster.md`](./effect-cluster.md) §5 applies in full: who runs
  placement off-Cloudflare, cross-agent transactions, rebalancing hot agents. A
  fleet of stateful agents is harder to operate than a stateless prompt queue,
  and the convergence story (§5) is the *reward* for taking on that cost, not a
  way to avoid it.
- **"Agents merge like humans" assumes the merge semantics actually hold for
  agent-rate writes.** Humans edit slowly; an agent fleet can assert thousands of
  proposals a second. CRDT convergence survives that, but the *authority* and
  *flow* layers that turn proposals into binding facts were designed for human
  throughput. Back-pressure and proposal-storm handling are unspecified.
- **Deflationary, on purpose.** Three of the four claims (§0) are restatement of
  shipped or designed seams; the only new engine work is the recall fold. The
  doc's value is showing that "an agent framework for context at scale" is mostly
  the substrate it already is — *not* a license to build an agent runtime before
  the recall fold has a conformance suite and the consent-intersection constraint
  has a design.
