# n8n — the second emitter (the proof of the seam)

> `💭` Exploration, not a decision — see [`README.md`](./README.md). Companion
> to [`workato.md`](./workato.md), which defines the **Integration IR** and the
> claim this doc exists to test: *the durable artifact is the IR + emitter
> seam, not the vendor choice.* One emitter is an integration; two is an
> architecture. This doc covers only the deltas — the shared machinery
> (`define-integration`, the schema manifest, grant-minted tokens, the
> dumb-pipe rule, drift tests) is specified there and unchanged here.

---

## 0. Why n8n specifically

[n8n](https://n8n.io) is the structural opposite of Workato on the axes that
matter to this substrate:

| | Workato | n8n |
| --- | --- | --- |
| Hosting | their cloud (sub-processor) | **self-hostable** (your VPC) or their cloud |
| Connector catalog | ~1,200, enterprise-deep | ~400s, webhook/HTTP-native |
| Workflow format | recipe JSON, not a public contract | **workflow JSON, documented node graph** |
| Custom integration | Ruby SDK connector | **TypeScript community node** (npm package) |
| License | commercial SaaS | fair-code (Sustainable Use License) |
| Escape hatch culture | formulas/lookup tables | a full **Code node** (JS/Python) |

Two of those rows resolve `workato.md` caveats outright, one makes a caveat
*worse*, and that asymmetry is exactly what makes n8n the right second
emitter: if the IR were quietly shaped around Workato's affordances, emitting
n8n would expose it.

- **Self-hosting dissolves the sub-processor caveat.** PII never leaves your
  network; job-log retention is your retention policy. For care-circle-grade
  domains (`phase-space.md` §1.2) this isn't a preference, it's the
  requirement.
- **Workflow JSON is a real codegen target.** An n8n workflow is a `nodes`
  array plus a `connections` map — a DAG the emitter writes directly and
  pushes over n8n's REST API. No golden-file archaeology against an
  undocumented export format.
- **The Code node is maximal dumb-pipe pressure.** Workato tempts with
  recipe conditionals; n8n hands you a full JavaScript runtime inside the
  pipe. The emitter's rule hardens accordingly: **emitting a Code node is a
  build error.** If a mapping can't be expressed as trigger → map → action,
  that logic belongs in the substrate, full stop.

---

## 1. The mapping deltas

Same IR rows as `workato.md` §1, different right-hand column:

| Integration IR concept | Workato artifact | n8n artifact |
| --- | --- | --- |
| owned entities | connector `object_definitions` | community node `resourceMapper` / `loadOptions` (dynamic fields from schema-as-facts) |
| contract actions (`assert`/`retract`/`query`) | connector `actions` | operations on the generated **Operational Algebra node** |
| tx-feed trigger pattern | connector `triggers` | a plain **Webhook node** pointed at the outbound feed subscription |
| map step | recipe field mapping | a **Set node** with `{{ $json.… }}` expressions |
| grant-minted token | connection | an n8n **credential**, provisioned via the REST API |
| the whole flow | recipe JSON (vendored) | workflow JSON (vendored, drift-tested via the API) |

The generated node is a *declarative-style* community node
(`n8n-nodes-operational-algebra`): description + routing, no programmatic
code — which keeps the node itself inside the dumb-pipe discipline. Its
dynamic-field methods query the same schema-as-facts endpoint as Workato's
`object_definitions` lambda, so customer-defined types appear in the n8n
editor with nothing regenerated. One IR concept, two vendor-native dynamic-
schema mechanisms — the seam holding under load.

---

## 2. The examples — deliberately from the *other* domain

`workato.md` demonstrated the staffing domain (Bullhorn upstream, ADP
downstream). This doc uses the shadow-rooms domain
([`shadow-rooms.md`](./shadow-rooms.md)) — same IR, different domain, different
transport. Domain (Axis 1) and target (Axis 2) crossing without touching is
the `phase-space.md` claim demonstrated rather than asserted.

**Upstream — ambient Spotify ingestion** (n8n has a Spotify node; no
listening webhook exists, so this lowers to a schedule + poll — acceptable
here precisely because `workato.md` §6's rule is about *inline* steps, and
ambient capture is the one topology where polling is honest):

```lisp
(define-integration spotify-ambient
  (:topology  upstream)
  (:transport (n8n (:node "spotify") (:poll (every 30m))))
  (:inbound
    (:on   (n8n-op "Get Recently Played"))
    (:map  ((activity/verb       ← (const listened))
            (activity/object    ← (field "track.id"))
            (activity/occurred-at ← (field "played_at"))))
    (:then (assert! spotify-listen (:idempotent-by (actor occurred-at))))))
```

emits (abbreviated):

```json
{
  "name": "spotify-ambient (generated — do not edit)",
  "nodes": [
    { "type": "n8n-nodes-base.scheduleTrigger", "parameters": { "interval": [{ "field": "minutes", "minutesInterval": 30 }] } },
    { "type": "n8n-nodes-base.spotify",         "parameters": { "resource": "track", "operation": "recentlyPlayed" } },
    { "type": "n8n-nodes-base.set",             "parameters": { "assignments": "… generated from (:map …) …" } },
    { "type": "n8n-nodes-operational-algebra.oa", "parameters": { "operation": "assertFacts", "entityType": "spotify-listen" },
      "credentials": { "oaApi": "room-ingest-grant" } }
  ],
  "connections": { "…": "linear DAG, generated" }
}
```

**Downstream — the weekly digest to the family Slack** (the room projection
leaving the substrate through a treaty-shaped export: a *projection*, never
raw events):

```lisp
(define-integration digest-to-slack
  (:topology  downstream)
  (:transport (n8n (:node "slack")))
  (:outbound
    (:on   [?d type Digest] [?d digest/room family-room] [?d digest/status ready])
    (:map  ((channel ← (const "#family")) (blocks ← (render ?d slack-blocks))))
    (:then (n8n-op "Post Message" (:record-delivery-fact true)))))
```

The trigger lowers to a Webhook node on the tx-feed subscription — n8n's
webhook-native posture means the reactive story stays reactive, no polling.

---

## 3. Self-hosting closes the loop with alchemy

A self-hosted n8n is *infrastructure* — which means the transport tier itself
becomes a resource in the same Effect program as everything else
(`alchemy.md`, `shadow-rooms.md` §4):

```lisp
(define-resource transport (Container "n8nio/n8n")
  (:env (:N8N_ENCRYPTION_KEY (secret n8n-key)))
  (:provision-after backend))

(define-resource transport-workflows (N8n.Workflows)
  (:instance  (ref transport))
  (:source    (elaborated :integrations))   ; the emitted workflow JSON
  (:credentials (from-grants)))             ; grant-minted tokens, provisioned
```

That's the full circle: one Forma document elaborates the ontology, the
projections, the deployment, *and* the integration fabric — and the fabric's
host is itself a `define-resource` whose workflows are a cross-elaboration
reference. With Workato this seam stops at their API; with n8n the entire
chain is in the program.

---

## 4. Choosing an emitter

The IR doesn't choose; the deployment does. The honest decision table:

| Situation | Emitter |
| --- | --- |
| Vendor only in Workato's enterprise catalog (ADP, Workday, NetSuite) | Workato |
| PII/residency forbids a sub-processor; care-circle-grade domains | n8n, self-hosted |
| Inline step a human is waiting on, vendor has no webhook in either | **native Flow** — refuse both, per `workato.md` §6 |
| Ambient/upstream mirror where polling is acceptable | either; cheapest wins |
| The whole stack should be one alchemy program | n8n (the host is a resource) |

---

## 5. Honest caveats (the n8n-specific ones)

- **The license is a real constraint on productization.** n8n's Sustainable
  Use License permits self-hosting for internal business use, but **embedding
  n8n inside a commercial product needs their embed agreement**. Fine for
  "each customer runs their transport tier"; not fine for silently shipping
  n8n inside OA Cloud. Decide which one is being built before this leaves the
  💭 folder.
- **Self-hosting is an ops burden the Workato path doesn't have.** Upgrades,
  scaling the queue mode, credential encryption keys, webhook ingress — §3
  makes it *declarable*, not free.
- **`typeVersion` churn.** Nodes version their parameter schemas; emitted
  workflows pin `typeVersion`s and upgrades can change mapping semantics. The
  drift test must diff against the *running instance's* export, and the
  emitter should pin and bump deliberately, like any lockfile.
- **The smaller catalog bites exactly where Workato shines.** No ADP, no
  Workday-depth connectors; the HTTP Request node covers gaps but each use is
  hand-rolled auth/pagination — the thing the iPaaS was supposed to absorb.
  Catalog coverage is a per-integration input to §4, not a global verdict.
- **Two emitters now share one IR — guard the IR.** The first vendor-specific
  affordance that leaks into the Integration IR (a Workato lookup-table
  concept, an n8n expression string) breaks the seam this doc exists to
  prove. New capabilities enter the IR as *semantics* (e.g. `:poll` as a
  declared degradation) or not at all.
