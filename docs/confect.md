# docs/confect.md — the whole app as Effect, via Confect

A design sketch: what convex-triples becomes if the entire backend is written in
[Effect](https://effect.website) on Convex via
[**Confect**](https://github.com/rjdellecese/confect) — a wrapper that brings
Effect + Effect `Schema` *inside* the Convex isolate (Schema-defined tables,
Effect handlers, an Effect-wrapped `ctx.db`, Schema-decoded documents).

Read alongside [VISION.md](../VISION.md) (§6 config-as-code, §10 AI) and
[PLAN.md](../PLAN.md) (the vision-vs-Convex assessment this doc partly revisits).

> **Status.** This started as a directional design sketch. As of 2026-06-07,
> Confect's current public docs and npm packages are v8.0.0 and use
> `@confect/core` / `@confect/server` primitives such as `DatabaseSchema`,
> `Table`, `GroupSpec`, `FunctionSpec`, `GroupImpl`, `FunctionImpl`, generated
> refs, and generated `DatabaseReader` / `DatabaseWriter` services. Nothing here
> is wired into the running app yet — Goal 2 in [PLAN.md](../PLAN.md) is the
> scoped spike that decides whether it should be.

---

## Current Confect surface to verify in the spike

The Goal 2 spike should use the current Confect shape, not the older
`defineConfectSchema` placeholder language below:

```text
confect/
  schema.ts           # DatabaseSchema.make().addTable(...)
  spec.ts             # Spec.make().add(group specs)
  impl.ts             # Impl.make(api) ... Impl.finalize
  *.spec.ts           # GroupSpec + FunctionSpec
  *.impl.ts           # GroupImpl + FunctionImpl
  _generated/         # generated refs / api / services
```

Observed package set:

- `@confect/core`
- `@confect/server`
- `@confect/cli`
- `@confect/react` (only needed if the frontend calls Confect refs directly)

The evaluation target is deliberately narrow: build a Confect sidecar around one
MetaCRDT protocol concern, prove codegen/deploy/test ergonomics, and then decide
whether `@metacrdt/convex` should use Confect internally.

---

## The thesis

Confect's premise is that Effect can run in the Convex V8 isolate. If true, three
seams we currently hand-maintain collapse:

1. **One schema, end to end.** Today `convex/schema.ts` uses `v.*` validators, the
   authoring DSL (see VISION §6) *lowers to a plain literal*, and
   `convex/appconfig.ts:applyConfig` *re-validates* that literal with `v.*`. With
   Confect, an Effect `Schema` **is** the table validator, **is** the function
   args/returns validator, and **is** the DSL's type. The "lower then re-validate"
   seam disappears.
2. **Errors become typed values.** `throw new Error("unknown flow")` becomes an
   `UnknownFlow` tagged error in the function's error channel. The Datalog
   `LIMITS` guards become a `QueryTooComplex` failure rather than a thrown string
   masked to the client as a generic "Server Error".
3. **`Date.now()` / `crypto.randomUUID()` become services.** These are exactly the
   calls that are footguns on Convex (forbidden in some contexts, nondeterministic
   in tests). Effect's `Clock` / `Random` services make them injectable — so the
   bitemporal and compliance tests use `TestClock` instead of `vi.useFakeTimers()`.

---

## 1. Schema as Effect Schema

```ts
import { Schema as S } from "effect"
import { defineConfectSchema, defineConfectTable, Id } from "confect"

const TxTime    = S.Number.pipe(S.brand("TxTime"))
const ValidTime = S.Number.pipe(S.brand("ValidTime"))
const EntityId  = S.String.pipe(S.brand("EntityId"))
const Value     = S.Unknown // ≈ v.any(), but decoded per-attribute at the edge

const FactEvent = S.Struct({
  txId: Id("transactions"),
  txTime: TxTime,
  kind: S.Literal("assert", "retract", "tombstone", "untombstone", "correction"),
  factId: S.optional(Id("facts")),
  e: EntityId, a: S.String, v: Value,
  validFrom: S.optional(ValidTime),
  validTo:   S.optional(ValidTime),
  reason:    S.optional(S.String),
})

export const confectSchema = defineConfectSchema({
  factEvents: defineConfectTable(FactEvent).index("by_e_a_tx", ["e", "a", "txTime"]),
  facts:      defineConfectTable(Fact).index("by_e_a", ["e", "a"]),
  // …transactions, currentFacts, derivedFacts, flowRuns, flowDefs…
})
```

A `Doc<"facts">` now comes back **already decoded** through `Fact`: `txTime` is
branded `TxTime`, you cannot pass a `ValidTime` where a `TxTime` is expected, and
the README's visibility predicate becomes type-checked arithmetic over branded
numbers.

## 2. The write path as an Effect program

`convex/facts.ts:assertInTx` today is imperative with implicit failure. As an
Effect, the handler reads as its own spec:

```ts
class CardinalityViolation extends S.TaggedError<CardinalityViolation>()(
  "CardinalityViolation", { attr: S.String },
) {}

export const assertFact = mutation({
  args: S.Struct({ e: EntityId, a: S.String, value: Value, validTo: S.optional(ValidTime) }),
  returns: Id("facts"),
  handler: (args) =>
    Effect.gen(function* () {
      const store = yield* TripleStore
      const now   = yield* Clock.currentTimeMillis            // injectable time
      const tx    = yield* store.openTransaction({ reason: `assert ${args.a}`, now })

      const card = yield* store.cardinalityOf(args.a)         // schema-as-facts read
      if (card === "one") yield* store.retractCurrent(args.e, args.a, now, tx)

      const factId = yield* store.appendAssert({ ...args, now, tx })
      yield* Materializer.onFactChange({ e: args.e, a: args.a, factId, kind: "assert" })
      return factId
    }),
})
```

`TripleStore`, `Clock`, `Materializer` are Effect **services** provided by a layer.
`retractCurrent` can fail with `CardinalityViolation`, which surfaces in the
function's error channel and is encoded back to the client as a typed
`ConvexError`.

## 3. Tagged errors instead of thrown strings

```ts
class UnknownFlow     extends S.TaggedError<UnknownFlow>()("UnknownFlow", { name: S.String }) {}
class QueryTooComplex extends S.TaggedError<QueryTooComplex>()("QueryTooComplex", { limit: S.String, got: S.Number }) {}
class Denied          extends S.TaggedError<Denied>()("Denied", { attr: S.String }) {} // the PII-authz pillar
```

The Datalog engine's bounded-query guards become `Effect.fail(new QueryTooComplex(...))`,
so the bounded-query contract lives in the *type* of `datalog`, not a comment.
`Denied` is the channel attribute-level authorization (VISION §9) would use: the
per-attribute read Effect fails-with-`Denied`, and the query layer catches and
omits it.

## 4. The Datalog engine as an Effect

The nested-loop join becomes an `Effect`/`Stream` bounded by a `Limits` config
service, failing typed instead of throwing:

```ts
export const datalog = query({
  args: DatalogQuery,                       // the AST as an Effect Schema → free validation
  returns: S.Struct({ rows: S.Array(Binding), provenance: S.Array(Id("facts")) }),
  handler: (q) =>
    Effect.gen(function* () {
      const limits = yield* Limits
      if (q.where.length > limits.maxClauses)
        return yield* new QueryTooComplex({ limit: "maxClauses", got: q.where.length })
      const engine = yield* Datalog
      return yield* engine.run(q)           // Effect<…, QueryTooComplex>
    }),
})
```

Because the AST is an Effect Schema, an LLM-emitted query (the AI pillar) is
`Schema.decode`d at the door — the validator boundary is literally the schema.

## 5. The config DSL stops "lowering"

The authoring DSL (VISION §6 / the Effect-Schema DSL sketch) no longer emits a
literal that `applyConfig` re-validates — **the DSL's output is an Effect Schema
value, and `applyConfig` decodes and interprets it directly:**

```ts
const StaffingModule = S.Struct({
  entities:     S.Array(EntityTypeDef),
  attributes:   S.Array(AttributeDef),
  forms:        S.Array(FormDef),
  flows:        S.Array(FlowDef),
  requirements: S.Array(RequirementDef),
  actions:      S.Array(ActionDef),
})

export const applyConfig = mutation({
  args: StaffingModule,                      // ← the DSL value, schema-validated on the way in
  returns: ApplyReport,
  handler: (cfg) =>
    Effect.gen(function* () {
      const store = yield* TripleStore
      yield* Effect.forEach(cfg.attributes,   store.defineAttribute,    { discard: true })
      yield* Effect.forEach(cfg.entities,     store.defineType,         { discard: true })
      yield* Effect.forEach(cfg.forms,        store.defineForm,         { discard: true })
      yield* Effect.forEach(cfg.flows,        store.defineFlow,         { discard: true })
      yield* Effect.forEach(cfg.requirements, store.installRequirement, { discard: true })
      yield* Effect.forEach(cfg.actions,      store.defineAction,       { discard: true })
      return yield* store.applyReport
    }),
})
```

And the I-9 form's `S.Struct` is **reused as the submission decoder** — one source
of truth for render, decode, and PII gating:

```ts
export const submitCollection = mutation({
  args: S.Struct({ token: S.String, values: S.Unknown }),
  handler: ({ token, values }) =>
    Effect.gen(function* () {
      const run  = yield* TripleStore.runByToken(token)       // fails: UnknownToken | NotWaiting
      const form = yield* Forms.schemaFor(run.form)           // the I9 S.Struct
      const v    = yield* S.decodeUnknown(form)(values)       // ← real validation, typed errors
      yield* TripleStore.recordSubmission(run, v)             // asserts facts + resumes the flow
    }),
})
```

The `pii: true` annotation on the SSN field carries through `S.annotations`, so the
same field definition feeds the renderer, the decoder, **and** the authorization
grant check.

## 6. Flows as Effect programs

The `advanceFlow` interpreter (today a 50-iteration `for` loop with an `if/else`
chain) becomes a recursive Effect; "park" is a `Scheduler` service call; the branch
predicate runs the Datalog Effect:

```ts
const advance = (run: FlowRun): Effect<void, FlowError, TripleStore | Scheduler | Datalog> =>
  Effect.gen(function* () {
    const step = yield* Flows.stepOf(run)
    return yield* Match.value(step).pipe(
      Match.tag("Collect", (s) => Scheduler.park(run, s)),            // durable wait
      Match.tag("Branch",  (s) => Datalog.run(s.where).pipe(
        Effect.flatMap((r) => advance(run.goto(r.length ? s.ifTrue : s.ifFalse))))),
      Match.tag("Assert",  (s) => store.assert(run.subject, s).pipe(Effect.zipRight(advance(run.next())))),
      Match.tag("Done",    ()  => store.complete(run)),
      Match.exhaustive,                                                // every step type handled — checked
    )
  })
```

`Match.exhaustive` over a tagged step union means **adding a step type is a compile
error until you handle it** — versus today's `if/else if` chain that silently
no-ops on an unknown type.

---

## Where it bites (the honest part)

- **This reverses PLAN.md's "Effect at the edge only" decision.** That reframe
  assumed Effect couldn't run in the isolate; Confect's premise is that it can.
  Adopting it is a real bet — on a community wrapper, on Effect in the Convex
  bundle (size + cold start), and on Confect's `ctx.db` Effect layer tracking
  Convex's API.
- **Effect doesn't remove the transaction limits.** The reconciler, `applyConfig`,
  and projection rebuild still must be batched, scheduler-driven jobs — an
  `Effect.forEach` over 10k facts in one mutation still blows the write limit.
  Effect makes the *batching* composable (`Stream.grouped` + a `Scheduler`
  continuation), but the constraint stands. This is the contract PLAN.md flags as
  most under-weighted, and Confect doesn't change it.
- **Reactivity is unchanged.** Confect reads still go through `ctx.db`, so query
  reactivity tracks the same documents — kept for free, but Effect adds no magic.
- **Test harness.** The current 66 convex-test cases assume plain handlers; they'd
  run Effects via the Confect test harness. The upside is real: `TestClock`
  replaces the `vi.useFakeTimers()` dance in the bitemporal/compliance tests.

## The payoff

| Seam today | With Confect / Effect |
| --- | --- |
| `v.*` schema **and** Effect DSL **and** `applyConfig` re-validate | one Effect Schema: table → args → DSL → decoder |
| `throw new Error(...)`, masked as "Server Error" | tagged errors in the type, encoded as typed `ConvexError` |
| `Date.now()` / `crypto.randomUUID()` footguns | `Clock` / `Random` services → deterministic, `TestClock` in tests |
| `if/else` step interpreter, silent on unknown steps | `Match.exhaustive` tagged union — unhandled step won't compile |
| form fields defined for render, typed again for submit | one `S.Struct` renders, decodes, and gates PII |
| bounded-query limits as comments | `QueryTooComplex` in `datalog`'s signature |

## Recommended way to pressure-test it

Don't migrate the whole store on faith. Build a **sidecar Confect group** around
one real MetaCRDT protocol concern — for example, reading protocol-shaped
`factEvents`, validating their `eventId`s with `@metacrdt/core`, and returning a
typed result with typed errors. Keep the production `convex/facts.ts` API in
plain Convex until the spike proves itself.

That measures the unknowns that decide the bet:

- codegen layout beside the existing `convex/_generated` tree;
- deploy compatibility with current Convex functions;
- `DatabaseReader` / `DatabaseWriter` ergonomics for indexed reads;
- typed-error behavior across the Convex/client boundary;
- test harness friction;
- bundle/cold-start impact.

If that slice is clean, the next candidate is `@metacrdt/convex` internals — not
the product app wholesale.
