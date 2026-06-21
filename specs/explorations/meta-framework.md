# meta-framework — Forma compiles the framework, agents are actors

> `💭` Exploration, not a decision — see [`README.md`](./README.md). This one is
> a *synthesis*, not a new boundary: it asks what MetaCRDT looks like **packaged
> as an expressive web-platform meta-framework** rather than as a substrate with
> products bolted on. Every load-bearing piece already exists in another doc;
> the contribution is the framing that joins them and one genuinely-new seam
> (agents as sharded actors that own their own context). Builds on
> [`algebra-dsl.md`](./algebra-dsl.md) (the Effect/Schema DSL tier),
> [`../vision/forma.md`](../vision/forma.md) / [`../vision/dsl.md`](../vision/dsl.md)
> (the Lisp front-end), [`../vision/api.md`](../vision/api.md) (the API as a
> projection — and the cut this doc respects), [`effect-cluster.md`](./effect-cluster.md)
> §1.5/§4 (the sharding plane + actor=SQLite+triples), and
> [`phase-space.md`](./phase-space.md) §2.1 (forma → agent harness). Naming per
> [`../vision/branding.md`](../vision/branding.md).

---

## 0. The claim, in one line

The four boundary explorations — data ([`workato.md`](./workato.md)/[`n8n.md`](./n8n.md)),
execution ([`effect-cluster.md`](./effect-cluster.md)), machine
([`machine.md`](./machine.md)), and API ([`../vision/api.md`](../vision/api.md)) —
each proved the same seam: *Forma Lisp → IR → an emitted artifact, vendor behind
the seam.* Point all of them at the **developer** instead of at an ops target and
you have a **meta-framework**: you author the ontology in Forma, the Forma
compiler emits the Effect/Schema program that *is* your typed API + handlers +
client + views, the integration packages (`salesforce`, `stripe`, …) drop in as
named adapters, and the whole thing scales out as an **actor-per-agent** fleet on
the sharding plane.

"Meta-framework" is precise here in the way Next/Remix are precise: they generate
routes from files; **this generates the entire typed surface — schema, API,
handlers, client, UI — from facts**, and the generator itself is a Forma
elaboration. You don't write the framework code. Forma writes it; you author the
ontology.

```text
Forma Lisp (authored)
   │  @forma/ts compiler  (Reader → Type → Elaboration → CodeGen)
   ▼
Effect/Schema program (emitted)    ← the algebra-dsl.md tier, generated not hand-written
   │  Schema · HttpApi · handlers · HttpApiClient · ViewSpec
   ▼
Running web platform               ← typed API + UI, one declaration → many artifacts
   ├─ adapter packages:  salesforce · stripe · checkr · …   (integration seam)
   └─ agent fleet:        actor-per-agent, context-as-ledger (sharding plane)
```

---

## 1. The pipeline — Forma compiles to the Effect codegen

This is the spine of your sketch, and it is real: [`@forma/ts`](../vision/forma.md)
already exports `CodeGen`, `DescriptorCodegen`, and `Descriptor`. The move you
describe — *"a Forma compiler that makes the Effect code generator, and that
generated code is the API"* — is the two-stage lowering those exports imply:

| Stage | @forma/ts surface | Output |
| --- | --- | --- |
| **Read** | `Reader` (lexer → green/red tree → SExpr) | parsed forms |
| **Type** | `Type` (Hindley–Milner inference + unify) | a typed core, so the emitted TS types are *sound*, not stringly-typed |
| **Elaborate** | `Elaboration` / `Form` / `Descriptor` | the canonical IR + self-describing descriptors |
| **Generate** | `CodeGen` / `DescriptorCodegen` | **Effect/Schema source** — `Schema.Class`es, an `HttpApi.make(...)`, handler stubs, an `HttpApiClient`, ViewSpecs |

The emitted tier is exactly the hand-written DSL in
[`algebra-dsl.md`](./algebra-dsl.md): `Algebra.make(...)` as data, executors at
the boundary, authority as middleware, the §5 residue as the `R` channel. The
difference is that algebra-dsl *hand-writes* that program to prove its shape;
the meta-framework *emits* it from Forma. algebra-dsl is the target's
specification; this doc is the compiler that hits it.

### The correction your framing needs

`vision/api.md` already adjudicated one version of this and **cut it**: a
*per-account `HttpApi` JIT-compiled at runtime* is infeasible on the Convex
target. What survived — and what your sketch actually describes — is the doc's
own fallback: **emit the contract as data and codegen offline.** That is the
Forma→CodeGen path above. So the honest statement is:

> Forma → Effect/Schema codegen is the **build-time** generator (`codegen`
> produces committed `.ts`), *not* a per-request runtime compiler. The dynamic,
> customer-defined half is still served by a single runtime-validating
> `httpAction` over the registry (`api.md` §"Convex update"). The meta-framework
> generates the **typed core**; the substrate serves the **dynamic surface**.
> Both are true at once — that two-surface split is `api.md` §1, not a
> contradiction.

Selling "the API is JIT-compiled per account at runtime" would re-open a
decided cut. Selling "Forma compiles your typed API surface at build time, and a
generic dynamic endpoint covers runtime-defined types" is the same idea, shipped.

---

## 2. The DSL-builder meta-framework

"Effect Schema based DSL builder" names the authoring layer. The repo already
has its pieces under three names; the meta-framework is what you call them when
they point at an app developer:

- **Forma** ([`forma.md`](../vision/forma.md)) — the Lisp you author in.
- **The six domain DSLs** ([`dsl.md`](../vision/dsl.md)) — the derived-forms tier
  (`define-type`, `define-flow`, `define-grant`, …) that desugar to the kernel.
- **Schematics** (the workbench, [`branding.md`](../vision/branding.md)) — the
  IDE/builder surface; [`@forma/ts`](../vision/forma.md) already ships `Editor`
  and `LSP` exports, so structural editing and language-server support for the
  builder are not aspirational.

The "builder" is the editor + the type system + the codegen acting together: you
manipulate forms, HM inference keeps the emitted Schema sound, and `CodeGen`
re-emits the framework on every change. **One declaration, many derived
artifacts** ([`algebra-dsl.md`](./algebra-dsl.md) §0, last row) is the whole
value proposition restated for a framework audience — the artifacts are now
*your application's* Schema, API, client, and views.

What makes it a *meta*-framework rather than a framework: the generator is itself
expressed in the language it generates for. Forma elaborations emit Effect; the
Forma compiler is an Effect program; the descriptors are self-describing
(`Descriptor` / `DescriptorCodegen`). The thing that builds your framework is the
same kind of artifact as the framework — which is the meta-circularity
[`overview.md`](../vision/overview.md) §"schema as facts" already claims for the
substrate, lifted to the toolchain.

---

## 3. `salesforce`, `stripe`, … — adapters are named ontologies, not new code

Your `metacrdt/salesforce`, `metacrdt/stripe` are the **integration seam**
([`workato.md`](./workato.md)/[`n8n.md`](./n8n.md)) packaged as distributable
units. Each is a `define-integration` (owned entities ← schema-as-facts, contract
actions, a tx-feed trigger, grant-minted token) plus the emitter that lowers it
to a vendor connector. As a package, that bundle is:

- a Forma ontology fragment (the Salesforce/Stripe object model as types + grants),
- its mapping to the substrate's contract actions (`assert!`/`retract`/`query`),
- and the emitters (Workato connector, n8n node, or native Flow) behind the IR seam.

**Naming correction** (per [`branding.md`](../vision/branding.md)): these most
likely publish as **named ontologies on `ontology.run`** — the registry of named
ontologies whose adapters are exactly `salesforce`/`checkr` — not necessarily as
`@metacrdt/*` npm scopes. `@metacrdt/*` is the *substrate kernel*; the adapters
are *content on the registry*. So the product surface is
`ontology.run/salesforce`, composed by an onboarded app, rather than a kernel
package. Worth resolving before this leaves the 💭 folder, because it decides
whether the adapter business is "kernel packages" or "registry content."

"Scales horizontally" for adapters means: adding the 50th adapter touches **zero
substrate code** — it is one more `define-integration` behind the same IR. That's
the [`n8n.md`](./n8n.md) thesis (*one emitter is an integration; two is an
architecture*) read as a catalog-growth property.

---

## 4. The genuinely-new seam: agents are actors, context is a ledger

This is the part with no prior doc, and it's the strongest idea in the sketch.
"Actor-based agent framework for managing context at scale" is the intersection
of three existing pieces that nobody has joined yet:

1. **The sharding plane** ([`effect-cluster.md`](./effect-cluster.md) §1.5).
   `@effect/cluster` gives addressable, single-writer, placed *entities* with
   mailboxes and rebalancing. An **agent is an entity.** Horizontal scale of the
   agent fleet *is* the sharding plane — placement, routing, and rebalance come
   for free, the same way a Durable Object gives one per group.
2. **Actor = SQLite + triples** ([`effect-cluster.md`](./effect-cluster.md) §4).
   Each agent-actor owns a local ledger. So **an agent's context window is not a
   blob in a prompt — it is an actor-owned triple store**: a bitemporal,
   provenanced, convergent fact log scoped to that agent. "Managing context at
   scale" stops being prompt-stuffing and becomes *partitioned, queryable,
   mergeable memory* — one ledger per agent, federated by anti-entropy (SPEC §8).
3. **The agent harness** ([`phase-space.md`](./phase-space.md) §2.1). Forma
   elaborates the ontology into the agent's operating envelope: entities become
   the typed memory, actions become MCP tools, **grants become the tool
   allowlist**, constraints become guardrails the agent cannot plan across.

Joined, the claim is:

> An agent is a sharded actor whose **context is a triple ledger** and whose
> **tools, memory, and guardrails are a Forma elaboration of the same ontology
> the rest of the platform runs on.** Scaling to N agents is scaling the
> sharding plane; managing each agent's context is querying a fold; auditing what
> an agent knew and when is the substrate's "what did we know when," for free.

Why this is more than "run many agents": the context is *convergent and
provenanced*. Two agents that observe overlapping facts merge under CRDT
semantics; an agent's proposal is a fact with an author, mergeable under the same
rules as a human's ([`positioning.md`](../reference/positioning.md), "Agent
Participation"). Context-at-scale becomes a data problem the substrate already
solves, not an LLM-plumbing problem.

```lisp
(define-agent triage
  (:context  (ledger :scope room))                 ; an actor-owned triple store
  (:memory   (entities Ticket Customer Policy))     ; typed memory = ontology slice
  (:tools    (from-actions assert-triage close))    ; MCP tools = contract actions
  (:allow    (from-grants room-agent))              ; tool allowlist = grants
  (:guard    (constraints no-pii-export)))          ; guardrails = constraints
```

That `define-agent` is not a new engine — it is a fifth `define-*` head whose
elaboration target is *the agent harness*, exactly as `define-machine`
([`machine.md`](./machine.md)) targets the machine boundary. The fleet is
`@effect/cluster` entities; the per-agent host is the actor primitive of
[`effect-cluster.md`](./effect-cluster.md) §4.

> **This section has since been promoted to its own exploration —
> [`agent.md`](./agent.md)** — which consolidates the `define-agent` surface
> (reconciling this sketch with [`phase-space.md`](./phase-space.md) §2.1) and
> specs the **recall fold**: the bounded LLM context window as a deterministic,
> consent-scoped, decaying materialization of the unbounded ledger.

---

## 5. What's actually new here (the deflationary table)

Honesty discipline, same as [`effect-cluster.md`](./effect-cluster.md) §5: most
of this is restatement. Naming what is *not*:

| Piece of the sketch | Status | Where it already lives |
| --- | --- | --- |
| Forma → Effect/Schema codegen → API | **exists** | `@forma/ts` `CodeGen`; `algebra-dsl.md`; `api.md` (offline-codegen path) |
| "Effect Schema DSL builder" / meta-framework | **exists, unnamed as a framework** | `forma.md` + `dsl.md` + Schematics + `@forma/ts` `Editor`/`LSP` |
| `salesforce` / `stripe` adapter packages | **exists as a seam** | `workato.md`/`n8n.md` IR; `ontology.run` registry |
| "scales horizontally" (adapters) | **exists as a property** | the IR+emitter seam — new adapter = new `define-integration`, zero substrate code |
| "scales horizontally" (agents) | **exists as a plane** | `@effect/cluster` sharding (`effect-cluster.md` §1.5) |
| **agent = actor, context = triple ledger** | **NEW synthesis** | joins §4's three pieces; no prior doc |
| **`define-agent` as a `define-*` head** | **NEW** | implied by `phase-space.md` §2.1 but never written as a surface |
| "expressive web platform" positioning | **NEW framing** | reframes `overview.md`'s substrate-with-products as a developer meta-framework |

The value of the doc is rows 6–8. Everything above them is confirmation the
synthesis is *cheap* — it composes shipped or designed seams — not a mandate to
build a new platform.

---

## 6. Honest caveats

- **"Meta-framework" is a positioning bet with a competitor moat to clear.**
  Next/Remix/Convex-Components own the "framework" mental model; pitching a
  Forma-Lisp-authored, codegen-emitted framework asks a developer to adopt a
  *language* before a framework. The wedge has to be a capability they can't get
  otherwise (bitemporal audit, convergent agent memory), not "another way to
  write CRUD." Decide the wedge before the framing leaves 💭.
- **The codegen path inherits `api.md`'s cut — don't re-sell the JIT.** §1's
  correction is load-bearing: build-time codegen for the typed core + a runtime
  generic endpoint for the dynamic surface. Any pitch that says "your per-account
  API is compiled live" is selling a decided-infeasible thing on the Convex
  target.
- **`define-agent` is real distributed-systems + LLM work, not a free head.**
  §4 is elegant on paper, but "context is a sharded triple ledger" inherits every
  hard part of `effect-cluster.md` §5: who runs placement off-Cloudflare, how
  cross-agent transactions work, and — new here — how a bounded LLM context
  window is *materialized* from an unbounded ledger (the retrieval/summarization
  fold is itself a derivation that needs a spec). The convergence story is the
  moat; the materialization story is the unsolved part.
- **Adapter naming decides a business, not just a scope.** §3's
  `ontology.run/salesforce` vs `@metacrdt/salesforce` is the difference between a
  registry-content business and a kernel-package business. The branding doc
  leans registry; this sketch leaned kernel. Pick one.
- **Deflationary, on purpose.** Like its siblings, the honest reading is that the
  "expressive web platform" is the substrate's existing seams pointed at a
  developer audience, plus one new elaboration target (the agent harness). The
  confirmation that it *composes* is the result — not a green light to build a
  framework, an adapter marketplace, and an agent runtime at once before the data
  and execution boundaries have shipped theirs.
