# docs/foldkit.md — from a serializable app to a serializable organization

[Foldkit](https://foldkit.dev) is the Elm Architecture in Effect: a single
`Model` (an Effect `Schema`), type-safe `Message`s, a pure `update(model, msg) →
[model, commands]`, side effects confined to `Command`s, `Subscription`s that
start/stop with the model, and a `view` that is a pure function of the model —
"no JSX, no hooks, no component lifecycle." Its DevTools inspect the Model and
Message history and rewind through snapshots.

The reason that architecture serializes so well is that the *interesting state is
data* — Schema-described Model and Messages — rather than hidden in closures,
hooks, refs, or component instances. Foldkit stops at a **serializable frontend
application**.

This document takes that idea to its conclusion. The claim:

> The ontology runtime in this repo is **Foldkit generalized from one app to a
> whole organization**. Same shape — immutable log, pure derivation, effects as
> values, state-as-data — but the state is domain-wide, durable, queryable, and
> bitemporal. Foldkit serializes an app; this serializes an *organization*.

Read alongside [VISION.md](../VISION.md) (the thesis), [docs/confect.md](./confect.md)
(the Effect substrate that makes both sides literally share `Schema`), and
[README.md](../README.md) (the engine).

---

## The isomorphism

Foldkit and the ontology runtime are the same five primitives at two scales:

| Foldkit (one app) | Ontology runtime (one org) | Where it lives here |
| --- | --- | --- |
| `Message` (Schema event) | **Transaction** of fact events | `transactions` + append-only `factEvents` |
| `update(model, msg)` (pure) | **Rules** → derived facts (materialized) | `rules` → `derivedFacts`, `convex/materialize.ts` |
| `Model` (single Schema value) | **The fact store** (entities × attributes) | `facts` / `currentFacts` projections |
| `Command` (effect as value) | **Workflows** (durable, parked steps) | `flowDefs` / `flowRuns`, the step interpreter |
| `Subscription` (model-driven stream) | **Reactions** (event path + crons) | `resumeOnSubmission`, the compliance cron |
| `view` (pure fn of model) | **Generated experience** (projection of facts) | `entityDetail`, Overview — computed from type+config |
| Schema-described `Message`s | **Schema-as-facts** + the config DSL | `attr:`/`type:` facts, the Effect-Schema DSL |
| DevTools: inspect Model + Message log | **Time travel + provenance** | Transaction-log page, `explainDerived` |

Read top to bottom: a Foldkit app is *a single-Model special case* of an ontology
runtime where the Model has one row, the message log is in memory, and the only
viewer is one browser tab.

```
Foldkit               Message ──▶ update ──▶ Model ──▶ view
                          │                    │
                      (Schema)             (one tab, in memory)

Ontology runtime   Transaction ──▶ Rules ──▶ Facts ──▶ Generated view
                          │                    │              │
                    (factEvents,         (bitemporal,     (any actor,
                     append-only)     queryable, durable)   reactive)
```

## What generalizing adds

Foldkit's Model is one immutable value rewound by message index. The ontology
runtime keeps the serializability but lifts every axis:

- **One Model → many entities, queryable.** The Model isn't a struct you read
  whole; it's a fact store you *query* (Datalog). The "view" is a projection, and
  there can be many simultaneous ones.
- **Linear rewind → two-axis time travel.** Foldkit rewinds along *one* axis
  (message N). Facts carry **transaction time and valid time** independently, so
  you can ask "what did we believe on May 1?" separately from "what is now believed
  to have been true on May 1?" — and corrections/tombstones mean replay is a fold,
  not a slice. (`rebuildProjections` is the replay; see README.)
- **Pure synchronous `update` → rules + async materialization.** Derivation is
  still pure *logic* (Datalog), but it's materialized off the live path on the
  scheduler, because a Convex mutation is one bounded transaction (PLAN.md's central
  constraint). The fold survives; the timing changes.
- **`Command` → durable workflow.** A Foldkit command runs and resolves within the
  session. An ontology command is a **parked flow** resumed days later by a
  submission fact, a timer, or an action callback — durability the single-session
  model never needed.
- **One client → multi-actor, reactive.** Every transaction names its actor; reads
  are reactive for *all* clients. Foldkit's "sync" is trivially one tab; here it's
  the substrate.

## The five capabilities, generalized

Foldkit's serializable state buys persist / replay / time-travel / inspect / sync /
agent. Each lands harder when the state is the organization — and each already has
a home in this repo:

- **Persist + replay.** `factEvents` is the append-only source of truth;
  projections are rebuildable folds of it. The org's entire history is the log.
- **Time travel.** Bitemporal as-of queries — richer than message-index rewind.
- **Inspect.** Provenance: every derived fact links to the source facts and the
  asserting transaction (`explainDerived`). "Why is this obligation open?" is a
  first-class answer, not a debugger session.
- **Sync.** Convex reactive reads — generated views are live for every client for
  free.
- **Agent.** The deepest one. Foldkit leans into "AI-readable architecture" and MCP
  because Schema-described Model + Messages are legible to an LLM. Generalized, an
  agent receives the *organization* as data:

  ```json
  { "facts": [...], "schema": {...}, "rules": [...], "provenance": [...] }
  ```

  and acts by emitting a **validated Datalog AST** (to read) or a **transaction**
  (to write) — the same boundary the schema enforces for humans. The query *is*
  data; the config *is* data; the audit *is* data.

## The full conclusion: the client is a projection of the ontology

Take it all the way. If a Foldkit app is a single-Model state machine and the
ontology is the general one, then the frontend Model **is a materialized view of
the ontology for one session**, and the stack is *one replayable state machine end
to end*:

```
        ┌────────────────────────── one state machine ──────────────────────────┐

  user gesture ─▶ Message ─▶ proposed Transaction ─▶ Rules ─▶ Facts ─▶ projection ─▶ view
       ▲                          │                              │                    │
       └──────────── reactive subscription pushes the new projection back ───────────┘

  client Model         =  a query over the org's facts (e.g. entityDetail, Overview)
  client Messages       =  proposed transactions (assert / submitForm / runAction / startFlow)
  the message log       =  factEvents (durable, shared, bitemporal)
  DevTools time-travel  =  the Transaction-log page + as-of queries
```

Concretely in this repo: the Overview and `entityDetail` queries are already pure
projections of facts; the UI's actions (`assertFact`, `submitForm`, `runAction`,
`startFlow`) are already "messages" that become transactions; the Transaction-log
page is already a DevTools-style inspector over the message log. A Foldkit client
here wouldn't invent state — its `Model` would be a **subscription to a projection**,
its `Message`s would be **mutations**, and its time-travel would be **our
bitemporal log**. With the Effect substrate in [confect.md](./confect.md), both
sides share the *same* `Schema`, so a Message and a Transaction are the same value
crossing the wire.

The arc:

```
React          state hidden in closures/hooks/refs        → serializes poorly
Foldkit        state as Schema Model + Message log         → serializable app
Ontology       state as facts + rules + transactions       → serializable organization
```

Foldkit makes a frontend a replayable state machine. The end of this road is the
**business** as a replayable state machine: models become ontologies, messages
become transactions, commands become workflows, and "rewind the app" becomes
"what did the organization know, and believe to be true, at any coordinate in
time."

## Honest caveats

- **We don't run Foldkit.** The frontend today is React + React Router + Tailwind.
  This doc argues the *architectures converge*, and that a Foldkit (or any
  Model/Message/projection) client would fit cleanly — not that one is wired in.
- **Bitemporal replay ≠ linear rewind.** Foldkit's rewind is "drop messages after
  N." Here, replay is a fold over an append-only log with corrections, tombstones,
  and two time axes. More powerful, but not a slider — and the "current Model" is a
  *query*, not a snapshot you can `JSON.stringify` whole.
- **The Convex constraints stand.** A mutation is one bounded transaction; rules
  materialize asynchronously; store-sweeping replays/rebuilds must be batched,
  resumable jobs. Effect/Confect make the composition nicer (confect.md) but remove
  none of this.
- **Boundary discipline matters.** Not all client state is org-fact: hover, draft
  text, scroll position are ephemeral session state that should *not* become
  transactions. The serializable-organization idea is about the **domain** state
  graduating to facts, not about logging keystrokes.

## Synthesis

Three docs, one trajectory: **VISION** says products are declarations over a
fact substrate; **confect** says the substrate can be Effect + `Schema`
end-to-end; **this** says the client is then just another projection of that
substrate — so the whole stack, frontend included, is one serializable,
replayable, inspectable, agent-legible state machine. Foldkit is the proof that
the frontend half of that picture is not only possible but pleasant.
