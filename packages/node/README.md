# @metacrdt/node

The Node / server-process target for MetaCRDT. It is the open host: unlike
managed targets such as Convex or Cloudflare Durable Objects, Node can mount
different storage adapters behind the same runtime contracts.

## What Node Owns

- **Node memory runtime** — `createNodeMemoryRuntime`, a named wrapper over the
  runtime memory harness for server/dev/test processes.
- **Server SQLite runtime** — `createNodeSqliteRuntime`, with
  `NodeSqliteEventStore`, `NodeSqliteClock`, and `NodeSqliteSequencer` over a
  structural SQLite driver interface.
- **Driver-neutral SQLite shape** — `NodeSqliteDatabaseLike` /
  `NodeSqliteStatementLike`, matching the common `prepare().get/all/run` surface
  used by better-sqlite3-style wrappers, Bun SQLite adapters, and tests. The
  package intentionally ships no native SQLite dependency.
- **HTTP/SSE sync handler** — `createNodeSyncHttpHandler`, a dependency-free
  fetch-like handler over any `RuntimeServices`: health/version-vector,
  pull-delta, push-events, and one-shot SSE delta routes. It returns a small
  structural response so Express, Fastify, Hono, native `node:http`, Bun, tests,
  or a future dev server can adapt it without this package owning a framework.
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
- Postgres. It belongs here eventually, but this first slice only adds memory and
  server-SQLite runtime services.
- Production server framework, auth, observability, static asset serving, or
  durable production storage. The packaged dev server is intentionally
  memory-only and local-development oriented.

## Conformance

Both the memory and SQLite runtime services pass the shared `@metacrdt/testkit`
EventStore / anti-entropy / deterministic-fold conformance suite. The package
also verifies SQLite persistence of the event log, HLC, and per-replica `seq`
across runtime recreation, and tests the HTTP/SSE handler's health, delta pull,
event push, SSE response paths, and the native-style listener adapter's response
writing and streamed POST body merge. The dev-server CLI is tested by starting a
real ephemeral `node:http` server and querying its health route.

## Usage

```ts
import {
  createNodeHttpRequestListener,
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

The sync handler routes are:

- `GET /<base>/health` — profile + local version vector.
- `GET /<base>/events?vv=<json>` — events this runtime has beyond the supplied
  version vector.
- `POST /<base>/events` with `{ events }` — merge remote events into the local
  G-Set and advance the local HLC.
- `GET /<base>/events/sse?vv=<json>` — one-shot `text/event-stream` delta frame
  for simple server-sent-event clients.
