# Views Tab — ontology-defined views, listed, rendered, and action-bound

> Replaces the previous PLAN.md (Better Auth setup), which shipped in PR #8.

## Goal

Add a **Views** tab to the sidebar. Clicking it lists every view defined in the
tenant's ontology (as ViewSpec definitions stored schema-as-facts, like actions
and flows already are). Clicking a view renders it with the ViewSpec renderer,
binds its declared `queries` to **live Convex subscriptions**, and binds its
declared events/actions so a button in a view can execute a real ontology
action (`api.actions.runAction`) — the same loop Open Ontology workspaces have
(see `.context/open-ontology`, `packages/web/app/components/workspaces/`).

This is the vertical slice through phases 4–6 of `specs/plans/views.md`:
stored view definitions (a slice of phase 6's "ontology produces specs"), an
edge binding layer (phase 5), and a grown-up renderer (phase 4's precursor).
Update that doc's status table when this lands.

## Reference: how Open Ontology does it (`.context/open-ontology`)

The loop we are porting, adapted to this repo's Convex substrate:

| Concern | Open Ontology | This repo (target) |
|---|---|---|
| Definition | `define-view` / `define-workspace` Lisp forms → compiled ViewSpec, persisted as triples (`[?id, ":system/type", "View"]` + `:view:definition`) — `packages/runtime/src/views/ViewService.ts` | View defs as **schema-as-facts** on `view:<name>` entities, installed by config-as-code (`convex/appconfig.ts`), exactly like `action:<name>` defs |
| Listing | `ViewService.list()` → `allViewsAtom` → workspace sidebar nav (`WorkspaceBlocks.tsx`) | `api.views.listViews` Convex query → `/views` page + sidebar badge |
| Rendering | `ViewRenderer.tsx` `nodeRenderers` map over 40+ component types | Extend `src/views/ViewRenderer.tsx` (already covers the Entities subset) |
| Query binding | `runSingleQuery` fetch per binding + state-dependency re-run | `queryRef` → allowlisted Convex query via `useQueries` — **live by construction**, no re-run machinery needed |
| Actions | `runtime.dispatch()` switch over `ViewAction` variants; `executeAction` → ActionExecutionService | `dispatch()` switch in a `useViewHost` hook; `executeAction` → `api.actions.runAction`, gated by `useWriteGate` |

Key simplification vs OO: Convex `useQuery` subscriptions are reactive, so the
"action ran → re-run queries" plumbing (OO's `run-queries` callbacks, depMap
re-execution) mostly disappears — execute the action and the bound data
updates itself. That live-update moment is the demo payoff.

## Layering rules (do not violate)

From `specs/plans/views.md` (and memory): `@metacrdt/views` stays
**query-agnostic and render-agnostic**.

- The app imports **only** `@metacrdt/views/runtime` (effect-free, ~5 kB).
  Never the main entry — it drags the Effect Schema IR into the bundle
  (the +260 kB regression documented in views.md).
- Query bindings stay **opaque** to the views package. Resolution of
  `queryRef` → Convex function lives in the app (the "edge binding layer").
- The renderer stays a render *target*: it never executes queries; data and
  dispatch arrive via the host-provided context.
- View **specs are app/tenant content**; the package owns only the contract.

## Storage model — `view:<name>` schema-as-facts

Mirror the action-def pattern (`convex/actions.ts` header comment):

```
(view:<name>, type,        "View")
(view:<name>, label,       "Worker roster")          // display title
(view:<name>, description, "All workers with …")     // optional
(view:<name>, spec,        { …ViewSpec v2 JSON… })   // the whole envelope, one fact value
```

Storing the envelope as one JSON fact value (like an action's `asserts` /
`fields`) keeps it transactional, historized, and reconcilable by
`applyConfig`. No new tables.

## Phases

### Phase A — backend: view registry (`convex/views.ts` + config kind)

1. **`convex/views.ts`** (new), modeled on `actions.ts`:
   - `defineView` mutation — args `{ name, label?, description?, spec: v.any() }`;
     `requireWritePrincipal`; asserts the facts above in one transaction.
     Do a **light structural gate** server-side (object with
     `$viewSpec.version === "2"` and a `root` node) — full Schema validation
     stays in tests/CI via `@metacrdt/views`' `validateViewSpecStructure`
     (don't pull the Effect Schema IR into the Convex bundle until proven
     cheap; revisit if the gate proves too weak).
   - `listViews` query — all `view:*` defs → `{ name, label, description }`,
     for the sidebar/list page (no specs; keep it light).
   - `getView` query — one def by name, including `spec`.
   - Helper `convex/lib/viewDefs.ts` (mirror `lib/actionDefs.ts`): `viewId()`,
     `loadViewDef()`, `listViewDefs()`.
2. **`convex/appconfig.ts`** — add `"view"` to `ConfigKind`, `OWN_ATTR`
   (`owns.view`), `previousOwned`, the reconcile/retract path, and a `views:`
   array in the config literal type lowered through `defineView`'s logic
   (idempotent upsert, like every other kind).
3. **Blueprint content** — add two demo views to the staffing config in
   `appconfig.ts` (`setupStaffing`):
   - **`worker-roster`** — exercises query params, state, table events, and an
     action: a `table` bound to `queries.workers`
     (`queryRef: "entities.queryEntities"`, params `{ type: "Worker" }`),
     `onRowClick` → `setState selectedWorker` ; a header row with the selected
     worker and two `button`s dispatching
     `executeAction "terminate" / "reactivate"` on `state.selectedWorker`,
     `disabled` when nothing is selected (expression-driven).
   - **`onboarding-dashboard`** — exercises metrics/layout: `stat-group` of
     `metric`s bound to `queries.summary` (`queryRef: "overview.summary"`),
     plus a compliance table (`queryRef: "compliance.workerCompliance"`).
4. **Tests** — `convex/views.test.ts` (convex-test, like `actions.test.ts`):
   define/list/get round-trip, applyConfig idempotency + reconcile (removing a
   view from config retracts it), reject malformed spec. Plus a vitest that
   runs the blueprint specs through `validateViewSpecStructure` from
   `@metacrdt/views` (full validation lives here, off the serving path).

### Phase B — frontend: Views tab + list page

1. **`src/App.tsx`** — routes `/views` → `Views`, `/views/:name` → `ViewPage`.
2. **`src/Layout.tsx`** — Workspace nav item
   `{ to: "/views", label: "Views", icon: <PanelsTopLeft/>, badge: views?.length }`
   via `api.views.listViews`; add `/views` to `TITLES`.
3. **`src/pages/Views.tsx`** — list page: card per view (label, description,
   name as mono) → links to `/views/:name`. Empty state points at the staffing
   blueprint setup (same pattern as `Entities.tsx`).

### Phase C — the host runtime: `useViewHost` (edge binding layer)

The heart of the feature. New `src/views/host/` (app code; extraction to a
package only when proven — same rule as the renderer):

1. **`queryRegistry.ts`** — the explicit allowlist mapping `queryRef` strings
   to Convex functions + a param codec:
   ```ts
   const registry = {
     "entities.queryEntities":      { fn: api.entities.queryEntities,      select: (r) => r.page },
     "overview.summary":            { fn: api.overview.summary,            select: (r) => [r] },
     "compliance.workerCompliance": { fn: api.compliance.workerCompliance, select: (r) => r.open },
     "flows.listFlowDefs":          { fn: api.flows.listFlowDefs },
     "actions.actionsForType":      { fn: api.actions.actionsForType },
   };
   ```
   Unknown `queryRef` → renders an inline "unknown query binding" notice, never
   throws. The allowlist **is** the security boundary: a stored spec can only
   reach read-only queries we registered, with params it can shape but not
   functions it can choose. `select` flattens backend rows into renderer scope
   (generalizes `flattenEntityRows`).
2. **`useViewHost.ts`** — one hook owning the loop:
   - `state` from `initializeViewState(spec)` (`@metacrdt/views/runtime`).
   - Evaluate each binding's `params` expressions against
     `{ state, input, query }` scope (`evaluateViewExpression`), resolve via
     the registry, subscribe with `useQueries` (object form, non-throwing) —
     params referencing state re-subscribe automatically when state changes,
     which replaces OO's depMap re-run machinery.
   - `dispatch(actionOrList, scope)` — switch over the `ViewAction` subset:
     - `setState` / `patchState` / `toggleState` — path helpers from runtime.
     - `navigate` — react-router (`/e/:id` for entity refs, plain paths otherwise).
     - `showToast` — minimal inline toast (the app has none yet; keep it tiny).
     - `executeAction` — evaluate `name`/`entity`/`parameters` expressions →
       `guardWrite(label, () => runAction({ action, entity, args }))` from
       `useWriteGate` (`src/auth.tsx`), so view actions get the same auth gate
       as every other write in the app.
     - `runQuery` / `runQueries` — no-op + console.debug (subscriptions are
       live); kept so OO-authored specs don't error.
     - Everything else (`openDialog`, `emit`, `toolCall`, …) — log-and-ignore
       with a visible dev warning. Document the supported subset.
   - Returns `{ ctx: ViewRenderContext, dispatch, loading, errors }`.
3. **`src/pages/ViewPage.tsx`** — `getView(name)` → `useViewHost(spec)` →
   `<ViewRenderer node={spec.root} ctx={ctx}/>` in a `Card`, with loading /
   not-found / invalid-spec states.

### Phase D — renderer growth (only what the demo views need)

Extend `src/views/ViewRenderer.tsx` node coverage from the Entities subset to:
`card`, `stat-group`, `metric`, `badge`, `button` (events.onClick → dispatch),
`divider`/`separator`, `condition`/`case`/`else` (for the "nothing selected"
affordance). The renderer gains a `dispatch` on its context for event nodes;
`onRowActivate` is rewired as the `onRowClick` event dispatched through the
host (keep the old prop working for `Entities.tsx`, or migrate it — small).
Unknown node types render a labeled placeholder (OO's
`UnknownComponentPlaceholder` pattern), not nothing — authors need to see what
didn't render.

### Phase E — acceptance demo (the loop, end to end)

On a seeded staffing deployment:

1. Sidebar shows **Views (2)** → `/views` lists *Worker roster* and
   *Onboarding dashboard* with descriptions.
2. Open *Worker roster*: live table of workers from the bound query.
3. Click a row → selection state updates (expression-driven header).
4. Click **Terminate** → write gate (sign-in if needed) → `runAction` →
   the worker's status badge flips to `terminated` **live** via Convex
   reactivity — no manual refetch. Reactivate flips it back.
5. Open *Onboarding dashboard*: metrics + compliance table render from two
   independent bindings.
6. `pnpm typecheck`, `pnpm test`, `pnpm build` green; app bundle did not
   regress (only `@metacrdt/views/runtime` imported — check the build output).

## Out of scope (explicitly deferred)

- **Workspaces** (`define-workspace` grouping/nav/persona/home view) — the
  Views tab is the flat catalog; workspaces layer on top later.
- **Forma authoring** — views land in the blueprint as already-lowered
  ViewSpec JSON. The `define-view` Lisp → ViewSpec lowering is views.md
  phase 6 and stays separate (the storage + listing built here is its target).
- **View CRUD UI** — no in-app view editor; config-as-code only.
- **`@metacrdt/views-react` extraction** (views.md phase 4) — extract after
  this proves the renderer's real surface area.
- **OO action richness** — preconditions, approvals, computed params. This
  repo's actions are `asserts`-style; `executeAction` maps to `runAction` 1:1.

## Risks / decisions

- **Spec trust**: stored specs are data from the DB rendered into the DOM.
  Renderer must never `dangerouslySetInnerHTML` (skip `raw-html`/`raw-css`
  nodes), and the query allowlist bounds what a spec can read. Actions are
  already server-gated by `requireWritePrincipal`.
- **Server-side validation depth**: light structural gate in `defineView`
  vs full Schema validation. Start light + full validation in tests; if junk
  specs become a problem, measure the cost of `normalizeViewSpec` in the
  Convex bundle before pulling it in.
- **`useQueries` with dynamic binding sets**: bindings are static per spec, so
  hook-order issues don't arise; param changes just change subscription args.
- **Expression evaluation cost**: specs are small; evaluate per render like
  the Entities view already does. No memoization until it shows up in a profile.

## File inventory

| File | Change |
|---|---|
| `convex/views.ts` | new — defineView / listViews / getView |
| `convex/lib/viewDefs.ts` | new — id/load/list helpers |
| `convex/views.test.ts` | new — registry + reconcile + validation tests |
| `convex/appconfig.ts` | add `view` ConfigKind + 2 blueprint views |
| `src/App.tsx` | routes `/views`, `/views/:name` |
| `src/Layout.tsx` | Views nav item + title |
| `src/pages/Views.tsx` | new — catalog page |
| `src/pages/ViewPage.tsx` | new — render page |
| `src/views/host/queryRegistry.ts` | new — queryRef allowlist + row flattening |
| `src/views/host/useViewHost.ts` | new — state + live bindings + dispatch |
| `src/views/ViewRenderer.tsx` | grow node coverage + event dispatch |
| `src/views/entitiesView.ts` | fold `flattenEntityRows` into the registry (or keep; minor) |
| `specs/plans/views.md` | update status table when this lands |
