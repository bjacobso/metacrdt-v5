# Plans — what we're building next

This directory breaks the larger objectives (and the ephemeral `PLAN.md` /
`TODO.md` coordination notes) into smaller implementation specs. Each spec is
meant to be independently actionable: one work session should be able to pick a
slice, implement it, update the same spec, and leave the broader objective
intact. This is the **actionable** altitude — for the durable model see
[`../reference/`](../reference/README.md); for the aspirational end-state see
[`../vision/`](../vision/README.md).

## Active Specs

| Spec | Purpose | Current next slice |
| --- | --- | --- |
| [Cloudflare Phase D](./cloudflare-phase-d.md) | Durable Object SQLite operational parity after Goal 145 | Persisted flow definition registry lookup |
| [Cloudflare Live Query SDK](./cloudflare-live-query-sdk.md) | Frontend/SDK layer over the shipped structural live-query helpers | React-free browser session storage/auth boundary |
| [Cloudflare SQL Query Hardening](./cloudflare-sql-query-hardening.md) | Broader historical SQL-indexed query-provider parity and performance | Add targeted scan coverage for the next missing query shape |
| [Cloudflare Target](./cloudflare-target.md) | The overall Durable Object + SQLite triple-store target plan (parity with the Convex component; live queries over DO WebSockets as a stretch) | See the Cloudflare specs above for the active slices |
| [Node Production Hardening](./node-production-hardening.md) | Production deployment support around the shipped Node runtime assembly | Auth middleware example |
| [Provider Auth UI](./provider-auth-ui.md) | Provider-specific React/JWT wrapper over the fail-closed auth config | Choose provider and wire `ConvexProviderWithAuth` |
| [Confect Domain Wrapper](./confect-domain-wrapper.md) | Scoped Confect/Effect sidecar expansion without converting Convex wholesale | Pick one read/planning domain with stable semantics |
| [Views](./views.md) | Fold Open Ontology's ViewSpec into `@metacrdt/views`, generated from in-package Forma preludes | Phase 4: extract `@metacrdt/views-react` |
| [App & UI Restructure](./app-ui-restructure.md) | Unify the top-level `convex/`, `confect/`, `src/` into packages + `apps/` once the substrate is packaged | Phase 1: converge the Convex target binding into `packages/convex` |
| [Client / Atom](./client-atom.md) | `@metacrdt/client` — effect-atom frontend over a `MetacrdtClient` service with swappable backend Layers (Confect WS, raw Convex, polling, CF, node, local) | Phase 1: the `MetacrdtClient` interface + Schema payloads |

## Working Rules

- Keep each spec focused on one target or product seam.
- Record shipped slices as checkboxes with goal numbers.
- Put non-goals in the spec before implementation starts.
- Do not mark full parity unless every remaining item in that spec is complete
  and verified.
- `PLAN.md` remains the historical narrative; `TODO.md` remains the current
  pulse. These specs are the working breakdown.
