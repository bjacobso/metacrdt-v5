# Shadow Rooms — one Forma document, three parallel elaborations

> Exploration, not a build spec. Companion to
> [`alchemy.md`](./alchemy.md) (Alchemy v2 + Confect position),
> [`../vision/forma.md`](../vision/forma.md) (Forma → MetaCRDT IR), and
> [`../plans/views.md`](../plans/views.md) (ViewSpec generated from Forma
> preludes). This doc uses a concrete product idea — **Shadow Rooms** — to show
> the next elaboration backend: **Forma → Alchemy v2 Effect TypeScript**, sitting
> beside the ontology and ViewSpec elaborations as *parallel projections of one
> document*.

---

## 0. The product premise (one paragraph)

Every group chat gets a **shadow room**: a private, consent-scoped, append-only
activity log continuously populated by events from the members' apps (Spotify,
Strava, Steam, Kindle, Calendar, GitHub, …). Nobody posts; sources emit, members
consent, the room accumulates. Chat, feed, digest, search, and AI memory are all
*projections* of the same log. The unit is not a profile or a feed — it is the
room. This is a MetaCRDT for human activity: a shared append-only event graph
where a chat is just one view over the room.

The physics in one equation:

```
group memory = Σ(consented activity events) → rules → projections, over time
```

That decomposition *is* the MetaCRDT decomposition: events are **facts**, consent
and emission rules are **derived coherence**, reactions and curation are
**intentions/effects**, and the room itself is **coordination**. Which is why one
Forma document can carry the whole product — what's new here is that the
*deployment* becomes a third parallel elaboration of that same document.

---

## 1. Parallel elaboration — the extended layering

`vision/forma.md` draws authoring → IR → runtime → target as one vertical path.
Shadow Rooms makes the horizontal structure explicit: **one document, N
elaborators, each producing a different typed artifact**, with cross-references
checked across all of them.

```text
                       shadow-rooms.lisp   (one Forma document)
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼ elaborate:ontology    ▼ elaborate:viewspec     ▼ elaborate:alchemy
  Effect-Schema Ontology IR   ViewSpec IR             Infra IR
  (entities, activities,      (feed / digest /        (stack, resources,
   consent, emission rules)    memory projections)     actors, bindings)
        │                       │                        │
        ▼                       ▼                        ▼
  Confect runtime +           @metacrdt/views          alchemy.run.ts
  fact-lowering (Convex)      runtime + renderers      (Effect program: Convex
                                                        deployment, CF Workers,
                                                        Durable Objects, R2, Queues)
        └───────────── cross-elaboration references ─────────────┘
          (an actor's :of names an entity; a worker serves a view;
           a binding carries a deployment URL — all checked at elaboration)
```

The point of "parallel" rather than "sequential": the alchemy elaboration is not
downstream of the ontology elaboration — both read the same forms, and the
elaborator resolves references *between* their outputs (e.g. a Durable Object's
state schema is the ontology elaboration of the entity it names).

---

## 2. Elaboration 1 — the ontology (the room's physics)

Real Forma surface (same conventions as `vision/forma.md` §2). The particles:

```lisp
(define-entity Person
  (:field [person/handle String {:required true}]))

(define-entity Room
  (:field [room/name     String {:required true}])
  (:field [room/members  (Set (Ref Person)) {:required true}]))

;; the core particle: an ambient activity event
(define-entity Activity
  (:field [activity/actor       (Ref Person) {:required true}])
  (:field [activity/source      (enum spotify strava steam kindle calendar github photos) {:required true}])
  (:field [activity/verb        Symbol  {:required true}])
  (:field [activity/object      (Ref Entity)])
  (:field [activity/occurred-at Instant {:required true}])
  (:field [activity/payload     Json]))

;; the force law: nothing enters a room without consent
(define-entity Consent
  (:field [consent/actor   (Ref Person) {:required true}])
  (:field [consent/source  Symbol       {:required true}])
  (:field [consent/room    (Ref Room)   {:required true}])
  (:field [consent/verbs   (Set Symbol) {:required true}])
  (:field [consent/redactions Json]))
```

The emission rule is derived coherence — a Datalog `when` + `emit`, not an
imperative pipeline:

```lisp
(define-rule room-emission
  (:when  [?a type Activity] [?a activity/actor ?p]
          [?r type Room]     [?r room/members ?p]
          [?c type Consent]  [?c consent/actor ?p] [?c consent/room ?r]
          [?c consent/source ?src] [?a activity/source ?src])
  (:guard (member? (verb-of ?a) (consent-verbs ?c)))
  (:emit  [room-event ?r (redact ?a (consent-redactions ?c))]))
```

And the DSL-builder magic — **each integration is just a new form** extending
`Activity`. Adding a source is authoring, not engineering:

```lisp
(define-form spotify-listen
  (:extends Activity) (:source spotify) (:verb listened)
  (:object Track)
  (:redact ((private-session true))))

(define-form strava-run
  (:extends Activity) (:source strava) (:verb completed-run)
  (:object Workout)
  (:redact ((exact-route default-hidden))))
```

This elaboration lowers exactly as `vision/forma.md` already specifies: entities
→ schema-as-facts, rules → derived facts, forms → typed Effect Schemas via
`@forma/ts`'s existing descriptor path. Nothing new is needed here — which is
the point: the product's physics costs zero new machinery.

---

## 3. Elaboration 2 — the ViewSpec (chat is one projection)

Projections are authored in the same document and elaborate to ViewSpec IR
(the `views.md` Phase 6 path — "Forma lens/view defs lower to ViewSpec"):

```lisp
(define-view room-feed
  (:of Room)
  (:queries ((events (room-events ?room (:order occurred-at :desc)))))
  (:root (list (:bind events) (:item activity-card))))

(define-view room-digest
  (:of Room)
  (:queries ((week (room-events ?room (:window (days 7))))))
  (:root (summary (:bind week) (:group-by activity/source))))

(define-view room-memory
  (:of Room)
  (:queries ((all (room-events ?room))))
  (:root (search (:bind all) (:index (activity/verb activity/object occurred-at)))))
```

Each lowers to a ViewSpec envelope (`queries` as opaque data-dependency
descriptors, `root` as view-nodes) — `@metacrdt/views` stays query-agnostic and
render-agnostic; the edge binds `room-events` to `@metacrdt/query` over the fact
store. Chat, feed, digest, memory, and the AI-context window are five ViewSpecs
over one log, which is the product thesis stated as architecture.

---

## 4. Elaboration 3 — the Alchemy v2 DSL (the new part)

`explorations/alchemy.md` establishes the target: Alchemy v2 models
infrastructure as an Effect program (`Alchemy.Stack` + `Effect.gen`, resources
yielded, bindings as the seam, Durable Objects as app-level actors). The
question this doc answers: **what is the Forma surface that elaborates into
that program?**

Three forms: `define-stack` (the program), `define-resource` (a yielded
resource), `define-actor` (a Durable Object that names an ontology entity).

```lisp
(define-stack shadow-rooms
  (:providers convex cloudflare)
  (:stages (dev preview prod)))

;; the system of record — note :source is the *ontology elaboration itself*
(define-resource backend (Convex.Deployment)
  (:project "shadow-rooms")
  (:type (stage-case (dev dev) (preview preview) (prod prod)))
  (:source (elaborated :ontology)))          ; cross-elaboration reference

;; blob storage for photo/media payloads
(define-resource media (Cloudflare.R2Bucket))

;; pacing for digest/memory-compaction jobs (the transaction-limit constraint)
(define-resource digests (Cloudflare.Queue))

;; the egress boundary: integrations webhook in here, consent enforced at the edge
(define-resource ingest (Cloudflare.Worker)
  (:main "./src/ingest.ts")
  (:routes ("/hooks/:source"))
  (:bindings (:CONVEX_URL (ref backend url))   ; refs build the dependency DAG
             (:ROOM      (ref room-actor))
             (:MEDIA     (ref media))
             (:DIGESTS   (ref digests))))

;; one live actor per room — the DO from alchemy.md, now ontology-aware
(define-actor room-actor (Cloudflare.DurableObject)
  (:of Room)                                   ; state schema = elaboration of Room
  (:state (Schema (working-set Room)))
  (:alarms ((digest  (weekly sunday))
            (compact (monthly))))
  (:serves (room-feed room-digest))            ; cross-ref into the ViewSpec elaboration
  (:handler
    (effect (msg)
      (:require Convex.Client)
      (match msg
        ((room-event ?e) (do (fanout! ?e) (mutation! rooms/record ?e)))
        ((alarm digest)  (enqueue! digests (digest-job (self))))))))
```

What the forms mean, in MetaCRDT terms:

- A `define-resource` is a **fact about desired infrastructure**. The document
  is a declarative desired-state graph, not a script.
- `(ref backend url)` is the **bindings seam** from `alchemy.md` made into
  syntax. Refs are the edges of a DAG; elaboration topologically sorts them
  into the `yield*` order of the generated `Effect.gen`. A cycle is an
  elaboration-time type error, not a runtime deadlock.
- `(elaborated :ontology)` and `(:of Room)` / `(:serves room-feed)` are
  **cross-elaboration references**: the infra elaboration consumes the *outputs*
  of the sibling elaborations. Renaming `Room` breaks the actor's `:of` at
  elaboration time. This is the concrete payoff of "parallel" — one document
  means infra cannot drift from ontology.
- `stage-case` is the only conditional. Stages are data; the elaborator emits
  one program parameterized over stage, mirroring Alchemy's own stage model.
- Alchemy's reconciliation (diff desired vs. actual, converge) is **derived
  coherence over infrastructure facts**; a deploy is an **intention/effect**.
  Same physics, one level out.

---

## 5. What it elaborates into — the generated Effect program

The alchemy elaborator emits a valid Alchemy v2 / Effect TypeScript program
(the Mode-1/Mode-4 shape from `alchemy.md`, with the Confect app coming from
the ontology elaboration):

```ts
// alchemy.run.ts — GENERATED from shadow-rooms.lisp; do not edit
import * as Alchemy from "alchemy";
import * as Convex from "alchemy/Convex";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer, Schema } from "effect";
import confectApp from "./generated/confect/app";        // ← elaborate:ontology
import { RoomWorkingSet } from "./generated/schema/room"; // ← elaborate:ontology
import { roomFeed, roomDigest } from "./generated/views"; // ← elaborate:viewspec

export default Alchemy.Stack(
  "shadow-rooms",
  { providers: Layer.mergeAll(Convex.providers(), Cloudflare.providers()) },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    // topo order derived from refs: backend, media, digests → room-actor → ingest
    const backend = yield* Convex.Deployment("Backend", {
      project: "shadow-rooms",
      type: stage === "prod" ? "prod" : stage === "preview" ? "preview" : "dev",
      app: confectApp,
    });

    const media = yield* Cloudflare.R2Bucket("Media");
    const digests = yield* Cloudflare.Queue("Digests");

    const roomActor = yield* Cloudflare.DurableObject("RoomActor", {
      state: RoomWorkingSet,                       // ontology-derived schema
      alarms: { digest: "weekly:sunday", compact: "monthly" },
      serves: [roomFeed, roomDigest],              // viewspec-derived
      handler: (msg) =>
        Effect.gen(function* () {
          const convex = yield* Convex.Client;
          switch (msg._tag) {
            case "RoomEvent":
              yield* fanout(msg.event);
              yield* convex.mutation(api.rooms.record, { event: msg.event });
              break;
            case "Alarm.digest":
              yield* Cloudflare.Queue.send(digests, digestJob(msg.roomId));
              break;
          }
        }),
    });

    const ingest = yield* Cloudflare.Worker("Ingest", {
      main: "./src/ingest.ts",
      routes: ["/hooks/:source"],
      bindings: {
        CONVEX_URL: backend.url,
        ROOM: roomActor,
        MEDIA: media,
        DIGESTS: digests,
      },
    });

    return { url: ingest.url, convex: backend.url };
  }),
);
```

Every structural decision in the output is mechanical: refs → `yield*` order,
`stage-case` → the stage ternary, `:bindings` → the bindings map,
cross-elaboration refs → imports of sibling-elaboration artifacts. The handler
body is the only part that is *translated* rather than *arranged* (Forma
`effect`/`match` → `Effect.gen` + tagged-union switch), and it can start life as
an escape hatch (`(:handler (ts "./src/room-actor.ts"))`) before the effect
sublanguage is trusted.

---

## 6. The elaborator as code generator

This follows the proven `@forma/ts` pipeline (the same one that generates the
ViewSpec Schema in `views.md`), with one new IR and one new emitter:

```
shadow-rooms.lisp
      │  parseDescriptorPrelude        (existing reader)
      ▼
descriptors (define-stack / define-resource / define-actor nodes)
      │  elaborate:alchemy
      ▼
Infra IR  =  Schema.Struct({
               stack:     StackMeta,
               resources: Array(ResourceNode),   // provider, kind, props
               actors:    Array(ActorNode),      // of-entity, alarms, serves, handler AST
               edges:     Array(Ref),            // the dependency DAG
             })
      │  topo-sort edges; resolve cross-elaboration refs against sibling IRs
      ▼
emission (two modes, mirroring alchemy.md's Mode 2 vs Mode 3):
  a) codegen mode  → alchemy.run.ts source text on disk, vendored + drift-tested
                     (like the views Schema: regenerated, never hand-maintained)
  b) runtime mode  → an in-memory Effect<Stack> value handed to Alchemy directly,
                     no files (viable only if Alchemy's Mode-3 runtime matures)
```

Design rules carried over from the rest of the repo:

- **The Infra IR is itself an Effect Schema** — infra descriptions are data you
  can validate, diff, store as facts, and project (a "what is deployed where"
  ViewSpec falls out for free).
- **Codegen mode first.** Generated-and-vendored with a drift test is the
  pattern views already proved; it keeps the output inspectable and gives an
  escape hatch (edit the generated file → the drift test tells you to promote
  the change into the Forma source).
- **The bindings map stays the contract** (alchemy.md's conclusion). The
  elaborator never reaches into Confect internals; it imports the
  *post-elaboration artifacts* of its siblings.

---

## 7. One physics, three projections

| MetaCRDT primitive | Ontology elaboration | ViewSpec elaboration | Alchemy elaboration |
| --- | --- | --- | --- |
| **Facts** | activity events in the room | — (views never own data) | resource declarations (desired state) |
| **Derived coherence** | emission rules, redaction | every view: a deterministic projection | reconciliation (desired vs. actual) |
| **Intentions / effects** | reactions, curation, consent grants | view `actions`/`events` emitting facts | deploys, alarms, queue sends |
| **Coordination** | the room (membership, consent scope) | shared view state | the DO actor; the bindings seam |

The slogan version: *the room is an append-only event graph; the UI is a fold
over it; the deployment is a fold over its description.* Shadow Rooms is a good
forcing function precisely because it needs all three at once — ambient
ingestion (infra), consent physics (ontology), and many projections of one log
(views).

---

## 8. Honest caveats

- **Alchemy v2's Convex provider is aspirational** (per `alchemy.md`); codegen
  mode deliberately targets the published `Alchemy.Stack` surface so the
  generated file is useful even if hand-finished. Runtime mode waits on Mode 3.
- **The handler sublanguage is the hard 20%.** Arranging resources is
  mechanical; translating `(effect (msg) (match …))` to idiomatic Effect is a
  real compiler. Ship the `(ts "./file.ts")` escape hatch first.
- **Cross-elaboration refs need a shared symbol table.** Today each elaboration
  is independent; "parallel" requires the elaborator to run all three against
  one resolved namespace. That's new plumbing in `@forma/ts`, not a new theory.
- **Don't let infra forms leak into the ontology.** `define-resource` lowers to
  infra IR only; it must never become a fact in the product's substrate, or the
  "Convex is the system of record" rule from `alchemy.md` gets violated by the
  deploy system itself.
- **Shadow Rooms the product** has its own non-architectural risks (integration
  API access, consent UX, cold-start of a network of rooms) — out of scope
  here; the product is the running example, not the commitment.
