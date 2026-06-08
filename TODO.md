# TODO

Running worklog for **MetaCRDT** (this repo). Open items up top; dated log below,
newest first. See [PLAN.md](./PLAN.md) for the full backlog and
[docs/metacrdt.md](./docs/metacrdt.md) for what's *built* vs *frontier*.

## Now / up next

**Substrate frontier (cashes the name)** — specified in [SPEC.md](./SPEC.md)
- [x] Commutative supersession — centralized Convex writes now stamp
  event/HLC metadata, and cardinality-one current projection reconciles by the
  `≺` total order (`hlc → actorId → eventId`, SPEC §5.1), not arrival order.
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
- [ ] **Write path on core** — partially shipped: new `factEvents` now carry
  `eventId` + HLC + target/causal metadata, `facts.assertEventId` stores the core
  assert id, `correctFact` writes tombstone+assert protocol events, and
  cardinality-one current projection reconciles by `≺`-max; `rebuildProjections`
  now prefers HLC/eventId ordering while retaining legacy fallback. Remaining:
  continue toward retiring the hand-maintained `facts` projection.
- [ ] Then peel off, as they stabilize: `@metacrdt/schema`, `@metacrdt/query`,
  `@metacrdt/workflow`, `@metacrdt/forms`, `@metacrdt/agent`.
- [x] **`@metacrdt/forma` extracted** from Open Ontology's language packages
  (`language-ts`, selected `language-host` / docs / tests). Forma owns the Lisp
  authoring language; runtime lowering stays out until the IR boundary proves it.
- [x] **`@metacrdt/convex` adapter package extracted** — `packages/convex` owns
  Convex/core event construction, row reconstruction/verification summaries,
  visibility mapping, protocol metadata validators, and the Confect sidecar
  warning. The reference app consumes it from `convex/lib/coreEvent.ts`,
  `convex/lib/visibility.ts`, and `confect/metacrdt.impl.ts`. Component/function
  factories remain deferred until the host-app API boundary is clearer.
- [ ] `@metacrdt/runtime` (the IR + service interfaces) + targets
  `@metacrdt/cloudflare` (DO), `@metacrdt/local` (browser), and the fuller
  `@metacrdt/convex` component surface. Don't factor these until the harness
  boundary is real.

**Current goal — true `applyConfig` reconcile (see [PLAN.md](./PLAN.md#goal-5--true-applyconfig-reconcile))**
- [x] Make `applyConfig` compute stable desired sets for explicitly supplied
  config sections.
- [x] Retract or deactivate previously configured facts/rows dropped from the
  blueprint, without touching runtime data or system/meta facts.
- [x] Add tests proving requirement/action/type-or-attribute removal and repeated
  identical apply idempotence.

**Goal 6 — attribute-level PII read authorization**
- [x] Mark PII at the form-schema layer (`i9/ssn`).
- [x] Derive the read principal server-side from Convex auth identity
  (`tokenIdentifier`), defaulting unauthenticated callers to `anonymous`.
- [x] Express grants as facts on the principal (`grants.read`) and make public
  read projections omit/redact ungranted values with `Denied` markers.
- [x] Protect public Datalog while leaving internal rule/materialization folds
  unfiltered.

**Goal 7 — schema-driven entity UI**
- [x] Extend `typeSchemaAsOf` with UI-ready column definitions reconstructed
  from schema-as-facts.
- [x] Render the Entities table from declared type columns via `queryEntities`.
- [x] Order entity detail state by the primary type's declared schema, then
  append extra runtime facts.
- [ ] Choose the next active goal. Leading candidates: dry-run compliance,
  `@metacrdt/runtime` harness groundwork, or auth/write hardening.

**Product / engine**
- [x] Attribute-level PII authorization — read grants; query layer omits
  ungranted attrs (the i9 SSN) and reports `Denied`.
- [ ] Dry-run compliance — read-only "for a hypothetical worker + scope, what's
  required and would it reuse or collect?" No writes; cheapest high-value add.
- [x] Schema-driven forms / list views — render columns + collection fields from a
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

### 2026-06-07 — schema-driven entity UI
- [x] **Goal 7 shipped:** `attributes.typeSchemaAsOf` now returns UI-ready
  `columns` with attribute definitions reconstructed from schema-as-facts while
  preserving the existing `attributes` compatibility list.
- [x] **Entities list from declared schema:** the Entities route uses
  `typeSchemaAsOf(...).columns` for table columns and `queryEntities` for rows,
  so configured type shape drives the browser rather than ad-hoc current-fact
  discovery.
- [x] **Detail ordering from schema:** entity detail renders state in primary
  type schema order, then appends extra runtime facts. Collection forms remain
  form-definition driven, and PII `Denied` markers continue to render.
- [x] Tests cover column definitions and configured Placement row attributes.

### 2026-06-07 — attribute-level PII read authorization
- [x] **Goal 6 shipped:** form definitions can mark fields `pii` / `sensitive`,
  and the staffing blueprint marks `i9/ssn` as PII. `convex/lib/readAuth.ts`
  centralizes principal derivation, sensitive-attribute detection, grant matching,
  and attribute-map redaction.
- [x] **Facts-native grants:** grants are ordinary current facts on the principal:
  `(principal, "grants.read", { e, a })`, with wildcard support. Public read
  functions derive the principal from `ctx.auth.getUserIdentity().tokenIdentifier`
  (or `anonymous`) and never accept a caller-provided user id.
- [x] **Projection enforcement:** `getEntity`, `queryFacts`, `entityAsOf`,
  `compareFacts`, `entityFactsAsOf`, `history`, `entityTimeline`,
  `entityDetail`, `queryEntities`, and public Datalog/aggregate queries now omit
  or redact ungranted PII. Internal rule/materialization folds opt out via the
  Datalog engine's explicit `enforceReadAuth` option.
- [x] **UX + tests:** entity detail and transaction-log pages render `Denied`
  markers. `convex/readAuth.test.ts` proves unauthenticated and ungranted reads
  cannot see `i9/ssn`, while a granted authenticated principal can read it through
  entity reads, as-of reads, `queryFacts`, and Datalog.

### 2026-06-07 — true `applyConfig` reconcile
- [x] **Goal 5 shipped:** `applyConfig` now reconciles configured artifacts
  instead of only upserting them. It tracks ownership on `config:default`
  (`owns.attribute`, `owns.entityType`, `owns.form`, `owns.flow`,
  `owns.requirement`, `owns.action`) and computes desired sets for explicitly
  supplied config sections.
- [x] **Safe cleanup semantics:** dropped owned `attr:*`, `type:*`, `form:*`, and
  `action:*` carriers are retracted through a new `actorId: "config"` transaction;
  dropped requirements disable `require.*` / `task.*` rules and delete stale
  derived facts; dropped flows delete the owned `flowDefs` row. Omitted config
  sections are overlays and do not reconcile to empty.
- [x] **Regression coverage:** tests prove removing the forklift requirement
  removes the obligation, removing `terminate` removes only that action while
  preserving forms, and removing the configured `Venue` type / `venue` attribute
  does not delete runtime `venue:stadium7` data.

### 2026-06-07 — @metacrdt/forma extraction
- [x] **Goal 4 shipped:** `packages/forma` now publishes `@metacrdt/forma`, the
  runtime-neutral Lisp / S-expression authoring language extracted from the
  pinned Open Ontology language implementation. It owns reader/source/session,
  formatter, evaluator, expander, VM, builtins, HM type inference, forms,
  descriptors, artifacts, and language-owned elaboration/codegen utilities.
- [x] **Boundary documented:** `packages/forma/README.md` states what Forma owns
  and explicitly excludes Convex bindings, protocol event storage, Datalog/runtime
  execution, platform targets, and product UI. Onlang is documented as a legacy
  alias; new code imports `@metacrdt/forma`.
- [x] **Fixture coverage:** selected Open Ontology Lisp fixtures were copied into
  package-local tests and now parse/evaluate/typecheck under the new package. The
  extraction test also enforces no `.context/open-ontology` or `@open-ontology/*`
  imports in `packages/forma/src`.
- [x] Verification: `npm run test:forma` (9 tests) and package typecheck pass;
  full repo gates are recorded in the commit that shipped this slice. Current
  goal moves to true `applyConfig` reconcile.

### 2026-06-07 — @metacrdt/convex adapter package extraction
- [x] **Goal 3 shipped adapter-first:** `packages/convex` now publishes
  `@metacrdt/convex` with package-owned Convex/core event adapters, HLC fallback,
  `eventPatch`, protocol row reconstruction/summarization, bitemporal visibility
  mapping, protocol metadata validators, and a Confect sidecar warning/helper.
- [x] **Reference app consumes the package:** `convex/lib/coreEvent.ts` delegates
  event construction/patching to `@metacrdt/convex`; `convex/lib/visibility.ts`
  delegates projected-row visibility to the package; `confect/metacrdt.impl.ts`
  uses the package event-summary helper instead of duplicating reconstruction.
- [x] Verification: `npm run test:convex-package` (9 tests), `npm run test:core`
  (46 tests), `npm test` (72 tests), package/Convex/app typechecks, and
  `npx convex dev --once` all pass. Goal 4 (`@metacrdt/forma`) is now current in
  `PLAN.md`.

### 2026-06-07 — PLAN.md becomes the executable goal file
- [x] **Goal 2 Confect spike shipped:** `confect/` now defines a Confect v8
  sidecar group over real MetaCRDT `factEvents`; `metacrdt.verifyEvents` uses
  Effect Schema args/returns, typed `UnknownEntity` / `InvalidProtocolEvent`
  errors, generated `DatabaseReader`, and `@metacrdt/core.verifyId`.
  `convex/metacrdtConfect.ts` manually mounts the generated registered function
  beside the existing plain Convex backend. Verification: `npm run
  confect:codegen`, `npm run test:core`, `npm run test:confect`, `npm test` (72
  Convex tests), both typechecks, `npx convex dev --once`, and a live
  `metacrdtConfect:verifyEvents` call returning `validEventId: true`.
- [x] **Confect decision:** adopt narrowly for `@metacrdt/convex` internals /
  typed boundary experiments, not as a wholesale reference-app migration. Raw
  Confect codegen rewrites/removes files in the configured Convex functions
  directory, so this repo uses `scripts/confect-codegen-sidecar.mjs` to generate
  `confect/_generated/*` safely against a throwaway target.
- [x] **Expanded Goal 2 into an executable Confect spike plan** after finishing
  the protocol write-path work: current Confect v8 API baseline, sidecar-not-
  migration scope, exact dependencies, generated file layout, typed-error
  requirements, test/deploy gates, and adopt/defer/reject decision criteria.
  `docs/confect.md` now names the current v8 surface before the older conceptual
  sketch.
- [x] **Goal 1 implementation slice shipped:** additive protocol metadata on
  `factEvents` (`eventId`, HLC, replica, target, causal refs), `facts.assertEventId`
  for lifecycle targeting, local Convex/core adapter (`convex/lib/coreEvent.ts`),
  new writes sealed/verified through `@metacrdt/core`, `correctFact` now emits
  tombstone+assert protocol events instead of new `correction` rows, and
  cardinality-one current projection chooses the `≺`-max candidate. Verified with
  70 Convex tests + 46 core tests + both typechecks; functions pushed to
  `chatty-hare-94`.
- [x] Added explicit legacy fallback coverage: a fact with `assertEventId`
  removed still reconciles safely through the compatibility target path during a
  later cardinality-one assertion.
- [x] `rebuildProjections` now prefers protocol order (`hlc` then `eventId`) for
  core-shaped rows and falls back to legacy `txTime` / `_creationTime` ordering.
- [x] Rewrote `PLAN.md` from the old triple-store milestone backlog into a
  goal-oriented MetaCRDT execution plan: Goal 1 is core-shaped Convex writes
  (`eventId`/HLC/replica metadata, `≺`-max cardinality-one supersession,
  rebuild-from-log tests); Goal 2 is a scoped Confect spike after the protocol
  semantics are correct; later goals cover `@metacrdt/convex` and
  `@metacrdt/forma`.
- [x] Tightened `PLAN.md` from review feedback: `correction` is now explicitly an
  operation that expands to tombstone+assert protocol events; centralized Convex
  `≺` behavior is framed as a test-proven convergence property, not a visible UX
  change; global sequence counters are deferred to real replicas to avoid
  write-contention; legacy event metadata policy is explicit (tolerant adapter
  first, optional backfill later).

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
