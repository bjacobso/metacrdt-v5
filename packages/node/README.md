# @metacrdt/node

The Node / server-process target for MetaCRDT. It is the open host: unlike
managed targets such as Convex or Cloudflare Durable Objects, Node can mount
different storage adapters behind the same runtime contracts.

## What Node Owns

- **Node memory runtime** — `createNodeMemoryRuntime` plus
  `createNodeMemoryRuntimeLayer`, named wrappers over the runtime memory harness
  for server/dev/test processes.
- **Server SQLite runtime** — `createNodeSqliteRuntime`, with
  `NodeSqliteEventStore`, `NodeSqliteClock`, and `NodeSqliteSequencer` over a
  structural SQLite driver interface. `createNodeSqliteRuntimeLayer` exposes the
  same target as an Effect `Layer`.
- **Server Postgres runtime** — `createNodePostgresRuntime`, with
  `NodePostgresEventStore`, `NodePostgresClock`, and `NodePostgresSequencer`
  over a structural `query(sql, params)` client interface.
  `createNodePostgresRuntimeLayer` exposes the same target as an Effect `Layer`.
- **Driver-neutral SQLite shape** — `NodeSqliteDatabaseLike` /
  `NodeSqliteStatementLike`, matching the common `prepare().get/all/run` surface
  used by better-sqlite3-style wrappers, Bun SQLite adapters, and tests. The
  package intentionally ships no native SQLite dependency.
- **Driver-neutral Postgres shape** — `NodePostgresClientLike`, matching the
  common `pg`/Neon-style `query(sql, params)` surface. The package intentionally
  ships no Postgres driver dependency.
- **Shared SQL lifecycle plan** — `createNodeSqlLifecyclePlan` validates table
  prefixes and emits the runtime event/meta table names, indexes, and ordered DDL
  used by both the SQLite and Postgres adapters. This is intentionally narrower
  than a full `@metacrdt/sql` package.
- **HTTP/SSE sync handler** — `createNodeSyncHttpHandler`, a dependency-free
  fetch-like handler over any `RuntimeServices`: health/version-vector,
  pull-delta, push-events, and one-shot SSE delta routes. It returns a small
  structural response so Express, Fastify, Hono, native `node:http`, Bun, tests,
  or the packaged dev server can adapt it without this package owning a
  framework.
- **Native-style request listener** — `createNodeHttpRequestListener`, a
  dependency-free adapter for Node `http.createServer`-style request/response
  objects. It consumes streamed request bodies, calls the structural sync
  handler, and writes status/headers/body back to the response without importing
  Node types.
- **Packaged dev server CLI** — `metacrdt-node-dev`, an in-memory local sync
  server over native `node:http`. It is a convenience wrapper over
  `createNodeMemoryRuntime` + `createNodeHttpRequestListener`, with configurable
  host/port/base path and graceful shutdown.

## What Node Does Not Own

- Protocol semantics — `@metacrdt/core`.
- Runtime contracts and operation/sync helpers — `@metacrdt/runtime`.
- Browser/local-first defaults — `@metacrdt/local`.
- Cloudflare Durable Object storage/relay behavior — `@metacrdt/cloudflare`.
- Production server framework, auth, observability, static asset serving, hosted
  database provisioning, or migration orchestration. The packaged dev server is
  intentionally memory-only and local-development oriented.

## Conformance

The memory, SQLite, and Postgres runtime services pass the shared
`@metacrdt/testkit` EventStore / anti-entropy / deterministic-fold conformance
suite through their Effect Layer providers. SQLite and Postgres also pass
`@metacrdt/testkit` restart-persistence conformance for the event log, HLC, and
per-replica `seq`; the memory target also runs shared scheduler service-boundary
conformance. Package-specific tests still cover concrete persistence regressions
and the shared SQL lifecycle plan used by both SQL adapters. It also tests the
HTTP/SSE handler's health, delta pull, event push, SSE response paths, and the
native-style listener adapter's response writing and streamed POST body merge.
The dev-server CLI is tested by starting a real ephemeral `node:http` server and
querying its health route.

## Usage

```ts
import {
  createNodeMemoryRuntimeLayer,
  createNodeHttpRequestListener,
  createNodePostgresRuntimeLayer,
  createNodePostgresRuntime,
  createNodeSqlLifecyclePlan,
  createNodeSqliteRuntimeLayer,
  createNodeSqliteRuntime,
  createNodeSyncHttpHandler,
} from "@metacrdt/node";

const runtime = await createNodeSqliteRuntime({
  replicaId: "node:main",
  db,
});

const handleSync = createNodeSyncHttpHandler(runtime, { basePath: "/sync" });
const response = await handleSync({
  method: "GET",
  url: "/sync/events?vv=%7B%7D",
});

// Native node:http-style adapter:
const listener = createNodeHttpRequestListener(runtime, { basePath: "/sync" });
// http.createServer((req, res) => void listener(req, res)).listen(8787)
```

Effect-native hosts can provide the same targets as Layers:

```ts
const layer = createNodePostgresRuntimeLayer({
  replicaId: "node:pg",
  client,
});
```

Postgres uses the common `query(sql, params)` driver shape:

```ts
const pgRuntime = await createNodePostgresRuntime({
  replicaId: "node:pg",
  client, // e.g. a pg Pool/Client or Neon wrapper with query(sql, params)
});
```

Host tooling that wants to run its own migrations can use the same lifecycle
plan the adapters use:

```ts
const plan = createNodeSqlLifecyclePlan({
  dialect: "postgres",
  tablePrefix: "tenant_a",
});

for (const sql of plan.initializeStatements) {
  await client.query(sql);
}
```

Local in-memory dev server:

```sh
npx metacrdt-node-dev --port 8787 --base-path /sync
curl http://127.0.0.1:8787/sync/health
```

`db` is any object with a structural SQLite API:

```ts
type NodeSqliteDatabaseLike = {
  exec?(sql: string): unknown | Promise<unknown>;
  prepare(sql: string): NodeSqliteStatementLike | Promise<NodeSqliteStatementLike>;
};
```

Postgres clients only need:

```ts
type NodePostgresClientLike = {
  query(
    sql: string,
    params?: readonly unknown[],
  ):
    | { rows?: readonly unknown[]; rowCount?: number | null }
    | Promise<{ rows?: readonly unknown[]; rowCount?: number | null }>;
};
```

The sync handler routes are:

- `GET /<base>/health` — profile + local version vector.
- `GET /<base>/events?vv=<json>` — events this runtime has beyond the supplied
  version vector.
- `POST /<base>/events` with `{ events }` — merge remote events into the local
  G-Set and advance the local HLC.
- `GET /<base>/events/sse?vv=<json>` — one-shot `text/event-stream` delta frame
  for simple server-sent-event clients.
