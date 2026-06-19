# Names — the registry and the checklist

> Plans-altitude tracking doc: every name the project uses or wants, what we
> own, what's taken, what to register, and the naming decisions still open.
> Companion to [`open-ontology-unification.md`](./open-ontology-unification.md)
> (repo/org layout) and [`../vision/branding.md`](../vision/branding.md) (what
> each name *means*). Availability checks dated **2026-06-12** — recheck
> before acting; this space moves (see the `forma-lang` incident below).

## The name stack (decided direction, pending branding.md ratification)

| Name | Layer | One job |
| --- | --- | --- |
| **Open Ontology** | org · front door · community | the umbrella; the distribution that composes the instruments |
| **operational algebra** | theory | the paper; lowercase; "the McCarthy move for operations" |
| **Forma** | language | syntax, elaboration; "Forma Lisp" allowed on first contact |
| **MetaCRDT** | protocol + substrate | facts, folds, merge; never the customer-facing hero; name gated on the merge demo |
| **Schematics** | workbench | internal/OSS codename only; packages publish by function |
| **ontology.run** | hosted service | the commercial surface; "your ontology, running" |
| **`ontology`** | the prelude module | what `(import ontology)` resolves to; replaces the unresolved `(:preludes core)` token |
| **Onboarded** | first application | the existence proof |
| **rooms** | product noun (future) | the workspace unit inside the product; not a brand |
| **Orrery** | in reserve | clean as of 2026-06; candidate product-tier name if ontology.run wants a consumer face |

## Owned

| Asset | Detail |
| --- | --- |
| `open-ontology.com` | umbrella domain |
| `ontology.run` | hosted-service domain |
| `metacrdt.com` | reg. 2024-04 via Cloudflare; **do not launch before the two-replica merge demo** (name = proof obligation) |
| `meta-ontology.com` | defensive only — "Meta-" prefix risk (Meta Platforms); do not use |
| GitHub `Open-Ontology` | created 2026-06-09, empty — the development org |
| GitHub `metacrdt` | created 2026-06-06, empty — defensive; option: future vendor-neutral home for the protocol spec if a second implementer appears |
| npm `@open-ontology` | scope for language (`forma-*`), vocabulary (`ontology`, `ir`), workbench (`artifacts`, `ide`, `alchemy`, …), experience |
| npm `@metacrdt` | scope for protocol/substrate packages — the one scope where independent identity is existential |
| Open Ontology Discord | existing community |
| `formworkbench.com` | held for the workbench's future brand (see open decision 5 — "Formwork") |

## Taken / unavailable (verified)

| Name | Holder / status |
| --- | --- |
| npm org `forma` | taken (no published packages visible) |
| npm org `forma-lang` | **taken ~2026-05-20 — 23 days before our check.** Possibly sniped. Lesson: register before discussing names in public. |
| npm org `schematics` / `schematic` | taken |
| npm bare `forma` | squatted "WIP" stub at 0.2.0 — npm-support dispute candidate |
| npm bare `ontology` | abandoned 0.0.1 stub — npm-support dispute candidate; `npm install ontology` would be a major get |
| GitHub `forma` | org, taken 2018 |
| GitHub `ontology` | personal account (2013) — not gettable |

## Open (verified 2026-06-12) — register now

- [ ] npm bare **`forma-lang`** — the language's CLI/entry package (`npm install forma-lang`, like `typescript`); also denies the org-squatter the matching package
- [ ] npm bare **`create-ontology`** — the starter (`npm create ontology`)
- [ ] npm bare **`ontology-run`** — defensive
- [ ] GitHub org **`forma-lang`** — defensive redirect only; develop under `Open-Ontology`
- [ ] npm scope **`@formwork`** — zero packages as of 2026-06-12; claim quietly for the workbench candidate
- [ ] GitHub org **`formworkbench`** — free as of 2026-06-12; defensive for the workbench candidate
- [ ] Email npm support re: abandoned `ontology` (0.0.1) and `forma` (WIP 0.2.0) stubs — plan as if it fails, send anyway

## Checked and rejected (don't re-litigate)

Brand sweep 2026-06-12, all collision-verified: Sequent, Operand,
Tabula/Tabulate/Tabular, Sundial, Daybook, Reckoner, Metaroom, Maproom,
Facta, Mundi, Vivarium, Norma, Astrolabe, Factotum, Entail — all taken by
funded companies or hopelessly crowded. "Operational calculus" — an existing
mathematical field (Heaviside); claims a theory that isn't ours. Figma-class
warm coinages generally: that namespace was strip-mined 2012–2024; remaining
options are purchases, not finds. Clean finds from the sweep: **MetaCRDT**
(no paper or product anywhere) and **Orrery** (hobbyist astronomy apps only).

## Decisions still open

1. **Ratify the branding reversal.** `branding.md` still records the
   2026-06-10 Operational Algebra consolidation; the 2026-06-12 direction
   (Open Ontology umbrella, instruments beneath) needs one deliberate
   rewrite — and then the line holds. This doc assumes the reversal.
2. **Distribution repo name** under `Open-Ontology`: `ontology` (lean) vs
   `open-ontology` (keeps the website/docs repo name free vs. taken).
3. **`(:preludes core)` → `(import ontology)`** — retire the unresolved
   `core` token from docs/skills before it fossilizes; requires the prelude
   registry ([`../vision/composition.md`](../vision/composition.md),
   artifact 1).
4. **Social/handle sweep** not yet done: X/Twitter, Bluesky, crates.io (an
   OCaml/Rust future?), PyPI — check `openontology` / `open-ontology` /
   `metacrdt` when there's something to announce.
5. **Workbench standalone brand — deliberately deferred.** The generic
   workbench (typed artifact surface + pull/plan/apply/drift, the
   Schematics line) continues as a line of building, but gets a brand only
   at the moment of independent adoption (first non-ontology user or
   spin-out). Until then: repo codename `schematics`, packages
   `@open-ontology/{artifacts,ide,agent,alchemy,provider}`, prose name
   "the workbench". When the day comes: run a descriptive-compound sweep
   (Terraform = terra+form; spec/draft/plan/state × bench/form/work/craft),
   verify and register before discussing. **Leading candidate: Formwork**
   (formworkbench.com owned; `@formwork` npm scope empty; GH `formworkbench`
   free) — the mold that holds the shape while reality sets; drift = the
   concrete not matching the form; morphological mirror of Terraform;
   rhymes with Forma ("author in Forma, build in Formwork"). Known
   collisions, judged survivable but not clean: Formwork flat-file PHP CMS
   (getformwork.org), OpenRegulatory Formwork eQMS, bare npm `formwork`
   (stale 2022), GH user `formwork` (2014). Open tension: the
   Forma↔Formwork adjacency reads as "the Forma IDE" when the workbench is
   deliberately generic. Burned dictionary candidates
   (2026-06-12): Statecraft (campaign-compliance co + Gentle's npm
   package), Mylar (Eclipse→Mylyn trademark cautionary tale), Redline,
   Jig, Plat, Diazo, Drydock (npm squatted), Asbuilt (construction
   software category + GH org), Formworks (plural — established enterprise
   forms-automation SaaS in directly adjacent category + Autodesk store
   app + .com held since 1997; npm being free is the weakest signal). Landmine at spin-out: rename `alchemy` —
   it's an homage to Sam Goodwin's alchemy.run and collides with
   alchemy.com.

## Working rule

Register first, discuss second. Any name that appears in a public artifact
(homepage, repo, talk, this spec tree once public) should already be held at
every registrar that costs < $50/yr. The `forma-lang` org loss is the
standing reminder.
