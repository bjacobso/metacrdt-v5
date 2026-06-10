# Algebra DSL — Operational Algebra as an Effect/Schema TypeScript DSL

> `💭` Exploration, not a decision — see [`README.md`](./README.md). What would
> it look like to define and *use* Operational Algebra from TypeScript in the
> `HttpApi` idiom: a declarative, fully-typed definition that is data, with
> implementations provided separately and multiple artifacts derived from one
> declaration?
>
> Grounded on the reduced kernel
> ([`../vision/operational-algebra.md`](../vision/operational-algebra.md):
> assert / fold / react + two laws) rather than the pre-reduction primitives.
> Companion to [`../vision/dsl.md`](../vision/dsl.md) (the six domain DSLs —
> the derived-forms tier this doc puts a floor under),
> [`../vision/forma.md`](../vision/forma.md) (the Lisp front-end to the same
> IR), and [`confect.md`](./confect.md) (the runtime-shape tier this lowers
> into on the Convex target).

---

## 0. The thesis: HttpApi's shape *is* the algebra's shape

`HttpApi` works because of four separations, and every one of them has an
exact counterpart in the kernel:

| `@effect/platform` HttpApi | Operational Algebra | Why it's the same move |
| --- | --- | --- |
| `HttpApi.make(...)` — the api is **data** | `Algebra.make(...)` — definitions are facts | declaration ≠ execution |
| `HttpApiBuilder.group(api, ..., handlers)` — impls provided separately | **Executors at the boundary** ([`operational-algebra.md`](../vision/operational-algebra.md) §5.1) | the definition/implementation split *is* the log/boundary split |
| `HttpApiMiddleware` | **Authority guards at admission** (§2.5) | cross-cutting gate, declared once |
| `HttpApiClient.make(api)` / OpenAPI derivation | typed client, forms, views, **lowering to facts** | one declaration, many derived artifacts |

And the deepest alignment, which only Effect can express:

> **The §5 residue is the `R` channel.** Everything inside the log is pure
> (`R = never`); everything that resists reduction — external effects, clocks,
> admission coordination — surfaces as *requirements*. An algebra with no
> boundary executors yields `Layer<AlgebraRuntime, never, never>`. Add a
> `send-email` action and the type becomes
> `Layer<AlgebraRuntime, never, Mailer>` — the boundary discipline, enforced
> by the compiler.

---

## 1. Tier 0 — the kernel as a service

Two verbs, one service. This is the *entire* interface to the substrate:

```ts
import { Context, Effect, Schema, Stream } from "effect"

// what you write — the substrate stamps (vt, tt, author) at admission,
// the way HttpApi's request context supplies what the handler never names
export class Fact extends Schema.Class<Fact>("Fact")({
  s: Schema.String,
  a: Schema.String,
  v: Schema.Unknown,
}) {}

export class Refused extends Schema.TaggedError<Refused>()("Refused", {
  fact: Fact,
  reason: Schema.Literal("unauthorized", "invariant"),
}) {}

export class Log extends Context.Tag("oa/Log")<Log, {
  // the only effect: propose; the substrate disposes
  readonly assert: (fact: Fact) => Effect.Effect<void, Refused>
  // the only read: a deterministic fold over the log
  readonly fold: <S>(step: (state: S, fact: Fact) => S, init: S) => Effect.Effect<S>
  // law 1 makes this well-defined: the folded value converges across replicas
  readonly changes: Stream.Stream<Fact>
}>() {}
```

A reaction is a fold whose output is asserted — which in Effect is not an API
call, it is a **Layer** (installing a standing process is providing it):

```ts
export const Reaction = {
  make: <S>(opts: {
    readonly name: string
    readonly on: (fact: Fact) => boolean
    readonly emit: (fact: Fact) => Effect.Effect<ReadonlyArray<Fact>, never, Log>
  }) => opts,
  layer: (r: ReturnType<typeof Reaction.make>) =>
    Layer.scopedDiscard(
      Effect.gen(function* () {
        const log = yield* Log
        yield* log.changes.pipe(
          Stream.filter(r.on),
          Stream.mapEffect((f) => r.emit(f).pipe(Effect.flatMap(Effect.forEach(log.assert)))),
          Stream.runDrain,
          Effect.forkScoped,
        )
      }),
    ),
}
```

Everything below is derived forms over this one service — the DSL equivalent
of [`forma-zero.md`](../vision/forma-zero.md)'s layers.

## 2. Entities and relations — Schema classes, attributes as facts

The `Schema.Class` / `Model` idiom, where each field is an attribute
definition and a `Ref` field is a relation (the attribute position, per
[`operational-algebra.md`](../vision/operational-algebra.md) §2.2):

```ts
export class Department extends Entity.Class<Department>("Department")({
  name: Schema.String,
}) {}

export class Employee extends Entity.Class<Employee>("Employee")({
  name: Schema.String,
  status: Schema.Literal("active", "terminated"),
  department: Entity.Ref(() => Department),
  reportsTo: Schema.optional(Entity.Ref((): typeof Employee => Employee)),
}) {}
```

`Entity.Class` gives three things `Schema.Class` alone doesn't:

- **lowering** — `Entity.toFacts(Employee)` emits the schema-as-facts carriers
  ([`../vision/triples.md`](../vision/triples.md)); the class *is* the
  `(define-entity …)` form;
- **a subject brand** — `Employee.Id` is a branded `Schema.String`, so refs
  can't cross entity types;
- **a pattern factory** — used by the query layer below.

## 3. Typed Datalog — the part HttpApi can't do and this can

HttpApi's signature trick is type-safe paths. The algebra's analog is
type-safe *patterns*: query variables carry their entity type, attributes are
checked against the schema, and the result row type is inferred:

```ts
const directReports = Query.vars({ e: Employee, m: Employee, d: Department })
  .where(($) => [
    $.e.department($.d),
    $.d.name("Engineering"),
    $.e.reportsTo($.m),
  ])
  .select(($) => ({ name: $.e.name, manager: $.m.name }))
// Query<{ readonly name: string; readonly manager: string }>
```

- `$.e.department($.m)` — compile error: `department` relates to `Department`,
  not `Employee`.
- `$.d.name(42)` — compile error: `name` is `Schema.String`.
- The `where` clause is **data** (it serializes to the Datalog AST that
  [`../vision/convex.md`](../vision/convex.md) compiles to indexed reads) and
  its reference semantics are the conformance kernel's `where` — the same
  query must produce the same rows on the 150-line fold and on the production
  engine.

`Query.fold(directReports)` lowers to the kernel verb: a query *is* a fold,
materialized or not is the engine's choice
([`../vision/performance.md`](../vision/performance.md)).

## 4. Constraints — one fold, two trigger disciplines

The §2.3 distinction (invariant vs. obligation) becomes a literal field, and
each desugars to a different runtime artifact:

```ts
const I9Required = Constraint.make("i9-required", {
  when: Query.vars({ e: Employee }).where(($) => [$.e.status("active")]),
  require: ($) => $.e.submitted(I9),
  mode: "obligation",            // violations become `must` facts (reconciler)
})

const NoSelfApproval = Constraint.make("no-self-approval", {
  when: Query.vars({ a: Approval }).where(($) => [$.a.approver($.a.subject)]),
  mode: "invariant",             // admission guard: the transaction is Refused
})
```

`mode: "obligation"` derives a `Reaction` (the
[`../vision/compliance.md`](../vision/compliance.md) reconciler); `mode:
"invariant"` derives **middleware** — see §6.

## 5. Actions — pure ones need no implementation; external ones demand one

The HttpApi definition/handler split, applied with the kernel's boundary rule:

```ts
// PURE: consumes facts, produces facts — the definition IS the implementation
const Terminate = Action.make("terminate", {
  input: Schema.Struct({ employee: Employee.Id, reason: Schema.String }),
  asserts: ({ employee }) => [Employee.fact(employee, "status", "terminated")],
})

// EXTERNAL: crosses the boundary — declares an effect it cannot perform
const SendWelcomeEmail = Action.make("send-welcome-email", {
  input: Schema.Struct({ employee: Employee.Id }),
  external: true,                 // ← the §5.1 residue, as a flag
  results: Schema.Struct({ messageId: Schema.String }),
})
```

A pure action is complete as written. An external action is the analog of an
unimplemented endpoint: the algebra will not build into a runtime until an
**Executor** is provided —

```ts
const SendWelcomeEmailLive = Executor.make(SendWelcomeEmail, ({ employee }) =>
  Effect.gen(function* () {
    const mailer = yield* Mailer                  // ← requirement surfaces in R
    const id = yield* mailer.send(employee, "welcome")
    return { messageId: id }                      // → result facts, asserted
  }),
)
```

— and the requirement (`Mailer`) flows into the runtime Layer's `R`. Intent
fact out, effect at the boundary, result fact in: the
[`../vision/integrations.md`](../vision/integrations.md) pattern, typed.

## 6. Authority — grants are facts, the guard is middleware

```ts
const ManagerApproves = Grant.make(Role.Manager).can(Approve, {
  over: Onboarding,
})
```

`Grant.make` produces *facts* (nothing operator-like — `authorize` is an
assertion, per [`operational-algebra.md`](../vision/operational-algebra.md)
§3). Enforcement is declared once, like `HttpApiMiddleware`:

```ts
const algebra = Algebra.make("onboarding")
  .middleware(Authority.guard)     // folds grants × author at admission
```

The guard is itself a fold over grant facts plus the proposing author — the
validator pattern, uniform for humans and agents
([`../vision/ai.md`](../vision/ai.md)).

## 7. The container, and what derives from it

```ts
export const Onboarding = Algebra.make("onboarding")
  .add(Department, Employee, I9)                    // entities (facts)
  .add(I9Required, NoSelfApproval)                  // constraints (folds)
  .add(Terminate, SendWelcomeEmail)                 // actions (reactions)
  .add(OnboardingProcess)                           // step graph (facts + one reaction)
  .add(ManagerApproves)                             // authority (facts)
  .middleware(Authority.guard)
```

One declaration, many artifacts — the `HttpApiClient` / OpenAPI move:

```ts
// 1. the running system — type error if an external action lacks its Executor
const Runtime: Layer.Layer<AlgebraRuntime, never, Mailer> =
  AlgebraRuntime.layer(Onboarding).pipe(Layer.provide(SendWelcomeEmailLive))

// 2. a typed client — propose facts, invoke actions, run/subscribe queries
const client = yield* AlgebraClient.make(Onboarding)
yield* client.actions.terminate({ employee, reason: "end of contract" })
const rows  = yield* client.query(directReports)
//    ^ Effect<ReadonlyArray<{ name: string; manager: string }>, Refused>

// 3. lowering — the definition becomes facts in its own log (homoiconicity)
const definitionFacts = Algebra.toFacts(Onboarding)

// 4. front-end parity — the same IR Forma elaborates to (forma.md §1)
const forma = Algebra.toForma(Onboarding)   // printable, diffable, reviewable

// 5. derived surfaces
const forms = Forms.derive(Onboarding)      // a form = required-but-missing facts
const views = Views.derive(Onboarding)      // experience.md: UI as a fold
```

Artifact 3 is the load-bearing one: because `Algebra.make(...)` is plain data
(like `HttpApi`), lowering it to facts means **the TS DSL and Forma are two
notations for the same declarations** — the
[`../vision/branding.md`](../vision/branding.md) "Business as Code" story with
TypeScript as a first-class authoring surface beside markdown + Forma.

## 8. Type-level accumulation (the HttpApi generics, transposed)

`HttpApi` threads `<Groups, Errors, Requirements>` through `.add`. The algebra
threads:

```ts
interface Algebra<
  in out Name extends string,
  in out Entities,        // union of Entity.Any added
  in out Actions,         // record of action name → input/result schemas
  in out Unprovided,      // external actions still missing Executors
> { /* … */ }
```

- `client.actions.*` is derived from `Actions` — full inference, no codegen.
- `AlgebraRuntime.layer` is only callable when `Unprovided = never` — a
  missing executor is a *compile* error, exactly like an unhandled endpoint
  in `HttpApiBuilder`.
- Query `$`-objects are derived from `Entities` — adding an entity to the
  algebra is what brings its attributes into pattern scope.

## 9. Where it sits in the stack

```
TS Algebra DSL (this doc)      Forma (.forma / markdown)      blueprint literal
        │                              │                            │
        └────────── construct / elaborate ──────────────────────────┘
                                │
                    Ontology IR (@metacrdt/schema)
                                │
                  Confect-shaped runtime (confect.md)
                                │
                 targets: Convex · Cloudflare · Node
                                │
                    convergence via @metacrdt/core
```

This is [`../vision/forma.md`](../vision/forma.md) §1 with the TS front-end
made concrete: the DSL **constructs** the same IR Forma **elaborates** to.
Neither front-end is privileged; the conformance suite
(`packages/@forma/conformance/forma-zero/`) is the semantic floor both must
sit on — and gains a natural fourth runner here (kernel cases through
`AlgebraClient` against an in-memory `Log`).

## 10. What a spike would prove (and what it wouldn't)

A worthwhile first slice, in order:

1. **`Log` + an in-memory layer** passing the forma-zero conformance cases
   through TS (`assert`/`fold`/reaction-layer only — no entities yet). This
   is conformance runner #4 and it is small.
2. **`Entity.Class` + typed `Query.vars`** — the typed-Datalog inference is
   the riskiest type-level work (the `$`-proxy types); prove it on two
   entities and one join before building anything else.
3. **One pure action + one external action** — demonstrate `Unprovided`
   flowing to a compile error and `Mailer` surfacing in the runtime's `R`.
4. **`Algebra.toFacts`** round-tripped against `Algebra.toForma` →
   re-elaborated — the two-notations-one-IR claim, executable.

Explicitly *not* in scope for a spike: forms/views derivation (needs the
views work), the Convex binding (Confect sidecar exists; wire later), and
merge semantics (law 1 belongs to `@metacrdt/core`, not the DSL — the DSL
only ever speaks through `Log`).

The exit question for the exploration: does the typed-Datalog `$`-proxy stay
ergonomic at realistic schema sizes, or does inference cost/error quality
degrade? That answer decides whether the TS surface is a peer front-end or a
thin client over Forma definitions.
