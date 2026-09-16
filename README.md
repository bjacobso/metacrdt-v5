# MetaCRDT

**Explainable coordination from versioned policies and facts, powered by Triplex.**

MetaCRDT turns derived requirements into durable work and collects the evidence
that resolves it. Triplex owns facts, temporal queries, configuration releases,
derivation provenance, and the transaction journal. MetaCRDT owns the meaning and
lifecycle of the resulting work.

The first implemented consumer is [`@metacrdt/triplex`](./packages/triplex/README.md):
release-pinned forms, submission previews, requirement reconciliation, resumable
journal consumption, and durable expiry wakeups. Run the SQLite example with
Node 24 after `pnpm install`:

```bash
pnpm demo:triplex
pnpm test:triplex
```

The example opens a training requirement, previews and commits evidence, closes
the database, and reopens work at evidence expiry after restarting. See the
[Triplex architecture](./specs/reference/triplex-coordination.md) for the current
boundary and remaining migration work.

This repository also retains the original convergence protocol implementation and
`@metacrdt/*` package monorepo. The full existing reference application lives in
[`apps/convex-demo`](./apps/convex-demo) and runs on
[Convex](https://convex.dev) as a centralized, reactive reference runtime. Thin
Cloudflare and Node demos live in `apps/cloudflare-demo` and `apps/node-demo` to
prove the shared dashboard/client boundary. The demo elaboration is
**datarooms** (compliance/onboarding) — one physics over the substrate, not the
substrate itself.

> **Research Preview.** The Triplex consumer is the first slice of the new
> architecture; the existing dashboard and runtime packages have not migrated.
> The original event log is a CRDT. The Triplex consumer makes no replica-merge
> guarantee. See [Status](#status).

---

## 📖 Documentation

**All design, spec, and reference docs live in [`./specs`](./specs/README.md) —
start there.** The map is organized by altitude:

| Altitude | Where | What it answers |
| --- | --- | --- |
| **Reference** | [`specs/reference/`](./specs/reference/README.md) | What is true now — the [engine](./specs/reference/engine.md), the [protocol](./specs/reference/protocol.md), the [architecture](./specs/reference/architecture.md), [positioning](./specs/reference/positioning.md) |
| **Vision** | [`specs/vision/`](./specs/vision/README.md) | Why it exists and where it's going — the [thesis & pillars](./specs/vision/overview.md) and 18 design explorations |
| **Plans** | [`specs/plans/`](./specs/plans/README.md) | What we're building next — actionable, slice-sized specs |
| **Explorations** | [`specs/explorations/`](./specs/explorations/README.md) | Speculative technology sketches (Confect, Foldkit, Alchemy) |

In-flight work is coordinated in the gitignored `PLAN.md` / `TODO.md` scratchpads.

---

## Development

Install dependencies:

```bash
pnpm install
```

Run the Convex reference app backend:

```bash
pnpm --filter @metacrdt/convex-demo exec convex dev
```

Configure backend JWT auth when a provider is chosen:

```ts
// apps/convex-demo/convex/auth.config.ts
export default {
  providers: [
    {
      domain: "https://your-issuer.example.com",
      applicationID: "convex",
    },
  ],
};
```

For deployments where the issuer/audience should come from Convex environment
values, use this shape after setting the values:

```bash
pnpm --filter @metacrdt/convex-demo exec convex env set CONVEX_AUTH_ISSUER https://your-issuer.example.com
pnpm --filter @metacrdt/convex-demo exec convex env set CONVEX_AUTH_APPLICATION_ID convex
```

```ts
// apps/convex-demo/convex/auth.config.ts, after both env vars exist in the deployment
export default {
  providers: [
    {
      domain: process.env.CONVEX_AUTH_ISSUER!,
      applicationID: process.env.CONVEX_AUTH_APPLICATION_ID!,
    },
  ],
};
```

Convex requires any environment variable referenced by `auth.config.ts` to exist
in the deployment. The checked-in config therefore references no env vars and
accepts no providers until the product provider is selected. The frontend still
uses an explicit no-provider hook until that provider-specific wrapper is added.

Run the Vite frontend:

```bash
pnpm dev:web
```

Run the thin target demos:

```bash
pnpm --filter @metacrdt/cloudflare-demo dev
pnpm --filter @metacrdt/node-demo dev
```

Run tests:

```bash
pnpm test          # build packages, then run the Convex backend suite
pnpm test:packages # all @metacrdt/* package tests through Turbo
pnpm test:all      # package tests, then Convex app tests
```

Build:

```bash
pnpm build          # package builds, then all app builds
pnpm build:packages # package builds only
pnpm build:apps     # Convex, Cloudflare, and Node app builds
pnpm pack:packages  # package dry-run pack checks through Turbo
```

Typecheck:

```bash
pnpm typecheck
```

Deploy from the Convex app package. In short:
`pnpm --filter @metacrdt/convex-demo exec convex dev --once` configures and
pushes functions to a dev deployment. `pnpm run deploy` deploys Convex functions
once `CONVEX_DEPLOYMENT` is configured locally or `CONVEX_DEPLOY_KEY` is present
in CI. `pnpm run deploy:static` uploads static assets to the `.convex.site`
host.

---

## Status

Research Preview.

Built:

- Triplex coordination consumer with versioned collection, recoverable requirement
  reconciliation, durable temporal wakeups, and a SQLite restart example
- Convex reference runtime
- datarooms/compliance elaboration
- `@metacrdt/core`
- bitemporal visibility via core in the read path
- `@metacrdt/schema`, `@metacrdt/query`, `@metacrdt/convex`,
  `@forma/ts`, `@metacrdt/runtime`, `@metacrdt/cloudflare`,
  `@metacrdt/local`, `@metacrdt/node`, `@metacrdt/client`,
  `@metacrdt/views-react`, `@metacrdt/dashboard`, and the first
  `@metacrdt/testkit`
- thin Cloudflare and Node dashboard demos over the shared client boundary
- docs/spec/architecture package plan

Frontier:

- Triplex-backed dashboard/ViewSpec queries, workflow execution and effect delivery,
  authorization integration, existing-work release migration, and historical data copy
- commutative supersession in the write path
- HLC + version-vector sync across replicas
- Durable Object + SQLite triple-store parity
- production database lifecycle/migrations beyond the current Node SQL DDL plan
  and structural production assembly helper
- full historical SQL-indexed Datalog/query providers beyond the shared
  EventStore-backed service and current projection-backed query provider

## License

MIT
