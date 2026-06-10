# Prompt: Typed Authority for Forma

You are working in the `convex-triples` monorepo on **forma**, a small Lisp
whose kernel has exactly one effect: proposing facts into a bitemporal,
provenanced log. Your mission:

> **Make a forma program's type statically declare which authority it needs,
> so admission can be gated by a typecheck against the grant table before a
> single step runs.**

Today, authority is checked *dynamically*: the admission loop (`opeval`)
rejects each proposed fact whose author lacks a matching grant. The thesis of
this work is that the existing Hindley–Milner effect-row machinery can compute
the same answer *statically* — a program's inferred effect row becomes its
permission manifest. This is the keystone for the project's "agents propose,
validators dispose" model (`specs/vision/ai.md`): a validator that can read
an agent-authored program's blast radius off its type, before running it.

## Read first, in this order

1. `specs/vision/forma-zero.md` — the kernel: `assert` / `fold` / `react`,
   layers 1–4, and `opeval` (the admission loop). Everything else is derived.
2. `specs/vision/operational-algebra.md` — the two laws (convergence,
   provenance); grants are facts; enforcement is a guard fold at admission.
3. `specs/vision/authorization.md` — the product-level authorization model.
4. `packages/@forma/conformance/forma-zero/prelude.lisp` (~177 lines) — the
   executable kernel. The parts you are formalizing:
   - `grant` (line ~112): a grant is the fact `[who "can" attr]`.
   - `can?` (line ~114): authority check = query for `[author "can" (nth fact 1)]`
     — i.e. **authority is keyed by the fact's attribute**.
   - `opeval-step` (line ~150): the admission fold; the dynamic gate is the
     `(not (can? (get p :by) f log))` branch. Reactions are
     `fact → facts-to-propose` functions; proposals are `{:fact f :by author}`.
5. `packages/@forma/ts/src/type/` — the HM inferencer (rows AND effect rows
   already exist and are actively used):
   - `types.ts` — `Type`, `ERow` (`EEmpty | EVar | EExtend`), `Scheme` with
     `evars`; `TFun` carries `effect?: ERow`.
   - `effect-helpers.ts` — ambient effect tracking during inference
     (`withAmbientEffectScope`, `resolveAmbientEffect`).
   - `infer-core.ts` (~line 94, 107) — where ops get `EExtend(effectName, ...)`
     attached to their types today.
   - `unify.ts` — `unifyERows` exists.
6. `packages/@forma/ts/test/forma-zero.test.ts` — how the conformance suite
   runs (13 cases in `packages/@forma/conformance/forma-zero/cases/`, expected
   values in `expected.json`; the same fixtures run against `@forma/ocaml`).

## The design problem

Bridge two things that already exist but don't talk:

- **Static**: effect rows in the inferencer, currently carrying coarse effect
  labels.
- **Dynamic**: `can?` in the admission loop, keyed by fact attribute.

The bridge: when a program (or reaction) can cause `assert` of a fact whose
attribute is statically known, its effect row should carry that attribute as
a label — e.g. a reaction that emits `[s "must" oblig]` facts has an effect
row containing `assert:"must"`. Then:

```
checkAuthority(program, grants) =
  inferred assert-labels of program  ⊆  attributes granted to its author
```

returns either `ok` or the precise list of missing grants — *without running
the program*.

### Design questions you must resolve (write them up before coding)

1. **Label granularity.** `can?` keys on attribute only. Start there
   (labels = attribute string literals). Note in the design doc how the
   scheme extends to subject/value patterns later without rework.
2. **Where `assert` manifests.** In the executable prelude, asserting is not
   a special form — reactions *return* fact vectors and `opeval` admits them.
   Decide where effect labels attach: to a typed `assert` form, to the
   declared type of reactions (`fact → facts-to-propose`), or both. The
   pragmatic anchor: a reaction's return type's fact attributes ARE its
   assert-effects. Verify how `@forma/ts` types vectors/literals well enough
   to read attribute literals out of `[s "must" oblig]`-shaped returns.
3. **Statically unknown attributes.** If a program computes the attribute at
   runtime, the label is not a literal. Options: widen to a `assert:*` label
   that requires a wildcard grant; or reject such programs at the typed-
   authority gate (forcing authors to make attributes literal). Pick one,
   justify it; deny-by-default is the project's stated posture.
4. **Polymorphism.** A higher-order helper that emits whatever its argument
   tells it should get an effect *variable* that closes at the call site —
   the existing `evars` in `Scheme` are designed for this. Make sure
   generalization/instantiation already does the right thing; add tests.
5. **Static vs dynamic.** The dynamic `can?` guard in `opeval` stays — it is
   normative (defense in depth; concurrency can change grants between check
   and admission, see operational-algebra.md §5 "authority under
   concurrency"). The static check is a *pre-admission gate*; state this
   relationship explicitly in the design doc.

## Deliverables, in order

**Phase 0 — design doc.** `specs/vision/typed-authority.md`: the label
scheme, the five decisions above with alternatives considered, the
`checkAuthority` API contract, and worked examples (the `make-obligate` and
`advance` reactions from the prelude, typed). Keep it in the register of the
existing vision docs — kernel-first, derived-forms-second.

**Phase 1 — inference.** Make the inferencer produce attribute-labeled
assert-effects for reaction-shaped programs. Reuse the ambient-effect
machinery; do not invent a parallel mechanism. Unit tests in
`packages/@forma/ts/test/` showing inferred effect rows for: a literal-
attribute reaction, a multi-attribute reaction, a higher-order emitter
(effect var), and a runtime-computed attribute (per your decision in Q3).

**Phase 2 — the gate.** A public API in `@forma/ts` (suggested:
`Type.checkAuthority(source, grants) → { ok: true } | { ok: false; missing: string[] }`
where `grants` is a list of `[who, "can", attr]` facts) that infers the
program and compares its assert-labels against the grants for a given author.
Test it against the same scenarios the dynamic `can?` handles in the
conformance cases — **static and dynamic verdicts must agree** on every case
where attributes are static.

**Phase 3 — conformance.** Add a `typed-authority` suite under
`packages/@forma/conformance/` (separate from forma-zero — `@forma/ocaml` is
untyped-at-runtime today, so this suite is ts-only for now, but write the
fixtures engine-neutrally: case source + grants in, `ok`/`missing` out, like
`expected.json`). Include at least: permitted reaction, denied reaction,
multi-attribute partial denial, higher-order closure at call site.

## Constraints

- **Do not grow the kernel.** No new special forms, no new effects. `assert`
  remains the only effect; authority remains facts + folds. If you feel
  pressure to add a primitive, it belongs in the prelude or the type system.
- **Do not break what exists.** `pnpm --filter @forma/ts test` (23 tests, 13
  conformance cases) and `pnpm --filter @forma/ts typecheck` must stay green.
- **Grants stay facts.** No parallel ACL data structure; `checkAuthority`
  consumes grant facts in the same shape `can?` queries.
- The dynamic guard in `opeval` is not weakened or removed.
- Effect-row work happens in `@forma/ts` only; do not touch `@forma/ocaml`.

## Working notes

- pnpm + turbo workspace; run `pnpm install` then `pnpm --filter @forma/ts build`
  before anything imports built packages.
- The inferencer is Effect-based (`effect` npm package); follow existing
  idioms in `src/type/` (see `infer-core.ts`, `context.ts`).
- When reading `prelude.lisp`, remember keywords evaluate to `":kw"` strings
  and maps are string-keyed (`evalSym` in `src/evaluator/eval-core.ts:98`).
- If a design question can't be resolved from the docs and code, make the
  smallest decision consistent with "deny by default" and record it in the
  design doc's open-questions section rather than blocking.

## Definition of done

1. `specs/vision/typed-authority.md` exists and reads like the other vision
   docs (kernel-first, decisions justified).
2. For the prelude's `make-obligate` reaction, the inferencer reports an
   effect row containing the `"must"` attribute, and
   `checkAuthority` returns `ok` iff the grant table contains
   `[author "can" "must"]`.
3. Static and dynamic verdicts agree on every static-attribute conformance
   scenario; the disagreement cases (runtime attributes) are enumerated and
   handled per the documented decision.
4. All existing tests and typechecks pass; new suites pass; nothing in
   `@forma/ocaml` or the kernel spec changed.
