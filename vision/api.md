# Vision — Type-Safe Contracts over a Dynamic Schema

> **MetaCRDT primitive →** _convergence-as-projection_ — the API is a projection of schema-as-facts, invalidated by a schema-change tx. **Reversed cut:** the JIT `HttpApi` is re-viable as a target-neutral IR → runtime-shape consumer ([`forma.md`](./forma.md)), not bolted to a backend. See [`metacrdt-alignment.md`](./metacrdt-alignment.md) §3.

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on [`triples.md`](./triples.md)
> (the registry + AST), [`authorization.md`](./authorization.md) (scoped access), [`library.md`](./library.md)
> (schema/contract versioning), and [`performance.md`](./performance.md) (the compiled API is a
> projection). Grounded in `../PLAN.md` and the repo's Effect `HttpApi` conventions.

> **Convex update (decided — mostly cut):** the JIT-compiled **per-account `HttpApi`** is **infeasible on
> Convex** and is cut. Convex generates types **per-deployment at codegen time**, not per-account at
> runtime, and there is no Effect `HttpApi`-builder / `OpenApi.fromApi` to fold the registry into at
> runtime. The Convex-native target is this doc's own "lighter variant": a **single dynamic `httpAction`**
> that validates the payload against the registry/schema-facts **at runtime** and dispatches to one generic
> handler over the Datalog engine + projections (account from auth). You keep runtime validation and
> per-account routing; you lose compile-time per-account types, served per-account OpenAPI, and "the live
> API is the spec." For typed clients, emit an OpenAPI/JSON-schema doc from the registry **as data** and
> codegen offline. See [`convex.md`](./convex.md) §"Cuts".

This codebase is **end-to-end typed**: Effect `Schema`, `HttpApi` contracts, branded ids, types flowing
from API schema to UI atoms. A configurable, runtime-defined schema is in direct tension with that — if
types and attributes are _data_, the contract can't be fully known at compile time. This doc keeps
type-safety where it pays, and explores the ambitious resolution for the dynamic half: **just-in-time
compiling a real `HttpApi` — schema, handlers, and OpenAPI — from an account's registry.**

> Status: **stretch / directions.** The most concrete of the stretch ideas, but it rests on one Effect
> feasibility question (§5) that wants a spike before it's more than a direction.

---

## 0. The tension

`HttpApi` gives compile-time _and_ runtime safety because the contract is static. The substrate's value
is that customers add types/attributes at runtime. You cannot hand-write a statically-typed endpoint for
`POST /assets` when `asset` was defined by a customer this morning. The resolution is not "give up types"
— it's to **split the surface**, then make the dynamic half pull its weight by _generating the contract
from the data_.

---

## 1. Two surfaces

- **The typed core (most of the app).** Intrinsic types and the process machinery — `task`, `form`,
  obligations, Flows, the role-bound domain (`workflows.md` §2.5) — keep **hand-written, statically-typed
  `HttpApi` contracts**, exactly as today. Stable, few, worth the hand-authoring.
- **The dynamic surface.** CRUD/query over _arbitrary_ configurable types. This is where the JIT idea
  lives.

The boundary is a per-concern decision: semantically-rich, stable operations earn a typed endpoint;
generic operations over configurable types are served by the JIT-built API.

---

## 2. The idea: a just-in-time `HttpApi`, compiled from the registry

Treat the registry as **source** and a per-account `HttpApi` as a **compiled, cached artifact** —
literally JIT compilation, where the "program" is the account's `EntityType`/`Attribute` facts and the
"binary" is a live, OpenAPI-documented, validated REST surface.

```
account's EntityType/Attribute facts  ──compile──▶  HttpApi instance (schemas + endpoints + handlers)
        (the "source")                                  + OpenAPI doc   (the "compiled artifact")
                                          ▲ cached per (account, schemaVersion); invalidated on schema-change tx
```

Because Effect's `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`, and `Schema` are **values produced by
builders**, not macros, they can be assembled at runtime by folding over data.

> **Prior art — this is a proven pattern, not a hypothesis.** A sibling system ("Open Ontology") builds
> exactly this: a schema-driven REST API where `HttpApi` is constructed in a loop from ontology data,
> cached, and served. Its four pieces map onto ours one-to-one:
>
> | Open Ontology                                                                                | Here                                                                                              |
> | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
> | Lisp ontology files (VCS) → `CreateEntityTypeInput[]` (a `VersionResolver`)                  | the account's `EntityType`/`Attribute` registry at a schema version (`library.md` tags)           |
> | `DynamicRestApiFactory`: attribute→`Schema`, per-type `HttpApiGroup`, handler binding        | §2.1–§2.3                                                                                         |
> | `RestHandlerCache` keyed `db:version` ("latest" invalidated on advance; changeIds immutable) | the projection cache keyed `(account, schemaVersion)`, invalidated on the schema-change tx (§2.6) |
> | `AppRoutes` wildcard `/api/db/:database/rest/:version/*` → cache → run handler               | the per-account dispatcher (§2.4), with the account from `CurrentAuth`                            |
>
> The assembly is the loop you'd expect — and the only domain-specific part is the schema _source_;
> everything downstream is generic over the input types:
>
> ```ts
> let api = HttpApi.make("rest-api");
> for (const t of types) api = api.add(createEntityTypeGroup(t, version)); // §2.2
> api = api.prefix(`/api/db/${database}`);
> let layer = HttpApiBuilder.api(api);
> for (const t of types)
>   layer = layer.pipe(Layer.provide(createGroupHandlers(api, t, store))); // §2.3
> const webHandler = HttpApiBuilder.toWebHandler(layer); // §2.4
> ```

### 2.1 Build the schemas

Map each attribute's `valueType` to an Effect `Schema` (the `valueTypes.ts` encode/decode maps from
`PLAN.md` Phase 2 §18 are exactly this bridge), assemble a `Schema.Struct`, apply `required` →
required/optional, brand entity ids:

```ts
// per entity type, from its Attribute facts
const fieldsFor = (attrs) =>
  Object.fromEntries(
    attrs.map((a) => [
      a.ident,
      a.required
        ? schemaForValueType(a)
        : Schema.optional(schemaForValueType(a)),
    ])
  );
const AssetSchema = Schema.Struct(fieldsFor(assetAttrs)); // built at runtime, real Effect Schema
```

The result is a genuine `Schema` — so request decoding, `400`s on `ParseError`, and value branding all
work, sourced from data instead of code.

### 2.2 Build the endpoints (fold, don't hand-write)

```ts
const groupFor = (type, schema) =>
  HttpApiGroup.make(type.namespace)
    .add(
      HttpApiEndpoint.post("create", `/${type.namespace}`)
        .setPayload(schema)
        .addSuccess(EntityEnvelope)
    )
    .add(
      HttpApiEndpoint.get("get", `/${type.namespace}/:uid`)
        .setPath(UidParam)
        .addSuccess(EntityEnvelope)
    )
    .add(
      HttpApiEndpoint.post("list", `/${type.namespace}/list`)
        .setPayload(ListView)
        .addSuccess(ListResult)
    )
    .addError(BadRequestError, { status: 400 })
    .middleware(Authorization);

const accountApi = types.reduce(
  (api, t) => api.add(groupFor(t, schemaFor(t))),
  HttpApi.make("account")
);
```

The custom-type surface is the static fact-API endpoints (`/query`, `/facts`) _plus_ per-type groups
generated from the registry — a real, navigable, per-account API.

### 2.3 Build the implementation (one generic handler family, not per-type codegen)

The elegant part: you don't generate handler _code_ per type. You write **one parametric handler family**
— `create`/`get`/`list`/`assert`/`retract` — that closes over the endpoint's type descriptor and
dispatches to the fact store (`assertFact`, the AST compiler, the reconciler). "Generating the
implementation" is **wiring** those generic handlers onto the JIT-built endpoints via
`HttpApiBuilder.group`, not emitting code:

```ts
const createGroupHandlers = (api, type, store) =>
  HttpApiBuilder.group(api, type.namespace, (h) =>
    h
      .handle("list", listFromAst(type, store))
      .handle("create", guardWrite(version, assertFrom(type, store))) // guardWrite blocks mutations on a non-current schema version
      .handle("get", getEntity(type, store))
  );
```

So N custom types share one handler implementation; the registry decides routing and validation. Note
the binding is **by string name** (`"list"`, `"create"`) — see the type caveat in §5: keep the
endpoint-name constants shared between `createEntityTypeGroup` (§2.2) and the handlers here.

### 2.4 Serve via a per-account dispatcher

A wildcard route resolves the account from `CurrentAuth`, selects (or compiles) that account's cached
handler layer, and runs it — `HttpApiBuilder.toWebHandler(layer)` (or
`HttpApiBuilder.httpApp.pipe(Effect.provide(layer))`), exactly Open Ontology's `AppRoutes`
wildcard-mount. The intrinsic typed core is mounted statically; the dynamic per-account surface is
mounted under the account's compiled router. (One difference from the prior art: the discriminator is the
authenticated account from `CurrentAuth`, not a `:database` path segment.)

### 2.5 OpenAPI — and the client story — for free

`OpenApi.fromApi(accountApi)` produces a **per-account OpenAPI document** straight from the JIT artifact;
`HttpApiSwagger` serves live docs. This _collapses_ the earlier "generate per-tenant client types"
pipeline: there is no separate codegen — the **live API is the spec**, and a consumer codegens their
typed client from the account's served OpenAPI. Compile-time safety returns at the edge, for real custom
types, with no bespoke generator to maintain.

### 2.6 Lifecycle: compile · cache · invalidate (it's a projection)

Compiling per request is too expensive, so the artifact is cached per `(account, schemaVersion)` and
**invalidated by the schema-change transaction** — i.e. the compiled `HttpApi` is a **projection of the
schema-facts** in the exact sense of `performance.md` §1–§3: derived, cached, rebuilt from the log on
change. First request after a schema change pays a cold-compile; everything else is warm. This reuses the
Phase 3 per-account schema cache (`PLAN.md` §23) as the invalidation signal.

---

## 3. What this unifies

The JIT artifact folds three previously-separate concerns into one mechanism, all reusing Effect's
existing machinery rather than re-implementing it:

- **Validation** — the constructed `Schema`s give per-account request validation (was: "runtime schema
  from the registry").
- **Client types** — `OpenApi.fromApi` gives per-account specs (was: a separate codegen pipeline).
- **The generic API** — per-type endpoints + generic handlers (was: one opaque `/entities` endpoint).
- **Authorization, errors, middleware** — `.middleware(Authorization)` and the shared error contract
  compose onto JIT endpoints; the generic handler enforces attribute-level grants (`authorization.md` §4).

One artifact, generated from the registry, served per account, documented for free.

---

## 4. Versioning

Schema versioning _is_ contract versioning (`library.md`). The cache key includes the schema version, so
`asOf` a schema tag selects **a specific compiled API artifact**; "what did this account's API look like
at v2" is a real, servable thing. Deprecations are facts; clients regenerate per version.

---

## 5. Feasibility (confirmed) and the real caveats

**Feasibility is established, not speculative** — Open Ontology serves a per-`(db, version)`,
runtime-built `HttpApi` + router today (§2 prior art). What it costs is precise and known:

- **Type erasure at the assembly seams (the main caveat).** `@effect/platform`'s `HttpApi` types are
  designed for _static_ declaration — the type parameters accumulate group/endpoint identities at compile
  time. Building in a loop discards that, so the seams (`.add()`, `HttpApiBuilder.api`,
  `HttpApiBuilder.group`, `Layer.provide`) use deliberate `as any`. Two consequences to design around:
  1. **Handler names are string-matched to endpoint names** — there is _no_ compile-time guarantee they
     line up. Share endpoint-name constants between `createEntityTypeGroup` (§2.2) and
     `createGroupHandlers` (§2.3).
  2. **Errors must be declared per endpoint** (`.addError(...)`) _and_ produced by handlers, or runtime
     serialization won't know about them. The dynamic surface therefore shares one error contract (`400`
     validation, `404`, authz `403`); richer per-type errors are a typed-core concern.
- **Naming — don't call our module `HttpApiBuilder`.** That name is `@effect/platform`'s
  (`HttpApiBuilder.api/.group/.httpApp/.toWebHandler`) and we call it heavily; reusing it guarantees
  import confusion. Follow the repo's `make*` convention and split today's monolith along the two things
  it does: **`makeEntityHttpApi`** (registry → `HttpApi` value, §2.1–§2.2) and a separate
  **`EntityApiLayer` / `provideEntityApi`** (the handler `Layer`, §2.3). Keep `HttpApiBuilder` as the
  dependency you call, not the thing you name.
- **Build cost & cold start.** Building `Schema` + `HttpApi` + layer is not free — cache per
  `(account, schemaVersion)` (prior art's `RestHandlerCache` does exactly this: "latest" invalidated when
  the schema advances, immutable version tags cached forever). Accept a cold-compile after a schema
  change; bound memory (LRU over active accounts) — N accounts × artifacts is real footprint.
- **No server-side compile-time types** on the dynamic surface (accepted in §0/§1). The intrinsic core
  stays statically typed; only per-account custom types are JIT. Don't dynamicize everything.
- **Consistency of the generic handler.** One handler family must correctly serve every type; correctness
  is concentrated — good for testing, unforgiving if wrong, like the compiler in
  `performance.md`/`authorization.md`.

> **Lighter variant** (if you want even less surface): use the JIT-built `HttpApi` purely for payload
> validation against its `Schema`s and for `OpenApi.fromApi`, while a single catch-all endpoint routes to
> the generic handler. Strictly less than the prior art proves possible, but a smaller first step.

---

## Decisions (resolved)

- ✅ **Feasibility confirmed by prior art** — Open Ontology serves a runtime-built, per-`(db, version)`
  `HttpApi` today; this is a port, not a research bet. (§2, §5)
- ✅ **Split the surface** — typed `HttpApi` for the intrinsic core; a JIT-built API for configurable
  types. (§1)
- ✅ **JIT-compile a per-account `HttpApi` from the registry** — schemas (from `valueTypes`), endpoints
  (folded), and a generic handler family bound by name to each. (§2)
- ✅ **The compiled API is a projection** — cached per `(account, schemaVersion)`, invalidated by the
  schema-change tx (`performance.md`). (§2.6)
- ✅ **OpenAPI from the artifact replaces the separate codegen pipeline** — the live API is the spec.
  (§2.5)
- ✅ **Contract versioning = schema versioning** (`library.md`); `asOf` selects an artifact. (§4)
- ✅ **Name it `makeEntityHttpApi` + `EntityApiLayer`/`provideEntityApi`** — not `HttpApiBuilder` (that's
  the `@effect/platform` dependency we call). (§5)

## Open (non-blocking)

- ❓ How dynamic should the _internal_ dashboard API be — does the UI consume the JIT API for custom
  types, or generated typed atoms per account?
- ❓ Do we serve generated SDKs per tenant, or only the live OpenAPI + a generic client?
- ❓ Cache eviction policy and cold-compile budget at scale (how many accounts, how often schema changes).
- ❓ Where exactly is the typed-core ↔ JIT-surface boundary drawn, and who decides per endpoint?
- ❓ The type-erasure `as any` seams: wrap them in one small, well-tested adapter, or accept them inline
  as the prior art does?
