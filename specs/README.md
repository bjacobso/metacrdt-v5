# MetaCRDT Specs

This directory breaks the large operational backlog in `PLAN.md` and `TODO.md`
into smaller implementation specs. Each spec is meant to be independently
actionable: a Codex window should be able to pick one slice, implement it,
update the same spec, and leave the broader objective intact.

## Active Specs

| Spec | Purpose | Current next slice |
| --- | --- | --- |
| [Cloudflare Phase D](./cloudflare-phase-d.md) | Durable Object SQLite operational parity after Goal 145 | Persisted flow definition registry lookup |
| [Cloudflare Live Query SDK](./cloudflare-live-query-sdk.md) | Frontend/SDK layer over the shipped structural live-query helpers | React-free browser session storage/auth boundary |
| [Cloudflare SQL Query Hardening](./cloudflare-sql-query-hardening.md) | Broader historical SQL-indexed query-provider parity and performance | Add targeted scan coverage for the next missing query shape |
| [Node Production Hardening](./node-production-hardening.md) | Production deployment support around the shipped Node runtime assembly | Auth middleware example |
| [Provider Auth UI](./provider-auth-ui.md) | Provider-specific React/JWT wrapper over the fail-closed auth config | Choose provider and wire `ConvexProviderWithAuth` |
| [Confect Domain Wrapper](./confect-domain-wrapper.md) | Scoped Confect/Effect sidecar expansion without converting Convex wholesale | Pick one read/planning domain with stable semantics |

## Working Rules

- Keep each spec focused on one target or product seam.
- Record shipped slices as checkboxes with goal numbers.
- Put non-goals in the spec before implementation starts.
- Do not mark full parity unless every remaining item in that spec is complete
  and verified.
- `PLAN.md` remains the historical narrative; `TODO.md` remains the current
  pulse. These specs are the working breakdown.
