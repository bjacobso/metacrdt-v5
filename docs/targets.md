# Targets, adapters, and transports

**Status:** Draft model
**Scope:** Define what a MetaCRDT "target" is, distinguish it from a storage
adapter and a transport, enumerate which of each should exist, and fix the
eventual package dependency graph.

Companion docs: [architecture.md](./architecture.md) (the layer/target map),
[package-consolidation.md](./package-consolidation.md) (the package graph),
[cloudflare-target.md](./cloudflare-target.md) (one target's build plan),
[SPEC.md](../SPEC.md) §8 (anti-entropy sync).

---

## The reframe: target ≠ storage backend

It is tempting to list "node, bun, postgres, FoundationDB, …" as peer targets.
That conflates three different axes a target spans, each of which implements a
different `@metacrdt/runtime` Effect service contract:

| Axis | Contract implemented | Examples |
| --- | --- | --- |
| **Execution host** | `SchedulerService` + lifecycle | Convex functions, Durable Object + alarms, Node process, browser event loop |
| **Storage adapter** | `EventStoreService` (+ projection store) | Convex tables, DO SQLite, IndexedDB, **SQLite**, **Postgres**, memory |
| **Transport adapter** | `TransportService` | Convex reactivity, DO WebSocket relay, BroadcastChannel, WebRTC p2p, HTTP/SSE |

A **target** is an *execution host* that bundles a default choice across the
other two axes. Consequences:

- **Postgres is not a target — it is a storage adapter.** So are SQLite and
  FoundationDB. They implement `EventStore`; they do not host execution.
- **Node and Bun are execution hosts**, not storage backends. They can mount any
  server-grade storage adapter.

This is the rule that decides where new code lands: ask *which Effect service
contract does it provide* — host scheduler, event store, clock/sequencer, or
transport — not *which technology is it named after*.

---

## Managed vs. open hosts

The storage-adapter axis only has freedom on *open* hosts:

- **Managed hosts** — storage is fixed by the platform:
  - `convex` → Convex tables
  - `cloudflare` → Durable Object SQLite
- **Open hosts** — storage is pluggable:
  - `node` → `sqlite | postgres | memory`
  - `local` (browser) → `localStorage | IndexedDB | SQLite-wasm`

On managed hosts you cannot swap the backend; the adapter is part of the target.
On open hosts the adapter is a selectable dependency.

---

## Which targets should exist

### Have today

- `@metacrdt/convex` — managed, reactive reference target (full triple store).
- `@metacrdt/cloudflare` — sync-plane shell with Durable Object KV and SQLite
  Effect Layers; Worker/DO WebSocket relay with optional token auth; the SQLite
  runtime seed persists events, projection rows, HLC, and seq over
  `ctx.storage.sql.exec(...)`; it now also exposes a first SQLite log/current
  surface (append helpers with scoped current-coordinate projection reconcile,
  get/list events, rebuild with changed `(e, a)` summaries, current
  rows/entities) plus simple collection capability rows (`issueCollection`,
  `collectionByToken`, `listCollections`, `submitCollection`) with optional
  submit-time assertion lowering through the same append/reconcile path and
  operational collection reminder/escalation/expiry timer rows, DAG timelines,
  flow-wait alarms, a narrow `resumeDagRun` terminal-decision surface, a
  SQLite live invalidation fanout seed for changed `(e, a)` coordinates, and a
  bounded live current-query snapshot/update seed with optional persisted
  subscription rows plus structural reconnect hydration for connected sockets
  and an authenticated Worker route seed.
  Growing to a full DO + SQLite bitemporal triple store remains the active target plan
  ([cloudflare-target.md](./cloudflare-target.md)).
- `@metacrdt/local` — browser/local-first host with localStorage / IndexedDB /
  SQLite-compatible Effect Layers.
- `@metacrdt/node` — open server-process host with memory and structural
  server-SQLite/Postgres runtime services plus a dependency-free structural
  HTTP/SSE sync handler, native `node:http`-style request listener, and packaged
  in-memory dev-server CLI. It also exposes a shared SQL lifecycle plan for the
  SQLite/Postgres runtime tables and Effect Layers for memory, SQLite, and
  Postgres. A dependency-free sync SDK client now talks to the same HTTP/SSE
  routes through an Effect-native facade plus Promise wrapper. The production
  assembly helper selects `memory | sqlite | postgres`, returns the runtime
  Layer + handler/listener, exposes SQL lifecycle metadata for durable stores,
  and optionally bundles the sync client for a remote base URL without choosing
  a Node framework or concrete driver.
- `@metacrdt/runtime`'s in-memory target/Layer — the reference harness.
- `@metacrdt/testkit` — Effect Layer-backed conformance helpers for EventStore,
  anti-entropy, deterministic fold convergence, EventStore-backed projection,
  the runtime `DatalogQueryService` contract, runtime's projection-backed
  current-query provider, opt-in materialized projection-store semantics, and
  restart-persistence semantics (log/HLC/seq), plus scheduler
  service-boundary, transport publish-boundary, and first network
  delivery/catch-up semantics. Log/sync/projection/query conformance is proven
  against the in-memory Layer, Convex component Layer, Cloudflare Durable Object
  Layer, async local Layer, and Node memory/SQLite/Postgres Layers; persistence
  conformance is wired into runtime localStorage, local async, and Node
  SQLite/Postgres; scheduler submission and transport publication conformance are
  wired into testkit memory and Node memory; network delivery/catch-up
  conformance is proven against BroadcastChannel, p2p DataChannel, and
  Cloudflare Durable Object WebSocket relay harnesses. The Cloudflare Worker
  relay also has package tests for optional token auth at the deployment
  boundary. Projection-store
  conformance is currently proven against runtime memory/localStorage, Node
  memory/SQLite/Postgres, local-first localStorage, Cloudflare Durable Object KV
  and SQLite storage, and the Convex component-owned `projectionRows` read model.
  Compatibility
  `RuntimeServices` targets still adapt through `runtimeServicesLayer`.

### Should exist next

- **`@metacrdt/node` next slices** — production hardening around the concrete
  deployment recipes now documented in `packages/node/DEPLOYMENT.md`: auth
  middleware examples, retry/backoff loops for peer sync, observability hooks,
  and process-manager templates when real deployments demand them.

### Defer until a real need justifies them

- **`@metacrdt/bun` / Deno** — Bun and Deno are ~Node-compatible; the only
  differentiators are built-in APIs (`bun:sqlite`, `Deno.openKv`). Have `node`
  detect/select those adapters; split a package only if API divergence forces it.
- **Electron / Tauri (desktop)** — just `local` (browser projection) + `node`
  (local server-grade SQLite) composed. No new semantics.
- **Edge-serverless shapes (Lambda / Vercel / Deno Deploy)** — stateless function
  hosts that must point at an *external* adapter (Postgres / DO / Convex). These
  are deployment shapes of `node` / `sdk`, not distinct target packages.

---

## Which adapters should exist

### Storage adapters (implement `EventStore` + projection store)

| Adapter | Lives in / under | Status |
| --- | --- | --- |
| memory | `runtime` | done (compatibility target + Effect Layer) |
| localStorage | `local` (via `runtime`) | done |
| IndexedDB | `local` | done |
| SQLite-wasm | `local` | done |
| SQLite (server) | `node` | done (structural driver API + shared lifecycle plan) |
| Postgres | `node` | done (structural `query(sql, params)` adapter + shared lifecycle plan) |
| DO SQLite | `cloudflare` | started (runtime-service substrate + projection/persistence conformance + log/current/query surface, including projection-backed current Datalog reads, collection capability rows with optional assertion lowering, collection timer rows, collection/flow-wait alarm multiplexing, DAG run/timeline rows, terminal DAG resume seed, live invalidation fanout seed, live current-query snapshot/update seed, persisted current-query subscription rows, structural reconnect hydration, and an authenticated live-query Worker route seed; full operational flow interpreter/action parity and production live-query DO assembly/frontend SDK planned in [cloudflare-target.md](./cloudflare-target.md)) |
| Convex tables | `convex` | done (managed) |
| FoundationDB | — | archive unless a real need appears |

**Extract `@metacrdt/sql` when the second SQLite consumer lands.** Node now has a
small shared SQL lifecycle plan (`createNodeSqlLifecyclePlan`) for events/meta
tables and indexes across SQLite and Postgres, but that is intentionally not a
package boundary. SQLite-in-node, SQLite-wasm-in-browser, and DO-SQLite all want
the *same* relational triple-store schema + query generation — only the driver
differs. When that duplication is real, extract a driver-agnostic
`@metacrdt/sql` (DDL + parameterized triple/projection queries) with thin
per-host driver bindings. **Postgres becomes a second dialect of that same
package.** This unifies what Open Ontology split across `database-sql` /
`database-sqlite` / `database-postgres`.

### Transport adapters (implement `Transport`)

| Adapter | Lives in | Status |
| --- | --- | --- |
| BroadcastChannel | `runtime` | done |
| p2p DataChannel | `runtime` | done |
| DO WebSocket relay | `cloudflare` | shell done |
| Convex reactivity | `convex` | done (managed) |
| HTTP / SSE | `node` | done (structural handler + native-style listener + packaged dev-server CLI) |

---

## How targets relate to each other

Targets are **horizontal peers**. They do not depend on each other. They are
unified two ways:

1. **Vertically, by `core`.** Every target runs the *same* fold and the *same*
   `≺`-reconcile, so all targets are *guaranteed* to converge to the same
   projections. This is exactly why a target must never reimplement the fold —
   see the Cloudflare plan's keystone phase.
2. **Horizontally, by transports.** A Convex replica, a Cloudflare DO, and a
   browser tab sync via version-vector anti-entropy (SPEC §8) and converge.

> One feature set → many targets, guaranteed to converge, because every target
> embeds the same kernel and only swaps I/O.

---

## Live queries are a transport concern, not a semantic one

Every target produces *identical* projections; they differ only in **how they
push invalidations** when a write touches an `(e, a)` coordinate:

| Target | Live-query mechanism |
| --- | --- |
| convex | native reactive queries |
| cloudflare | DO WebSocket push *(stretch goal)* |
| node + postgres | `LISTEN` / `NOTIFY` → WebSocket / SSE |
| node + sqlite | update hooks → WebSocket / SSE |
| local / browser | BroadcastChannel + in-process subscription |

So "live queries" is something each *transport adapter* provides over the same
invalidation key — not new substrate semantics. Postgres is attractive here
because `LISTEN/NOTIFY` gives reactivity for free.

The Cloudflare DO SQLite facade now reports the first version of this key:
`rebuildCurrent` and append/lifecycle facade results include deterministic
`changed` `(e, a)` coordinates with before/after event ids. Append/lifecycle
helpers also use `ProjectionStoreService.replaceMatching` to replace only the
touched current coordinate, and the replacement fold is bounded by
`EventStoreService.scan({ e, a })` plus lifecycle rows discovered through
`EventStoreService.scan({ target })`. Actual WebSocket subscription fanout
remains transport work.

---

## Eventual dependency graph

```text
                         ┌─────────────────┐
                         │  @metacrdt/core │   zero deps — the convergence guarantee
                         └────────┬────────┘
              ┌───────────────────┼────────────────────┐
   FEATURES   │                   │                     │
   schema   query   workflow   forms   views   agent    │   → core (and each other:
     │        │        │         │       │       │       │     workflow→query, forms→schema…)
     └────────┴────────┴────┬────┴───────┴───────┘       │
                            │                            │
                   ┌────────▼─────────┐                  │
   HARNESS         │ @metacrdt/runtime│ ─────────────────┘   → core; defines
                   │  services +      │                       EventStore / Clock /
                   │  memory + sync   │                       Sequencer / Scheduler / Transport
                   └───┬────────┬─────┘
          ┌────────────┘        └────────────┐
   ADAPTERS (→ runtime + core)        TRANSPORTS (→ runtime + core)
   @metacrdt/sql ──┬── sqlite          broadcast · p2p · websocket · http
   (DDL + queries) └── postgres
                          │
                   ┌──────▼───────────────────────────────────┐
   TARGETS         │ convex   cloudflare   node   local         │  → runtime + chosen
   (hosts)         │ (fixed)  (fixed:DO)  (open)  (open:browser) │    adapters + features
                   └──────┬───────────────────────────────────┘
                   ┌──────▼──────┐
   TOOLING         │ sdk · cli · │  sdk→targets/runtime; cli→sdk+forma;
                   │ testkit     │  testkit→core+runtime(+adapters)
                   └──────┬──────┘
                   ┌──────▼──────┐
   APPS            │ reference   │  the Convex app today; Schematics later
                   └─────────────┘

   forma → core    authoring language; lowers to features/IR, no target deps
```

**The invariant** (also stated in [architecture.md](./architecture.md)): feature
packages depend on `core` and `runtime` contracts but **never on a target**.
Targets depend downward on everything; targets never depend on each other.
Adapters and transports depend only on `runtime` + `core`, never on a feature or
a sibling target.

---

## Recommended build order

1. **`@metacrdt/node`** + `memory` / `sqlite` / `postgres` adapters + shared SQL
   lifecycle plan + HTTP/SSE handler + packaged dev server — unlocks
   SDK/self-hosting work and another host for the testkit to exercise.
2. **Goal 111 expanded conformance** — Convex/Node/local/Cloudflare now expose
   runtime Layers and `@metacrdt/testkit` runs conformance over those Layers.
   Persistence conformance has started for durable targets, and scheduler
   service-boundary / transport publish-boundary conformance has started for
   observable services. Network delivery/catch-up conformance has started for
   BroadcastChannel, p2p DataChannel, and Cloudflare relay harnesses. EventStore
   projection and `DatalogQueryService` conformance are included in the
   shared runtime suite. Materialized projection-store conformance is an opt-in
   suite over `ProjectionStoreService`, now wired through runtime memory/local,
   Node memory/SQLite/Postgres, local-first localStorage, and Cloudflare Durable
   Object storage, plus the Convex component-owned `projectionRows` read model;
   runtime now also exposes a projection-backed current-query provider under the
   same `DatalogQueryService` contract. Add target-specific query-provider
   conformance whenever a target exposes a fuller query engine beyond the shared
   EventStore-backed service and current projection provider. This is what
   *proves* the "guaranteed to converge" claim across targets.
3. **Cloudflare Phase B/C** — the DO SQLite runtime-service substrate and first
   log/current/query surface have started, including projection-backed current
   Datalog reads, current-projection change summaries, and scoped
   current-coordinate projection replacement. Target-event lookup is now part of
   the EventStore contract and DO SQLite uses it for bounded coordinate folds;
   historical queries now have an indexed provider seed, running DAG rows have a
   terminal resume-decision seed, changed coordinates have a WebSocket
   invalidation fanout seed, and bounded current Datalog subscriptions can send
   live snapshots/refreshes; indexed historical queries now have
   conformance-style clause/visibility/index-scan coverage, and bounded live
   current-query subscriptions now have persisted metadata rows plus structural
   hydration and authenticated Worker route plumbing; next is broader SQL query
   provider parity/performance hardening plus full flow interpreter/action
   execution and production live-query DO assembly/frontend SDK with full
   frontend reconnect/session protocol
   ([cloudflare-target.md](./cloudflare-target.md)).
4. **Extract `@metacrdt/sql`** once node-SQLite/Postgres and DO-SQLite reveal
   enough repeated DDL/query-generation logic beyond the current Node lifecycle
   plan to justify a shared SQL package.
5. **Bun / Deno / desktop / serverless** — adapter selections or deployment
   shapes, not new packages, until divergence forces otherwise.
