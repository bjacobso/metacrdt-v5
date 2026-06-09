# Provider Auth UI

## Status

The backend has a fail-closed `convex/auth.config.ts` and the frontend has a
shared auth-required UX boundary. A real provider choice and React/JWT wrapper
remain open.

## Remaining Slices

### 1. Provider Decision

Objective: choose the production auth provider and record issuer/audience
requirements.

Deliverables:
- Provider name and environment variables.
- JWT issuer/audience mapping.
- Local development behavior.

### 2. Convex Auth Config

Objective: fill the fail-closed Convex auth config with the chosen provider.

Deliverables:
- Config update.
- Tests or documented manual verification for accepted/rejected JWTs.

### 3. React Provider Wrapper

Objective: wire the React tree through the provider-specific auth wrapper while
preserving the existing auth-required UX.

Deliverables:
- `ConvexProviderWithAuth` integration.
- Loading/signed-out/signed-in states.
- Tests or app-level verification for protected write controls.

## Non-Goals

- Do not weaken protected backend writes.
- Do not add demo-only auth bypasses to production config.
