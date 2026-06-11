# @metacrdt/client

The target-agnostic React client boundary for MetaCRDT dashboard surfaces.

This package defines the narrow interface that reusable UI packages consume:
named live queries, named mutations, and an optional write guard. It does not
know about Convex, Cloudflare, Node, or any generated API references.

## What this package owns

- `MetacrdtClient`, the injected client interface.
- `MetacrdtClientProvider`, `useClientQuery`, `useClientMutation`, and
  `useWriteGuard` for React consumers.
- `createStaticMetacrdtClient`, a small fixture helper for tests and examples.

## What this package does not own

- Target-specific transport behavior.
- Query planning or Datalog execution.
- Product-specific APIs such as staffing setup or compliance collection.

## Usage

```tsx
import {
  MetacrdtClientProvider,
  useClientQuery,
  type MetacrdtClient,
} from "@metacrdt/client";

function EntityTypes() {
  const types = useClientQuery("entities.listEntityTypes", {});
  return <pre>{JSON.stringify(types, null, 2)}</pre>;
}

export function App({ client }: { client: MetacrdtClient }) {
  return (
    <MetacrdtClientProvider client={client}>
      <EntityTypes />
    </MetacrdtClientProvider>
  );
}
```

## Checks

```sh
pnpm --filter @metacrdt/client typecheck
pnpm --filter @metacrdt/client build
```
