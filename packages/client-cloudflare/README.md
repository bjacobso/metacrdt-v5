# @metacrdt/client-cloudflare

Cloudflare Durable Object live-query binding for `@metacrdt/client`.

This package adapts `@metacrdt/cloudflare`'s SQLite live-query session to the
named query interface consumed by `@metacrdt/dashboard`. It is the browser-facing
client used by `apps/cloudflare-demo`.

## What this package owns

- `createCloudflareMetacrdtClient`, a `MetacrdtClient` implementation backed by
  `createDurableObjectSqliteLiveQuerySession`.
- A small dashboard projection layer over current fact rows so the shared
  dashboard can browse Cloudflare target data without importing target code.
- Explicit unavailable mutation errors for writes not exposed by the live-query
  client.

## What this package does not own

- Durable Object storage or relay behavior. That lives in `@metacrdt/cloudflare`.
- Generic dashboard UI. That lives in `@metacrdt/dashboard`.
- Product-specific Convex APIs.

## Usage

```ts
import { createCloudflareMetacrdtClient } from "@metacrdt/client-cloudflare";

const client = createCloudflareMetacrdtClient({
  url: import.meta.env.VITE_METACRDT_CLOUDFLARE_LIVE_QUERY_URL,
  protocol: import.meta.env.VITE_METACRDT_CLOUDFLARE_LIVE_QUERY_PROTOCOL,
  connectionId: import.meta.env.VITE_METACRDT_CLOUDFLARE_CONNECTION_ID,
});
```

## Checks

```sh
pnpm --filter @metacrdt/client-cloudflare typecheck
pnpm --filter @metacrdt/client-cloudflare build
pnpm --filter @metacrdt/cloudflare-demo build
```
