# Alchemy — infrastructure as part of the program (Alchemy + Confect + Cloudflare)

[Alchemy](https://alchemy.run) v2's core idea: **infrastructure and application
code live together as one type-safe TypeScript/Effect program.** Resources,
bindings, env vars, deploys, previews, tests, and observability are all modeled in
the same Effect-native system.

That is the fourth and outermost layer of this repo's trajectory:

```
VISION    products are declarations over a fact substrate      (config as data)
confect   the backend is Effect + Schema, end to end           (logic as Effect)
foldkit   the client is a projection of the ontology           (UI as a fold)
alchemy   the infrastructure is the same Effect program        (deploy as data)
```

If config is data, logic is Effect, and the UI is a projection, then the last
non-declarative thing left is *the deployment itself* — and Alchemy folds that in
too. The end state: one Effect program from `alchemy.run.ts` down to a single
fact. "Serializable organization" (foldkit.md) becomes a **deployable** one.

Read alongside [VISION.md](../vision/overview.md), [docs/confect.md](./confect.md), and
[docs/foldkit.md](./foldkit.md).

> This is a design doc / RFC position, not implemented here. The repo's backend is
> plain Convex today; this is the shape we'd want if Alchemy + Confect matured.

---

## The RFC (as posed)

Alchemy is exploring a Convex integration, and the open question is how Confect —
which already brings Effect deep into Convex (Effect `Schema` for db/function
contracts, typed encode/decode, Effect HTTP APIs, runtime services, Convex
platform access through Effect) — should fit. Four candidate modes:

### Mode 1 — Convex Plain

Existing Convex users keep normal `convex/*.ts` files. Alchemy only manages
project/deployment/env/deploy lifecycle.

```ts
import * as Alchemy from "alchemy";
import * as Convex from "alchemy/Convex";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";

export default Alchemy.Stack(
  "my-app",
  { providers: Layer.mergeAll(Convex.providers(), Cloudflare.providers()) },
  Effect.gen(function* () {
    const project = yield* Convex.Project("App", { name: "my-app" });
    const deployment = yield* Convex.Deployment("Dev", {
      project, type: "dev", source: "./convex",
    });
    const web = yield* Cloudflare.Worker("Web", {
      main: "./src/worker.ts",
      bindings: { CONVEX_URL: deployment.url },
    });
    return { url: web.url };
  }),
);
```

### Mode 2 — Alchemy Convex

Users write an Alchemy/Effect DSL; Alchemy generates Convex files and deploys
through the normal Convex flow.

```ts
// src/convex/app.ts
import { App, Query, Mutation, Table } from "@alchemy/convex";
import { Effect, Schema } from "effect";

const Notes = Table("notes", { text: Schema.String, completed: Schema.Boolean });

const listNotes = Query("notes:list", {
  args: Schema.Struct({}),
  returns: Schema.Array(Notes.Document),
  handler: Effect.gen(function* () {
    const db = yield* Convex.Database;
    return yield* db.query(Notes).collect();
  }),
});

const createNote = Mutation("notes:create", {
  args: Schema.Struct({ text: Schema.String }),
  returns: Notes.Id,
  handler: ({ text }) =>
    Effect.gen(function* () {
      const db = yield* Convex.Database;
      return yield* db.insert(Notes, { text, completed: false });
    }),
});

export default App.make({ tables: [Notes], functions: [listNotes, createNote] });
```

### Mode 3 — Alchemy Convex Runtime (experimental)

Same authoring model, but no generated Convex files on disk — Alchemy
bundles/pushes directly. The most Effect-native mode: app definition, deployment,
runtime services, observability, and tests all composed through Layers.

```ts
const backend = yield* App("Backend", {
  app: app.pipe(
    Effect.provide(LoggerLive),
    Effect.provide(AuthLive),
    Effect.provide(EmailLive),
  ),
  project: "my-app",
  type: "dev",
});
```

### Mode 4 — Confect Adapter

Existing Confect users keep authoring with Confect; Alchemy wraps
project/deployment/env/stage/preview/deploy lifecycle around it, and can bind
Cloudflare resources into the same program.

```ts
import { App } from "@alchemy/convex-confect";
import * as Cloudflare from "alchemy/Cloudflare";
import confectApp from "./confect/app";

const bucket = yield* Cloudflare.R2Bucket("Uploads");

const backend = yield* App("Backend", {
  app: confectApp,
  project: "my-app",
  type: "dev",
  bindings: { UPLOADS: bucket },
  env: { APP_ENV: "dev" },
});
```

Or, once Confect exposes a stable manifest:

```ts
const manifest = yield* Confect.buildManifest(confectApp);
const backend = yield* Convex.Deployment("Backend", {
  project: "my-app", type: "dev", manifest,
});
```

**The current leaning** is a thin Confect adapter: Confect stays the source of
truth for authoring; Alchemy manages lifecycle; the adapter respects Confect's
generated-file and package boundaries; a stable manifest/API can come later.

**Tradeoffs.** A thin adapter is lowest-risk but Alchemy understands little before
Confect's codegen runs. A deeper integration gives better lifecycle/type
introspection, richer previews, and cleaner binding — but needs a clearer public
boundary from Confect and risks coupling the projects too early.

---

## Our position (answering the RFC's questions)

Grounded in this repo's stance (config-as-data, Effect-native substrate):

1. **Does the adapter fit the direction?** Yes — it's the natural fourth layer.
   The whole arc here is "push the declarative boundary outward." Alchemy pushes it
   past the deployment edge. The adapter is the right *first* shape.
2. **Thin wrapper or manifest/API boundary?** Thin adapter **first**, graduating to
   a manifest. The seam should be the **post-codegen artifact** — Confect already
   emits generated `convex/_generated` + a function/schema description; that *is*
   the public boundary. Build the adapter against it now; promote it to a typed
   `Confect.buildManifest` once it's stable. Don't block the adapter on the manifest.
3. **Confect internals to avoid.** Anything pre-build: the private codegen file
   layout, the internal structure of Effect service tags, and any in-memory app
   object that only exists before bundling. Depend on the *deployable artifact*
   (generated functions + schema manifest + the deployment URL/env), not the
   authoring graph.
4. **Where Confect stays authoring / Alchemy orchestrates.** Clean split:
   - **Confect (authoring):** Schema tables, function contracts, runtime services,
     encode/decode boundaries — *what the app is*.
   - **Alchemy (orchestration):** project/deployment/env/stage/preview/deploy, and
     non-Convex resources (Workers, R2, Queues, Durable Objects) — *where it runs
     and what it's wired to*.
   - **The seam is the bindings map + the deployment artifact.** Alchemy provisions
     a resource, hands its address into `bindings`, and Confect reads it as a typed
     env/service. Neither reaches into the other's model.
5. **Package space.** Experimental first, in Alchemy's space (`alchemy/Convex`,
   `@alchemy/convex-confect`). Confect optionally exposes `buildManifest` later if
   the adapter proves the boundary. Don't move it into Confect's core until the
   manifest is real.

In short: **the bindings map and the deployment artifact are the contract.** Keep
both projects decoupled across that line and the adapter can deepen without a
big-bang coupling.

---

## Cloudflare at the app level — and Durable Objects specifically

The reason this matters beyond lifecycle management: once infra is part of the
Effect program, you can **bind Cloudflare primitives directly into the app** and
give them typed, service-shaped access. The honest framing first, because it's
load-bearing:

> **Convex stays the system of record.** Facts, bitemporality, reactivity, and
> transactional consistency live in Convex. Cloudflare primitives are *complements
> at the edge*, never a second source of truth — two sources of truth for the same
> state is a consistency nightmare. DOs and friends hold ephemeral/coordination
> state and **write facts back** to Convex.

With that rule, each primitive lands cleanly against a VISION pillar:

| Cloudflare primitive | Role here | Pillar |
| --- | --- | --- |
| **R2** | document / e-sign blob storage; crypto-shred erasure for blobs | §12 documents/privacy |
| **Queues** | drive batched, resumable reconciler / `applyConfig` / rebuild jobs | the transaction-limit constraint (PLAN.md) |
| **KV** | edge cache of read-authorization grants & config snapshots | §9 authorization |
| **Workers** | edge HTTP; the integration **egress boundary**; an NL→AST gateway | §8 integrations, §10 AI |
| **Durable Objects** | strongly-consistent, addressable **stateful actors** | §4 workflows, §7 experience |

### Durable Objects as an app-level abstraction

A DO is a single-threaded, strongly-consistent, addressable actor with its own
storage, alarms (timers), and WebSocket hibernation. That description is *exactly*
the shape of three things this system already has — so "DO at the app level" means
declaring those actors in the same DSL as `Table`/`Query`/`Mutation`, and letting
Alchemy provision the DO class + binding while Confect/Effect give it typed access.

**1. Per-flow actor.** Each parked `flowRun` ↔ a DO addressed by its token. The DO
owns the run's working state, holds the live WebSocket to the `/collect` page,
fires **alarms** for reminder/escalate/expire (today's scheduler ticks), and
resumes on events — then writes the resulting facts back to Convex. This is
arguably a *more* natural home for long-lived, externally-driven workflows with
live connections than the scheduler is.

```ts
// authored alongside tables/functions; Alchemy provisions the DO + binding
const FlowActor = DurableObject("flow", {
  state: Schema.Struct({ runId: Schema.String, step: Schema.String, ctx: Schema.Unknown }),
  alarms: ["reminder", "escalate", "expire"],     // → ctx.storage.setAlarm
  handler: (msg) =>
    Effect.gen(function* () {
      const convex = yield* Convex.Client;          // typed Confect access
      // advance the step; park on collect; on submission, write facts back:
      yield* convex.mutation(api.flows.recordStep, { ... });
    }),
});

const backend = yield* App("Backend", {
  app: confectApp,
  bindings: { FLOW: FlowActor, UPLOADS: yield* Cloudflare.R2Bucket("Uploads") },
});
```

**2. Per-session projection actor (ties to [foldkit.md](./foldkit.md)).** A DO holds
the materialized **Model/projection** for a client session and fans updates out
over WebSocket — the edge cache for "the client is a projection of the ontology."
Convex already pushes reactive reads, so this is specifically for edge-local,
multi-client **collaborative presence** layered on the fact store (cursors,
who's-viewing, optimistic local Messages) without making any of that a fact.

**3. Per-entity actor.** A hot entity mid-process (a Worker being onboarded) gets a
DO that **serializes concurrent actions** and rate-limits external calls (the
E-Verify integration), then commits the outcome as facts. Single-threaded DO
semantics give you a clean mutual-exclusion boundary that Convex transactions
don't model directly.

The unifying move: a Durable Object becomes a **first-class authoring primitive**
next to `Table`/`Query`/`Mutation`, composed through Layers like everything else —
`DurableObject(...)` declares the actor, Alchemy wires the binding, and the actor's
handler is an Effect with typed Convex access. Convex is the durable ledger; the DO
is the live actor in front of it.

```
                         alchemy.run.ts  (one Effect program)
                                 │
   ┌────────────┬────────────────┼───────────────┬───────────────┐
   ▼            ▼                 ▼               ▼               ▼
Convex      CF Workers      Durable Objects     R2            Queues
(facts,     (edge HTTP,     (flow / session /   (document      (batched
 reactive,   egress,         entity actors)      blobs)         reconciler
 bitemporal) NL→AST)         ↑ write facts back               jobs)
   ▲                                 │
   └───────── system of record ──────┘
```

---

## Honest caveats

- **Convex / DO overlap is real — choose deliberately.** Both are stateful,
  consistent compute. The discipline is one system of record (Convex) and DOs as
  coordination/edge actors that write back. Blur that and you get split-brain.
- **Two runtimes, two deploy targets.** Convex isolate + Cloudflare Workers/DOs are
  separate platforms. Alchemy's value is unifying their *lifecycle* in one program;
  it does not make them one runtime.
- **Maturity.** Alchemy v2's Convex provider and a Confect `buildManifest` are
  early/aspirational (Mode 3's no-files runtime and the manifest option most of
  all). The thin adapter is the only low-risk step today.
- **The transaction-limit constraint still stands** (PLAN.md). Queues can *drive*
  batched reconciler/rebuild continuations, but each Convex mutation is still one
  bounded transaction; Alchemy doesn't change that contract, it just lets you wire
  the queue that paces it.

## Recommendation

Ship the **thin Confect adapter** first: Confect authors, Alchemy orchestrates
lifecycle, and the **bindings map + deployment artifact** are the only contract
between them. Add Cloudflare primitives through that bindings seam, with **Durable
Objects as an app-level actor primitive** for flows, sessions, and hot entities —
Convex remaining the system of record throughout. Graduate to a typed
`Confect.buildManifest` boundary only once the adapter has proven the shape.
