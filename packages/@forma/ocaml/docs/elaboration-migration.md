# Descriptor Elaboration Migration

`define-elaboration` is now implemented by both the OCaml and TypeScript
engines. The migration is in steady-state execution: new structural construct
hooks should be authored as descriptors, existing structural `meta-fn
.../construct` bodies should be replaced by descriptors one form at a time, and
the parity gates protect each replacement.

## Current State

Migrated construct hooks:

- `record/construct`: descriptor exists; Lisp fallback remains for parity.
- `entity/construct`: descriptor exists; Lisp fallback remains for parity.
- `relation/construct`: descriptor-only. This is the first net deletion of a
  construct `meta-fn` body.
- `action/construct`: descriptor-only. This proved expression slot projection
  through `:slot-runtime-expr`.
- `mutation/construct`: descriptor-only. This keeps mutation construction
  aligned with the action descriptor shape.
- `workspace/construct`: descriptor-only. This proved repeated string slot
  projection through `:slot-string-list`.
- `link/construct`: descriptor-only. This proved derived summary names through
  `:format` and child arrays with expression-valued fields.
- `constraint/construct`: descriptor-only. This proved default values,
  first-present slot aliases, and conditional companion refs.
- `document-localized/construct`: descriptor-only. This proved nameless
  summaries.
- `document/construct`: descriptor exists; Lisp fallback remains for parity.
  This proved primitive-backed projection with `:primitive attribute-binding`
  for the shared `:bind` slot decoder.
- `document-locale/construct`: descriptor-only. This proved that parent
  descriptors should own nested sub-IR projection for roles, sections,
  localized fields, and options.
- `task-definition/construct`: descriptor-only. This proved conditional object
  construction for optional companion payloads.
- `process/construct`: descriptor-only. This proved first-child object
  projection, nested child arrays, and positional expression projection.

Descriptor-only hooks are first-class implementations. The
`OO_LANG_DISABLE_NATIVE_ELABORATION=1` flag disables descriptor dispatch only
when a Lisp fallback still exists. If no fallback exists, the descriptor stays
active so parity and corpus gates keep working after a `meta-fn` body is
removed.

## Migration Rule

For each candidate hook:

1. Add a `define-elaboration` with its own binding name and a `(:hook ...)`
   reference. Never bind the hook symbol itself.
2. Run the OCaml and TypeScript descriptor-vs-fallback parity gates while the
   Lisp body still exists.
3. Delete the Lisp body only if the descriptor vocabulary already expresses the
   hook honestly.
4. Run corpus emission, OCaml target parity, TypeScript parity, and
   cross-engine language-e2e checks after deletion.

Do not add a descriptor clause kind just to make one form migrate. New clause
kinds must name a reusable structural operation or a deliberately named
primitive.

## Nested Sub-IR Forms

Forms such as `page`, `field`, `option`, `completion-mutation`, `role`,
`section`, `locale-field`, `trigger`, `node`, `guard`, and `edge` are nested
sub-IR forms in the current corpus. The grep pass found nested uses, not
standalone `define-page`, `define-role`, or equivalent declaration-level forms.

That means author-side reuse of these fragments belongs to expansion time:
authors can use macros to expand a shared fragment before elaboration sees the
parent form. The descriptor layer should not grow `:include`, shared-shape, or
fragment-reference syntax unless a real declaration-level caller appears.

The current form descriptors still carry `:construct-fn` references for many of
these nested forms. When a parent descriptor owns the sub-IR projection, replace
the child form's `:construct-fn` with `:constructed-by parent-elaboration`.
The descriptor registry validates that the named parent elaboration projects the
child form. If the wrapper slot name differs from the child form name, use
`:child`, as in `(:constructed-by document-locale-elaboration :child field)`.

First proved deletions:

- `role/construct`, `section/construct`, and `locale-field/construct` were
  deleted after `document-locale-elaboration` became the parent-owned projection.

## View Design Pass

`view/construct` should not be migrated by simply adding clause kinds as the
current body is translated. It contains several distinct concepts:

- Simple slot reads: `description`, `query`, `title`, `subject`, `mode`,
  `empty-state`, and `loc`.
- Runtime expressions: `where`, `row-action`, column `expr`, state `initial`,
  named-query `params`, and layout expressions.
- String-list reads: inline `column`, `default-sort`, and named-query
  `depends-on`.
- Conditional object construction: `defaultSort` is absent when the list is
  empty, otherwise it emits `{ field, direction }` with a derived direction.
- Child maps: `state`, `input`, `queries`, and `defs` are maps keyed by child
  identifiers, not arrays.
- Hosted primitives: `meta/compile-descriptor-tree` and
  `view/compile-expr-record` are semantic transforms, not structural reads.
- Shared hook routing: `define-view` and `define-view-component` both route to
  `view/construct`, but they use different fallback names in their descriptor
  `:construct` metadata.

The first two items are probably reusable structural vocabulary:

- `(:slot-expr name)` should mirror existing `:slot-string` and
  `:slot-symbol`.
- `(:slot-runtime-expr name)` should mirror `meta/slot-runtime-expr`. This is
  already implemented for `action/construct`.
- `(:slot-string-list name)` should return the normalized list value.
- `(:format ...)` should concatenate scalar source values and literal strings
  for descriptor-local names such as link summaries.
- `(:default source "fallback")` should preserve truthy values and substitute
  the fallback for nil/false.
- `(:first source...)` should return the first truthy source value, primarily
  for canonical aliases such as `:action` / `:mutation`.
- `(:ref "Kind" source)` should emit `{ kind, name }` only when the source has
  a scalar value.
- `(:object (:field key source)...)` should emit a nested object by evaluating
  structural field sources in order.
- `(:child child-name (:field key source)...)` should emit the first matching
  child form as a nested object, or nil/null when absent.
- `(:children child-name (:field key source)...)` should emit each matching
  child form as a nested object array. This is now a general source, not a
  top-level-only field shape.
- `(:positional index)` should emit the raw positional argument at `index` for
  cases where the authored form intentionally carries an expression outside a
  named slot.
- `(:primitive name source)` should call a closed, native primitive decoder
  after evaluating `source`. The first primitive is `attribute-binding`, which
  turns the flat `:bind` string-list convention into `AttributeBinding` IR.
- `(:when condition source)` should emit the nested source only when the
  condition is truthy; otherwise it emits nil/null. This covers optional
  wrapper objects like task assignees and scopes without imperative hooks.
- A descriptor with no `:name` clause should emit a nameless `$summary`; this
  covers aggregate declarations like `DocumentLocalized`.

The child-map cases are also likely structural if expressed as one reusable
shape:

```lisp
(:field state (:child-map state
  (:key name)
  (:field kind (:slot-string type) (:default "null"))
  (:field type (:slot-string type) (:default "null"))
  (:field initial (:slot-value initial))))
```

That implies one additional source kind, `:slot-value`, because `state.initial`
uses literal decoding rather than string or symbol projection.

The hosted transforms are not structural. They should be named primitives, not
general expression evaluation inside the descriptor language:

```lisp
(:field root (:primitive viewspec/layout-root
  (:layout (:slot-expr layout))
  (:defs (:child-map def ...))))
```

The descriptor interpreter can implement the primitive in OCaml and TypeScript,
but the primitive name is authored data. This keeps the descriptor language
small and avoids turning `define-elaboration` into a second Lisp interpreter.

That boundary is now implemented for `attribute-binding`: the prelude declares
`define-elaboration-primitive attribute-binding`, and both engines expose a
closed native decoder under that name. The declaration records the language
surface; it does not permit arbitrary runtime calls from descriptors.

## View Decision

Before migrating `view/construct`, choose between these outcomes:

- If the view body can be expressed with `:slot-expr`, `:slot-string-list`,
  `:slot-value`, `:child-map`, and one named `viewspec/layout-root` primitive,
  migrate it as descriptor-only.
- If layout compilation needs broader imperative access to the hosted DSL
  registry, keep `view/construct` as a `meta-fn` escape hatch and migrate other
  purely structural hooks first.

Do not migrate `query/construct` as a warm-up before this decision. Query has
semantic declaration lookups, type annotation synthesis, slot refs, and query
select-field normalization. It is not a simpler version of view; it needs its
own primitive analysis.

Current decision: `view/construct` and `query/construct` are deliberate
imperative outliers, not migration backlog. Leave them as `meta-fn` bodies
unless their semantic transforms become authored primitives with a clear
cross-engine contract.

## Likely Next Structural Targets

The remaining high-value targets are no longer purely structural warm-ups.
`view/construct`, `query/construct`, and `pdf-mapping/construct` each need a
named primitive or a focused semantic analysis before migration.

`field/construct` shares the same `attribute-binding` primitive as
`document/construct`, but it should not be migrated as a top-level descriptor
until child-form summary semantics are explicit. The current descriptor runner
emits `$summary` for declaration-level hooks; `field` values are child IR
objects nested under `Document.pages[].fields[]`, not package declarations.
