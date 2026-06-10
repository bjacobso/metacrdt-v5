# Vision — Forma Zero: the kernel, written down

> Part of the `vision/` set — see [`README.md`](./README.md). Companion to
> [`operational-algebra.md`](./operational-algebra.md) (which argued the kernel
> down to two verbs, one rule, two laws) and [`forma.md`](./forma.md) (the full
> authoring surface). That reduction was stated in prose; this doc states it in
> **syntax**, the way McCarthy stated Lisp — a minimal set of forms, then the
> higher abstractions derived in front of you, ending with the evaluator written
> in itself. Forma Zero is the kernel of Forma: the thing every
> `define-*` form in [`forma.md`](./forma.md) must macro-expand into.

---

## 0. Why this is possible at all

McCarthy's move had two halves that are easy to conflate:

1. **The data structure is the syntax.** Programs are lists; lists are the
   data the seven operators manipulate. Homoiconicity is what made `eval`
   writable in one page.
2. **The kernel is tiny.** Seven operators, then everything else is derived
   *in the language*, so each abstraction is a proof of sufficiency, not a
   feature.

Operational Algebra has the same two halves available:

1. **A fact is a list.** `(ben works-for onboarded)` is simultaneously the
   syntax you write, the value the fold receives, and the unit the log stores.
   No constructor, no schema layer in the kernel — the triple *is* the cons
   structure. Definitions-as-facts ([`library.md`](./library.md)) is
   homoiconicity's second half: the system's own rules are facts in the same
   log they govern.
2. **The kernel is two verbs and a rule** ([`operational-algebra.md`](./operational-algebra.md) §4)
   — which is *smaller* than seven.

So the construction is: take McCarthy's Lisp as the computational substrate,
add **three forms**, and derive the rest.

---

## 1. The kernel

**Forma Zero = McCarthy's seven + three.**

The seven — `quote` `atom` `eq` `car` `cdr` `cons` `cond` (with `lambda` and
`label` for abstraction) — are assumed exactly as in *Roots of Lisp*. They
contribute no operational semantics; they are how folds compute. On top:

```lisp
(assert f)        ; propose fact f into the log — the ONLY effect
(fold g a)        ; the value of folding g over the log from a — the ONLY read
(react r)         ; install r : fact → facts-to-propose — the ONLY closure
```

That is the whole kernel. Three notes:

- **`fold` is the only read.** There is no `get`, no `query`, no `current
  state` — `(fold g a)` is a deterministic left fold of `g` over every fact in
  the log, starting from `a`. Law 1 (convergence) is what makes its value
  well-defined without coordination. Datalog, views, projections — all derived
  below.
- **`assert` proposes; the substrate disposes.** Written facts are bare
  triples. The substrate stamps the bitemporal and provenance coordinates
  `@ (vt, tt) by author` at admission — exactly as McCarthy's `eval` supplies
  the environment the expression never mentions. Law 2 (provenance) lives
  there, not in the syntax.
- **`react` is the only place fold output crosses back into assertion.**
  Folds are pure (they must be, for law 1). A reaction `r` receives each newly
  *admitted* fact and returns facts to *propose* — `fact → fold → fact` as a
  form. Stateful reactions need no extra machinery: `r` may call `fold`.

One piece of reader sugar, in the spirit of `'x` ≡ `(quote x)`:

```lisp
?e   ≡  (? e)        ; a pattern variable is a list tagged with ?
```

so patterns are plain lists too, and `atom`/`car` can inspect them.

---

## 2. Layer 1 — deriving the query algebra

The first thing *Roots of Lisp* does with its seven is derive the library
(`null.` `and.` `assoc.` …). The first thing Forma Zero must derive is Datalog
— because [`operational-algebra.md`](./operational-algebra.md) §2.3 reduced
constraints to *standing queries*, so queries had better be derivable.

`defun` abbreviates `label`+`lambda` as in Graham. List helpers (`map.`
`append.` `flat.` `member.` `minus.`) are derived from the seven in the usual
way and assumed.

A pattern variable, and unification of one pattern against one fact:

```lisp
(defun var. (x)
  (and. (not. (atom x)) (eq (car x) '?)))

(defun bind. (v x env)                       ; extend env, or 'no on clash
  (cond ((null. (assoc. v env)) (cons (list v x) env))
        ((eq (cadr (assoc. v env)) x) env)
        ('t 'no)))

(defun unify. (pat fact env)                 ; both are triples
  (cond ((eq env 'no) 'no)
        ((null. pat) env)
        ((var. (car pat))
         (unify. (cdr pat) (cdr fact) (bind. (car pat) (car fact) env)))
        ((eq (car pat) (car fact))
         (unify. (cdr pat) (cdr fact) env))
        ('t 'no)))
```

The log as a value — the only use of `fold` in the whole query layer:

```lisp
(defun facts () (fold cons '()))
```

Conjunctive query: thread an environment set through the patterns. Each step
is pure list manipulation; only `facts` touches the log:

```lisp
(defun matches. (pat fs env)                 ; all extensions of env by pat
  (cond ((null. fs) '())
        ('t ((lambda (e rest)
               (cond ((eq e 'no) rest) ('t (cons e rest))))
             (unify. pat (car fs) env)
             (matches. pat (cdr fs) env)))))

(defun where. (pats fs envs)                 ; conjunction
  (cond ((null. pats) envs)
        ('t (where. (cdr pats) fs
              (flat. (map. (lambda (env) (matches. (car pats) fs env))
                           envs))))))

(defun where (pats)
  (where. pats (facts) (list '())))

(defun without (pats neg)                    ; negation-as-absence
  (filter. (lambda (env) (null. (where. neg (facts) (list env))))
           (where pats)))
```

This is the *Roots of Lisp* `assoc.` moment: Datalog is not a feature of the
substrate — it falls out of `fold` plus list recursion. (The production
version is the incremental, indexed fold of
[`performance.md`](./performance.md); same semantics, different evaluation
strategy — exactly the relationship between Graham's `eval.` and a real Lisp.)

---

## 3. Layer 2 — deriving the five "primitives"

Now the derivations promised by [`operational-algebra.md`](./operational-algebra.md) §2,
each a few lines.

**Declaration** — identity:

```lisp
(defun declare (s a v) (assert (list s a v)))
```

**Relation** — nothing to define. It is the second slot of the list. The
primitive that falls completely falls *syntactically* too: there is no form.

**Constraint** (obligation reading) — a violation set is a derived value:

```lisp
(defun require (when need)
  (lambda ()
    (minus. (map. car (where when))          ; subjects matching the pattern
            (map. car (where (append. when need))))))  ; …that also satisfy it
```

and the reaction that turns violations into obligation *facts* — the
[`compliance.md`](./compliance.md) reconciler in four lines:

```lisp
(defun obligate (when need oblig)
  (react (lambda (f)
           (map. (lambda (s) (list s 'must oblig))
                 ((require when need))))))
```

**Authority** — a grant is a fact; the check is a query:

```lisp
(defun grant (who what) (declare who 'can what))

(defun can. (author f)
  (not. (null. (where (list (list author 'can (cadr f)))))))
```

**Constraint** (invariant reading) and **enforcement** — a guard is a reaction
over *proposal* facts that emits *admission* facts. Proposals are themselves
facts (`(proposed f author)`), so the gate needs no new form:

```lisp
(defun guard ()
  (react (lambda (p)
           (cond ((eq (cadr p) 'proposed)
                  (cond ((can. (caddr p) (car p)) (list (list (car p) 'admitted (caddr p))))
                        ('t '())))
                 ('t '())))))
```

**Action** — definition facts plus a reaction on invocation facts:

```lisp
(defun defaction (name produce)              ; produce : invocation-fact → facts
  (declare name 'type 'action)
  (react (lambda (f)
           (cond ((and. (eq (cadr f) 'invoke) (eq (caddr f) name))
                  (produce f))
                 ('t '())))))
```

and `execute` is what [`operational-algebra.md`](./operational-algebra.md) §3
said it was — an assertion:

```lisp
(defun execute (who action) (assert (list who 'invoke action)))
```

Five primitives, six operators — every one is now a definition on the page,
written in the kernel. None needed a new form. That table in
[`operational-algebra.md`](./operational-algebra.md) §2–3 is no longer a claim;
it is code.

---

## 4. Layer 3 — deriving the Forma surface

The `define-*` forms of [`forma.md`](./forma.md) §2 are macros over Layer 2 —
the same relationship `let` has to `lambda`. Two expansions to fix the idea:

```lisp
(define-constraint i9-required
  (:when    [?p type Placement] [?p placement/employer ?e])
  (:require (form i9 (:scope ?e))))
;; ≡
(obligate '((?p type Placement) (?p placement/employer ?e))
          '((?e submitted i9))
          'i9)
```

```lisp
(define-process onboarding (:subject Worker) (:start i9)
  (:step i9       (:collect i9)       (:next handbook))
  (:step handbook (:collect handbook) (:next done)))
;; ≡ one declaration per step edge, plus one reaction per step:
(declare 'onboarding 'type 'process)
(declare 'i9 'next 'handbook)               ; the step graph is facts
(react (lambda (f)                           ; advance on completion
         (cond ((eq (cadr f) 'completed)
                (map. (lambda (env) (list (car f) 'now (cadr (assoc. '(? n) env))))
                      (where (list (list (caddr f) 'next '(? n))))))
               ('t '()))))
```

Note what the second expansion shows: **the step graph is data in the log**
(`(i9 next handbook)` is a fact), and the workflow engine is one generic
reaction that *queries the graph it is executing*. A form is the same move
read-side — `(define-form …)` expands to a view (`where`) of
required-but-missing facts, per [`experience.md`](./experience.md). An agent is
an author plus `grant` facts plus `execute` — no form at all, per
[`ai.md`](./ai.md).

This is the answer to "where does the surface language stop and the kernel
begin": **everything above the three forms is macro-expansion**, checkable by
expanding it.

---

## 5. Layer 4 — opeval: the evaluator in itself

McCarthy's finale is `eval.` written in the seven. The Operational Algebra
analog is the **admission loop** — one transaction step — written in Forma
Zero. It folds proposals to a fixpoint: admit, run reactions, propose their
emissions, repeat.

```lisp
(defun opeval (log proposals)
  (cond ((null. proposals) log)
        ('t ((lambda (p rest)
               (cond ((admit. p log)
                      (opeval (cons p log)
                              (append. rest (emit. p log))))
                     ('t (opeval log rest))))
             (car proposals) (cdr proposals)))))

(defun admit. (p log)                        ; guards are folds over the log
  (can.  (author. p) p))                     ; (§3's can., against log)

(defun emit. (p log)                         ; run every installed reaction
  (flat. (map. (lambda (r) ((body. r) p))
               (reactions. log))))

(defun reactions. (log)                      ; the engine READS ITS OWN RULES
  (where. '((?r type reaction)) log (list '())))
```

The load-bearing line is the last one. In McCarthy's `eval.`, the environment
is a parameter threaded alongside the expression. In `opeval`, the environment
**is the log**: the installed reactions, the grants that gate admission, the
step graphs the reactions traverse — all are facts in the very log being
folded. `(react r)` itself desugars to assertions: `(declare r 'type 'reaction)`
plus the body as a definition fact. The evaluator discovers its own rules by
querying the world it evaluates.

That is a strictly stronger meta-circularity than Lisp's, and it is the
self-description rung of the [`branding.md`](./branding.md) proof
ladder: not "trust me," but *here is the engine, four definitions long, written
in the language it runs.*

What `opeval` deliberately does **not** capture — the same residue as
[`operational-algebra.md`](./operational-algebra.md) §5:

- **convergence** — `opeval` evaluates one branch; merge of concurrent logs is
  law 1, substrate territory ([`../reference/protocol.md`](../reference/protocol.md));
- **termination** — reaction cascades can run away; the event-bus contract
  (poison transactions, idempotency) is the open frontier of
  [`metacrdt-alignment.md`](./metacrdt-alignment.md) §4;
- **effects and clocks** — boundary executors, outside the loop by design.

---

## 6. What this buys

```
Forma          (define-process …)               forma.md — the ergonomic surface
  ⇣ macro-expansion (Layer 3)
derived forms  declare / require / grant /
               defaction / execute              the paper's "primitives" (Layer 2)
  ⇣ definitions (Layer 1–2)
Forma Zero     assert / fold / react            three forms + McCarthy's seven
  ⇣ admission (opeval)
MetaCRDT       the convergent log               laws: convergence, provenance
```

- **The paper gets its Part II** ([`operational-algebra.md`](./operational-algebra.md) §6):
  the derivations are no longer sketches — they are the code in §2–§4 of this
  doc, presentable in *Roots of Lisp* form.
- **Forma gets a conformance test.** Any `define-*` form that cannot be
  macro-expanded into the three forms is a new primitive smuggled in — the
  exact failure the Roots-of-Lisp test exists to catch. The elaborator
  (`@forma/ts` → IR, [`forma.md`](./forma.md) §3) should be able to print the
  expansion of any surface form down to Forma Zero.
- **The substrate gets a spec.** A target implements Operational Algebra iff
  it implements three forms and two laws. Everything else is library.

> McCarthy needed seven operators to make computation fall out. The claim on
> the table is that organizations need three more — `assert`, `fold`, `react`
> — and two laws. Layers 1–4 are the evidence.

---

## 7. Postscript: the kernel runs

The construction above is no longer only on paper. A conformance suite at
[`packages/@forma/conformance/forma-zero/`](../../packages/@forma/conformance/forma-zero/)
executes a portable rendering of this kernel — unification, `where`/`without`,
the derived primitives, and `opeval` — **on both Forma engines** (`@forma/ts`,
dynamic; `@forma/ocaml`, HM-typechecked), with thirteen cases asserting the
behaviors claimed layer by layer, down to the reconciler emitting each
obligation exactly once and the workflow reaction querying the step graph it
executes.

Two findings from making it run are worth folding back into the doc:

- **The executable kernel needs no recursion at all.** Every derivation in
  the running prelude is literally a fold (`reduce`/`map`/`filter`/
  `flat-map`) — including `where` (a fold of the env-set through the
  patterns) and `opeval` itself (a fold over rounds of admission). The prose
  above leans on McCarthy-style recursion; the machine demanded folds, and
  the kernel's own thesis predicted that.
- **The typed engine narrowed the dialect, not the kernel.** HM typing forced
  representational choices (variables as declared strings, failure as the
  empty env-set, homogeneous facts) but zero new primitives — the
  Roots-of-Lisp failure mode the suite exists to catch did not occur.
