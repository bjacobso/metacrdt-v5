# Vision — Arguing the Algebra Down: the kernel under Operational Algebra

> Part of the `vision/` set — see [`README.md`](./README.md). Companion to
> [`metacrdt-alignment.md`](./metacrdt-alignment.md) (which found the
> fact/fold/reaction lens) and [`branding.md`](./branding.md) (which set
> the proof obligations). The draft paper proposes five primitives and six
> operators. This doc argues that kernel is **too big** — that the five and the
> six are *derived forms* over a smaller kernel the vision set already named —
> and shows the derivations. The Roots-of-Lisp test gets harder to pass with
> every primitive you keep; the way to pass it is to keep fewer.

---

## 0. The claim

The draft paper ("The Roots of Operational Algebra") proposes:

- **five primitives** — declaration, relation, constraint, action, authority
- **six operators** — compose, derive, constrain, authorize, execute, merge

[`metacrdt-alignment.md`](./metacrdt-alignment.md) reduced every vision doc to
three things over the convergent log: a **fact**, a **fold**, or a **reaction**
(a fold that emits facts). If the paper's five primitives are themselves
expressible as facts, folds, and reactions, then the paper's kernel is not the
kernel — it is the standard library.

> **Claim:** Operational Algebra has two verbs — **assert** and **fold** — one
> closure rule — a fold's output may itself be asserted (**reaction**) — and one
> law — concurrent assertions **converge** (merge), and since folds are
> deterministic, everything derived converges with them. The five primitives and
> six operators are derived forms.

This is the same shape as the precedents the paper invokes. Relational algebra
does not take *join* as primitive — join is product + select + project. Graham's
*Roots of Lisp* does not take `and` or `assoc` as primitive — it derives them in
front of you from seven operators. The persuasive power of both comes precisely
from the derivations. The paper should make the same move, one level down from
where it currently stands.

---

## 1. Two kernels

| | The paper's kernel | The substrate's kernel |
| --- | --- | --- |
| data | declaration, relation | **fact** |
| derivation | constraint | **fold** |
| change | action | **reaction** (fold → assert) |
| gate | authority | a guard fold at admission |
| law | merge (as an operator) | **convergence** (as a law) |

The right column is smaller and, this doc argues, sufficient. One refinement
before the derivations: the reductions only go through because the fact is
**richer than a bare triple**. A MetaCRDT fact is

```
(subject, attribute, value) @ (valid-time, tx-time) by author
```

— content-addressed, immutable, bitemporal, and provenanced
([`triples.md`](./triples.md)). The time coordinates are what let retraction and
history reduce to assertion; the author coordinate is what lets authority reduce
to a fold. A poorer fact primitive would force time and provenance back in as
separate primitives. The fact is one primitive *with structure*, the same way
Lisp's cons cell is one primitive with two slots.

---

## 2. Reducing the five primitives

| Paper primitive | Reduces to | The move |
| --- | --- | --- |
| Declaration | fact | identity — surface word for the same thing |
| Relation | fact | a relation *is* the attribute position |
| Constraint | fold (+ reaction) | a standing query whose result is the violation set |
| Action | reaction | invocation is a fact; execution is a fold that emits facts |
| Authority | facts + a guard fold | grants are facts; enforcement is a filter at admission |

### 2.1 Declaration → fact

```
(employee ben)            ≡  (ben, :type, :employee)
(document i9-123 submitted) ≡  (i9-123, :status, :submitted)
```

Identity. "Declaration" is the authoring-layer word; "fact" is the
substrate-layer word. Nothing to derive.

### 2.2 Relation → fact

```
(works-for ben onboarded)  ≡  (ben, :works-for, onboarded)
(manages ben alice)        ≡  (ben, :manages, alice)
```

A relation is not a second kind of thing standing beside declarations — it is
the **attribute position** of the triple. A "declaration" whose value is a
literal and a "relation" whose value is another subject differ only in the type
of the value slot. N-ary relations reify, the standard RDF/Datomic move:
`(assigned alice task-123 due-friday)` becomes an entity with three facts about
it. Relation is the first primitive to fall, and it falls completely.

### 2.3 Constraint → fold

```
(require
  (employee ?e)
  (submitted-i9 ?e))
```

A constraint is a **standing query** — a fold whose result is the set of
subjects for which the required pattern does not hold:

```
violations = (employees ?e) ∖ (submitted-i9 ?e)
```

The constraint does not need its own primitive because it produces no new kind
of thing: its output is a derived set, and [`compliance.md`](./compliance.md)
already proved the productized version — *an obligation is a fact; reuse is a
generated query*. Two readings of "constraint" must be kept distinct in the
surface language, because they desugar differently:

- **invariant** (*must never be admitted*) — the fold runs as a **guard at
  admission**: a validator reaction that refuses the transaction.
- **obligation** (*must eventually hold*) — the fold's violation set feeds a
  **reaction that asserts obligation facts**, which the rest of the system
  (tasks, notifications, dashboards) folds over like anything else.

One fold, two trigger disciplines. The paper currently blurs these; the
desugaring forces the distinction, which is a point in the desugaring's favor.

### 2.4 Action → reaction

```
(assign-task employee manager-review)
```

An action decomposes into three facts and one fold:

1. its **definition** is a fact — what it consumes, what it produces
   ([`library.md`](./library.md): definitions are facts);
2. an **invocation** is a fact — the proposal, asserted by some author;
3. its **execution** is a reaction — a fold over the invocation fact plus
   current state that emits the result facts.

This is literally the `fact → fold → fact` bridge from
[`metacrdt-alignment.md`](./metacrdt-alignment.md). "Actions consume
declarations and produce declarations" — the paper's own definition — *is* the
definition of a reaction. Nothing extra-algebraic remains **as long as the
action's effect lands inside the log**. Effects that cross the boundary
(send an email) are the residue — see §5.1.

### 2.5 Authority → facts + a guard fold

```
(can-approve manager onboarding)   ≡  (manager, :can-approve, onboarding)
```

A grant is just a fact — [`authorization.md`](./authorization.md) already
landed this: *grants are facts; the projection filters by them*. Enforcement is
a fold: at admission, a guard reaction folds over the grant facts and the
proposing fact's **author coordinate** and disposes — admit or refuse. This is
the validator pattern from [`ai.md`](./ai.md) (*agents propose facts; validators
dispose*), applied uniformly to every author, human or agent.

Authority reduces **representationally** without remainder. It is the primitive
that pushes back **operationally** — under merge, concurrent grant and revoke
on different branches mean a fact can be admitted under a grant that the merged
log says was already revoked. That is not a flaw in the reduction; it is a
sharp statement of an open substrate problem (coordination profiles, SPEC §9),
and it is *better* stated this way than as a monolithic "authority primitive"
that hides the question. See §5.2.

---

## 3. Reducing the six operators

The punchline first: every operator desugars to one of the two verbs.

| Paper operator | Verb | Desugaring |
| --- | --- | --- |
| compose | assert | definition facts naming a subgraph: `(onboarding, :member, …)` |
| derive | fold | identity — *derive is the fold* |
| constrain | fold + assert | a derive with a distinguished violation shape (§2.3) |
| authorize | assert | not an operator at all — the assertion of a grant fact |
| execute | assert | the assertion of an invocation fact; admission *is* execution |
| merge | — | not an operator — the substrate's convergence **law** |

Three of these deserve a sentence.

**Authorize is an assertion, not an operator.** `(authorize manager
approve-onboarding)` does nothing operator-like — it adds one fact to the log.
The paper listing it beside `derive` is a category error the desugaring exposes.

**Execute is an assertion too.** You do not "call" an action; you assert its
invocation fact, and the admission of that fact (past the authority guard)
triggers the executing reaction. This is what makes agents, humans, and
integrations uniform participants — they all do exactly one thing: propose
facts.

**Merge is a law, not an operator.** You do not call merge any more than a
relational query calls "consistency." Branches converge because the substrate
guarantees it and folds are deterministic, so every *derived* value converges
too — the meta-claim of [`metacrdt-alignment.md`](./metacrdt-alignment.md) §1.
The surface form `(merge branch-a branch-b)` is a substrate operation, like
`git merge` — real, essential, and **below** the algebra, not inside it. Moving
merge out of the operator list and into the laws section is the single largest
structural improvement available to the paper.

---

## 4. The kernel, restated

```
fact      (s, a, v) @ (valid-time, tx-time) by author      — the only data
fold      deterministic query over the log                  — the only derivation
reaction  a fold whose output is asserted, under a guard    — the only closure
─────────────────────────────────────────────────────────────
law 1     convergence: concurrent assertions merge;
          deterministic folds make every derived value converge
law 2     provenance: every fact carries its author;
          guards are folds over grants + authorship
```

Two verbs — **assert** and **fold** — one closure rule, two laws. The paper's
five primitives become the first five *derived forms*; its six operators become
sugar over the two verbs. Then the derivation tower from
[`branding.md`](./branding.md) continues exactly as before, one level
taller:

```
fact / fold / reaction                          the kernel
  → declaration, relation, constraint,
    action, authority                           derived forms (the paper's "primitives")
    → workflow, permission, form,
      view, agent                               derived systems
      → Onboarded, legal ops, CRM               derived applications
```

---

## 5. The residue — what does not reduce

Honesty about the remainder is what separates a reduction from a slogan. Three
things resist, and they share a shape: **everything inside the log reduces;
what resists is the boundary.**

### 5.1 External effects

`(send-email employee welcome-email)` is not an assertion — the email leaves
the log. The resolution is the bounded-context pattern
([`integrations.md`](./integrations.md)): the **intent** is a fact, an executor
agent at the boundary performs the effect, and the **result** is a fact. The
algebra sees a complete record; the effect itself is extra-algebraic. The paper
should say this plainly: *Operational Algebra is an algebra of the
organization's record. Executors — human, service, agent — live at its
boundary and touch the world.*

### 5.2 Authority under concurrency

Representationally reduced (§2.5), operationally open: concurrent grant/revoke
across branches means admission guards can be evaluated against a log that
merge later extends. Which coordination profile a given authority relation
demands — local admission, synchronous quorum, retroactive flagging — is the
event-bus / SPEC §9 frontier that [`metacrdt-alignment.md`](./metacrdt-alignment.md)
§4 already lists as genuinely open. The reduction does not solve it; it
*localizes* it to one guard fold instead of smearing it across a permission
system.

### 5.3 Time

"Remind in 3 days" requires an event the log will never spontaneously contain.
Clocks are boundary executors like §5.1: a scheduler asserts time facts, and
temporal reactions fold over them ([`notifications.md`](./notifications.md)).
Bitemporality makes time *queryable* for free; it does not make time *fire* for
free.

The residue is small, nameable, and uniform — a boundary discipline, not a
missing primitive. That is the strongest position a kernel can be in.

---

## 6. What this does to the paper

The current draft argues **up**: here are five primitives, watch workflows
emerge. The stronger paper argues **down first**:

1. **Part I — the kernel.** Two verbs, one rule, two laws (§4). Smaller than
   Lisp's seven.
2. **Part II — the derived forms.** Derive declaration, relation, constraint,
   action, authority — the §2 derivations, written out the way Graham writes
   `assoc`. This is the part the current draft skips, and it is the part that
   *is* the proof. [`forma-zero.md`](./forma-zero.md) writes these derivations
   as code.
3. **Part III — the derived systems.** Workflow, permission, form, view, agent
   — unchanged from the draft, but now standing on derived forms rather than
   asserted primitives.
4. **Part IV — proof by construction.** Onboarded, then a foreign domain,
   per [`branding.md`](./branding.md). The sufficiency test sharpens:
   *no new primitives* now means no new **verbs**, which is a much harder and
   much more falsifiable claim.
5. **Part V — the boundary.** The §5 residue, stated as scope, not apology.

And it resolves the question [`branding.md`](./branding.md) left
open: the relationship between Operational Algebra and MetaCRDT is not
theory-beside-substrate. **The substrate's primitives are the theory's
primitives.** Forma is the surface syntax for the derived forms; MetaCRDT is
the machine for the two verbs; the paper is the derivation between them. Three
artifacts, one kernel — which was the unification test all along.
