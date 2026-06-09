# Client / Atom — `@metacrdt/client` over swappable backends

A frontend data-access layer where React components consume **effect-atom**
atoms, those atoms call a single **`MetacrdtClient`** Effect service, and the
service has **swappable Layer implementations** per backend (Confect WebSocket,
raw Convex, HTTP polling, Cloudflare Durable Object live-query, node SSE, local,
mock). Changing backend = swapping one Layer; nothing above it changes.

This is the concrete design of the `@metacrdt/client` keystone in
[`./app-ui-restructure.md`](./app-ui-restructure.md) Phase 5, and the client that
[`./views.md`](./views.md)'s `@metacrdt/dashboard` consumes. It realizes
[`../vision/api.md`](../vision/api.md) (a uniform client surface) and
[`../vision/experience.md`](../vision/experience.md) (a generated UI that runs on
any target).

## Status at a glance

| Phase | What | Status |
|---|---|---|
| 1 | `@metacrdt/client` — `MetacrdtClient` service interface + Schema payloads (RPC + AST channels) | ⏳ later |
| 2 | effect-atom binding — query/mutation atom families + React hooks | ⏳ later |
| 3 | `ConfectWebSocketLive` backend Layer (reactive; nearly free over `@confect/js`) | ⏳ later |
| 4 | `MockLive` backend Layer over `@metacrdt/testkit` (deterministic tests / Storybook) | ⏳ later |
| 5 | Dashboard rides the **AST channel** → proven deployment-portable | ⏳ later |
| 6 | `CloudflareLive` / `NodeSseLive` / `LocalLive` backend Layers | ⏳ later |
| 7 | Polling + raw-Convex Layers; optimistic updates | ⏳ later |

---

## The key idea

Confect's `WebSocketClient` is **already an Effect service** whose
`reactiveQuery(ref, args?)` returns `Stream<A, E>` — the exact contract
effect-atom wants to consume (`Atom.make(stream) → Result<A, E>`). So we do **not**
invent an abstraction: we adopt Confect's client API shape as the
`MetacrdtClient` interface, then implement that same interface for the
non-Convex targets. Reactivity is uniform because every backend normalizes to
`Stream<A, E>`; "push vs poll" is only a difference in how a Layer *produces* the
Stream.

> Note: we use effect-atom for the React layer, **not** `@confect/react` (whose
> hooks wrap a plain `ConvexReactClient` with Promise/`Either` and are
> Convex-only). We reuse Confect's *client services* (`WebSocketClient`,
> `HttpClient`) as one backend, and replace its *React layer* with effect-atom so
> the same hooks work across every backend.

## Architecture

```text
React components
   │  useAtomValue(entityAtom(id))   useAtomSet(assertFact)      ← no Effect / Convex / transport
   ▼
effect-atom layer  (@metacrdt/client/atom)
   │  Atom.family(spec => Atom.make(client.reactiveQuery(spec)))      → Result<A, E>
   │  Atom.fn(intent => client.mutation(intent), { reactivityKeys })
   ▼
MetacrdtClient   (Effect.Service: query / reactiveQuery / mutation / action / setAuth)
   │  Atom.runtime(ClientLive)        ← swap THIS one Layer to change backend
   ▼
backend Layer (choose one at the app boundary)
```

## The service interface

Modeled on Confect's `WebSocketClient` + `HttpClient` (which expose
`query/mutation/action(ref, args?): Effect<T, TransportError | ParseError |
declaredError>`, `reactiveQuery(ref, args?): Stream<…>`, scoped `setAuth(effect
provider, onChange?)`). Two addressing channels (see the decision below):

```ts
class MetacrdtClient extends Effect.Service<MetacrdtClient>()("MetacrdtClient", {
  // RPC channel — app/product endpoints. Convex refs map 1:1; other targets
  // expose a named-endpoint registry.
  query:         <A, E>(ref: Ref<A>, args?: Args) => Effect<A, E | TransportError | ParseError>
  reactiveQuery: <A, E>(ref: Ref<A>, args?: Args) => Stream<A, E | TransportError | ParseError>
  mutation:      <A, E>(ref: Ref<A>, args?: Args) => Effect<A, E | TransportError | ParseError>
  action:        <A, E>(ref: Ref<A>, args?: Args) => Effect<A, E | TransportError | ParseError>

  // AST channel — target-agnostic by construction (VISION: queries are data).
  // The dashboard rides this; Convex/Confect translate the AST → a generic
  // `datalog` ref, Cloudflare/node run it natively.
  runQuery:      (q: QuerySpec) => Effect<Rows, QueryError | TransportError>
  watchQuery:    (q: QuerySpec) => Stream<Rows, QueryError | TransportError>

  setAuth:       (provider: Effect<Token>, onChange?: (ok: boolean) => Effect<void>) => Effect<void>
}) {}
```

`Ref`, `QuerySpec`, `Rows`, and the intent payloads are `effect/Schema` types so
**every backend gets arg-encoding, result-decoding, and typed errors for free,
regardless of transport.** `@metacrdt/query` and `@metacrdt/views` already speak
`effect/Schema`, so the vocabulary exists.

## effect-atom binding

```ts
const clientRuntime = Atom.runtime(ClientLive)            // ClientLive = the chosen backend Layer

// parameterized reactive query → React-renderable Result
export const entityAtom = Atom.family((id: string) =>
  clientRuntime.atom(MetacrdtClient.pipe(
    Effect.flatMap((c) => c.watchQuery(entityQuery(id))),  // Stream → Result
  )))

// mutation with invalidation
export const assertFact = clientRuntime.fn(
  (intent: AssertIntent) => MetacrdtClient.pipe(Effect.flatMap((c) => c.mutation(refs.facts.assert, intent))),
  { reactivityKeys: ["facts"] },                           // refetch dependent atoms on non-push backends
)
```

React: `const result = useAtomValue(entityAtom(id))` (a `Result` matched on
Initial/Success/Failure); `const assert = useAtomSet(assertFact)`. Components are
backend-agnostic.

## Backend Layer matrix (the swappable part)

| Layer | Transport | How it builds `Stream<A,E>` | Notes |
|---|---|---|---|
| **ConfectWebSocketLive** | `@confect/js` `WebSocketClient` over Convex WS | native — `reactiveQuery` *is* a Stream | ~trivial adapter; **start here** |
| **RawConvexLive** | `ConvexReactClient.onUpdate` | `Stream.async` from the callback | no Confect dependency |
| **ConfectHttpPollingLive** | `@confect/js` `HttpClient` (one-shot) | `Stream.repeatEffect(query)` + `Schedule.fixed(interval)` | degraded, identical interface |
| **CloudflareLive** | DO WebSocket live-query SDK ([cloudflare-live-query-sdk.md](./cloudflare-live-query-sdk.md)) | invalidation messages → Stream | rides the **AST channel** natively |
| **NodeSseLive** | node HTTP/SSE sync client ([node-production-hardening.md](./node-production-hardening.md)) | SSE events → Stream | |
| **LocalLive** | in-memory `@metacrdt/runtime` + BroadcastChannel | channel events → Stream | offline / local-first |
| **MockLive** | `@metacrdt/testkit` fixtures | scripted Stream | deterministic tests, Storybook |

Polling is not a special case — it is a Layer that builds its Stream from a
schedule. That is the user's "rpc or raw convex js, or polling," made uniform.

---

## The central decision: RPC refs vs query-AST

Confect/Convex address functions by `refs.public.notes.list` —
deployment-specific. Cloudflare/node/local have **no Convex refs**; they execute
a `@metacrdt/query` Datalog AST directly. Two channels resolve this, and they
**compose**:

- **RPC channel** (`query`/`reactiveQuery` by `Ref`) — for app/product endpoints.
  Convex maps `Ref` → generated function; other targets back it with a named
  registry.
- **AST channel** (`runQuery`/`watchQuery` by `QuerySpec`) — target-agnostic by
  construction (VISION pillar 2: queries are data). Convex/Confect translate the
  AST → one generic `datalog` ref; Cloudflare/node run it natively.

**The dashboard rides the AST channel** so it is genuinely portable; product
calls ride RPC. Getting this right is the difference between "swappable backends"
being real versus a Convex wrapper in a costume — without the AST channel,
`@metacrdt/dashboard` silently re-couples to Convex refs.

## Design tensions

1. **Schema boundary is a gift.** Define payloads once as `effect/Schema`;
   validation + typed errors come for free on every transport (mirrors Confect's
   encode/decode).
2. **Invalidation.** On Convex/WS, server push updates dependent atoms —
   `reactivityKeys` is a no-op. On polling/SSE, the keys trigger an immediate
   refetch. effect-atom's `Atom.withReactivity` / `Reactivity.invalidate` is the
   seam.
3. **Optimistic updates.** Convex has native support; for others, an optimistic
   overlay atom layered over the Stream. Defer to Phase 7.
4. **Auth unifies three specs.** `setAuth(provider: Effect)` (Confect WS already
   takes an Effect provider). Each backend binds its own: Convex JWT
   ([provider-auth-ui.md](./provider-auth-ui.md)), CF bearer
   (live-query-sdk spec), node middleware (node-hardening spec).
5. **Lifecycle = scope.** Confect's WS is a scoped resource (opens on layer
   provide, closes on scope end); effect-atom's `Atom.runtime` owns that scope.
   No manual `close()`; clean for dashboard mount/unmount and SSR.

## Package shape

```text
@metacrdt/client             # MetacrdtClient service + Schema payloads + the AST channel
@metacrdt/client/atom        # effect-atom families/fns + React hooks (subpath, or its own pkg)
@metacrdt/client-convex      # ConfectWebSocket / RawConvex / polling Layers
@metacrdt/client-cloudflare  # DO live-query Layer
@metacrdt/client-node        # SSE Layer
                             # @metacrdt/dashboard depends on client/atom + the AST channel only
```

`@metacrdt/client` deps: `@metacrdt/query` (QuerySpec/Rows), `@metacrdt/core`
(fact shapes), `effect`, `@effect-atom/atom` (+ `@effect-atom/atom-react` for the
React subpath). Backend packages add their transport dep (`@confect/js`,
`convex`, the CF/node clients).

---

## Phases (actionable)

### Phase 1 — `@metacrdt/client` interface
- [ ] Scaffold the package (pnpm `workspace:*` deps, per `PLAN.md` §5 conventions).
- [ ] `MetacrdtClient` `Effect.Service` with both channels; `effect/Schema`
      payloads (`Ref`, `QuerySpec`, `Rows`, intents); `TransportError`.
- [ ] No backend yet — interface + types only, typechecks.

### Phase 2 — effect-atom binding
- [ ] `Atom.runtime(ClientLive)` wrapper; `Atom.family` query atoms;
      `Atom.fn` mutation atoms with `reactivityKeys`.
- [ ] React subpath: re-export `useAtomValue`/`useAtomSet` + small `Result`
      matchers. Decide subpath vs separate `@metacrdt/client-react` package.

### Phase 3 — `ConfectWebSocketLive`
- [ ] Adapter Layer delegating to `@confect/js` `WebSocketClient`
      (`reactiveQuery` → our `Stream`); wire `setAuth`.
- [ ] AST channel: translate `QuerySpec` → the deployment's generic `datalog` ref.

### Phase 4 — `MockLive`
- [ ] Layer over `@metacrdt/testkit` fixtures producing scripted Streams; enables
      component tests + Storybook without a backend.

### Phase 5 — Dashboard on the AST channel
- [ ] `@metacrdt/dashboard` consumes `client/atom` via `watchQuery`/`runQuery`
      only; app injects `ConfectWebSocketLive`. Proves portability.

### Phase 6 — Other backends
- [ ] `CloudflareLive` (DO live-query), `NodeSseLive`, `LocalLive`. Run each under
      the same dashboard to confirm zero React changes (the cross-target proof app
      in app-ui-restructure Phase 7).

### Phase 7 — Polling + optimistic
- [ ] `ConfectHttpPollingLive` / `RawConvexLive`; optimistic-overlay atoms.

---

## Open questions

- **One `Result` model across backends?** Map Convex's loading/skip semantics and
  Stream `Result` to one shape the dashboard matches on. (Confect's
  `QueryResult` Loading/Success/Failure is a good template.)
- **AST channel scope** — read-only queries only, or also AST-shaped mutations
  (assert/retract intents) so the dashboard can write portably?
- **React packaging** — `@metacrdt/client/atom` subpath vs a separate
  `@metacrdt/client-react` (keeps the core React-free, mirrors
  `@metacrdt/views` vs `@metacrdt/views/runtime`).
- **`@effect-atom/atom` version pinning** — the library is pre-1.0; pin and track.

## Non-goals

- Not using `@confect/react` hooks — effect-atom is the React layer; Confect
  supplies a *client service*, not the hooks.
- Not building every backend Layer up front — Confect WS + Mock first; others on
  demand (driven by app-ui-restructure Phase 7).
- Not a general GraphQL/tRPC-style framework — this is a MetaCRDT-shaped client
  (fact assert/retract + Datalog/ViewSpec queries), not arbitrary RPC.
- Not optimistic updates before the read path + invalidation are proven.
