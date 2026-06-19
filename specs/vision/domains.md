# Domains & Brands — the neutral inventory

> This is a **ledger, not a verdict.** It enumerates every domain, org, scope,
> and name we hold (or deliberately don't), and records the *vibe* each one
> carries — the connotation a reader lands on before any argument is made. It
> takes no side on which name should be the front door.
>
> Its opinionated counterpart is [`branding.md`](./branding.md), which *does*
> pick a stack. Where the two disagree, that disagreement is the live decision —
> not an error in either doc. `branding.md` reflects the **2026-06-10**
> "Operational Algebra is the front door" consolidation; that call is under
> active reconsideration, so this inventory keeps every option legible rather
> than retiring any.

---

## How to read the "vibe" column

A vibe is the first-impression weather of a name — who it speaks to, what
adjacent thing it evokes, what it quietly promises. It is the part of branding
that survives before positioning copy is written. Two names can describe the
same artifact and carry opposite vibes; that gap is the whole reason to write
this down.

---

## 1. Domains we own

| Domain | Status | Vibe |
| --- | --- | --- |
| **metacrdt.com** | Registered 2024-04, on Cloudflare | Infrastructure. Protocol. Dev-legible and a little severe — reads like a spec you'd `npm install`, not a product you'd buy. Speaks to engineers first. Carries the substrate's physics directly. |
| **ontology.run** | Owned | "Your ontology, running." Hosted, alive, present-tense. The most product-shaped of the set and the only name legible to *both* audiences — Palantir-aware buyers and OSS devs. The `.run` TLD makes it feel operational rather than academic. |
| **open-ontology.com** | Owned | The open umbrella / org front door. Movement energy — "the open alternative to Palantir's Ontology." Invites a community and a GitHub org; risks reading as a foundation/standards body rather than a vendor. |
| **meta-ontology.com** | Owned, **defensive only** | Held to deny it, not to use it. The "Meta-" prefix carries trademark and association risk (Meta Platforms). Should not anchor a public surface. |

## 2. Subdomains in the proposed taxonomy

Two live umbrellas, distinct jobs (per the 2026-06-18 taxonomy). Listed here as
*proposed structure*, not deployed sites.

| Subdomain | Under | Species | Vibe |
| --- | --- | --- | --- |
| **shelly.metacrdt.com** | metacrdt.com | First-party kernel product | The reconciliation loop made concrete — a machine that converges desired-vs-observed facts. Surfaces the kernel's physics directly. See [`../explorations/effect-cluster.md`](../explorations/effect-cluster.md) §3. |
| **dataroom.metacrdt.com** | metacrdt.com | First-party kernel product | Shadow-rooms consent + projection physics, pointed at a due-diligence VDR. Concrete, enterprise-legible application of the substrate. See [`../explorations/shadow-rooms.md`](../explorations/shadow-rooms.md). |
| **salesforce.ontology.run** | ontology.run | *Adapter* ontology | A vendor surface reflected as an ontology — the define-integration boundary. One subdomain per named vendor. |
| **checkr.ontology.run** | ontology.run | *Adapter* ontology | Same shape as the Salesforce adapter — a background-check vendor reflected. |
| **onboarded.ontology.run** | ontology.run | *Domain* ontology / app | An authored Forma product, the first app. **Composes** `salesforce` + `checkr` — the namespace is a dependency graph, not a flat list. |

> Open decision (not resolved here): is `ontology.run` a *registry of named
> ontologies* or a *multi-tenant app host*? It currently reads as a registry —
> both adapter and domain species are addressable and composable. Keeping the
> adapter-vs-domain species crisp is the "guard the IR" discipline applied to
> the namespace.

## 3. Names (brands) and their layer

These are names that appear in docs and pitches. The **layer** column says what
job the name does; the **vibe** column says how it feels. Inclusion here is not
endorsement — retired and candidate names sit side by side on purpose.

| Name | Layer | Vibe |
| --- | --- | --- |
| **Operational Algebra** | Theory / system / candidate front door | Rigorous, paper-backed, Oracle-to-relational-algebra posture. Authoritative but heavy; reads academic on first contact. The 2026-06-10 front-door pick; under reconsideration. |
| **Operational Algebra Cloud** | Hosted runtime (under the above) | "Terraform Cloud to Terraform." Clearly the paid surface; inherits OA's weight. |
| **Open Ontology** | Umbrella / org candidate | Community, openness, "the open alternative to Palantir." Marked *retired* in `branding.md` yet the leading umbrella candidate again as of 2026-06-12 — this tension is live. |
| **MetaCRDT** | Substrate / protocol | The machine. Clean term-space, no prior product or paper. Infrastructure vocabulary — belongs in the architecture section, never the hero. |
| **Forma** | Language (authoring surface) | Crisp, classical, "form/shape." Strong as a language name. **Caveat:** Autodesk ships a product called Forma — collision risk stands. |
| **Alchemy** | Deploy layer | Plan/apply, bindings, previews. Evocative but component-level; a badge, not a hero brand. (Note: an external `alchemy.run` deploy tool also exists — see [`../explorations/alchemy.md`](../explorations/alchemy.md).) |
| **Onboarded** | First application | Concrete, product-shaped, HR-flavored. The existence proof, not a layer of the kernel. |
| **ontology.run** | Hosted service name | (See domains.) Doubles as a brand — the present-tense, operational reading of "ontology." |
| **Schematics** | Retired workbench codename | Absorbed into OA Cloud per `branding.md`. At most an internal codename now. |

## 4. Orgs, scopes, and channels

| Asset | Where | Status / Vibe |
| --- | --- | --- |
| **Open-Ontology** | GitHub org | Created 2026-06-09, empty. Matches the `@open-ontology` npm string. |
| **metacrdt** | GitHub org | Created 2026-06-06, empty. Matches `@metacrdt` npm scope and the repo's package namespace. |
| **@open-ontology** | npm scope | Unpublished; reserved, matches the GitHub org. |
| **@metacrdt** | npm scope | Unpublished as a public brand, but it is the live package namespace in this monorepo (`@metacrdt/core`, etc.). The one name already load-bearing in code. |
| **Open Ontology** | Discord | Community channel exists under the umbrella name. |

## 5. Deliberately *not* owned

Recording these so no plan assumes them.

| Asset | Note |
| --- | --- |
| **github.com/ontology** | A personal account since 2013 — not ours, not acquirable casually. |
| **npm `@ontology`** | Scope not owned. |
| **npm `ontology`** | Bare package is an abandoned `0.0.1` stub — not ours. |

---

## The one tension to keep in view

Every oscillation in the naming has reduced to a single forced choice: **who are
the first 1,000 users?**

- If they are **devs `npm install`-ing the substrate**, the gravity is
  `metacrdt.com` + `@metacrdt` — the names already real in code.
- If they are **buyers of a hosted product** who know Palantir's Ontology, the
  gravity is `ontology.run` / Open Ontology — the only names legible to that
  audience.

This ledger stays robust to either answer. `branding.md` commits to one. Until
that commitment is re-ratified or reversed, treat both columns as live and don't
delete a name from this inventory just because the opinionated doc retired it.
