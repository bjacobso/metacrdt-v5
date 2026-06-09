# App & UI Restructure — unify `convex/`, `confect/`, `src/` into packages + apps

Once the substrate is fully packaged (including `@metacrdt/workflow` and
`@metacrdt/collect` — see the root `PLAN.md`), the repo's top level still mixes a
library monorepo with a deployed application. This spec is the plan to separate
those concerns: pull the reusable parts of `convex/`, `confect/`, and `src/` into
packages, move the deployable application into `apps/`, and decide the fate of
the Confect experiment.

This is the **actionable** altitude for the end-state sketched in
[`../vision/experience.md`](../vision/experience.md) (generated UI) and
[`../vision/config.md`](../vision/config.md) (products as declarations). It
depends on [`./views.md`](./views.md) Phase 4 and relates to
[`./confect-domain-wrapper.md`](./confect-domain-wrapper.md).

## Status at a glance

| Phase | What | Status |
|---|---|---|
| 1 | Converge root `convex/` component binding onto `packages/convex` (kill the duplication) | ⏳ later |
| 2 | Move the deployable app to `apps/onboarded/` (root becomes pure workspace) | ⏳ later |
| 3 | Extract `@metacrdt/views-react` (renderer) — see [views.md](./views.md) Phase 4 | ⏳ later |
| 4 | Extract `@metacrdt/dashboard` (generic ontology explorer) on top of views-react | ⏳ later |
| 5 | Design `@metacrdt/client` — uniform live-query interface (the consolidation doc's `sdk`) | ⏳ later |
| 6 | Decide Confect: promote into `packages/convex`, keep as reference app, or freeze | ⏳ later |
| 7 | (stretch) `apps/dashboard-cloudflare/` — prove dashboard + client work cross-target | ⏳ later |

---

## The mental model: the top level conflates four concerns

The repo root is simultaneously a library workspace *and* a running app. Those
are four distinct things tangled together. Almost every step below is just
"pull one of these out of the pile."

| Concern | Where it lives today | Should be |
|---|---|---|
| **Substrate** | `packages/*` | packages (in progress) |
| **Target binding** (Convex component + IO glue) | `packages/convex` **and** root `convex/` (duplicated) | one package + thin app wiring |
| **Product** (the staffing/compliance "Onboarded" vertical) | `convex/appconfig.ts`, `convex/compliance.ts`, product pages in `src/` | an app (+ blueprint as data) |
| **Authoring experiment** (Effect-native) | `confect/` | folded into the target *or* a reference app *or* archived |

---

## Disposition of each directory

### `convex/` (~9.9k LOC excl. tests) — splits three ways; does **not** become one package

- **Pure logic** (`lib/engine.ts`, `lib/meta.ts`, the flow/form/requirement
  semantics) → already moving to packages via `PLAN.md` + the workflow/collect
  extraction. The remaining `lib/*` adapters become thin re-exports.
- **Target binding** (`facts.ts`, `materialize.ts`, `rebuild.ts`, `crons.ts`,
  `metacrdtComponent.ts`, `convex.config.ts`) → **converge onto
  `packages/convex`.** Today there is real duplication between root
  `convex/metacrdtComponent.ts` and `packages/convex`; that seam should resolve
  inside the package, leaving the app with thin wiring. This is Phase 1 and the
  prerequisite for judging Confect.
- **App API + deployment** (`entities.ts`, `overview.ts`, `system.ts`,
  `http.ts`, `schema.ts`, `auth.config.ts`, `appconfig.ts`) → **inherently the
  app.** This is the read API the frontend calls plus deployment config; it
  moves to `apps/onboarded/convex/`, not to a package.

### `src/` (~4.4k LOC) — splits two ways

The frontend API surface confirms the split:

- **Generic / ontology** (any deployment has these): `entities.*`,
  `attributes.typeSchemaAsOf`, `datalog.*`, `facts.*`, `overview.*`,
  `system.*`, `flows.*`, `configHistory.*`, `actions.*`. Backing pages:
  `Overview`, `Entities`, `EntityDetail`, `DataModel`, `TransactionLog`,
  `Flows`, `ComponentEntity`, plus `ViewRenderer.tsx`, `EntityPicker`,
  `CommandMenu`. → **`@metacrdt/dashboard`** (+ `@metacrdt/views-react`).
- **Product-specific**: `compliance.*`, `forms.collect*`,
  `appconfig.setupStaffing`, `metacrdtComponent.*owned*`. Backing pages:
  `Compliance`, `Collect`, the staffing `GuidedTour`. → **stays in the app.**

### `confect/` (~1.3k LOC) — an Effect-native binding style, not a third substrate

`confect/*.impl.ts` already import `fromEvents`/`visibleAsserts` from
`@metacrdt/core` and pull from `@metacrdt/convex` — but they **redefine** the
tables (`FactEvents`, `DerivedFacts`, `Rules`, `Transactions`) as Confect
`Table.make` schemas. So it is a prototype of "what `packages/convex` looks like
authored Confect-style," not a parallel engine. Its fate is Phase 6 (below) and
is tracked in tandem with [`./confect-domain-wrapper.md`](./confect-domain-wrapper.md).

---

## New package opportunities

1. **`@metacrdt/views-react`** — the renderer. Already planned in
   [`./views.md`](./views.md) Phase 4. Pulls `ViewRenderer.tsx` /
   `entitiesView.ts` out of `src/`. Low-risk, well-scoped. Depends on
   `@metacrdt/views/runtime` + react.

2. **`@metacrdt/dashboard`** — the generic ontology explorer (entities, data
   model, timeline, flows, schema-as-of). This is
   [`../vision/experience.md`](../vision/experience.md) made reusable: a UI
   computed from type + config rather than product code, so it works on *any*
   MetaCRDT deployment. Depends on `views-react` + `client` (below).

3. **`@metacrdt/client`** — **the keystone.** The dashboard today calls
   `api.entities.listEntities`, a Convex-generated ref. A package cannot hardcode
   one deployment's `api`. For the dashboard to be deployment-agnostic (Convex /
   Cloudflare / node) it needs a uniform live-query interface the app injects.
   This unifies three things that already exist separately: Convex reactive
   reads, the Cloudflare live-query SDK ([`./cloudflare-live-query-sdk.md`](./cloudflare-live-query-sdk.md)),
   and the node sync client. This is the consolidation doc's `sdk`. **Without it,
   `@metacrdt/dashboard` silently re-couples to Convex** and the "works on any
   target" promise breaks.

Dependency story: `dashboard → views-react + client (interface)`; each **app**
supplies the concrete client binding for its target.

---

## The `apps/` question — options

Move the deployable app out of root so the root is purely the workspace.

- **Option A — one full-stack reference app** (`apps/onboarded/`): backend
  (`convex/`) + frontend (`src/`) together; mounts every package, the dashboard,
  the client binding, and the staffing/compliance product. Simplest; matches how
  Convex apps colocate client + functions. **Recommended for now.**
- **Option B — split backend/frontend** (`apps/convex-deployment/` +
  `apps/web/`): cleaner boundary, but they are tightly coupled through the
  generated API; coordination cost for little near-term gain.
- **Option C — two apps to prove portability** (`apps/onboarded/` + a thin
  `apps/dashboard-cloudflare/` that mounts only `@metacrdt/dashboard` against the
  Cloudflare target): the strongest *demonstration* that the dashboard + client
  abstraction are real, and the natural place the Cloudflare live-query SDK pays
  off. **Recommended later** (Phase 7), once `@metacrdt/client` exists.

`convex/appconfig.ts` (the staffing blueprint) is *config data* — the cleanest
artifact of "products are declarations." Move it to
`apps/onboarded/blueprints/staffing.ts` so it reads as a declaration, not setup
code.

---

## The Confect fork — options (Phase 6)

Since `confect/` consumes the substrate but redefines the target tables, it is a
prototype `@metacrdt/convex` authoring surface. Three honest options:

- **(i) Promote** — fold into `packages/convex` as an Effect-native authoring
  export (e.g. `@metacrdt/convex/confect`), rebased so table schemas come from
  the package, not redefined. Plain `convex/` functions become thin/generated
  over it. *Highest payoff, highest cost; commits to Confect as the target's
  authoring layer.*
- **(ii) Parallel reference** — `apps/onboarded-confect/`: a second reference app
  showing the Effect-native style end-to-end. *Keeps the comparison alive
  without forcing a winner.*
- **(iii) Freeze** — move to [`../explorations/`](../explorations/) until the
  substrate stabilizes. *Honest if Confect is not on the critical path.*

**Recommendation: (ii) now**, decide (i) vs (iii) only after Phase 1 — Confect's
value (is Effect-native authoring better?) cannot be judged while
`packages/convex` itself is still half-in-the-app. Do not promote it onto a
moving target. Coordinate with [`./confect-domain-wrapper.md`](./confect-domain-wrapper.md).

---

## Recommended end-state layout

```text
packages/
  core query schema runtime workflow collect testkit views
  views-react        # renderer (views.md Phase 4)
  dashboard          # generic ontology explorer UI
  client             # uniform live-query interface (the "sdk") + per-target bindings
  convex cloudflare local node   # targets (absorb the root convex/ binding glue)
apps/
  onboarded/         # the product: convex backend + react frontend, mounts everything
    convex/  src/  blueprints/staffing.ts
  (later) onboarded-confect/    # Effect-native reference, OR
  (later) dashboard-cloudflare/ # cross-target proof for dashboard + client
specs/explorations/  # confect/ if frozen
```

---

## Phases (actionable)

### Phase 1 — Converge the Convex target binding
- [ ] Inventory the overlap between root `convex/metacrdtComponent.ts` +
      `convex/lib/*` and `packages/convex`.
- [ ] Move binding/component logic into `packages/convex`; leave the app with
      thin re-export wiring.
- [ ] All existing `convex/*.test.ts` stay green; `packages/convex` conformance
      still passes.

### Phase 2 — Relocate the app
- [ ] Create `apps/onboarded/` containing the current `convex/` (app API + deploy
      glue only) and `src/`.
- [ ] Move `appconfig.ts` → `apps/onboarded/blueprints/staffing.ts`.
- [ ] Update root `package.json`, `pnpm-workspace.yaml` (add `apps/*`),
      `turbo.json`, `vite.config.ts`, and Convex deploy config. Root no longer
      ships a `convex/` or `src/`.

### Phase 3 — `@metacrdt/views-react`
- [ ] Per [views.md](./views.md) Phase 4 — extract the renderer; enforce the
      headless boundary (no query execution in `@metacrdt/views`).

### Phase 4 — `@metacrdt/dashboard`
- [ ] Extract the generic pages/components listed above; depend on `views-react`
      + the `client` interface (Phase 5).
- [ ] App consumes `@metacrdt/dashboard`, injecting its Convex client binding.

### Phase 5 — `@metacrdt/client`
- [ ] Define the minimal uniform live-query interface (subscribe/query/assert).
- [ ] Ship a Convex binding first (wrap reactive reads); Cloudflare/node bindings
      follow with Phase 7.

> Full design — `MetacrdtClient` Effect service + effect-atom React binding +
> swappable backend Layers, and the RPC-vs-query-AST decision — is its own spec:
> [`./client-atom.md`](./client-atom.md). That spec answers this phase's "thin
> interface vs concrete adapters" open question (interface-first, Confect
> WebSocket Layer first).

### Phase 6 — Decide Confect (see options above).

### Phase 7 — (stretch) `apps/dashboard-cloudflare/`
- [ ] Thin app mounting only `@metacrdt/dashboard` against the Cloudflare target,
      proving the `client` abstraction is real cross-target.

---

## Open questions

- **Dashboard scope** — read-only explorer, or include write affordances (run
  flow, assert fact, `appconfig` diff)? Writes pull more product-coupling in.
- **`@metacrdt/client` shape** — _resolved in [`./client-atom.md`](./client-atom.md):_
  an Effect `MetacrdtClient` service interface + effect-atom React binding, with
  swappable per-backend Layers (Confect WS first, then CF/node/local/mock).
- **App naming** — product-named (`onboarded`) vs neutral (`reference`)?
  Product-named is honest to the vision but couples the example to one vertical.

## Non-goals

- Not splitting backend and frontend into separate apps now (Option B) unless a
  concrete need appears.
- Not promoting Confect (option i) before Phase 1 stabilizes `packages/convex`.
- Not making `@metacrdt/dashboard` a full product UI — the compliance/collect
  product surfaces stay in the app.
- Not building all per-target `@metacrdt/client` bindings up front; Convex first,
  others on demand.
