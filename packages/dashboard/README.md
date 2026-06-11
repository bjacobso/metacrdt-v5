# @metacrdt/dashboard

Reusable React dashboard for browsing a MetaCRDT deployment.

The dashboard is the generic ontology explorer extracted from the Convex
reference app: overview, entities, entity detail, data model, transaction log,
flows, component-owned entity inspection, command menu, and entity picker.

## What this package owns

- Target-agnostic React pages and shared UI for the generic MetaCRDT explorer.
- ViewSpec-backed entity list rendering through `@metacrdt/views-react`.
- Calls to `@metacrdt/client` hooks by stable named query/mutation names.

## What this package does not own

- Convex generated API refs or any target-specific SDK.
- Product-specific pages such as compliance collection and staffing guided tour.
- Backend authorization or write gating. Apps inject those through the client
  binding.

## Usage

```tsx
import { MetacrdtClientProvider } from "@metacrdt/client";
import { Overview, Entities } from "@metacrdt/dashboard";

export function App({ client }) {
  return (
    <MetacrdtClientProvider client={client}>
      <Overview />
      <Entities />
    </MetacrdtClientProvider>
  );
}
```

## Checks

```sh
pnpm --filter @metacrdt/dashboard typecheck
pnpm --filter @metacrdt/dashboard build
```
