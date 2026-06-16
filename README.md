# MetaCRDT

**A convergence substrate for structured coordination across distributed runtimes.**

> Databases store facts. CRDTs synchronize facts. **MetaCRDT synchronizes facts,
> logic, workflows, permissions, agents, and interfaces.**

MetaCRDT starts from one primitive — *a convergent graph of facts, constraints,
intentions, and effects* — and models every change as an immutable event in an
append-only, bitemporal fact log. State is not mutated in place; it is a
deterministic fold of events. Because **derivation** is also a fold, obligations,
rules, workflows, permissions, and generated views converge without being
separately synchronized. That is the "meta."

This repository is the canonical MetaCRDT reference implementation and `@metacrdt/*`
package monorepo. It currently runs on [Convex](https://convex.dev) as a
centralized, reactive reference runtime, with the pure convergence kernel extracted
as `@metacrdt/core`. The demo elaboration is **datarooms** (compliance/onboarding) —
one physics over the substrate, not the substrate itself.

> **Research Preview.** What is *built* vs. *research frontier* is marked
> explicitly in the docs. The log is a CRDT today; the multi-replica convergence
> runtime is research. See [Status](#status).

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

Run the Convex backend:

```bash
pnpm exec convex dev
```

Configure backend JWT auth when a provider is chosen:

```ts
// convex/auth.config.ts
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
pnpm exec convex env set CONVEX_AUTH_ISSUER https://your-issuer.example.com
pnpm exec convex env set CONVEX_AUTH_APPLICATION_ID convex
```

```ts
// convex/auth.config.ts, after both env vars exist in the deployment
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

Run tests:

```bash
pnpm test          # build packages, then run the Convex backend suite
pnpm test:packages # all @metacrdt/* package tests through Turbo
pnpm check:account-config # validate checked-in account config sources
pnpm test:all      # package tests, account config source checks, then root backend tests
```

Build:

```bash
pnpm build          # package builds, then Vite app build
pnpm build:packages # package builds only
pnpm build:app      # Vite app build only
pnpm pack:packages  # package dry-run pack checks through Turbo
```

Typecheck:

```bash
pnpm typecheck
```

Account config-as-code:

```bash
pnpm account-config check-sources --output yaml
pnpm account-config graph --output yaml configs/accounts/staffing.forma > account.graph.yaml
pnpm account-config graph --output mermaid configs/accounts/staffing.forma
pnpm account-config validate-forma --output yaml configs/accounts/staffing.forma
pnpm account-config from-forma --output yaml configs/accounts/staffing.forma > configs/accounts/staffing.from-forma.yaml
pnpm account-config normalize-forma --check --output yaml configs/accounts/staffing.forma
pnpm account-config dump --output yaml configs/accounts/staffing.forma > account.deploy.yaml
pnpm account-config diff-deploy --output yaml configs/accounts/staffing.forma
pnpm account-config draft-save --tenant acme-staffing --name main --review-note "checked-in staffing source" --output yaml configs/accounts/staffing.forma
pnpm account-config plan-deploy --tenant acme-staffing --draft main --output yaml configs/accounts/staffing.forma
pnpm account-config review-deploy --tenant acme-staffing --plan <planId> --output yaml
pnpm account-config approve-deploy --tenant acme-staffing --plan <planId> --output yaml
pnpm account-config apply-deploy --tenant acme-staffing --plan <planId> --output yaml
pnpm account-config deploy-current --tenant acme-staffing --output yaml
pnpm account-config export --tenant acme-staffing --output yaml > configs/accounts/staffing.export.yaml
pnpm account-config rollback-deploy --tenant acme-staffing --plan <appliedPlanId> --output yaml
pnpm account-config draft-list --tenant acme-staffing --limit 10 --output yaml
pnpm account-config draft-export --tenant acme-staffing --name main > configs/accounts/staffing.forma
```

This is a Terraform-like workflow in product shape only: Forma/JSON/YAML source
is validated, elaborated into the native account deploy artifact, planned,
reviewed, approved, applied, and tracked by the Convex runtime. It is not a
Terraform provider or HCL surface.

Repeat the same command shape for the legal tenant by swapping
`acme-staffing`/`configs/accounts/staffing.forma` for
`legal-workflows`/`configs/accounts/legal-workflows.forma`. The minimal proof
suite covers both tenants on fresh data and verifies that re-planning an already
active source produces an idempotent no-change deployment plan.

Deploy notes are tracked in `TODO.md`. In short: `pnpm exec convex dev --once`
pushes functions to the dev deployment, and `pnpm exec static-hosting upload`
uploads static assets to the dev `.convex.site` host.

---

## Status

Research Preview.

Built:

- Convex reference runtime
- datarooms/compliance elaboration
- `@metacrdt/core`
- bitemporal visibility via core in the read path
- `@metacrdt/schema`, `@metacrdt/query`, `@metacrdt/convex`,
  `@forma/ts`, `@metacrdt/runtime`, `@metacrdt/cloudflare`,
  `@metacrdt/local`, `@metacrdt/node`, and the first `@metacrdt/testkit`
- docs/spec/architecture package plan

Frontier:

- commutative supersession in the write path
- HLC + version-vector sync across replicas
- Durable Object + SQLite triple-store parity
- production database lifecycle/migrations beyond the current Node SQL DDL plan
  and structural production assembly helper
- full historical SQL-indexed Datalog/query providers beyond the shared
  EventStore-backed service and current projection-backed query provider

## License

MIT
