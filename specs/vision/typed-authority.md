# Vision — Typed Authority for Forma Zero

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on
> [`forma-zero.md`](./forma-zero.md), which writes the kernel and admission loop
> down in the language itself, [`operational-algebra.md`](./operational-algebra.md),
> which reduces authority to grants plus a guard fold, and
> [`authorization.md`](./authorization.md), which makes attribute-level access
> the product boundary.

Forma Zero has one effect:

```lisp
(assert f)        ; propose fact f into the log
```

The executable kernel makes that effect explicit in the admission loop. A grant
is a fact:

```lisp
(define grant (fn [who what] [who "can" what]))
```

and admission asks whether the proposing author has a matching grant for the
fact's attribute:

```lisp
(define can?
  (fn [author fact fs]
    (not (empty? (where [] [[author "can" (nth fact 1)]] fs)))))
```

That line is the whole authorization primitive. This document gives the typed
reading of the same line: a Forma program's inferred effect row is its
permission manifest. Before the program runs, a validator can compare the
manifest against grant facts for the author.

---

## 1. The Label Scheme

The first label granularity is the one `can?` already enforces:

```text
assert:<attribute>
```

Examples:

```text
[s "must" oblig]  =>  assert:must
[p "now" step]    =>  assert:now
```

The type system does not introduce a new kernel effect. `assert:*` and
`assert:must` are effect-row labels naming the single kernel effect at the
authority granularity the admission fold already uses.

This scheme extends without changing the row mechanism. Later labels can refine
the payload:

```text
assert:<attribute>
assert:<subject-pattern>:<attribute>
assert:<subject-pattern>:<attribute>:<value-pattern>
```

The current gate reads only the attribute component, because the current dynamic
gate reads only `(nth fact 1)`.

---

## 2. Where Assertion Manifests

The paper kernel has an `assert` form. The executable prelude also shows the
derived runtime shape: reactions are functions from an admitted fact and the log
to facts to propose:

```lisp
reaction : fact -> log -> facts-to-propose
proposal : {:fact f :by author}
```

Therefore assertion can manifest in two places:

1. A typed `assert` form, when the surface language grows one.
2. A reaction's return value, today.

The pragmatic rule for the current system is:

> A reaction return that statically contains a fact-shaped vector contributes
> an `assert:<attribute>` effect, where the vector's second slot is a string or
> keyword literal.

This keeps the kernel small. No primitive is added; the type checker is reading
the same fact shape that `opeval` later admits dynamically.

The current TS engine types vector literals as homogeneous lists, so the effect
analysis is source-aware after HM inference succeeds. HM still checks that the
program is well-typed. The authority pass then walks the lowered CoreExpr and
finds fact-shaped return values such as `[s "must" oblig]`, including facts
returned through ordinary collection combinators like `map`, `filter`,
`concat`, and branch forms.

---

## 3. Unknown Attributes

If the second slot of a fact is computed at runtime, the exact attribute is not
available before execution:

```lisp
(fn [s attr v] [[s attr v]])
```

The static label is:

```text
assert:*
```

The gate treats `assert:*` as requiring a wildcard grant:

```lisp
[author "can" "*"]
```

This is deny-by-default. A validator that does not want wildcard authority can
reject these programs statically and require authors to make attributes literal.
The dynamic `can?` guard remains the normative per-fact check, so a runtime
proposal with a concrete attribute is still admitted or refused against the
current log.

Alternative considered: reject unknown attributes as a type error. That is
stricter, but it turns authority policy into type soundness. `assert:*` keeps
HM inference useful for higher-order code while making the blast radius visible
and opt-in.

---

## 4. Polymorphism

Effect rows are already row-polymorphic. Higher-order helpers should not lose
authority information:

```lisp
(define emit (fn [attr] (fn [s v] [[s attr v]])))
(define emit-must (emit "must"))
```

The helper has an open effect until call site information closes it. A call
with `"must"` yields `assert:must`; a call with a runtime attribute yields
`assert:*`.

This is the same role `evars` play in schemes for ordinary effect rows: a
general helper can abstract over the eventual effect row, and instantiation
specializes it where enough literal information is present. The first
implementation derives those labels with a source-aware pass after HM inference;
the labels are represented as ordinary `ERow` values so the rest of the type
system sees the same shape.

---

## 5. Static And Dynamic Enforcement

The dynamic guard in `opeval` stays. It is normative:

```lisp
(not (can? (get p :by) f log)) st
```

The static gate is a pre-admission check. It answers a different question:

> Does this program's statically visible assertion manifest fit within the
> grants currently presented for this author?

Both are required. Static checking rejects oversized programs before any step
runs. Dynamic checking still protects the log at admission time, including
under concurrency where grants may change between static checking and proposal
admission (`operational-algebra.md` §5.2).

---

## 6. API Contract

```ts
checkAuthority(source, {
  author,
  grants,
}) =>
  | { ok: true }
  | { ok: false; missing: string[] }
```

Inputs:

- `source`: Forma source.
- `author`: the principal whose authority is being checked.
- `grants`: facts shaped exactly like the kernel's grants:
  `[who, "can", attr]`.

Algorithm:

1. Parse, lower, and HM-infer `source`.
2. Derive assertion effects from reaction-shaped returns.
3. Collect effect-row labels whose prefix is `assert:`.
4. Compute the granted attributes for `author`.
5. Return `ok` iff every asserted attribute is granted. `assert:*` requires
   `*`.

The `missing` list contains missing attribute names, not full effect labels,
because the grant table is keyed by attributes. It is sorted and deduplicated.

---

## 7. Worked Examples

### `make-obligate`

The executable prelude defines:

```lisp
(define make-obligate
  (fn [vars when need v oblig]
    (fn [f fs]
      (filter (fn [m] (not (member? fs m)))
              (map (fn [s] [s "must" oblig])
                   (violations vars when need v fs))))))
```

The inner reaction returns facts whose attribute slot is the literal `"must"`.
Its manifest contains:

```text
assert:must
```

For author `"system"`:

```lisp
["system" "can" "must"]  => ok
[]                       => missing ["must"]
```

### `advance`

The workflow reaction is:

```lisp
(define advance
  (fn [f fs]
    (if (= (nth f 1) "completed")
      (map (fn [env] [(nth f 0) "now" (get env "n")])
           (where ["n"] [[(nth f 2) "next" "n"]] fs))
      [])))
```

The emitted fact attribute is the literal `"now"`, so the manifest contains:

```text
assert:now
```

For author `"system"`, `[ "system" "can" "now" ]` is sufficient.

---

## 8. Open Questions

- Whether wildcard authority should be admitted in production policy or used
  only as an internal representation for static denial.
- The exact surface syntax for future typed `assert`; it should elaborate to
  the same `assert:<attribute>` labels described here.
- How far to refine labels beyond attributes. Subject/value patterns should
  be added only when the dynamic admission fold enforces the same granularity.
