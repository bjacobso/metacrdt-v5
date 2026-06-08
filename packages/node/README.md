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

## What Node Does Not Own

- Protocol semantics — `@metacrdt/core`.
- Runtime contracts and operation/sync helpers — `@metacrdt/runtime`.
- Browser/local-first defaults — `@metacrdt/local`.
- Cloudflare Durable Object storage/relay behavior — `@metacrdt/cloudflare`.
- Postgres. It belongs here eventually, but this first slice only adds memory and
  server-SQLite runtime services.

## Conformance

Both the memory and SQLite runtime services pass the shared `@metacrdt/testkit`
EventStore / anti-entropy / deterministic-fold conformance suite. The package
also verifies SQLite persistence of the event log, HLC, and per-replica `seq`
across runtime recreation.

## Usage

```ts
import { createNodeSqliteRuntime } from "@metacrdt/node";

const runtime = await createNodeSqliteRuntime({
  replicaId: "node:main",
  db,
});
```

`db` is any object with a structural SQLite API:

```ts
type NodeSqliteDatabaseLike = {
  exec?(sql: string): unknown | Promise<unknown>;
  prepare(sql: string): NodeSqliteStatementLike | Promise<NodeSqliteStatementLike>;
};
```
