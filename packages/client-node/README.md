# @metacrdt/client-node

Node sync-client binding for `@metacrdt/client`.

This package adapts `@metacrdt/node`'s HTTP sync SDK client to the named query
interface consumed by `@metacrdt/dashboard`. It is the browser-facing client used
by `apps/node-demo`.

## What this package owns

- `createNodeMetacrdtClient`, a `MetacrdtClient` implementation backed by
  `createNodeSyncClient`.
- Health and pull-delta polling for dashboard reads.
- Lightweight projections from pulled protocol events into entity, overview, and
  transaction-log shapes expected by the shared dashboard.

## What this package does not own

- Node runtime storage, HTTP/SSE sync routes, or server process assembly. Those
  live in `@metacrdt/node`.
- Generic dashboard UI. That lives in `@metacrdt/dashboard`.
- Product-specific write APIs.

## Usage

```ts
import { createNodeMetacrdtClient } from "@metacrdt/client-node";

const client = createNodeMetacrdtClient({
  baseUrl:
    import.meta.env.VITE_METACRDT_NODE_SYNC_URL ??
    "http://127.0.0.1:8787/sync",
  refreshMs: 5_000,
});
```

## Checks

```sh
pnpm --filter @metacrdt/client-node typecheck
pnpm --filter @metacrdt/client-node build
pnpm --filter @metacrdt/node-demo build
```
