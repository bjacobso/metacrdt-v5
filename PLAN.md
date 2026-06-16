# Minimal Vision Proof Plan

## Goal

Prove the smallest complete version of account configuration-as-code plus
multi-tenant runtime deployment.

The proof is complete when a reviewer can see, from tests and a short operator
checklist, that two different tenants can be deployed from checked-in Forma
definitions through a Terraform-like workflow:

```text
Forma source -> validate -> dump artifact -> plan -> review -> approve -> apply
  -> active deployment -> export/history
```

Terraform is only the workflow analogy. The deploy boundary is the native
account deploy artifact and the Convex runtime state.

Historical implementation notes live in `PLAN_HISTORY.md`.

## Non-Goals

- No migration, backfill, default-tenant promotion, or widen-migrate-narrow work.
  This branch targets fresh data instances.
- No Terraform provider, Terraform module, HCL authoring, or external deploy
  pipeline integration.
- No more authoring polish unless it directly helps prove the workflow below.
- No broad UI redesign. Use existing Account Config surfaces.

## Claims To Prove

### 1. Tenant Isolation

Evidence needed:

- A staffing tenant and a legal workflow tenant can both exist in the same app.
- A principal sees only tenants where they have membership.
- Runtime data, config manifests, flows, compliance obligations, facts, and
  deployment history are tenant-local.
- Public tenant-owned reads/writes require explicit tenant context once tenants
  exist.

Authoritative proof:

- Convex tests for tenant membership and tenantless access rejection.
- Convex tests proving staffing and legal tenants can carry different account
  shapes without cross-tenant leakage.

### 2. Config-as-Code Source Boundary

Evidence needed:

- `configs/accounts/staffing.forma` and
  `configs/accounts/legal-workflows.forma` validate from a clean checkout.
- Both checked-in Forma sources dump to native account deploy artifacts.
- Both deploy artifacts include account metadata, manifest, resources, source
  digest, artifact digest, graph metadata, and source outline metadata.
- Invalid source produces structured diagnostics with useful line/path data.

Authoritative proof:

- CLI tests for `check-sources`, `validate`, `dump`, `graph`, and `outline`.
- Package tests for Forma parse/normalize/diagnostics.

### 3. Terraform-Like Deploy Loop

Evidence needed:

- A checked-in Forma source can be saved or loaded as a draft.
- Draft/source can be planned into a persisted deployment plan.
- Review export exposes source/artifact metadata, semantic diff, dangerous
  changes, graph data, baseline state, staleness, and rollback metadata.
- Plans must be approved before apply.
- Applying a plan advances the active deployment pointer.
- Re-planning the same source is idempotent and produces a no-change plan.
- Stale plans are detected and blocked from approval/apply.
- Rollback is itself a planned/reviewed deployment before apply.
- Failed plans preserve status, error text, and review metadata.

Authoritative proof:

- A focused Convex end-to-end test for staffing:
  create tenant -> load checked-in Forma -> save draft -> plan -> review ->
  approve -> apply -> active deployment -> export -> idempotent re-plan.
- The same focused Convex end-to-end test for legal workflows.
- Existing or added tests for stale plan rejection, failed review export, and
  rollback planning/apply.

### 4. Account Review Surface

Evidence needed:

- Account Config UI renders source, parse diagnostics, normalized diff,
  checked-in source comparison, graph, manifest, drift, deployment plans,
  active deployment, apply jobs, rollback review, and history.
- The browser-facing review state matches what the CLI/server review artifacts
  expose.
- A reviewer can inspect the current tenant account without reading Convex
  tables directly.

Authoritative proof:

- SSR/component tests for the Account Config panels.
- One operator checklist that names the exact UI/CLI path for the demo.

## Minimal Proof Checklist

Run these checks before calling the PR ready:

```bash
pnpm exec vitest run \
  convex/tenants.test.ts \
  convex/accountDeploy.test.ts \
  convex/accountConfigDrafts.test.ts \
  src/accountConfigCli.test.ts \
  src/uiRender.test.tsx

pnpm exec tsc --noEmit -p tsconfig.json

git diff --check
```

Also run, or document why they are covered by tests:

```bash
pnpm account-config check-sources --output yaml
pnpm account-config validate configs/accounts/staffing.forma
pnpm account-config validate configs/accounts/legal-workflows.forma
pnpm account-config dump --output yaml configs/accounts/staffing.forma
pnpm account-config graph --output yaml configs/accounts/legal-workflows.forma
pnpm account-config outline --output yaml configs/accounts/legal-workflows.forma
```

## Operator Demo Script

The README or this plan must include a short demo sequence that proves the loop:

```bash
pnpm account-config check-sources --output yaml
pnpm account-config draft-save --tenant acme-staffing --name main \
  --review-note "checked-in staffing source" configs/accounts/staffing.forma
pnpm account-config plan-deploy --tenant acme-staffing --draft main \
  --output yaml configs/accounts/staffing.forma
pnpm account-config review-deploy --tenant acme-staffing --plan <planId> \
  --output yaml
pnpm account-config approve-deploy --tenant acme-staffing --plan <planId> \
  --output yaml
pnpm account-config apply-deploy --tenant acme-staffing --plan <planId> \
  --output yaml
pnpm account-config deploy-current --tenant acme-staffing --output yaml
pnpm account-config export --tenant acme-staffing --output yaml
pnpm account-config rollback-deploy --tenant acme-staffing \
  --plan <appliedPlanId> --output yaml
```

Repeat the same shape for `legal-workflows`.

## Proof Status

The minimal proof is represented by current tests and README commands:

- `convex/accountDeploy.test.ts` includes the focused checked-in Forma deploy
  loop for both staffing and legal tenants on fresh data, including draft,
  plan, review, approve, apply, active deployment, export, tenant-local
  manifests, and idempotent re-plan coverage.
- `README.md` includes the account-config command sequence for source checks,
  draft save, plan, review, approve, apply, current deployment, export, and
  rollback.
- `PLAN_HISTORY.md` preserves the broader implementation record and deferred
  ideas.

Verified proof commands:

```bash
pnpm exec vitest run convex/tenants.test.ts convex/accountDeploy.test.ts convex/accountConfigDrafts.test.ts src/uiRender.test.tsx
pnpm exec vitest run src/accountConfigCli.test.ts
pnpm exec tsc --noEmit -p tsconfig.json
git diff --check
pnpm account-config check-sources --output yaml
pnpm account-config validate configs/accounts/staffing.forma
pnpm account-config validate configs/accounts/legal-workflows.forma
pnpm account-config dump --output yaml configs/accounts/staffing.forma
pnpm account-config graph --output yaml configs/accounts/legal-workflows.forma
pnpm account-config outline --output yaml configs/accounts/legal-workflows.forma
```

Scope guard:

- Defer additional Forma editor polish, completion improvements, visual
  refinements, and migration-related work until after this minimal proof is
  reviewed.

## Completion Bar

This plan is complete when:

- The proof checklist passes.
- The golden deploy-loop test proves staffing and legal tenants independently.
- The operator demo script is documented with current commands.
- `PLAN_HISTORY.md` remains available for detailed historical context.
- No required proof depends on manual inspection of unrelated implementation
  details.
