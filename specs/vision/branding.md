# Vision — Branding: the name stack

> Part of the `vision/` set — see [`README.md`](./README.md). Companion to
> [`operational-algebra.md`](./operational-algebra.md) (the kernel reduction)
> and [`forma-zero.md`](./forma-zero.md) (the kernel as syntax).
>
> The names are not competitors. They are layers of one stack. This document
> fixes what each name means, what it is *not*, and the analogy that keeps it
> honest. When a doc, package, or pitch uses a name outside its layer, that is
> a bug.
>
> **Decided (2026-06-18):** the umbrella is **Open Ontology** — the org, the
> front door, the brand, the wedge ("the open alternative to Palantir's
> Ontology"). The hosted service is **ontology.run**. **Operational Algebra** is
> demoted to its honest job: the theory/paper, not the front door. This
> reverses the June-10 consolidation — see *Reversal history*, which this
> document intends to end.

---

## The stack

```
Open Ontology                  the umbrella: org · front door · brand · wedge
├── ontology.run                   the hosted service — a registry of named, running ontologies
│   ├── adapter ontologies             a vendor surface reflected   (salesforce.ontology.run, checkr.ontology.run)
│   └── domain ontologies / apps       an authored product          (onboarded.ontology.run)
├── metacrdt.com                   first-party products that surface the kernel directly
│   ├── shelly.metacrdt.com            the reconciliation loop → the machine
│   └── dataroom.metacrdt.com          room physics → secure shared projections
├── Forma                          the language (authoring surface)
├── MetaCRDT                       the substrate (protocol + runtime packages)
├── Schematics                     the workbench (authoring / IDE)
├── Operational Algebra            the theory and the paper — not the brand
└── Onboarded                      the proof (first application; onboarded.ontology.run)
```

One sentence each:

> **Open Ontology** is the umbrella and the front door — the org, the brand,
> and the wedge against Palantir's Foundry Ontology. **ontology.run** is the
> hosted service: a registry of named ontologies, each running. **metacrdt.com**
> is where the first-party, kernel-native products live (**shelly**,
> **dataroom**). **Forma** is the language. **MetaCRDT** is the substrate.
> **Schematics** is the workbench. **Operational Algebra** is the theory.
> **Onboarded** is the first application.

The posture this buys: "ontology" is the only word legible to *both* wedge
audiences — Palantir-aware buyers who already think in ontologies, and OSS devs
who'll `npm install` the substrate. It names the artifact customers actually
buy, and the "Open" prefix is the entire positioning against a closed
incumbent. The June-10 attempt to make one *theory* name (Operational Algebra)
also carry the front door failed not because the name was wrong but because it
was overloaded — a missing-names problem. The fix is crisp sub-names under one
umbrella, each with exactly one job.

---

## Open Ontology — the umbrella and front door

The brand customers and contributors meet first. The org, the website, the
pitch, and the GitHub/npm org strings all lead with it.

**Positioning (the wedge):**

> *The open alternative to Palantir's Ontology.* Model a slice of your
> operations as facts, constraints, and processes; deploy it like
> infrastructure; keep the model running in the background — on open packages
> you own, not a closed platform you rent.

The customer-facing story keeps three load-bearing phrases (they describe the
product regardless of which name sits on top, so they survived the reversal):

- **Business as Code** — the ontology lives in markdown files checked into
  git, reviewed in PRs, deployed through an infrastructure-style pipeline.
  Humans and agents propose changes through the same review and deploy flow.
- **Literate Ontologies** — markdown is for the team; Forma is for the
  runtime. Prose explains the policy; fenced code blocks compile into it.
- **The Loop** — facts change → constraints evaluate → violations surface →
  processes trigger → actions execute → new facts are asserted → views
  update. The runtime never stops evaluating the operational model. (This is
  the marketing rendering of `fact → fold → fact` from
  [`metacrdt-alignment.md`](./metacrdt-alignment.md).)

| Is | Is not |
| --- | --- |
| The org, the front door, the wedge | A neutral academic commons |
| The brand on the homepage and the GitHub org | A technical layer (those are below it) |

**Analogy:** Open Ontology is to this company what *Kubernetes* (the open
project + the term) is to the cloud-native world, or what *the relational
model, but open and operated* would have been to Oracle. The wedge framing is
literal: Palantir Foundry has an "Ontology"; this is the open one.

## ontology.run — the hosted service

"Your ontology, running." The deploy and monetization surface — but with a
specific shape: **a registry of named ontologies, addressable by subdomain.**
There are two species, and keeping them crisp is the same *guard-the-IR*
discipline the integration explorations enforce
([`integrations.md`](./integrations.md),
[`../explorations/workato.md`](../explorations/workato.md)):

- **Adapter ontologies** — a vendor's surface reflected into the ontology, the
  integration boundary's output: `salesforce.ontology.run`,
  `checkr.ontology.run`. These are `define-integration` artifacts, not authored
  products.
- **Domain ontologies / apps** — authored in Forma (`define-form`,
  `define-workflow`): `onboarded.ontology.run`, the first app.

The namespace is a **dependency graph, not a flat list**: a domain ontology
composes adapter ontologies. `onboarded.ontology.run` consumes
`checkr.ontology.run` (background check) and `salesforce.ontology.run` (CRM) —
the `onboard-employee` workflow imports both.

The deploy lifecycle (the homepage pipeline):

```
Author      markdown + embedded Forma definitions
Typecheck   the language host validates before anything touches a runtime
Plan        diff the desired ontology against the active one
Apply       atomic deploy through Alchemy-managed stages and previews
Run         constraints evaluate, processes trigger, every result audited
```

| Is | Is not |
| --- | --- |
| Where customers deploy and operate; the monetization surface | Required to use the open packages |
| A registry of named, composable ontologies | A single-app multi-tenant host (it hosts both species) |

**Analogy:** Terraform Cloud is to Terraform as ontology.run is to Open
Ontology. The registry shape is closer to npm or a package registry than to one
SaaS app — each subdomain is a named, versioned, importable ontology.

## metacrdt.com — first-party kernel products

A second live domain with a distinct job from ontology.run. Where ontology.run
hosts *applied* ontologies (yours, the customer's, a vendor's), **metacrdt.com
is where the engine company ships its own horizontal products** — the ones that
surface the kernel's physics directly and are sold to developers:

- **shelly.metacrdt.com** — the reconciliation loop (desired vs observed facts)
  pointed at *the machine*: a README that provisions its own dev environment,
  with the lockfile as a proof of convergence rather than a script. See
  [`../explorations/effect-cluster.md`](../explorations/effect-cluster.md) §3.
- **dataroom.metacrdt.com** — the shadow-rooms physics (consent + projection +
  bitemporality + redaction) pointed at secure document sharing: a virtual data
  room where a member sees a *projection*, never raw events. See
  [`../explorations/shadow-rooms.md`](../explorations/shadow-rooms.md) and
  [`documents.md`](./documents.md).

This gives **MetaCRDT a deliberate dual role**, which must not blur: as a *name*
it stays substrate/architecture vocabulary (below); as a *domain* it is the home
of kernel-native products. The rule of thumb: a thing lives on metacrdt.com when
it sells a **capability of the engine** to developers; it lives on ontology.run
when it is **an ontology someone authored or reflected**.

| Is | Is not |
| --- | --- |
| First-party products of the kernel, dev-facing | Customer-authored ontologies (those are ontology.run) |
| Horizontal tools (a machine, a data room) | A vertical domain app |

## Forma — the language

How humans (and agents) author Open Ontology. A homoiconic syntax that
elaborates into executable runtime structures. Forma source is the authoring
surface; what it elaborates *to* is MetaCRDT.

Lives under the Forma package scope. On customer-facing surfaces it may be
written "Forma Lisp" for first-contact clarity; in the stack docs it is
**Forma**. (Autodesk ships a product called "Forma" — collision caveat tracked
in the extraction plan; the names don't compete in market but copy should not
imply endorsement.)

| Is | Is not |
| --- | --- |
| The surface syntax and elaborator | The theory (that is Operational Algebra) |
| The thing you write in a file | The storage or merge model (that is MetaCRDT) |

**Analogy:** SQL is to relational algebra as Forma is to Operational Algebra.
Also: Lisp, Terraform HCL.

## MetaCRDT — the substrate

The machine. The convergent log of declarations: storage, branching, merging,
conflict resolution, time travel, distributed execution. The computational
primitive everything else compiles to and folds over.
[`metacrdt-alignment.md`](./metacrdt-alignment.md) names this lens: everything
is a fact, a fold, or a reaction.

As a *name* it is infrastructure vocabulary, not the hero: it appears in the
architecture section and in the package scope `@metacrdt/*`, not the umbrella.
(As a *domain*, metacrdt.com carries first-party products — see above; that is a
deliberate exception, and those products carry their own sub-names like shelly
and dataroom, never "MetaCRDT" as a consumer brand.)

| Is | Is not |
| --- | --- |
| The object model and merge semantics | A user-facing umbrella brand |
| The IR Forma elaborates into | The authoring syntax |

**Analogy:** the Git object model, the relational model, the BEAM.

## Schematics — the workbench

The authoring/IDE layer: where ontologies are written, browsed, diffed, and
deployed — the human surface over Forma + the plan/apply pipeline. Component
vocabulary, not the umbrella; it appears in product docs, not the wedge.

| Is | Is not |
| --- | --- |
| The IDE / workbench for authoring | The language (that is Forma) |
| Where you edit and deploy | The hosted runtime (that is ontology.run) |

## Operational Algebra — the theory

The paper. The primitives, operators, and laws — `assert` / `fold` / `react`
plus the closure rule and the two laws. It is the intellectual foundation and
the conformance target, and it earns credibility, but it is **not the front
door**: customers do not buy "an operational algebra," they buy an open
ontology that runs. OA appears in the paper, the `operational-algebra.md` /
`forma-zero.md` reductions, and "under the hood" footnotes — never the hero.

| Is | Is not |
| --- | --- |
| The theory, the paper, the laws, the conformance target | The brand or the front door (that is Open Ontology) |

**Analogy:** relational algebra is the theory; the relational *database* is what
shipped. Operational Algebra is the relational-algebra layer of this stack.

## Onboarded — the proof

The first serious application, built entirely from the kernel: I-9 workflows,
violations, approvals, forms, dashboards — with no new primitives. Proof by
construction that the algebra is sufficient for at least one real domain. It is
a *domain ontology* on the registry: `onboarded.ontology.run`, composing the
`checkr` and `salesforce` adapter ontologies.

| Is | Is not |
| --- | --- |
| A customer-facing product; a domain ontology | Part of the kernel |
| The first existence proof | The only intended domain |

**Analogy:** Salesforce runs on Oracle; GitHub runs on Git; Onboarded runs on
Open Ontology.

---

## Reversal history — and why this is the last one

The umbrella name oscillated three times; recording it here is the point, so it
stops:

1. **2026-06-09** — Open Ontology chosen as the umbrella.
2. **2026-06-10** — superseded by **Operational Algebra** as a single
   consolidated name (theory + system + front door), with Open Ontology and
   Schematics retired. This is the state the prior version of this doc encoded.
3. **2026-06-18** — reversed back to **Open Ontology** as the umbrella, with
   **Operational Algebra demoted to the theory** and **Schematics un-retired**
   as the workbench. The June-10 consolidation was an overload, not a clarity
   win: forcing one name to mean the theory *and* the product *and* the org
   made every sentence ambiguous. The diagnosis — *the June-10 overload was a
   missing-names problem, not a wrong-name problem* — is what makes this stable:
   the fix is more crisp names, not fewer.

**Why Open Ontology is robust to the question that kept this oscillating** —
"who are the first 1,000 users, devs npm-installing the substrate or buyers of
the hosted product?" — it works for either answer. Devs get open packages under
an org whose name describes the artifact; buyers get a legible wedge against a
named incumbent. No other candidate satisfied both audiences.

Status of assets backing this (per Ben, 2026-06): `open-ontology.com`,
`ontology.run`, and `metacrdt.com` are owned; GitHub orgs `Open-Ontology` and
`metacrdt` and npm scopes `@open-ontology` / `@metacrdt` are reserved. Proof
obligation before metacrdt.com goes live: the convergence/merge demo (the
substrate's central claim must be visibly true).

---

## Two "minimal cores" — keep them straight

The homepage ships a **Minimal Core** table — entities, relations, queries,
mutations, processes, constraints, views — the primitives customers model
with. The vision set proves a smaller one — `assert` / `fold` / `react` plus
two laws ([`operational-algebra.md`](./operational-algebra.md),
[`forma-zero.md`](./forma-zero.md)).

These are **two tiers of the same tower, not a contradiction**: the marketing
core is the *derived-forms* tier (the standard library customers touch); the
kernel is what the derived forms compile to. The right copy move is to market
the seven and footnote the kernel ("under the hood, all seven reduce to three
forms and two laws — that reduction is tested on every build"). The
conformance suite is a marketable fact.

Copy nit still open: the homepage says "**Nine** primitives, one machine" over a
table listing **seven**. Either count the table or grow the table — forms and
actions are the likely missing two rows.

---

## Why unify the kernel, not the brands

The naming problem dissolved only when three artifacts agreed:

1. **The paper** — Operational Algebra Core: primitives, operators, laws.
2. **The Forma kernel** — the same primitives expressible in syntax.
3. **The MetaCRDT runtime** — the same primitives executable as facts and
   folds.

```
Forma source
  ↓ elaborates to
MetaCRDT IR
  ↓ executes via
Effect runtime
```

The conformance suite ([`forma-zero.md`](./forma-zero.md) §7,
`packages/@forma/conformance/`) made the agreement executable — the
substrate's primitives and the theory's primitives are demonstrably the same
thing. The lesson the June-10/June-18 swing teaches: **unify the kernel, keep
the brands distinct.** The kernel is one thing wearing three notations (paper,
language, runtime); the *brand stack* is many things that each deserve their own
name. Collapsing the brands to match the kernel's unity was the mistake.

### The proof obligations

> The kernel itself is under active reduction:
> [`operational-algebra.md`](./operational-algebra.md)
> argues the five primitives and six operators are derived forms over
> fact/fold/reaction — two verbs (assert, fold), one closure rule, two laws.

In strength order (the Roots-of-Lisp ladder):

1. **Sufficiency** — derive workflow, permission, form, view, and agent from
   the primitives alone. If any derivation needs a new primitive, the algebra
   is wrong.
2. **Proof by construction** — derive Onboarded. Then derive a second domain
   (legal case management or a CRM) from the *same* kernel.
3. **Self-description** — express Operational Algebra in Forma:
   `(declare Primitive ...)`, `(declare Operator ...)`. The meta-circular
   evaluator move. Coherence, not truth — but it is the strongest notion of
   truth available: a minimal kernel whose consequences are systematically
   derivable and whose semantics are formally defined.

---

## Usage rules

- Say **Open Ontology** for the umbrella, the org, the front door, the brand,
  and the wedge. GitHub org / npm scope strings follow it (`@open-ontology`).
- Say **ontology.run** for the hosted service. When precision matters, say
  whether a subdomain is an **adapter ontology** (a reflected vendor surface) or
  a **domain ontology / app** (authored) — don't let the two species blur.
- Say **metacrdt.com** (and the product's own sub-name, e.g. **shelly**,
  **dataroom**) for first-party kernel products — never "MetaCRDT" as the
  consumer brand of one of them.
- Say **Forma** when talking about syntax, files, elaboration, authoring
  ("Forma Lisp" is acceptable on first contact in customer copy).
- Say **MetaCRDT** when talking about storage, merge, branches, history,
  convergence, or the IR. Package scope: `@metacrdt/*`. Architecture
  vocabulary, never the umbrella.
- Say **Schematics** for the authoring/IDE workbench.
- Say **Operational Algebra** for the theory and the paper — never the front
  door, never the product family.
- Say **Onboarded** only when talking about the HR application
  (`onboarded.ontology.run`).
- Do not put **Operational Algebra** on the homepage hero or the org name; do
  not reintroduce it as the umbrella. That was the June-10 reversal this
  document undoes.

A sentence that mixes layers ("Forma stores declarations", "MetaCRDT is our
workflow product", "Operational Algebra is the company") is misusing a name —
rewrite it.
