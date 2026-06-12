# Phase space — every point is an elaboration

> `💭` Exploration, not a decision — see [`README.md`](./README.md). The
> shadow-rooms riff ("a consented, shared activity field for a private group")
> turned out to be expressible as a handful of `define-form`s over the existing
> substrate. This doc asks the next question deliberately: **if forma is one
> authoring surface over one IR with many elaborations, what *else* lives in
> that space?** Companion to [`../vision/forma.md`](../vision/forma.md) (the
> layering), [`shadow-rooms.md`](./shadow-rooms.md) (the domain instance this
> generalizes), [`alchemy.md`](./alchemy.md) (the infra elaboration), and
> [`../vision/typed-authority.md`](../vision/typed-authority.md) (the asset
> several of these ideas lean on).

The space has three orthogonal axes. Every idea below is a point in it:

```text
AXIS 1  domains      — new things to *write* in forma        (what the ontology is about)
AXIS 2  targets      — new things to *elaborate into*        (what the IR lowers to)
AXIS 3  physics      — new laws the IR itself could carry    (semantics no target has yet)
```

Shadow rooms moved along axis 1 (domain: group context) while reusing existing
physics (consent, bitemporality, projection). Alchemy v2 moved along axis 2
(target: infra as Effect). The crazier ideas mostly live on axis 3.

---

## Axis 1 — same physics, new domains

The shadow-room insight generalizes: *any place where reality is fragmented
across apps and a small trusted group needs a shared, consented view of it* is a
room. The physics (events + consent + projection) is constant; only the verbs
and the redaction defaults change.

### 1.1 The room of one — `self`

The degenerate group: one member. Your whole life as a fact substrate —
quantified self, but queryable and bitemporal. Every other room is then a
*consented projection of selves*:

```lisp
(define-form self
  :primitive personal-context
  :law "the self-room is total; every other room sees a consented subset"
  :members (exactly 1)
  :derives (rooms via consent))
```

This reframes the product stack: you don't join rooms, you **lease projections
of your self-room to groups**. Consent becomes a first-class object *between*
two rooms (see §3.4, treaties), not a setting inside one. Architecturally this
is the cleanest framing — shadow rooms fall out as a theorem rather than a
feature.

### 1.2 Care circles

A room around a patient: family + doctors + caregivers. This is the domain
where the consent physics stops being a nice-to-have and becomes the entire
product — redaction rules, scoped verbs, and provenance are literally the
regulatory requirement (HIPAA-shaped). Typed authority already models this:

```lisp
(define-form care-circle
  :extends shadow-room
  :grants
  ((family   (:read health/appointment health/mood) (:deny health/diagnosis))
   (clinical (:read health/*) (:write health/note))
   (patient  (:read *) (:revoke *))) ; revocation is load-bearing here
  :law "the patient's revocation retro-propagates through every projection")
```

The retro-propagating revocation is the hard, valuable part — see §3.1.

### 1.3 Covenants — constraints over people

Rooms so far only *collect*. The next move is rooms that *check coherence of
commitments*. A group agreement is just a `define-constraint` whose subject is
activity events instead of placements:

```lisp
(define-constraint saturday-run
  (:severity nudge)                       ; new severity tier: social, not error
  (:scope    running-room)
  (:when     [?w week] (member ?p running-room))
  (:require  (exists [?a activity]
               [?a verb strava/completed-run] [?a actor ?p] [?a during ?w])))
```

The room becomes an accountability substrate: book clubs, training groups,
standups, sobriety circles, chore rotations. The digest projection turns into
"who's holding the covenant" — derived, never self-reported. Note the new
severity tier: constraint violations in social space produce *nudges*, not
errors. That's a genuinely new point in the constraint design space.

### 1.4 Rooms with lifecycles — trips, projects, seasons

`define-process` already exists for onboarding flows; apply it to rooms
themselves. A trip room is *born* from a calendar event, *accumulates* during
the trip (photos, places, splits), and *crystallizes* into a memory artifact at
checkout:

```lisp
(define-process trip-room
  (:subject Room)
  (:start   anticipation)
  (:step anticipation (:collect calendar/flights bookings) (:next live))
  (:step live         (:collect photos places spends)      (:next crystallize))
  (:step crystallize  (:emit memory-album ledger-settlement) (:next archived)))
```

The crystallize step is the interesting one: a *projection that runs once and
becomes a fact* — the room's output is itself an event in the parent room's
log. Rooms compose by emission.

### 1.5 The hundred-year room

What happens to a family room over decades? Members die; the log outlives them.
Inheritance of a consented activity log is an unsolved, emotionally enormous
domain — the family room as heirloom. Bitemporality is the prerequisite (you
can visit the room *as it was in 2026*), and the consent question ("what did
grandpa consent to being visible after his death?") needs consent objects with
temporal scope beyond the grantor's life. Nobody has built this because nobody
has the substrate; this repo arguably does.

---

## Axis 2 — same ontology, crazier targets

forma.md names three targets (Convex, Cloudflare, Node) — all *databases*. But
nothing about the IR says the elaboration has to produce a place to store
facts. It can produce anything that is *derivable from the ontology*.

### 2.1 Elaborate into an agent harness (`forma → MCP`)

The ontology **is** a world model. Elaborate it into an agent's operating
envelope: entities become a typed memory, actions become MCP tools, grants
become the tool allowlist, constraints become guardrails the agent cannot plan
across:

```lisp
(define-agent room-companion
  (:over    shadow-room)
  (:tools   (from-actions))        ; define-action terminate → a tool
  (:may     (from-grants companion)); typed authority = tool permissions
  (:goals   ((surface-memories weekly) (answer-queries on-demand)))
  (:must-not (violate consent)))   ; not a prompt — a compile-time property
```

The pitch sentence: **"the privacy policy and the agent's tool permissions are
the same compiled artifact."** Today every agent product hand-writes its
permission layer and *prays* it matches the privacy promise. Here both
elaborate from one `define-grant`. This is plausibly the most commercially
sharp idea in this document.

### 2.2 Elaborate into a simulation (`forma → physics engine`)

Rules + entities + processes are sufficient to *run the ontology forward*.
Elaborate into a generative simulation: synthetic actors emit plausible events,
constraints fire, projections render. Uses:

- **Property-based testing of social designs** — run 1,000 synthetic weeks of a
  room before shipping a digest algorithm; assert "no member's events are ever
  visible without a covering consent" as a QuickCheck property over traces.
- **Org design** — the staffing ontology simulated under load: what breaks at
  10× placements?
- **Demo data that is law-abiding by construction** — seeded demos that can't
  accidentally model an impossible state.

The deep idea: an ontology you can only *store* is a schema; an ontology you
can *run* is a physics. The simulation target is the proof that the IR captures
dynamics, not just shape.

### 2.3 Elaborate into legal prose (`forma → compliance`)

Grants, consents, and redaction rules already *are* the privacy policy — in the
wrong language. Elaborate them into the right one:

```text
Ontology IR ──→ privacy-policy.md      (generated, versioned, diffable)
           ──→ consent-receipt.pdf     (per-member, per-source, per-scope)
           ──→ DPA appendix tables     (what data, what purpose, what retention)
```

A diff in `define-grant` produces a diff in the privacy policy — reviewable in
the same PR. Compliance docs stop being a parallel artifact that drifts; they
become a build output. (`../vision/compliance.md` gestures here; this names it
as an elaboration target.)

### 2.4 Elaborate into semantic memory (`forma → embedding space`)

The "what were we obsessed with during covid?" query is not Datalog — it's a
latent-space query. Make the embedding schema *derived from the ontology*: each
entity type declares its embeddable rendering, each room gets a vector index
scoped by the same grants:

```lisp
(define-embedding activity
  (:render  (template "{actor} {verb} {object} at {place}"))
  (:scope   room)                  ; the index inherits room visibility
  (:decay   (half-life 365)))      ; old vectors fade in ranking — see §3.2
```

Crucial detail: the vector index must be *consent-scoped at query time*, or the
embedding layer becomes a consent-bypass side channel. That requirement is
exactly what typed authority is for — another asset-aligned idea.

### 2.5 Elaborate into ambient hardware (`forma → e-ink`)

A projection doesn't have to be an app screen. The family-room digest as an
e-ink frame in the kitchen; the running covenant as a glanceable orb. ViewSpec
(`@metacrdt/views`) is deliberately renderer-agnostic — an e-ink renderer is a
*small* binding, and it's the binding that makes "ambient" literal. The
contextware category claim ("not social media, a context layer") becomes
physically true: the room is on the wall, not in a feed.

### 2.6 Elaborate into a game world (`forma → ECS`)

Entities/attributes map cleanly onto an entity-component-system; rules become
systems; the room becomes a shared multiplayer world state. The least serious
and most generative idea here: a family room rendered as a village where
activity grows the garden. Path/Animal-Crossing energy. The reason it belongs
in this doc: it proves the renderer-agnostic claim at maximum distance from
CRUD.

---

## Axis 3 — new physics (laws the IR could carry that nothing else has)

These are the crazy ones. Each is a *semantic* extension — a new law in the
substrate that every front-end and every target would then inherit.

### 3.1 Retro-propagating revocation

Append-only logs are good at remembering and terrible at *un-sharing*. The law:

> A consent revocation is itself an event, and every projection must be
> re-derivable as if the covered events had never been visible.

This is only possible because projections are *derived* (fold of the log) —
revoke, re-fold, and the digest, the memory index, the embeddings, and the
agent's context all heal. Systems that materialize views destructively can't do
this. It is the single strongest technical answer to "why is this substrate the
right one for human data," and §1.2's care circles are the domain that pays for
it.

### 3.2 Decay — memory with a half-life

Human memory forgets by default and keeps what's rehearsed. Logs do the
opposite. Add decay as a first-class law:

```lisp
(define-decay activity
  (:half-life 90d)                 ; visibility weight, not deletion
  (:rehearse  (on reaction curate pin))  ; curation resets the clock
  (:floor     (curated → permanent)))
```

Events never leave the log (bitemporality survives), but their *weight* in
projections decays unless a human touched them. This single law fixes the
ambient-stream failure mode (infinite noise accumulating forever) and encodes
the product thesis — *capture automatically, react intentionally* — as physics:
reaction is literally what makes a memory permanent.

### 3.3 Counterfactual rooms — git for group reality

The log is immutable; the *rules and projections* are not. So: fork the room,
replay the same events under different rules, diff the projections.

```lisp
(define-fork digest-experiment
  (:of      family-room)
  (:vary    ((digest weekly-summary) → (digest monthly-narrative)))
  (:replay  last-90d)
  (:diff    projections))
```

Mundane use: A/B-testing a digest without touching the live room. Crazy use:
"what would our group's memory look like if we'd had different privacy
settings" — counterfactual introspection over your own shared history. No
social system has ever offered this, and it falls out of fold-replay for free.

### 3.4 Treaties — room-to-room consent

§1.1 reframed consent as an edge between rooms. Generalize: rooms share
projections with other rooms under *treaties* — the federation physics.

```lisp
(define-treaty family↔neighborhood
  (:from family-room) (:to neighborhood-room)
  (:share (projection availability))   ; "the Jacobsons are around this weekend"
  (:never (raw events))                ; treaties export projections, only ever
  (:revocable true))
```

The law — **treaties export projections, never raw events** — is what makes
federation safe-by-construction: the receiving room can't re-derive what the
sending room didn't project. This composes upward (rooms of rooms: synagogue →
neighborhood → city) without any global graph ever existing. It is the
anti-Facebook theorem: maximal sharing, no central observer.

### 3.5 Attention as a conserved quantity

Projections currently compete for attention with no budget. Make attention
conservation a law of the IR:

```lisp
(define-attention ben
  (:budget  (per-day 5))             ; total interrupts across ALL rooms
  (:auction (rooms bid by salience)) ; digest vs covenant-nudge vs memory
  (:overflow (fold-into next-digest)))
```

Every notification system ever built optimizes per-app engagement; none
conserves the human's total budget, because no system sees across the apps.
This substrate *does* — that's its whole premise — so it's the first place the
law is even expressible. (`../vision/notifications.md` is the landing zone.)

### 3.6 Proof-carrying projections

Typed authority, taken to its limit: every datum in every rendered view carries
the consent-derivation that authorized it, checkable at the edge.

> Tap any item in the digest → "you can see this because Ben granted
> spotify/listened to family-room on 2026-03-02, unrevoked as of now."

Authority stops being a gate at the query layer and becomes a *certificate
attached to the data*. This is the trust UI for everything above — care
circles, treaties, agents — and it's a direct extension of the typed-authority
work already merged.

---

## Where the heat is

Ranked by (asset-alignment × novelty), not by craziness:

1. **§2.1 agent harness** — "privacy policy and tool permissions are one
   compiled artifact" is a sentence with commercial teeth, and it elaborates
   from `define-grant`s that already exist in the surface.
2. **§3.1 revocation + §3.6 proof-carrying projections** — the technical moat;
   both are typed-authority extensions and both are *only* possible on a
   derived-projection substrate. Together they are the answer to "why this
   architecture for human data."
3. **§3.2 decay** — small law, fixes the ambient-stream failure mode, encodes
   the product thesis as physics. Probably the best effort-to-insight ratio in
   the doc.
4. **§2.2 simulation** — the proof that the IR captures dynamics; also the
   testing story for everything else here.
5. **§3.4 treaties** — the long-game federation thesis; write it down, build it
   last.

The pattern across all of them: shadow rooms wasn't a product idea, it was the
first *domain* instance of the general claim — **one consented fact substrate,
many elaborations**. Each row above is another instance, and each one makes the
IR more obviously the asset.

A closing observation that probably outlives this doc: a CRDT is one merge
model for one datatype. **This space is what the "meta" in MetaCRDT quantifies
over** — meta over *domains* (one substrate, any ontology), meta over *targets*
(one IR, any elaboration), meta over *laws* (the physics itself is extensible).
The three axes aren't an organizing device for a brainstorm; they are the
prefix, given coordinates. Per [`../vision/branding.md`](../vision/branding.md),
MetaCRDT stays infrastructure vocabulary — but if this claim graduates, it
belongs in `vision/` next to
[`metacrdt-alignment.md`](../vision/metacrdt-alignment.md), not here.
