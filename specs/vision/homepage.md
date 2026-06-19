# Vision — Homepage: open-ontology.com

> Part of the `vision/` set — see [`README.md`](./README.md). Companion to
> [`branding.md`](./branding.md) and [`overview.md`](./overview.md). Status: `💭`
>
> **Branding caveat.** This outline presumes the 2026-06-12 direction:
> **Open Ontology** as umbrella/org/front door, **ontology.run** as the hosted
> service, with Forma / MetaCRDT / Schematics as named open-source instruments
> and Operational Algebra demoted to the theory/paper. That reverses the
> 2026-06-10 decision still recorded in `branding.md`; if that reversal is not
> ratified, this page re-skins to the Operational Algebra front door — the
> structure, sections, and copy mechanics stand either way.

---

## Design principles

1. **Chaos in density and candor — never in information architecture.** The
   page reads like a brilliant person's lab notebook: marginalia, footnotes
   that are real, epistemic-status tags on its own claims, live experiments
   embedded. But every section answers exactly one question, in order.
2. **Demonstrate, don't assert.** The hero is an experiment running, the
   badges are conformance proofs, the uncertainty is published. Nothing on
   the page is a mockup, and the page says so.
3. **Two audiences, solved typographically.** Every load-bearing claim is a
   pair: a *for humans* line and a *for engineers* line, side by side. A
   non-technical reader gets a complete story reading only the left lines.
   No compromise voice.
4. **Status tags everywhere.** The repo's own legend —
   `✅ proven · 🚧 building · 📐 designed · 💭 conjecture` — appears in the
   header like a lab safety card and is applied to the page's own claims.

**Global furniture:** monospace-heavy, dense two-column with margin notes.
The top bar is a *proof ticker*, not a nav:
`kernel laws ✅ forma-zero, 2 engines · merge=∪ ✅ SEC · 7→3 reduction ✅ every build`.

---

## 0 · Hero — the experiment, not the pitch

- **Headline:** *Most business software is the same five ideas wearing costumes.*
- **Sub:** *Things. Facts about things over time. Rules that derive new facts.
  Processes that wait for the world to change. Obligations that fall out of
  all three. We built the five — once, correctly, on a log that cannot
  forget — so products stop being applications you write and become
  declarations you make.*
- **The artifact:** the two-replica branch-and-merge demo embedded live, full
  width (see dependency list below). Caption: *"Experiment №1, running now in
  your tab: two databases, no server, disagreeing while offline and
  reconciling on contact. The CONVERGED light is recomputed from the actual
  logs — view source."*
- **Margin note:** *"Nothing on this page is a mockup."*
- **CTAs:** `npm install @open-ontology/…` · *Run yours →* **ontology.run** ·
  *Argue with us →* **Discord**

## 1 · First principles — the kernel

Two literal columns, labeled **for humans** / **for engineers**:

- **For humans:** *Underneath every CRM, HR tool, and compliance system, the
  same three things happen: someone writes a fact down, someone works out
  what it means, and someone reacts. That's the entire machine. Everything
  else is costume.*
- **For engineers:** *Two verbs and a closure rule. `assert` appends an
  immutable, bitemporal, content-addressed fact. `fold` derives state
  deterministically from facts. A reaction is a fold whose output is new
  assertions. Two laws: **convergence** (logs form a join-semilattice; merge
  is set union; same events ⇒ same state) and **conservation** (no fact is
  destroyed — only superseded at a coordinate; history is queryable forever).*
- Below: the seven-primitive table (entities · relations · queries ·
  mutations · processes · constraints · views) with the load-bearing
  footnote: *"All seven reduce to the kernel. The reduction is not a slogan —
  it is a conformance suite, executed on two independent engines (TypeScript
  and OCaml/Hindley–Milner) on every commit."* `✅`
  (Fixes the "nine primitives over a seven-row table" copy bug from
  `branding.md` — count the table.)

## 2 · The Loop — what it feels like when it's on

ASCII diagram, animated cursor crawling around it:

```
facts change → constraints evaluate → violations surface →
processes trigger → actions execute → new facts asserted → views update → ⟲
```

- **For humans:** *Describe your business in ordinary documents — prose for
  people, short formal definitions for the machine. Then the model stays
  alive: when reality changes, rules fire, tasks appear, screens update, and
  every consequence carries its own "why."*
- **For engineers:** *The runtime never stops evaluating the model. Derived
  facts are queryable like base facts and carry provenance. "Why is this task
  open?" is answered by the data, not the logs.*

## 3 · The instruments — four sub-projects as lab equipment

Header: *"The apparatus. Three of these are open source. One pays for the
electricity."* Four dense cards, each: eng one-liner / human one-liner /
status / license / link.

### Forma — the notation `open source`

- *Engineers:* A homoiconic Lisp that elaborates into the ontology IR. One
  dialect, three engines — dynamic TS, HM-typed OCaml, and (`💭`) the TS type
  system itself — kept honest by a shared conformance suite. Lives inside
  markdown: prose explains the policy, the fenced block *is* the policy.
- *Humans:* The handwriting. Small formal sentences inside documents you'd
  write anyway. Literate ontologies: the memo and the system are the same
  file.

### MetaCRDT — the substrate `open source + protocol spec`

- *Engineers:* Append-only bitemporal fact log. Content-addressed events,
  hybrid logical clocks, deterministic total order; state is a pure fold;
  merge is set union; strong eventual consistency. Normative spec with
  conformance levels L1–L5 and a test harness — build your own runtime and
  prove it conforms.
- *Humans:* The memory. It never forgets, never lies about what was known
  when, and two copies that have seen the same facts always agree — that's a
  theorem up there running in your browser, not a feature.
- **Margin note — one protocol, four replicas:** *the replica you trust
  (Convex: one authoritative sequencer, transactional + reactive) · the
  replica near your users (Cloudflare: a Durable Object per room, the
  L5 quorum world) · the replica you own (Node + SQLite/Postgres: on-prem,
  CLI, CI) · the replica in your pocket (browser + IndexedDB, p2p sync — the
  hero demo). Same pure fold everywhere; targets differ only in who
  sequences, where facts persist, and how events travel.* (Source of truth:
  [`targets.md`](../reference/targets.md), [`physics.md`](../reference/physics.md).)

### Schematics — the workbench `open source`

- *Engineers:* Files route to schemas; every edit — human or AI agent —
  passes through the same typed, validated surface with source-mapped
  diagnostics down to the Lisp form inside the markdown. Then Terraform's
  loop aimed at ontologies: `pull → plan → apply → drift`. Deployment is a
  fact transaction, so deploys inherit audit and time travel.
- *Humans:* The workshop. You and your AI propose changes in the same
  documents, see exactly what would change before anything changes, and
  apply with a paper trail by construction.

### Ontology.run — the reactor `hosted · how the lab is funded`

- *Engineers:* The hosted runtime. Deploy a versioned ontology; get reactive
  queries, durable workflows, generated UI, attribute-level grants, and an
  audit trail that is the shape of the data. The server is just another
  replica.
- *Humans:* Where your model lives and keeps running. You bring the
  documents; we keep the loop turning.

**Margin note under all four:** *Proof by construction: [Onboarded] — a full
compliance/dataroom product (I-9s, obligations, approvals) built from the
kernel with zero new primitives. When the algebra needs a new primitive to
ship a feature, the algebra is wrong. So far it isn't.* `✅`

## 4 · Observed phenomena — "features nobody wrote"

Numbered field observations, not a feature grid:

- *Obs. 1 — Audit trails:* not implemented; they are the shape of the data.
- *Obs. 2 — Time travel:* "what did we know on March 3rd?" is the same query
  as any other.
- *Obs. 3 — Reuse:* one submitted document satisfies every obligation sharing
  its scope — deduplication fell out of a key, not out of code.
- *Obs. 4 — Compliance:* an obligation is `required ∧ ¬submitted`. Nobody
  wrote compliance. It emerged.
- *Obs. 5 — Generated UI:* add a workflow definition; the right screens grow
  it. Zero UI changes.

## 5 · Position — one paragraph, two knives

- *"Ontology, without the semantic web."* Not RDF, not SPARQL, not OWL, not a
  graph database. Operational, reactive, bounded — the word rescued from the
  standards committee.
- *The Palantir line:* The most commercially validated version of this idea
  is closed, bundled, and priced like a fighter jet. **This is the open
  one.** Spec published, kernel conformance-tested, runs on your
  infrastructure or ours.

**Margin note — the air cover:** *Even Microsoft's CEO argues the durable
asset is the firm's own learning loop, swappable underneath any model — "a
frontier ecosystem, not just a frontier model." We agree, and go one step
further: if you own the loop, you should own the substrate it runs on. Their
answer is a closed, vertically integrated loop; ours is a published protocol
you can leave.* (See [`learning-loop.md`](./learning-loop.md).)

## 6 · The lab notebook — publish the uncertainty

Link the actual spec tree (reference / vision / plans / explorations) with
the status legend. Copy: *"We publish our lab notes, including the wrong
turns. Here is the paper (Operational Algebra — the theory this system
implements), here is the protocol, here are the explorations that may never
ship. Tagged honestly."* This section costs nothing — the docs exist — and is
the single highest-trust signal on the page for the audience we want.

## 7 · Join

- Discord · GitHub `Open-Ontology` · npm `@open-ontology` · *"Bring a domain,
  leave with an ontology"* starter · RSS for lab notes.
- **Footer manifesto, one line:** *Databases store facts. CRDTs synchronize
  facts. This synchronizes facts, logic, workflows, permissions, agents, and
  interfaces.* — with the epistemic legend repeated, tiny.

---

## Build dependencies (in order)

1. **The merge demo** (`apps/merge-demo`) — the hero artifact. Two replicas,
   visible cable, digest-recomputing verifier, headless conformance scenario.
   The page should not ship without it; it is the difference between a claims
   page and an evidence page.
2. **Proof-ticker wiring** — the header badges must be generated from real CI
   runs (forma-zero suite, merge conformance), not hand-written.
3. **Spec tree publishing** — render `specs/` to the site with the status
   legend intact (the lab-notebook section is a static-site job, not a
   writing job).
4. **Starter** — the `npm create` path that scaffolds a markdown+Forma module
   and runs the loop locally (depends on the Schematics `MarkdownFormaModule`
   adapter — see [`../explorations/schematics.md`](../explorations/schematics.md)).

## Open questions

- Does the hero demo run fully client-side on the homepage (static, no
  backend — strongest rhetorical form) or link out to a demo page?
- Onboarded: named on the homepage as the proof, or kept as a separate
  property linked from the margin note?
- How much of the L1–L5 ladder appears on the page vs. the spec? (Lean: the
  margin-note version only; the ladder lives in the notebook.)
- Forma naming on first contact: "Forma" vs "Forma Lisp" (per `branding.md`
  usage rules, "Forma Lisp" is allowed in customer copy; Autodesk Forma
  collision caveat stands).
