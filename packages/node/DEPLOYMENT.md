# @metacrdt/node Deployment Recipes

`@metacrdt/node` is intentionally dependency-free. It does not choose `pg`,
`better-sqlite3`, Express, Fastify, Docker, systemd, Fly, Render, Railway, or any
other host for you. Instead, it exposes a structural production assembly helper:

```ts
import { createNodeProductionRuntime } from "@metacrdt/node";
```

That helper returns:

- a MetaCRDT runtime (`memory | sqlite | postgres`);
- an Effect `Layer` for Effect-native application code;
- a structural HTTP/SSE sync handler;
- a native `node:http`-style listener;
- SQL lifecycle metadata for SQLite/Postgres;
- an optional sync client for a configured remote peer.

This document shows where concrete drivers and process hosts plug in.

---

## Environment Shape

Use one replica id per running process. If you run multiple processes against the
same database, each process needs its own stable replica id.

```sh
METACRDT_REPLICA_ID=node:prod-us-west-1
METACRDT_BASE_PATH=/sync
PORT=8787
```

For Postgres:

```sh
DATABASE_URL=postgres://user:pass@host:5432/metacrdt
```

For SQLite:

```sh
METACRDT_SQLITE_PATH=/var/lib/metacrdt/metacrdt.sqlite
```

For remote sync:

```sh
METACRDT_REMOTE_SYNC_URL=https://peer.example.com/sync
METACRDT_REMOTE_SYNC_TOKEN=replace-me
```

The token is not interpreted by `@metacrdt/node`; it is just forwarded as a
header by the optional client. Authorization remains the host application's job.

---

## Native `node:http` + Postgres

```ts
import http from "node:http";
import { Pool } from "pg";
import { createNodeProductionRuntime } from "@metacrdt/node";

const port = Number(process.env.PORT ?? 8787);
const replicaId = process.env.METACRDT_REPLICA_ID ?? "node:prod";
const basePath = process.env.METACRDT_BASE_PATH ?? "/sync";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const node = await createNodeProductionRuntime({
  replicaId,
  storage: {
    kind: "postgres",
    client: pool,
    tablePrefix: "metacrdt",
  },
  sync: {
    basePath,
    clientBaseUrl: process.env.METACRDT_REMOTE_SYNC_URL,
    clientHeaders: process.env.METACRDT_REMOTE_SYNC_TOKEN
      ? { authorization: `Bearer ${process.env.METACRDT_REMOTE_SYNC_TOKEN}` }
      : undefined,
  },
});

const server = http.createServer((req, res) => {
  void node.listener(req, res);
});

server.listen(port, () => {
  console.log(`MetaCRDT sync listening on :${port}${node.basePath}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    void pool.end();
  });
});
```

Notes:

- `pg.Pool` already matches `NodePostgresClientLike` (`query(sql, params)`).
- The adapter initializes tables by default. If your deployment requires
  explicit migrations, set `initialize: false` and run `node.lifecycle` statements
  through your migration tool.
- `node.listener` only serves the sync surface. Your application can mount other
  routes in the same server before delegating to the listener.

---

## Native `node:http` + SQLite

```ts
import http from "node:http";
import Database from "better-sqlite3";
import { createNodeProductionRuntime } from "@metacrdt/node";

const db = new Database(process.env.METACRDT_SQLITE_PATH ?? "metacrdt.sqlite");

const node = await createNodeProductionRuntime({
  replicaId: process.env.METACRDT_REPLICA_ID ?? "node:sqlite",
  storage: {
    kind: "sqlite",
    db,
    tablePrefix: "metacrdt",
  },
  sync: {
    basePath: process.env.METACRDT_BASE_PATH ?? "/sync",
  },
});

const server = http.createServer((req, res) => {
  void node.listener(req, res);
});

server.listen(Number(process.env.PORT ?? 8787));

process.on("SIGTERM", () => {
  server.close(() => db.close());
});
```

Notes:

- `better-sqlite3` matches `NodeSqliteDatabaseLike`
  (`prepare().get/all/run`, plus `exec`).
- SQLite is a good single-process or embedded deployment. If you need multiple
  writers across machines, use Postgres or another coordinated storage adapter.

---

## Framework Adapter Shape

Frameworks can adapt the structural handler instead of using the native
listener:

```ts
const node = await createNodeProductionRuntime({ /* ... */ });

app.all("/sync/*", async (req, reply) => {
  const response = await node.handleSync({
    method: req.method,
    url: req.url,
    body: async () => req.body,
  });

  for (const [name, value] of Object.entries(response.headers)) {
    reply.header(name, value);
  }
  reply.status(response.status).send(response.body);
});
```

Keep authentication in the host framework. A common pattern is:

1. Let `/sync/health` be public or protected by deployment policy.
2. Require an app-owned Bearer token for `POST /sync/events`.
3. Pass `clientHeaders.authorization` when this node syncs to a protected peer.

---

## Explicit SQL Lifecycle

For hosts that require migration review, derive the DDL without initializing at
runtime:

```ts
const node = await createNodeProductionRuntime({
  replicaId: "node:prod",
  storage: {
    kind: "postgres",
    client,
    initialize: false,
  },
});

for (const sql of node.lifecycle?.initializeStatements ?? []) {
  await client.query(sql);
}
```

In production, prefer running those statements in your normal migration system
before starting the process, then keep `initialize: false`.

---

## Sync With a Peer

```ts
const node = await createNodeProductionRuntime({
  replicaId: "node:edge-a",
  storage: { kind: "postgres", client },
  sync: {
    basePath: "/sync",
    clientBaseUrl: "https://edge-b.example.com/sync",
    clientHeaders: { authorization: `Bearer ${token}` },
  },
});

await node.client?.syncFrom(node.runtime);
```

`syncFrom` performs one version-vector anti-entropy exchange. Long-running retry
loops, backoff, scheduling, process supervision, and observability belong in the
host app for now.

---

## Operational Checklist

- Use a stable `replicaId` per process.
- Use durable storage (`sqlite` or `postgres`) for anything beyond local dev.
- Run lifecycle DDL through migrations if your environment forbids runtime DDL.
- Put authentication/rate limits in the host framework or reverse proxy.
- Health-check `GET /sync/health`.
- Treat `metacrdt-node-dev` as local-only; use `createNodeProductionRuntime` for
  production hosts.
