# Effect Cluster — the execution host as an elaboration target

> `💭` Exploration, not a decision — see [`README.md`](./README.md). Sibling to
> [`workato.md`](./workato.md) / [`n8n.md`](./n8n.md), which proved *the durable
> artifact is the IR + emitter seam, not the vendor* for the **integration**
> boundary. This doc tests the same claim on a different boundary —
> **execution and durability** — and then notices that a third idea from the
> same conversation (a README that provisions its own machine) is the *same
> reconciliation loop* applied to the **machine** boundary. Three boundaries,
> one shape. Companion to [`../reference/targets.md`](../reference/targets.md)
> (the execution-host / storage / transport axes this extends),
> [`alchemy.md`](./alchemy.md) (Durable-Object-per-group actors), and
> [`phase-space.md`](./phase-space.md) §2 (where this registers as an Axis-2
> point).

---

## 0. The claim, in one line

The integration explorations earned a rule: *one emitter is an integration; two
is an architecture.* The IR is the durable thing; Workato and n8n are
interchangeable backends behind a seam. **Execution is just another boundary
with the same shape.** Inngest, Restate, Temporal, Trigger.dev, Cloudflare
Workflows, Rivet — these are not competing runtimes to pick between. They are
**durable-execution adapters** behind the seam, exactly as Workato and n8n are
iPaaS adapters and Postgres and SQLite are storage adapters
([`targets.md`](../reference/targets.md)).

What is *not* the adapter is Effect. Effect is the compute algebra the IR lowers
into; the adapters are how that program acquires durability, retries, and
coordination on a given host.

```text
Ontology  →  Forma Lisp  →  Canonical IR  →  Effect program  →  Execution adapter
                                                                  ├─ Inngest
                                                                  ├─ Restate
                                                                  ├─ Temporal
                                                                  ├─ Cloudflare Workflows
                                                                  ├─ Rivet
                                                                  ├─ Durable Object + alarms
                                                                  └─ (future Rust runtime)
```

This is the `ReactDOM.render` / `ReactNative.render` move, one layer below the
DSL: the same `Effect<A, E, R>` runs on many durability backends.

---

## 1. Where this slots into `targets.md`

[`targets.md`](../reference/targets.md) already split a "target" into three Effect
service contracts: **execution host** (`SchedulerService` + lifecycle),
**storage adapter** (`EventStoreService`), **transport** (`TransportService`).
The Effect-Cluster idea is **not a new axis** — it is a refinement of the
*execution-host* axis with a property `targets.md` only gestured at:

> Durable Object + alarms is listed as an execution host. So is "Convex
> functions". What `targets.md` did not name is the spectrum *within* that
> column: a bare Node event loop is an execution host with **no durability
> guarantee**; Inngest/Restate/Temporal are execution hosts that add
> **durable execution** — checkpointed steps, automatic retry, replay after
> crash — over the same `SchedulerService` contract.

So the seam already exists in the codebase. The contribution here is to say
the durable-execution platforms are **peers on the execution-host axis**, each
implementing `SchedulerService` + lifecycle with stronger guarantees, and that
the IR must describe *what durability it needs* without naming who provides it.

| `targets.md` axis | Contract | What this doc adds |
| --- | --- | --- |
| Execution host | `SchedulerService` + lifecycle | durable-**execution** tier: Inngest, Restate, Temporal, CF Workflows, DO+alarms |
| Sharding / placement *(new seam — see §1.5)* | `Sharding` · `Runners` · `MessageStorage` · `ShardManager` | virtual-actor tier: Rivet, Durable Objects, an Effect-Cluster pod fleet |
| Storage adapter | `EventStoreService` | unchanged — adapter still chosen per host |
| Transport | `TransportService` | unchanged |

This row corrects §0: the one-line diagram lists Rivet and DO+alarms in the
*same* column as Inngest/Temporal/CF Workflows. §1.5 shows that was a conflation
— Rivet and DO live on a **different seam** than the durable-execution backends,
and `@effect/cluster` is the name of that seam.

The invariant from `targets.md` holds verbatim: **feature packages depend on
`core` + `runtime` contracts, never on a target.** A workflow author never
imports `inngest`.

---

## 1.5. Two seams, not one: sharding vs. durable execution

§0 lined up Inngest, Restate, Temporal, CF Workflows, Rivet, and Durable Objects
as one row of "durable-execution adapters." A question forces a correction:
*why can't Rivet speak `@effect/cluster`? why can't Durable Objects? what about
Workflows?* The answer is that those three are not on one axis — they straddle
**two different seams**, and only one of them is what Effect Cluster names.

```text
                       ┌─────────────────────────────────────────────┐
  sharding plane       │  WHERE an addressable stateful singleton lives │
  (@effect/cluster)    │  + how messages route to it                   │
                       │  entities · placement · mailboxes · rebalance │
                       └─────────────────────────────────────────────┘
                       ┌─────────────────────────────────────────────┐
  durable-exec plane   │  HOW one logical execution survives a crash   │
  (§2 descriptor)      │  step memoization · replay · retry · timers   │
                       └─────────────────────────────────────────────┘
```

Effect Cluster's runner model needs four things: long-lived **runner** processes
that each hold *many* entities in memory; a **ShardManager** that assigns shard
ranges and rebalances on membership change; **runner-to-runner RPC** (a message
for an entity you don't own is forwarded to the runner that does); and a
**MessageStorage** layer for at-least-once delivery and replay. With that lens:

- **Rivet can't *host* Cluster because Rivet *is* the sharding plane.** A Rivet
  actor is addressable, single-writer, owns its storage, and is placed for you —
  that is Cluster's *entity*, not a host for Cluster's runtime. Running Cluster
  on Rivet is double-clustering: Cluster wants to own placement + peer-RPC, but
  Rivet already owns placement and exposes no long-lived runner-holds-many-
  entities tier with a mesh you control. Granularity is wrong (Cluster runner :
  many entities :: Rivet actor : one entity). The integration that works is the
  inverse — implement Cluster's `Sharding`/`Runners`/`MessageStorage` *on* Rivet
  (Rivet actor = entity, Rivet placement = ShardManager).
- **Durable Objects *replace* Cluster — same reason, sharper.** A DO is the
  cleanest virtual-actor going: globally addressable by ID, single-threaded,
  transactional storage, **and Cloudflare runs placement.** So DO already
  supplies entity *and* ShardManager. What the Workers/DO model withholds is
  Cluster's substrate: no long-lived runner holding many entities, no
  peer-to-peer mesh you manage (DOs talk via stubs by ID), CPU/lifetime limits,
  no arbitrary sockets. So DO doesn't host Cluster; DO is a Cluster *backend* —
  DO ID = entity address, CF edge = router, CF placement = ShardManager.
- **CF Workflows is a category error here — it isn't on the sharding plane at
  all.** No addressable singletons, no mailboxes, no routed messages: it is
  durable *execution* of one function across replayable steps. It can't host
  entities. What it *can* be is the thing **behind** an entity — a Cluster
  entity whose handler needs a crash-proof saga delegates to a Workflow. That is
  exactly the §2 durability descriptor, one plane down.

| Substrate | Plane | Relationship to `@effect/cluster` |
| --- | --- | --- |
| **Rivet** | sharding / virtual-actor | *is* it → implement Cluster's seams on it, don't run Cluster on it |
| **Durable Objects** | sharding (+ managed placement) | *replaces* it → DO ID = entity, CF = ShardManager |
| **CF Workflows** | durable execution | *orthogonal* → a backend behind an entity, never a host for one |
| **Inngest / Temporal / Restate** | durable execution | §2 backends — realize the durability descriptor under an entity's handler |

So none of them "speaks" Cluster for one structural reason: **Cluster bundles its
own placement + routing + storage**, while Rivet and DO bring their own placement
+ routing and Workflows brings none. Speaking Cluster requires decomposing it
into independently swappable Layers — `Sharding`, `Runners`, `MessageStorage`,
`ShardManager` — at which point Rivet and DO become `Sharding`/`Runners`
implementations and the durable-execution backends stay one plane below, under an
entity's handler. This is the n8n.md *guard-the-IR* discipline applied to
clustering: the durable artifact is the seam, not the vendor — but only once the
seam is cut in the right place, and §0 cut it one seam too coarse.

> `⚠` **Open question — is Cluster actually decomposable today?** This whole
> section assumes `@effect/cluster` exposes `Sharding`/`Runners`/`MessageStorage`/
> `ShardManager` as swappable Layers. Historically Cluster ships an opinionated
> ShardManager + SQL `MessageStorage` that assume a *generic pod fleet*, not a
> platform (Rivet, CF) that already does placement. If those internals are not
> yet pluggable, "Rivet/DO as a Cluster backend" is an upstream ask, not a
> wiring job. Verify against the current release before promoting this past 💭.

---

## 2. The IR carries durability as *semantics*, not vendor config

The n8n exploration's load-bearing caveat — *the first vendor affordance that
leaks into the IR breaks the seam* — applies with full force. Durable-execution
backends differ wildly in vocabulary (Temporal activities, Restate virtual
objects, Inngest steps, DO alarms). The IR must express durability as physics,
not as any one of those.

The Forma surface declares a workflow and *what must survive a crash*; the IR
lowers that to an Effect program plus a durability annotation; the adapter
realizes the annotation in its own idiom:

```lisp
(define-workflow onboard-employee
  (:durable true)                          ; checkpoint between steps
  (:steps
    (step provision-accounts
      (:retry  (exponential :max 5))
      (:effect (assert! account-provisioned)))
    (step await-manager-approval
      (:wait-for [?a type Approval] [?a approval/of ?employee])   ; durable wait
      (:timeout 7d))
    (step grant-access
      (:effect (assert! access-granted)))))
```

lowers to the same `Effect<WorkflowResult>` regardless of host, plus an IR
durability descriptor:

```text
durable-steps: [provision-accounts, await-manager-approval, grant-access]
retry:         provision-accounts → exponential(max=5)
durable-wait:  await-manager-approval → signal(Approval) | timeout(7d)
```

Each adapter realizes that descriptor natively:

| IR durability concept | Inngest | Restate | Temporal | DO + alarms |
| --- | --- | --- | --- | --- |
| durable step | `step.run` | journaled call | activity | event + checkpoint row |
| durable wait / signal | `step.waitForEvent` | awakeable | signal | parked actor + alarm |
| retry policy | step retries | invocation retry | activity retry | manual + alarm backoff |
| timeout | `step.sleepUntil` | timer | timer | alarm |

The DO + alarms column is **already half-built** in the repo: the Cloudflare
target's flow-wait alarms, parked `flowRun` actors, and `resumeDagRun` terminal
surface ([`targets.md`](../reference/targets.md), [`alchemy.md`](./alchemy.md) §4)
are exactly a hand-rolled durable-execution adapter. Inngest/Restate would be
the *managed* versions of the same descriptor — which is the strongest evidence
the seam is real: the substrate already emits one durable-execution backend.

---

## 3. The same loop, one boundary out: `shelly` and the machine

The conversation's second thread — a `shelly.md` that provisions its own
machine — is **not a separate idea**. It is the substrate's reconciliation loop
applied to the *machine* boundary instead of the *data* or *execution* boundary:

```text
substrate:   desired facts   vs  observed facts   → Effect program → new facts
shelly:      desired machine  vs  observed machine → Effect program → lockfile
```

`shelly.md` is a small ontology — `capabilities`, `services`, `secrets`,
`checks`, `permissions` are all **machine facts**. The agent reconciles desired
against observed; the `shelly.lock` is not a script — it is a **proof of
convergence**, a materialized view of "what actually reached green on this OS."
This is the same relationship `targets.md` draws between the fold and a
projection: the lock is to the spec what a current-row is to the event log.

Reframed in the repo's own nouns:

```lisp
(define-machine metacrdt-workstation
  (:extends org://acme/base-workstation)
  (:capability node@22 pnpm@9 ripgrep)
  (:service postgres :5432) (:service redis :6379) (:service app :3000)
  (:check  dev-server-responds (:run "curl -fsS localhost:3000/health" :retries 5)))
```

The "does it converge to git?" question from the chat resolves cleanly in this
frame: **no.** Git is the *transport* (where the declarations live, how PRs
review them) — the same role it plays for any spec in this repo. The runtime is
the reconciliation loop. shelly converges to *Terraform-for-machines*, and one
layer deeper to the same desired-vs-observed-facts ontology the whole substrate
is built on. The lockfile-as-corpus observation (a growing dataset of "how Node
22 actually installs on Ubuntu 24.04") is the machine-boundary analogue of the
drift-tested vendored recipes in [`n8n.md`](./n8n.md) §2.

This is genuinely a *fourth* Axis-2 target: Forma → IR → **machine spec**, with
`machine verify` as the conformance harness. It is also the most product-distinct
of the threads (see §5). **This section has since been promoted to its own
exploration — [`machine.md`](./machine.md)** — which specifies the literate
document format, the reconciliation verbs, the provisioner seam (exe.dev/Shelley
vs Nix/cloud-init emitters), the `machine.metacrdt.com` registry, and the agent
permission model.

---

## 4. The primitive underneath all three: actor = SQLite + triples

The chat's last thread asked whether "actor gets a SQLite DB as source of truth"
could be the Durable-Objects-like primitive. The answer is that **`targets.md`
already says yes** — and saying it at *actor* granularity is the unification:

- **Actor = authority.** One single-writer owner of a coordinate — exactly the
  DO-per-group / per-flow / per-entity actors in [`alchemy.md`](./alchemy.md) §
  "Durable Objects as an app-level abstraction".
- **SQLite = local source of truth.** An execution host that bundles a storage
  adapter — `targets.md`'s definition of a target, applied per actor. DO SQLite
  is one point; `~/.shelly/actors/*.sqlite` on a laptop is another; a Node
  process with `bun:sqlite` is another. Same `EventStoreService` contract.
- **Triples = the universal model**, MetaCRDT = the replication/merge layer,
  Effect = the execution model. The triple store is therefore **not one giant
  database** — it is a federation of actor-owned SQLite ledgers that exchange
  facts via version-vector anti-entropy (SPEC §8), the mechanism `targets.md`
  already uses to make a Convex replica, a DO, and a browser tab converge.

So "Durable Objects but portable" is not a new architecture to build — it is
the *naming* of what the execution-host × storage-adapter product already is.
Cloudflare DOs become **one deployment target of the actor primitive**, exactly
as Inngest is one execution adapter and n8n is one transport emitter.

```text
Actor (authority)
  ├── local SQLite  (EventStore: triples · events · projections · leases)
  └── Effect runtime  (reconcile · verify · repair · replicate)
        │
        └── deployment target picks the host:
              DO SQLite · Node+SQLite · Inngest step state · ~/.shelly/*.sqlite
```

---

## 5. Honest caveats

- **"Effect runs everywhere" hides the hard part.** Durable execution is *not*
  free from lowering a pure `Effect` onto a backend — the value is in the
  checkpoint/replay/idempotency semantics, and those differ enough between
  Temporal (deterministic replay, no wall-clock in workflow code) and Inngest
  (step-memoized, more permissive) that a naïve IR will produce subtly wrong
  programs on one backend. The IR's durability descriptor (§2) must encode the
  *strictest* backend's constraints (determinism, no ambient I/O outside steps)
  or the seam leaks the moment a second adapter ships. This is the
  execution-boundary version of n8n's "guard the IR".
- **"All adapters converge" must be *earned per adapter*, not asserted.** This
  is the same discipline `targets.md` puts on storage/transport: the claim only
  holds because `@metacrdt/testkit` runs conformance over every Layer. A
  durable-execution adapter needs its own conformance suite (crash-mid-step,
  duplicate-delivery, replay-after-resume) before it counts. Until then,
  Inngest/Restate are aspirations, DO+alarms is the one real data point.
- **shelly is a distinct product surface, not a substrate feature.** §3 shows
  it shares the reconciliation *shape*, but its blast radius (handing an agent
  root on a fresh VM), its security model (the `permissions` block, secret
  *names* not values), and its audience (dev-environment provisioning) are
  orthogonal to the ontology product. Folding it in here is a *conceptual*
  unification; it should not imply a shared codebase or roadmap slice without
  its own justification. Promote it to its own exploration if it earns more than
  this section.
- **Licensing / embedding bites the same way n8n's did.** Temporal (MIT-ish
  core, commercial cloud), Restate, Inngest, Rivet each have their own
  embed/self-host terms. "Each customer runs their own durable-execution tier"
  and "we ship one inside OA Cloud" are different products with different
  license exposure — decide which before this leaves the 💭 folder.
- **Actor-per-SQLite is real distributed-systems work, not a free win.** The
  federation-of-ledgers framing (§4) is clean on paper; single-writer authority,
  cross-actor transactions, and rebalancing hot actors are the parts DOs make
  look easy because Cloudflare operates the placement layer. A portable
  primitive has to answer "who runs the placement layer" on every host that
  isn't Cloudflare. `targets.md`'s open hosts currently dodge this by being
  single-process.
- **Don't let the elegance license a rewrite.** The honest reading of this whole
  synthesis is *deflationary*: three exciting-sounding ideas from the chat turn
  out to already be points in the substrate's existing phase space. The value is
  the confirmation that the seam generalizes — **not** a mandate to build five
  new adapters. The DO+alarms durable path and the actor primitive are the only
  ones with code today; everything else is a sketch.
