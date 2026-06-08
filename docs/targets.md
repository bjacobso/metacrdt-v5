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
- `@metacrdt/cloudflare` — sync-plane shell with a Durable Object Effect Layer;
  growing to a DO + SQLite triple store ([cloudflare-target.md](./cloudflare-target.md)).
- `@metacrdt/local` — browser/local-first host with localStorage / IndexedDB /
  SQLite-compatible Effect Layers.
- `@metacrdt/node` — open server-process host with memory and structural
  server-SQLite/Postgres runtime services plus a dependency-free structural
  HTTP/SSE sync handler, native `node:http`-style request listener, and packaged
  in-memory dev-server CLI. It also exposes a shared SQL lifecycle plan for the
  SQLite/Postgres runtime tables and Effect Layers for memory, SQLite, and
  Postgres. SDK integration remains a future slice.
- `@metacrdt/runtime`'s in-memory target/Layer — the reference harness.
- `@metacrdt/testkit` — Effect Layer-backed conformance helpers for EventStore,
  anti-entropy, deterministic fold convergence, and restart-persistence
  semantics (log/HLC/seq), plus scheduler service-boundary, transport
  publish-boundary, and first network delivery/catch-up semantics. Log/sync
  conformance is proven against the in-memory Layer, Convex component Layer,
  Cloudflare Durable Object Layer, async local Layer, and Node
  memory/SQLite/Postgres Layers; persistence conformance is wired into runtime
  localStorage, local async, and Node SQLite/Postgres; scheduler submission and
  transport publication conformance are wired into testkit memory and Node
  memory; network delivery/catch-up conformance is proven against
  BroadcastChannel and p2p DataChannel harnesses. Compatibility
  `RuntimeServices` targets still adapt through `runtimeServicesLayer`.

### Should exist next

- **`@metacrdt/node` next slices** — add SDK/client integration and production
  database lifecycle guidance on top of the memory/SQLite/Postgres host,
  lifecycle DDL plan, HTTP/SSE sync surface, and packaged dev server now in
  place.

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
| DO SQLite | `cloudflare` | planned ([cloudflare-target.md](./cloudflare-target.md)) |
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
   BroadcastChannel and p2p DataChannel harnesses; add Cloudflare relay and
   query/projection suites whenever the relevant target capabilities are exposed.
   This is what *proves* the "guaranteed to converge" claim across targets.
3. **Cloudflare Phase B/C** — extract the shared fold into core, then the DO +
   SQLite triple store ([cloudflare-target.md](./cloudflare-target.md)).
4. **Extract `@metacrdt/sql`** once node-SQLite/Postgres and DO-SQLite reveal
   enough repeated DDL/query-generation logic beyond the current Node lifecycle
   plan to justify a shared SQL package.
5. **Bun / Deno / desktop / serverless** — adapter selections or deployment
   shapes, not new packages, until divergence forces otherwise.
