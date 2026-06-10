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
> **Decided:** the brand stack is consolidated under **Operational Algebra** —
> the theory, the system, and the customer front door are one name. The hosted
> product is **Operational Algebra Cloud**. Open Ontology and Schematics are
> retired (see *Retired names*).

---

## The stack

```
Operational Algebra            the front door: theory, system, product
├── Operational Algebra Cloud      the hosted operational runtime
├── Forma                          the language (authoring surface)
├── MetaCRDT                       the substrate (protocol + runtime packages)
├── Alchemy                        the deploy layer (plan/apply, previews)
└── Onboarded                      the proof (first application)
```

One sentence each:

> **Operational Algebra** is the theory and the company's front door — we
> invent the primitive *and* operate the deploy surface. **Operational Algebra
> Cloud** is the hosted runtime. **Forma** is the language. **MetaCRDT** is
> the substrate. **Alchemy** manages deploys. **Onboarded** is the first
> application built on top.

The posture this buys: Operational Algebra is to this company what the
relational model was to Oracle — except the theory and the vendor share a
name on purpose. The strategy is reference-implementation-led, not
standards-led: the commons cost (a second implementation can't call itself an
operational-algebra engine without brand confusion) is accepted.

---

## Operational Algebra — the front door

The theory, the system, and the brand customers meet. The website, the org,
the docs, the paper, and the pitch all lead with it.

**Positioning (from the homepage):**

> *Hosted operational runtime. Facts. Constraints. Processes. One living
> system.* — Model a slice of your operations in code, deploy it like
> infrastructure, and keep the model active in the background.

> Operational Algebra is the product surface around MetaCRDT and Forma:
> entities, relationships, constraints, mutations, views, and processes
> become versioned definitions that compile into a running ontology.

The customer-facing story has three load-bearing phrases:

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
| The theory, the paper, the laws | A neutral academic commons (accepted cost) |
| The customer front door and brand | One product among several |

**Analogy:** relational algebra and Oracle, deliberately sharing a name;
Terraform the idea and Terraform the product.

## Operational Algebra Cloud — the hosted runtime

The deploy surface. A hosted runtime for **ambient ontologies**: define the
operational model in code, version it, deploy it like infrastructure, and let
facts, constraints, and processes keep running in the background.

The lifecycle (the pipeline on the homepage):

```
Author      markdown + embedded Forma definitions
Typecheck   the language host validates before anything touches a runtime
Plan        diff the desired ontology against the active one
Apply       atomic deploy through Alchemy-managed stages and previews
Run         constraints evaluate, processes trigger, every result audited
```

| Is | Is not |
| --- | --- |
| Where customers deploy and operate | Required to use the open packages |
| The monetization surface | A separate brand to explain |

**Analogy:** Terraform Cloud is to Terraform as Operational Algebra Cloud is
to Operational Algebra. Also: GitHub to Git.

## Forma — the language

How humans (and agents) author Operational Algebra. A homoiconic syntax that
elaborates into executable runtime structures. Forma source is the authoring
surface; what it elaborates *to* is MetaCRDT.

Lives at `packages/@forma/*`. On customer-facing surfaces it may be written
"Forma Lisp" for first-contact clarity; in the stack docs it is **Forma**.

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
[`metacrdt-alignment.md`](./metacrdt-alignment.md) already names this lens:
everything is a fact, a fold, or a reaction.

Not the company. Not the product. The protocol — the thing worth owning the
npm scope and spec around. Infrastructure vocabulary, not customer
vocabulary: it appears in the architecture section, not the hero.

| Is | Is not |
| --- | --- |
| The object model and merge semantics | A user-facing brand |
| The IR Forma elaborates into | The authoring syntax |

**Analogy:** the Git object model, the relational model, the BEAM.

## Alchemy — the deploy layer

Plan/apply, stages, routes, bindings, and PR preview environments for
ontology deploys (see [`../explorations/alchemy.md`](../explorations/alchemy.md)).
Component vocabulary like MetaCRDT: it appears in "Alchemy-deployed" badges
and pipeline docs, not as a standalone brand.

## Onboarded — the proof

The first serious application, built entirely from the kernel: I-9 workflows,
violations, approvals, forms, dashboards — with no new primitives. Proof by
construction that the algebra is sufficient for at least one real domain.

| Is | Is not |
| --- | --- |
| A customer-facing product | Part of the kernel |
| The first existence proof | The only intended domain |

**Analogy:** Salesforce runs on Oracle; GitHub runs on Git; Onboarded runs on
Operational Algebra.

## Retired names

- **Open Ontology** — was the umbrella; replaced by Operational Algebra as
  the front door. Survives only in historical docs and the
  `specs/plans/open-ontology-unification.md` lineage. New surfaces should not
  introduce it.
- **Schematics** — was the workbench brand; absorbed into Operational Algebra
  Cloud. At most an internal codename.

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

Copy nit to fix: the homepage says "**Nine** primitives, one machine" over a
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
thing, which is what made one front-door name honest rather than aspirational.

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

- Say **Operational Algebra** for the theory, the system, the company front
  door, and the brand. It is now also the product family name.
- Say **Operational Algebra Cloud** for the hosted runtime — the thing
  customers sign up for, deploy to, and pay for.
- Say **Forma** when talking about syntax, files, elaboration, authoring
  ("Forma Lisp" is acceptable on first contact in customer copy).
- Say **MetaCRDT** when talking about storage, merge, branches, history,
  convergence, or the IR. Package scope: `@metacrdt/*`. Architecture
  vocabulary, never the hero.
- Say **Alchemy** only for the deploy pipeline machinery.
- Say **Onboarded** only when talking about the HR application.
- Do not introduce **Open Ontology** or **Schematics** on new surfaces.

A sentence that mixes layers ("Forma stores declarations", "MetaCRDT is our
workflow product") is misusing a name — rewrite it.
