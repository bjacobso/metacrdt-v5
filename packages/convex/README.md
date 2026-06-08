# @metacrdt/convex

The Convex target for MetaCRDT. It is the reference runtime binding: it adapts
Convex rows to and from core `Event`s, validates protocol metadata, reconciles
cardinality-one by the `≺` order, and ships a registered Convex **component** that
can own a protocol event log and its projections in its own tables.

A target binds the protocol to a host. It is not the substrate — the convergence
semantics live in `@metacrdt/core`; this package makes Convex speak them.

## What Convex Owns

- **Row ↔ core adapters** — `assertEvent`, `retractEvent`, `tombstoneEvent`,
  `untombstoneEvent`, `eventPatch`, `protocolEventFromRows`,
  `summarizeProtocolEvent`, and `hlcFromTransaction` (deriving HLC from a Convex
  transaction). Identity helpers: `CONVEX_REPLICA_ID`, `convexActorType`,
  `asCoreValue`.
- **Visibility & projection folds** — `foldEventsForFactProjection`,
  `isFactVisible`, `valueKey`, delegating the predicate to `@metacrdt/core`.
- **Cardinality-one reconcile** — `reconcileCardinalityOneCandidates` and
  `CARDINALITY_ONE_SUPERSESSION_REASON`: pure selection of the surviving visible
  assert by `≺`, so losers are retracted through protocol events while history
  keeps every assertion.
- **Function factories** — `buildAssertFactEvent`, `buildLifecycleFactEvent`,
  `createProtocolFactEventWriter`, `summarizeProtocolEventRows` for host-mounted
  append/verify helpers.
- **Validators** — `hlcValidator`, `protocolMetadataValidators` for Convex schema
  field validation.
- **Component surface** — `@metacrdt/convex/convex.config.js` exports a registered
  component that owns `transactions` + append-only protocol `factEvents` and the
  `facts` / `currentFacts` projections, exposing `log.appendAssert`,
  `log.appendLifecycle`, `log.appendRaw`, `log.getRawEvent`,
  `log.listRawEvents`, `log.listCurrent`, `log.rebuildProjections`,
  `log.getCurrentEntity`, and the compliance/flow/collection functions the
  reference app mounts as `components.metacrdt`.
- **Runtime Layer binding** — `createConvexComponentRuntimeLayer` adapts a host's
  Convex query/mutation runner plus component function refs into the
  `@metacrdt/runtime` Effect service tags. The component-owned raw log and
  component-owned `projectionRows` read model pass `@metacrdt/testkit`
  EventStore / anti-entropy / deterministic-fold / projection-store conformance
  through that Layer.
- **Confect integration** — `confectSidecarWarning` / `ManualConfectMountDecision`
  for the optional typed Effect sidecar.

## What Convex Does Not Own

- Protocol semantics — events, ids, order, fold are `@metacrdt/core`.
- Feature semantics independent of Convex (schema vocabulary, Datalog helpers) —
  `@metacrdt/schema`, `@metacrdt/query`.
- Cloudflare, local-first, or Node bindings.
- Product UI.

## Dependencies

- `@metacrdt/core`
- `@metacrdt/runtime`
- `convex`
- `effect` v3 (`^3.21.3`) for Layer providers.

## Relation to SPEC

This package makes Convex writes produce data shaped like SPEC §3–5: every
`factEvent` carries `eventId` + HLC + actor/replica/target metadata, and
cardinality-one resolves by the SPEC §5.1 `≺` order rather than write-arrival
order. The Confect sidecar stays in the read/planning/inspection lane and does not
define protocol.

## Usage

As adapters in an app's own Convex functions:

```ts
import { buildAssertFactEvent, reconcileCardinalityOneCandidates } from "@metacrdt/convex";
```

As an installed component:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import metacrdt from "@metacrdt/convex/convex.config.js";
const app = defineApp();
app.use(metacrdt);
export default app;
```

As an Effect runtime Layer over mounted component functions:

```ts
import { createConvexComponentRuntimeLayer } from "@metacrdt/convex";

const layer = createConvexComponentRuntimeLayer({
  replicaId: "convex:app",
  refs: {
    appendRaw: components.metacrdt.log.appendRaw,
    getRawEvent: components.metacrdt.log.getRawEvent,
    listRawEvents: components.metacrdt.log.listRawEvents,
  },
  runner: {
    mutation: (ref, args) => ctx.runMutation(ref, args),
    query: (ref, args) => ctx.runQuery(ref, args),
  },
});
```

## Extraction Boundary

This package must not import from `.context/open-ontology`. The reference app
consumes it from `convex/lib/coreEvent.ts`, `convex/lib/visibility.ts`,
`confect/metacrdt.impl.ts`, and the mounted component wrapper.
