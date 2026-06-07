# TODO

Running worklog for **MetaCRDT** (this repo). Open items up top; dated log below,
newest first. See [PLAN.md](./PLAN.md) for the full backlog and
[docs/metacrdt.md](./docs/metacrdt.md) for what's *built* vs *frontier*.

## Now / up next

**Substrate frontier (cashes the name)** — specified in [SPEC.md](./SPEC.md)
- [ ] Commutative supersession — implement the `≺` total order
  (`hlc → actorId → eventId`, SPEC §5.1) so cardinality-one resolves by it, not
  arrival order (SPEC §5.2). Small; makes "the log is a CRDT" structurally true.
- [ ] HLC `(l, r)` + per-replica `seq` + version-vector anti-entropy sync
  (SPEC §3.2, §8) — the multi-replica convergence runtime: offline / p2p /
  Durable-Object-per-group (see [foldkit.md](./docs/foldkit.md),
  [alchemy.md](./docs/alchemy.md)).

**Packaging / monorepo (map, not migration — see [docs/architecture.md](./docs/architecture.md))**
- [x] **`@metacrdt/core` extracted** — `packages/core`, pure & dependency-free
  (sha256, base32, canonical encoding, HLC, Event + content addressing, the `≺`
  order, G-Set log/merge, the bitemporal fold; SPEC §4–5). 46 tests: CRDT laws,
  fold determinism, ≺-max supersession, visibility quadrants. No I/O, no
  `Date.now()`/`Math.random()` (HLC takes wallclock as a param).
- [x] **Open Ontology fold proposal** — `docs/package-consolidation.md` maps the
  submodule package graph into the canonical `@metacrdt/*` monorepo:
  `@metacrdt/forma` (Lisp), `schema/query/workflow/forms/views/agent`, runtime
  harness, and target packages. It explicitly rejects early `triplestore` /
  `database` package names in favor of core + query + targets.
- [x] **Read path on `@metacrdt/core`** — `lib/visibility.ts` is now a thin
  adapter that folds each `facts` row through core's `visible` (SPEC §5.3); every
  read query + `rebuildProjections` uses it. Confirmed Convex's esbuild bundles
  the workspace `.ts` directly (no dist build needed). All 66 convex + 46 core
  tests green; verified live.
- [ ] **Write path on core** — stamp `eventId` + `hlc` onto `factEvents`, and
  switch cardinality-one supersession from arrival-order to `≺`-max (the
  commutative rule, SPEC §5.2). Then fold raw `factEvents` through core directly
  (toward retiring the hand-maintained `facts` projection).
- [ ] Then peel off, as they stabilize: `@metacrdt/schema`, `@metacrdt/query`,
  `@metacrdt/workflow`, `@metacrdt/forms`, `@metacrdt/agent`.
- [ ] **Extract `@metacrdt/forma`** from Open Ontology's language packages
  (`language-ts`, selected `language-host` / docs / tests). Forma owns the Lisp
  authoring language; runtime lowering stays out until the IR boundary proves it.
- [ ] `@metacrdt/runtime` (the IR + service interfaces) + targets `@metacrdt/convex`
  (today), `@metacrdt/cloudflare` (DO), `@metacrdt/local` (browser). Don't factor
  these until the harness boundary is real.

**Product / engine**
- [ ] `applyConfig` true reconcile — retract config facts dropped from the blueprint
  (today it's idempotent-by-upsert, never removes).
- [ ] Attribute-level PII authorization — read grants; query layer omits ungranted
  attrs (the i9 SSN) and reports `Denied`. The deferred pillar.
- [ ] Dry-run compliance — read-only "for a hypothetical worker + scope, what's
  required and would it reuse or collect?" No writes; cheapest high-value add.
- [ ] Schema-driven forms / list views — render columns + collection fields from a
  type's declared attributes (`typeSchemaAsOf`), not ad-hoc.
- [ ] Auth + write authorization — the live site takes public writes; the collect
  token is demo-grade (no single-use / expiry).

**Docs**
- [ ] `docs/physics.md` — the capstone: compliance / small-group coordination &
  co-signing / agent swarms as three blueprints over one substrate.

**Polish / loose threads**
- [ ] Wire the decorative bits from the mockup: ⌘K search, "New entity",
  "Describe an account".
- [ ] Arg-taking action steps (today `runAction` asserts a fixed set); config
  diff/history UI (every `applyConfig` is already a transaction).
- [ ] Root-cause the `staticHosting:getCurrentDeployment` error over the WS path
  (works over HTTP; currently isolated behind an error boundary).

## Notes / gotchas

- **Deploy:** `npx convex codegen` generates types but does **not** fully push
  functions — use `npx convex dev --once`. Static: `npx @convex-dev/static-hosting
  upload` (defaults to **dev**); the `deploy` subcommand forces prod.
- Live dev deployment: `chatty-hare-94` (project `triple-store`).

---

## Log

### 2026-06-06 — wire the read path through @metacrdt/core
- [x] **Planned the Open Ontology → MetaCRDT fold** in
  `docs/package-consolidation.md`: this repo is canonical; Open Ontology remains a
  pinned context submodule; the Lisp layer becomes `@metacrdt/forma`; ViewSpec
  becomes `@metacrdt/views`; database/triplestore concepts split into
  `@metacrdt/core` + `@metacrdt/query` + target packages; migration is extraction
  by package boundary, not bulk copy.
- [x] **`convex/lib/visibility.ts` now delegates to `@metacrdt/core`** — the
  bitemporal visibility predicate has one definition (core, SPEC §5.3); the Convex
  adapter maps a folded `facts` row → core events (assert + optional retract/
  tombstone) and asks `core.visible`. All read queries (`entityFactsAsOf`,
  `entityAsOf`, `queryFacts`, `compareFacts`) and `rebuildProjections` inherit it,
  no call-site changes, behavior preserved.
- [x] **Step 0 retired the bundler unknown** — Convex's esbuild bundles the
  workspace package's `.ts` source directly; no `dist` build required.
- [x] 66 convex + 46 core tests green; convex typecheck clean; verified live on
  `chatty-hare-94` (the time-travel as-of read renders through the core fold).

### 2026-06-06 — the first package: @metacrdt/core
- [x] **Extracted `@metacrdt/core`** (`packages/core`) — the pure, dependency-free
  convergence kernel implementing SPEC §4–5: zero-dep `sha256` (NIST-vector
  tested) + `base32` for content-addressed `EventId`s, canonical value encoding
  (§A.1, with a pure `utf8` so the package pulls in no DOM/ambient globals), the
  HLC (`tick`/`receive` take wallclock as a param — no `Date.now`), the immutable
  `Event` + builders, the `≺` total order (§5.1), the G-Set `Log` + union `merge`
  (§4.3), and the deterministic bitemporal `fold`/`visible` (§5.3–5.4).
- [x] 46 tests: SHA-256 vectors; canonical key-order independence + type
  distinction; `eventId` content-addressing (seq/sig excluded); merge
  commutativity/associativity/idempotence; `≺` totality; **fold determinism under
  shuffled insertion order** (convergence) and **cardinality-one supersession =
  `≺`-max regardless of order**; full visibility quadrants + retract/tombstone/
  untombstone + flags.
- [x] npm workspaces (`packages/*`); root vitest scoped to `convex/**` so the pure
  package runs under its own (node) config. Root convex suite still 66/66.

### 2026-06-05 — naming, docs, and the SaaS/Tailwind rebuild
- [x] **Consolidated under the MetaCRDT umbrella.** `docs/architecture.md` (the
  layer/package map: features × IR × targets; where Open/Alpha Ontology, Onlang,
  Schematics, Onboarded all land) + `docs/manifesto.md` (the founding statement).
  VISION opens with a naming note; `@metacrdt/core`-first extraction plan tracked.
- [x] **`SPEC.md` — the MetaCRDT protocol spec** (normative, v0.1): events,
  content addressing, G-Set merge, the `≺` total order, the deterministic
  bitemporal fold + visibility predicate, derivation, HLC + version-vector sync,
  and the coordination profiles (capabilities / membership / quorum / read authz).
- [x] **Named the substrate MetaCRDT.** Whitepaper `docs/metacrdt.md` (log as a
  G-set CRDT, deterministic-fold projections, bitemporal+provenance as the
  meta-layer; frontier named honestly). Live rebrand: sidebar, Overview
  research-preview hero, datarooms framing; README now indexes the doc set.
- [x] Design docs: `confect.md` (the backend as Effect via Confect), `foldkit.md`
  (the client as a projection — serializable app → serializable organization),
  `alchemy.md` (infrastructure as the same Effect program; Cloudflare/Durable
  Objects as app-level actors).
- [x] `VISION.md` — the substrate → engine → emergent-product thesis + 12 pillars.
- [x] **Frontend rebuilt** on Tailwind v4 (`@tailwindcss/vite`) + React Router v7:
  dark grouped-sidebar shell, routed pages, an Overview dashboard
  (`overview.summary` / `recentActivity`), restyled to the design mockup.
- [x] **SaaS reframe:** origin facet (system / configured / data), the entity
  detail page (contextual flows + actions), the actions registry, config-as-code
  (`applyConfig` + staffing blueprint), and the system-processes read model.
- [x] Flows: `listFlows` / `listFlowDefs` + a reusable entity picker.
- [x] Phase 2 — the general Flow **DAG** interpreter + onboarding demo
  (collect → branch → action → notify → done).
- [x] External collection: field-defining forms + an isolated magic-link
  `/collect` page + save-and-continue.

### 2026-06-04 — compliance, flows, provenance, schema-as-facts
- [x] Durable **collect-step Flow runner** (issue → park → resume on submission
  fact / scheduler tick) + Flows demo UI.
- [x] **Compliance engine slice** (first vision slice): obligations-as-facts,
  reuse-as-scope-key, tasks via negation (`requirement ∧ ¬submitted`) with
  provenance, guarded requirements, valid-time expiry via cron.
- [x] Assessed the vision against the Convex build; rebased substrate assumptions
  (SQL/Effect/event-bus → Convex validators/indexes/scheduler) — the reframes/cuts
  in PLAN.md.
- [x] Datalog **aggregation** (count/sum/avg/min/max + group-by) and a two-axis
  **time-travel** + provenance UI.
- [x] **Provenance:** derived facts trace back to the source facts (and asserting
  transaction) that justify them; `explainDerived` + "why?" UI.
- [x] `rebuildProjections` — fold the log to regenerate facts/currentFacts/derived,
  with a replay property test; relabel facts/currentFacts/derived as projections.
- [x] **Schema-as-facts** (meta-circular): attribute/type definitions are
  bitemporal triples; the `attributes` table is gone.
- [x] Running feature backlog added to PLAN.md.

### 2026-06-03 — substrate, Datalog, hosting
- [x] Semi-naive **incremental transitive closure** + an entities browser with a
  dynamic query builder compiled to Datalog.
- [x] Richer **Datalog**: comparison predicates, negation, derived-fact querying,
  transitive closure.
- [x] `@convex-dev/static-hosting` + the demo Triple Store Explorer UI (live on
  `chatty-hare-94`).
- [x] Tests (convex-test + vitest), attribute schema, incremental recompute, M6
  bitemporal queries (`entityAsOf` / `compareFacts`).
- [x] Scaffold the Convex project + the bitemporal triple-store MVP (append-only
  `factEvents`, `facts`/`currentFacts` projections, assert/retract/tombstone/correct).
- [x] Initial README + PLAN for the bitemporal triple store.
