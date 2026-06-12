# Workato — elaborating the integration boundary into an iPaaS

> `💭` Exploration, not a decision — see [`README.md`](./README.md). An Axis 2
> move in [`phase-space.md`](./phase-space.md): same ontology, new elaboration
> target. Companion to [`../vision/integrations.md`](../vision/integrations.md)
> (integrations as bounded fact contexts with inbound/outbound Flows),
> [`../vision/forma.md`](../vision/forma.md) (the layering), and
> [`shadow-rooms.md`](./shadow-rooms.md) (the parallel-elaboration pattern this
> reuses). [Workato](https://www.workato.com) is the running target; §6 argues
> the same IR reaches n8n/Tray/Zapier, which is the point.

---

## 0. Why an iPaaS is an elaboration target at all

`integrations.md` §1 reduces every integration to one shape: a bounded fact
context plus **Flows** — inbound Flows that assert facts from the outside
world, outbound Flows that react to fact changes and push out. The substrate
owns the hard parts (schema, ownership, consent, idempotency, provenance,
bitemporal history). What a Flow still needs is a **transport**: auth against
Bullhorn, pagination against ADP, webhook plumbing against Checkr — per
external system, forever.

That transport layer is exactly what an iPaaS sells. Workato has ~1,200
prebuilt connectors, managed auth, retry/replay, and a recipe engine. The
build-vs-buy question for the *transport tier* (never the ontology tier) is
real, and the elaboration framing dissolves the usual objection to iPaaS —
"the mapping logic drifts into a GUI nobody reviews" — because here **the
recipe is a build output of the same Forma document that defines the
integration's schema and grants**. Nothing is authored in Workato; Workato
executes what the ontology elaborates.

```
                forma: define-integration bullhorn …
                            │ elaborate
        ┌───────────────────┼──────────────────────────┐
        ▼ substrate side    ▼ workato side             ▼ docs side (§2.3 of phase-space)
  schema manifest +     custom connector (Ruby SDK)   DPA appendix rows for
  owned namespace +     + generated recipes (JSON)    the data this transport
  grant for the         + RLM push via workato CLI    moves
  connector's token
```

The slogan: **the iPaaS is a dumb pipe; the ontology is the contract.**

---

## 1. The mapping

| Forma / substrate concept | Workato artifact |
| --- | --- |
| `define-entity` in an integration namespace (`bullhorn/placement`) | `object_definitions` entry in the custom connector |
| `define-action` (`assert`/`retract`/contract methods) | connector `actions` |
| tx-feed trigger pattern (the Flow trigger) | connector `triggers` (webhook on the substrate's outbound feed; polling fallback) |
| enum attribute | `pick_lists` |
| `define-grant` for the integration | the connection itself: a token **minted from the grant**, scoped to the owned namespace + role-bound shared entities |
| the map step of a Flow (`integrations.md` §1) | the generated recipe's field mapping |
| upstream / inline / downstream topology | recipe shape: which side holds the trigger and which the action |
| provenance | every assert carries `source: workato/<recipe>` transaction meta |

Two things deliberately have **no** Workato representation: constraints/rules
(coherence is derived in the substrate, never re-implemented in recipe
conditionals) and idempotency/external-id mapping (the connector's `assert`
action is an upsert-by-external-id against the substrate; Workato lookup
tables are not a second source of truth).

---

## 2. The Forma surface

The integration form names its topology and *chooses its transport*. The same
form with `(:transport flow)` elaborates to a native Flow on the shared engine
(`integrations.md` §1); with `(:transport workato …)` it elaborates to a recipe.
Transport is a per-integration target choice — the parallel-elaboration claim
again, one level down.

```lisp
(define-integration bullhorn
  (:topology  upstream)
  (:transport (workato (:connector "bullhorn")))   ; their prebuilt connector
  (:owns
    (define-entity bullhorn/placement
      (:field [bullhorn/placement/externalId String {:unique true}])
      (:field [bullhorn/placement/startDate  Date])
      (:ref   [bullhorn/placement/principal {:role compliance/principal}])))
  (:inbound
    (:on   (workato-trigger "New/updated placement"))
    (:map  ((bullhorn/placement/externalId ← (field "id"))
            (bullhorn/placement/startDate  ← (field "dateBegin" (coerce epoch-ms Date)))))
    (:then (assert! bullhorn/placement (:idempotent-by externalId)))))

(define-integration adp
  (:topology  downstream)
  (:transport (workato (:connector "adp_workforce_now")))
  (:outbound
    (:on   [?t type Task] [?t task/kind onboarding] [?t task/status completed])
    (:map  ((associateOID ← (resolve worker/adp-id ?t))
            (hireDate     ← worker/start-date)))
    (:then (workato-action "Add worker" (:record-delivery-fact true)))))
```

`(:owns …)` lowers to the schema manifest of `integrations.md` §3 unchanged —
the reconciler, the namespace guard, and the ownership tier are all
substrate-side and transport-agnostic. Only `:inbound`/`:outbound` lower to
Workato artifacts.

---

## 3. What the elaborator emits

### 3.1 One generic connector, dynamic schema (recommended)

Workato's SDK allows `object_definitions` whose `fields` are fetched at design
time. Since the substrate stores **schema as facts**, the connector doesn't
need per-deployment codegen — one generated-once connector introspects the
deployment it's connected to:

```ruby
# generated: connector/operational_algebra.rb (Workato Connector SDK)
{
  title: "Operational Algebra",
  connection: {
    fields: [{ name: "deployment_url" }, { name: "grant_token" }],
    authorization: { type: "api_key" }   # token minted from a define-grant
  },
  object_definitions: {
    fact_entity: {
      fields: lambda do |connection, config|
        # schema-as-facts endpoint; respects the grant's namespace + roles
        get("#{connection['deployment_url']}/api/schema/#{config['entity_type']}")
      end
    }
  },
  actions: {
    assert_facts:   { ... },  # upsert-by-external-id; provenance meta attached
    retract_facts:  { ... },
    query_facts:    { ... }   # read side, grant-scoped
  },
  triggers: {
    fact_changed:   { ... }   # webhook on the outbound tx-feed subscription
  }
}
```

Customer-defined types appear in Workato's recipe editor without regenerating
anything, because the editor's schema *is* a query over schema-as-facts. The
grant token makes typed authority reach into the iPaaS: a Workato workspace
can only see and do what its `define-grant` elaborates to.

### 3.2 Per-integration recipes (generated, vendored, drift-tested)

Each `:inbound`/`:outbound` clause emits a recipe (Workato recipes are
exportable JSON, managed via the lifecycle/Embedded API; the `workato` CLI
pushes connector + package). Same emission discipline as the views Schema and
`shadow-rooms.md` §6:

```
define-integration ──▶ Integration IR (Effect Schema; topology, maps, triggers)
                              │
              ┌───────────────┼──────────────────┐
              ▼               ▼                  ▼
     schema manifest    recipe-bullhorn.json   connection/grant
     (substrate)        recipe-adp.json        provisioning step
                              │                  (alchemy.md seam)
                        vendored in-repo; CI diffs against the
                        deployed recipe via the lifecycle API —
                        hand-edits in the Workato UI fail the drift test
```

The drift test is the cultural load-bearing piece: it converts "someone fixed
a mapping in the Workato GUI at 2am" from silent divergence into a failing
build that says *promote this change into the Forma source*.

---

## 4. The three topologies, elaborated

Mirroring `integrations.md` §1 exactly — only the transport column changes:

```
UPSTREAM    Bullhorn connector trigger ─▶ generated map ─▶ OA assert_facts
            (their webhook/poll)           (recipe)         (upsert by externalId,
                                                             provenance: workato/<recipe>)

INLINE      OA fact_changed trigger ─▶ E-Verify connector action
            (tx-feed webhook)             │ (their webhook back)
            OA assert_facts ◀── generated map ◀── E-Verify trigger

DOWNSTREAM  OA fact_changed trigger ─▶ generated map ─▶ ADP connector action
            ("task completed" pattern)                    └─▶ OA assert_facts (delivery fact)
```

The delivery fact on downstream pushes keeps audit/idempotency in the
substrate even though the push ran on Workato — replaying the recipe is safe
because the delivery fact is the dedup key, not Workato's job history.

---

## 5. What this buys, concretely

- **The connector catalog without the drift.** `integrations.md` I3 greenfields
  upstream (ATS) and downstream (HRIS); each one via native Flows means
  hand-building auth/pagination/webhooks per vendor. Via Workato it means one
  `define-integration` and a generated recipe against their connector.
- **Compliance docs for free.** The Integration IR knows exactly what fields
  move through which third party — the `phase-space.md` §2.3 legal-prose
  elaboration can emit the sub-processor table and DPA appendix rows from it.
- **An exit that's already built.** Because Workato artifacts are *outputs*,
  switching transports is re-elaborating: the same IR can emit n8n workflow
  JSON or a native Flow. Lock-in is confined to the emitter, ~the smallest
  module in the chain. This is the phase-space argument made commercial.

---

## 6. Honest caveats

- **PII through a third party.** Upstream sync moves candidate PII through
  Workato's infrastructure. That's a sub-processor relationship with DPA and
  data-residency consequences — and `integrations.md` §6's erasure problem
  now extends to Workato job logs, which retain payloads. Mask/trim logged
  fields in the generated connector; treat the §2.3 doc emission as mandatory,
  not nice-to-have.
- **The dumb-pipe rule will be under constant pressure.** Recipes support
  conditionals, loops, and lookup tables; every one used is ontology logic
  leaking into the transport. The elaborator should emit recipes from a
  deliberately tiny vocabulary (trigger → map → action) and the drift test
  enforces it stays that way.
- **Recipe JSON is not a stable public contract.** Workato's export format is
  versioned for their lifecycle tooling, not for third-party codegen. The
  emitter needs golden-file tests against a live workspace, and the generic
  connector (3.1) should carry most of the complexity precisely so recipes
  stay trivially simple and format-churn-resistant.
- **Two retry semantics.** Workato retries jobs; the substrate's Flows retry
  reactions. An inline round-trip that spans both needs idempotency at every
  assert (the upsert-by-external-id rule) or replays will double-fire. This is
  the same discipline `integrations.md` §6 already demands — Workato just adds
  a second place to forget it.
- **Polling triggers degrade the reactive story.** Where a vendor connector
  lacks webhooks, Workato polls — fine for upstream mirrors, wrong for inline
  steps a human is waiting on. The elaborator should refuse `(:transport
  workato)` for inline integrations whose trigger would lower to a poll, and
  say why.
- **Workato is the example, not the commitment.** The deliverable of this doc
  is the **Integration IR + emitter seam**; Workato is the first emitter
  because its catalog is largest. If the OEM/pricing math fails, the IR is
  unchanged.
