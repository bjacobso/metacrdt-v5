# Open Ontology Unification — umbrella org, repo layout, and the MetaCRDT merge

**Status:** 📋 planned (decision-stage; supersedes the implicit `.context/open-ontology`
fold-in)

Open Ontology (open-ontology.com) is the umbrella brand and GitHub org. This
spec records the brand→layer mapping, the target repo layout, and the phased
plan to unify this repo (the MetaCRDT exploration) with the Open Ontology repo
into one layered monorepo — splitting repos only after interfaces stabilize.

## Decisions (ADR-level, locked unless revisited explicitly)

1. **Umbrella:** Open Ontology — org `open-ontology`, site open-ontology.com,
   runtime front door ontology.run (+ ontology-runtime.com redirect).
2. **Protocol:** MetaCRDT — the event model (content-addressed events, HLC,
   bitemporal fold, G-Set merge, provenance) is the substrate semantics for the
   unified system. `@metacrdt/*` npm scope and metacrdt.com stay, scoped to the
   protocol: SPEC + kernel + testkit + sync primitives.
3. **Language:** Forma — `@forma/*`, forma-lang.com. One canonical copy.
   `@forma/ocaml` frozen (research tier; conformance surface capped).
4. **Definition layer / IR:** Open Ontology's canonical IR (`ontology-ir`,
   `ontology-compiler`, `dsl-ts`, `logic-ast`) is the shared IR. The planned
   from-scratch `Ontology` IR in `@metacrdt/schema` is cancelled; this repo
   becomes a consumer.
5. **One fact store:** OO's Datalog engine + adapter breadth, re-founded on the
   MetaCRDT event protocol. The `@metacrdt/testkit` conformance suite is the
   acceptance gate. Duplicated pairs each pick one survivor (see Phase 4).
6. **Schematics** (schematics.run) is a sibling project under the org —
   Effect-based filesystem/algebra config-as-code (define a project's schema,
   deploy it). It is not part of this merge; it consumes the umbrella brand and
   eventually the IR.

## Target GitHub org layout (end state)

| Repo | Contents | npm scope | Visibility |
| --- | --- | --- | --- |
| `open-ontology/ontology` | Flagship monorepo: IR + compiler + dsl, triplestore engine + adapters (sqlite/postgres/D1/DO/convex/local), runtime (constraints, processes, views, workspaces), view protocol, apps/examples | `@open-ontology/*` | public |
| `open-ontology/metacrdt` | Protocol: SPEC, `core`, `testkit`, sync/anti-entropy | `@metacrdt/*` | public |
| `open-ontology/forma` | Language: ts, host, editor, lsp, frozen ocaml | `@forma/*` | public |
| `open-ontology/schematics` | Config-as-code platform | `@schematics/*` or `@open-ontology/schematics` | TBD |
| `open-ontology/examples` | Ontology corpora + walkthroughs (split from flagship when it grows) | — | public |
| `open-ontology/.github` | Org profile, shared workflows | — | public |

Products (Onboarded datarooms) live outside the org or as private repos; the
dataroom demo stays in the flagship as an app/example.

**Interim state:** everything except Schematics lives in ONE monorepo
(`open-ontology/ontology`) with top-level workspace areas `forma/`,
`metacrdt/`, `packages/` (ontology+store+runtime), `targets/`, `apps/`,
`specs/`. Repos split out per-layer only after that layer's interface has been
stable for ~a quarter (Forma first, MetaCRDT second).

## Phases

### Phase 0 — Decisions on record ✅/⬜
- [ ] This spec merged; mirrored as an ADR in the OO repo's specs tree.
- [ ] Verify ownership of the `@forma` npm org (bare `forma` package is taken
      by a third party; `@forma` org exists — confirm we control it, else fall
      back to `@forma-lang/*` or `@open-ontology/forma-*`).
- [ ] Confirm GitHub org `open-ontology` ownership + transfer plan for the
      existing OO repo.

### Phase 1 — Forma single home (do first; active rot)
- [ ] Pick the canonical Forma location (the unified monorepo's `forma/` area).
- [ ] Delete or mark read-only the second copy; the non-canonical repo consumes
      published `@forma/*` packages or a workspace link — never a file copy.
- [ ] Cap the OCaml conformance surface at the current fixture set; CI marks it
      non-blocking.

### Phase 2 — One monorepo
- [ ] Import this repo into the OO repo (git subtree / filter-repo to preserve
      history) under `metacrdt/` + `targets/convex/`.
- [ ] Workspace scopes wired (`pnpm-workspace.yaml`): `forma/*`, `metacrdt/*`,
      `packages/*`, `targets/*`, `apps/*`.
- [ ] Both prior build/test pipelines green in the unified repo before any
      package is refactored.
- [ ] Unify the specs trees (this repo's `specs/` altitudes + OO's `specs/`).

### Phase 3 — Protocol adoption (the hard merge; spike first, timebox it)

> Theory + prior art for this phase are verified in
> [`../vision/convergence.md`](../vision/convergence.md): supersession-by-`≺` is the
> deployed go-ds-crdt construction; fold-permutation invariance is the conformance
> property that catches divergence bugs.

- [ ] Spike: one OO database adapter (sqlite) persisting MetaCRDT events
      (content addressing, HLC, bitemporal coordinates) behind the existing
      Datalog engine; run `@metacrdt/testkit` conformance against it.
- [ ] Commutative supersession lands in the protocol (deterministic tiebreak),
      making "the log is a CRDT" true pre-replica.
- [ ] Port remaining OO adapters (postgres, D1, DO, FoundationDB-or-cut) to the
      event model; conformance suite green per adapter.
- [ ] Retire the losing store implementation paths.

### Phase 4 — IR adoption + duplicate resolution
- [ ] `@metacrdt/schema`'s planned IR work redirected: consume `ontology-ir`.
- [ ] Views: one ViewSpec under the IR — fold `@metacrdt/views` and OO
      `view-protocol` into a single package; demo UI routes through it.
- [ ] Per duplicated pair, record survivor + migration note: query engines
      (`@metacrdt/query` vs OO database Datalog), workflow (`@metacrdt/workflow`
      + flows vs OO runtime processes), platform hosts (`@metacrdt/{node,
      cloudflare,local}` vs `platform-{node,bun,cloudflare}`). Convex becomes
      `targets/convex`, an adapter like the others.

### Phase 5 — Product/platform split inside the monorepo
- [ ] OO web app → `apps/web`; dataroom demo → `apps/datarooms`; both consume
      only published-shaped package interfaces.
- [ ] Supersedes/absorbs the existing [App & UI Restructure](./app-ui-restructure.md)
      plan's later phases.

### Phase 6 — Repo splits (evidence-gated, not scheduled)
- [ ] Forma → `open-ontology/forma` once descriptor boundary unchanged ~1 quarter.
- [ ] MetaCRDT → `open-ontology/metacrdt` once SPEC + testkit interface settles
      post-supersession.

## Non-goals

- No new runtimes/targets during the merge; no Effect v4; no wholesale Confect
  conversion (existing working rules carry over).
- Schematics integration beyond branding is out of scope here.
- No repo splits before Phase 6 gates are met — workspace boundaries are the
  project boundaries until then.

## Risks

- **Big-bang merge:** mitigated by Phase 2's "both pipelines green before
  refactor" gate and one-package-at-a-time moves.
- **Store merge stalls (Phase 3):** the spike is the canary; if the sqlite
  adapter can't pass conformance in a timeboxed spike, escalate to a design
  ADR before porting the rest.
- **Brand sprawl:** the org carries exactly four brands (Open Ontology,
  MetaCRDT, Forma, Schematics). Anything that wouldn't deserve its own brand
  doesn't get its own repo.
