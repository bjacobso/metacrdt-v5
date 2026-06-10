# Roadmap

A first-principles sequencing of the next stretch of work, broken into isolated,
independently-mergeable PRs. This complements `specs/plans/` (which holds the
detailed per-area specs) by answering the question those docs don't: **in what
order, and why.**

## Where the project stands

The thesis is that one substrate — a convergent, bitemporal fact log with
`assert` / `fold` / `react` — gives you audit, time-travel, obligations,
generated UI, and multi-target convergence as emergent properties rather than
features. As of `d54dc75`:

- **Proven:** the kernel math (convergence proof, Forma Zero conformance on
  both the TS and OCaml engines), the single-replica Convex reference target,
  the headless views runtime, the typed-authority *conformance suite*.
- **Designed but unproven:** typed authority *enforcement* in a real engine,
  the full authoring loop (Forma source → ViewSpec → live UI), multi-replica
  anti-entropy in operation, CALM monotonicity classification.
- **Missing infrastructure:** CI. Every gate (build, typecheck, vitest, OCaml
  parity scripts, IR snapshots) exists but only runs on someone's laptop.

## Ordering principles

1. **Retire the riskiest unproven claim first.** The vision docs are honest
   about what's `[ahead]`; each PR below should move something from "designed"
   to "demonstrated".
2. **A PR is isolated if it can merge with green checks and no follow-up
   required.** Vertical slices over horizontal layers; no PR that only makes
   sense if the next three land.
3. **Respect the layering rules** (`specs/reference/architecture.md`): feature
   packages stay target-free; `@metacrdt/views` stays query-agnostic and
   render-agnostic — renderers and query bindings live in sibling packages.
4. **Theory and product pull the same thread.** The recently merged
   typed-authority conformance suite and the half-finished Better Auth wiring
   are the same feature seen from two ends; sequence them to meet in the
   middle.

---

## Phase 0 — Foundations (do first, everything else depends on it)

### PR 0.1 — GitHub Actions CI
The whole "isolated PRs step by step" model needs an automated gate. All the
checks already exist as scripts; this PR only wires them up.

- Add `.github/workflows/ci.yml`: pnpm install → `turbo run build typecheck test`
  on PRs and `main`.
- Cache pnpm store and turbo outputs.
- Skip the OCaml/dune toolchain initially — run `@forma/ocaml` script gates only
  if the committed js_of_ocaml artifact makes that possible without dune;
  otherwise defer to PR 0.2.
- **Accept:** a PR with a failing test cannot merge green.

### PR 0.2 — Conformance & snapshot drift gates in CI
- Add the Forma Zero + typed-authority conformance suites
  (`packages/@forma/conformance/`) and the views IR snapshot checks
  (`snapshot:protocol-ir`, `snapshot:viewspec-ir`) as a second CI job.
- **Accept:** editing a prelude without regenerating snapshots fails CI.

### PR 0.3 — Docs hygiene sweep
- Fold the now-stale auth section of `README.md` into a pointer at `PLAN.md`;
  link this roadmap from `README.md` and `specs/plans/README.md`; record the
  Phase-1–3 views completion in one place.
- **Accept:** no doc instructs a pattern another doc supersedes without a
  pointer to the winner.

---

## Track F — Workspace split: packages vs apps (do early, right after Phase 0)

The repo root is still simultaneously a library workspace and a deployed app
(`convex/`, `confect/`, `src/`, vite/vitest configs all at root). The detailed
analysis lives in `specs/plans/app-ui-restructure.md`; this track resolves its
open questions — **neutral demo naming** (`apps/convex-demo`, not
`apps/onboarded`) and **Option C as the destination**: one full reference app
now, thin `apps/cloudflare-demo` / `apps/node-demo` later as proof that the
dashboard + client abstractions are target-agnostic.

These PRs rename paths across the whole repo, so they land **before** Tracks
A/B accumulate more root-coupled code — F1/F2 first, the rest on the normal
schedule.

### PR F1 — Converge the Convex target binding (restructure Phase 1)
- Dedupe root `convex/metacrdtComponent.ts` + `convex/lib/*` against
  `packages/convex`; binding/component logic lives in the package, the app
  keeps thin re-export wiring.
- **Accept:** all root `convex/*.test.ts` stay green; `packages/convex`
  conformance passes; no logic exists in both places.
- *Prerequisite for everything else in this track — moving the app before
  deduping just relocates the duplication.*

### PR F2 — Move the app to `apps/convex-demo/`
- One mechanical PR: `convex/`, `confect/`, `src/`, `index.html`,
  `vite.config.ts`, root `vitest.config.ts`, and the Better Auth +
  static-hosting deps move into `apps/convex-demo/` with its own
  `package.json`. They move together because they're coupled through
  `convex/_generated/api`.
- Move `convex/appconfig.ts` → `apps/convex-demo/blueprints/staffing.ts` so
  the product reads as a declaration, not setup code.
- Add `apps/*` to `pnpm-workspace.yaml`; update turbo filters, CI from PR 0.1,
  root scripts, and `CLAUDE.md`'s `convex/_generated/ai/guidelines.md`
  pointer. Deployment linkage (`.env.local`) moves with the app; `convex dev`
  runs from the app dir.
- **Accept:** root `package.json` is a pure workspace manifest (no app deps);
  `pnpm dev` / `pnpm deploy` work from `apps/convex-demo`; CI green.
- *Confect moves with the app — its impl files redefine this deployment's
  tables, so it is part of the deployment. The promote/freeze decision
  (restructure Phase 6) stays deferred.*

### PR F3 — Extract `@metacrdt/dashboard` (generic ontology explorer)
- Pull the deployment-agnostic pages out of the app: Overview, Entities,
  EntityDetail, DataModel, TransactionLog, Flows, ComponentEntity, plus
  CommandMenu/EntityPicker. Product surfaces (Compliance, Collect, the
  staffing GuidedTour) stay in `apps/convex-demo`.
- **The trap to avoid:** these pages call `api.entities.listEntities` — a
  Convex-generated ref a package cannot import. Extract against a narrow
  injected client interface (subscribe-to-named-query over the generic API
  surface); the app supplies the Convex implementation. Without this the
  dashboard silently re-couples to Convex and per-target demos become
  impossible.
- Depends on PR B1 (`@metacrdt/views-react`) for the renderer.
- **Accept:** `@metacrdt/dashboard` has zero `convex` imports; the app renders
  identically by injecting its binding.

### PR F4 — Rebase the dashboard onto `@metacrdt/client`
- When Track E lands the real `MetacrdtClient` interface, collapse the F3
  interim interface into it.
- **Accept:** one client interface, per-target bindings live with the targets.

### PR F5 — `apps/cloudflare-demo` (after F4 + the Cloudflare live-query SDK)
- Thin app: `@metacrdt/dashboard` + the Cloudflare client binding, nothing
  else. This is the proof the abstraction is real — and it's expected to be
  much smaller than `convex-demo`, which also carries the product vertical.
- **Accept:** the same dashboard package browses a Cloudflare-target
  deployment with zero dashboard code changes.

### PR F6 — `apps/node-demo`
- Same shape as F5 against the node target's sync client. Natural companion
  to PR C2's local ↔ node sync work.

*F1 → F2 immediately after Phase 0; F3 after B1; F4 after E1; F5 after F4 +
the Cloudflare live-query SDK; F6 after F4.*

---

## Track A — Authority: from conformance suite to enforced reality

The typed-authority work (`specs/vision/typed-authority.md`, conformance suite
merged in #11) is the most recently active thread and the biggest gap between
theory and product. Grants are facts; enforcement is a fold. Make that true in
the running system.

### PR A1 — Finish Better Auth wiring (PLAN.md phases, remaining slice)
- Complete the unfinished phases of `PLAN.md`: HTTP route mounting, env vars,
  the demo credential choice. The fail-closed `auth.config.ts` becomes real.
- **Accept:** sign-in works against the dev deployment; unauthenticated writes
  are rejected.

### PR A2 — `authority` fold in `@metacrdt/query` (pure, target-free)
- Implement the enforcement fold from the conformance suite as a pure library:
  given a log of grant facts + a principal + a proposed read/write, return
  allow/deny with provenance.
- Drive it with the existing `packages/@forma/conformance/typed-authority/`
  corpus so the suite gains its first *engine* (mirroring how forma-zero runs
  on ts + ocaml).
- **Accept:** typed-authority conformance passes against the TS implementation.

### PR A3 — Grants-as-facts in the Convex target
- Wire PR A2 into `convex/`: Better Auth identity → principal entity; mutations
  check the authority fold; seed default grants via `applyConfig` so they get
  config provenance and time-travel for free.
- **Accept:** revoking a grant fact immediately denies the action, and the
  denial is explainable by a Datalog query over grant facts.

### PR A4 — Per-principal visible-subject projection
- The designed read-side: a scheduler-driven, batched projection of visible
  subjects per principal (the v1 cut chosen in `specs/vision/authorization.md`
  instead of request-time graph traversal).
- **Accept:** entity list/detail queries filter through the projection; a
  rebuild job reconstructs it from the log.

*A1 is independent; A2 is independent; A3 needs both; A4 needs A3.*

---## Track B — Close the authoring loop (views Phases 4–6)

The demo that sells the thesis: author an entity + view in Forma, and a working
UI appears with zero hand-written React. Three PRs, already sketched in
`specs/plans/views.md`; the layering rule is that `@metacrdt/views` itself
never learns about React or Convex.

### PR B1 — Extract `@metacrdt/views-react` (views Phase 4)
- Move `src/views/ViewRenderer.tsx` into a new sibling package consuming only
  `@metacrdt/views/runtime`; the app imports the package.
- **Accept:** app renders identically; the new package has no Convex imports;
  bundle delta stays within the Phase-3 runtime-only budget.

### PR B2 — Edge binding layer: ViewSpec queries → Convex (views Phase 5)
- A small binding package (or module in `packages/convex`) that resolves a
  ViewSpec's declared `queries` to live Convex subscriptions and feeds the
  renderer.
- **Accept:** one existing page (start with Entities) is rendered end-to-end
  from a ViewSpec with live reactivity, replacing its hand-written query
  wiring.

### PR B3 — Forma view defs → ViewSpec lowering (views Phase 6)
- `define-view` in a Forma prelude lowers to a ViewSpec via the existing
  descriptor codegen path; snapshot-tested like the other IR.
- **Accept:** editing the Forma source and regenerating changes the rendered
  page; no TS edits in between. This is the "one ontology → generated
  experience" demo, end to end.

*Strictly sequential: B1 → B2 → B3.*

---

## Track C — Convergence: from proof to operation

Multi-replica convergence is the project's name-claim, currently proven in
memory (`@metacrdt/testkit`, convergence proof) and modeled
(`specs/plans/AntiEntropy.tla`) but never run between two real targets.

### PR C1 — TLC model checking for `AntiEntropy.tla`
- Add the TLC config (`specs/plans/anti-entropy-tla.md` next slice), check
  small finite models, run it in CI as an optional job.
- **Accept:** TLC passes on the small models; a deliberately broken invariant
  fails.

### PR C2 — Cross-target sync demo: `local` ↔ `node`
- Use the existing HTTP/SSE adapters in `@metacrdt/node` and the
  BroadcastChannel/IndexedDB machinery in `@metacrdt/local` to run testkit's
  anti-entropy conformance between a browser replica and a node replica.
- **Accept:** the testkit convergence contract passes across the process
  boundary, not just in memory.

### PR C3 — Convex as a sync peer
- Expose version-vector/delta endpoints from the Convex target so a local
  replica can anti-entropy against the hosted log (read-only first).
- **Accept:** a fresh local replica replays to the same fold results as the
  Convex projection — checked by testkit, gated in CI against a seeded
  fixture.

*C1 independent; C2 independent; C3 after C2.*

---

## Track D — Engine hardening (parallel, pick up between bigger slices)

Each of these is a single PR with a spec already on file:

- **PR D1 — Datalog monotonicity classifier**
  (`specs/plans/datalog-monotonicity-classification.md`): classify rules
  CALM-monotone vs not; persist the metadata. Unlocks safe incremental
  reactions later.
- **PR D2 — Cloudflare Phase D** (`specs/plans/cloudflare-phase-d.md`):
  persisted flow-definition registry lookup.
- **PR D3 — Cloudflare SQL query hardening**
  (`specs/plans/cloudflare-sql-query-hardening.md`): next missing query-shape
  scan coverage.
- **PR D4 — Node production hardening**
  (`specs/plans/node-production-hardening.md`): auth middleware example —
  natural follow-on to Track A since it can reuse the PR A2 authority fold.

---

## Track E — Client SDK (after B2 proves the shape)

### PR E1 — `MetacrdtClient` interface (`specs/plans/client-atom.md` Phase 1)
- Target-neutral client interface with Schema payloads; the Convex binding
  from PR B2 becomes its first implementation.

### PR E2 — Atom layer
- Reactive client-side atoms over the client interface, so non-React hosts get
  the same live-view capability.

---

## Suggested order of attack

```
0.1 → 0.2 → 0.3        (one short sitting; everything else gates on 0.1)
F1 → F2                 (workspace split — land before A/B start, it renames
                         paths repo-wide)
then in parallel:
  A1 ──┐
  A2 ──┴→ A3 → A4      (authority thread)
  B1 → B2 → B3          (authoring-loop thread)
  C1, C2 → C3           (convergence thread)
later, on this scaffolding:
  B1 → F3 → (E1 →) F4 → F5, F6   (dashboard package → per-target demo apps)
D1–D4, E1–E2 slot in between as standalone slices.
```

If only one thread can be active, take **F1–F2, then Track A through A3, then
Track B through B3**: the split keeps every later PR cleanly scoped, A3 makes
the system safe to show, B3 makes it worth showing.

## What this roadmap deliberately defers

- **Full historical Datalog hardening** — current EventStore-backed service is
  adequate for the preview; revisit after C3.
- **Per-account JIT HTTP API** — explicitly cut for the Convex target
  (`specs/vision/convex.md`); don't revive until a multi-tenant story exists.
- **General DAG workflow runner** — the compliance reconciler pattern covers
  current needs; adopt the Convex Workflow component when a second consumer
  appears.
- **Open Ontology org/repo split** (`specs/plans/open-ontology-unification.md`
  Phase 0) — a packaging decision, not a capability; cheapest to do after the
  `@forma` surface stabilizes (post-B3).
- **The Confect promote/freeze decision** (`specs/plans/app-ui-restructure.md`
  Phase 6) — Confect moves into `apps/convex-demo` with PR F2 as a parallel
  authoring style; whether it becomes `@metacrdt/convex`'s authoring layer or
  gets archived can't be judged fairly until F1 stabilizes the package it
  would be promoted into.
