# @metacrdt/views-react

React renderer for `@metacrdt/views` ViewSpec trees.

This package is the host renderer extracted from the Convex reference app. It
turns normalized ViewSpec nodes into React elements while keeping the core
ViewSpec package headless and render-agnostic.

## What this package owns

- `ViewRenderer`, the recursive React renderer for ViewSpec node trees.
- `ViewRenderContext`, the runtime data/action context passed to rendered views.
- Small renderer-local UI helpers used by the ViewSpec components.

## What this package does not own

- ViewSpec schema, normalization, or expression evaluation. Those live in
  `@metacrdt/views`.
- Query execution. Hosts provide query results in the render context.
- Dashboard pages. Those live in `@metacrdt/dashboard`.

## Usage

```tsx
import { ViewRenderer, type ViewRenderContext } from "@metacrdt/views-react";

const ctx: ViewRenderContext = {
  state: {},
  input: {},
  query: {},
};

export function RenderedView({ root }) {
  return <ViewRenderer node={root} ctx={ctx} />;
}
```

## Checks

```sh
pnpm --filter @metacrdt/views-react typecheck
pnpm --filter @metacrdt/views-react build
```
