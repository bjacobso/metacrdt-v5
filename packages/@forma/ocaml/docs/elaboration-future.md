# Elaboration: Future Direction

This document describes where the descriptor elaboration language is heading.
It is a vision, not a current spec. The current spec is in
`elaboration-migration.md`; the load-bearing decisions that constrain the
direction are in `design-decisions.md`.

The purpose of this doc is to anchor `view/construct` and `query/construct`'s
status as deliberately deferred imperative outliers, give future contributors
(human and agent) a map of where the descriptor language is going, and make
the cost of getting there explicit so the decision to pick it up is informed.

## The boundary the descriptor language hits today

The current descriptor language is closed under one operation: walk a form,
pull declared slots, recurse on declared children, emit a typed IR object. It
has named primitives (`attribute-binding`) for non-structural decoders that
recur across forms. It does not have:

- **Cross-form analysis.** A descriptor cannot reference another declaration
  in the env, walk its slots, or extract types from its fields.
- **Cross-namespace recursion.** A descriptor cannot dispatch into a peer
  elaboration system (the `viewspec` namespace, hypothetical SQL or
  state-machine dialects) and incorporate its result.
- **Bindings.** Every `:field` sources directly from the input form. There
  are no intermediate values that other clauses can reference.
- **Types.** Primitives have implicit signatures. Misuse fails at runtime
  with corpus parity, not at descriptor-compile time.

Two prelude hooks expose these gaps:

- `query/construct` resolves the entity referenced by `:from`, walks its
  field declarations, and derives type annotations for each `select` field.
  This needs cross-form analysis.
- `view/construct` calls `meta/compile-descriptor-tree "viewspec"` on a
  layout expression, recursively compiling that expression through a peer
  elaboration namespace whose result becomes part of the view IR. This needs
  cross-namespace recursion.

Both remain `meta-fn` bodies. The architecture explicitly permits this — the
descriptor language is structural projection; `meta-fn` is the escape hatch
for genuine imperative logic. Pinning that boundary keeps the descriptor
language small and honest about its scope.

## The maximally ambitious endpoint

Lift descriptors from a structural projection notation into a small, total,
typed dataflow language for elaboration. Three pillars:

### 1. Bindings turn the descriptor into a DAG

Today every `:field` is independent. Add `:bind` to introduce intermediate
values that other clauses reference:

```lisp
(define-elaboration query-elaboration
  (:hook query/construct)
  (:form define-query)
  (:kind "Query")
  (:result-type "List")
  (:name name (:declaration-name) (:default "anonymous-query"))

  (:bind from-name   (:slot-string from))
  (:bind from-decl   (:lookup-declaration from-name :kind "Entity"))
  (:bind where-field (:slot-string where))
  (:bind where-type  (:type-of (:field-of from-decl where-field)))
  (:bind select-fields (:query-select-fields))
  (:bind select-types
    (:assoc-from select-fields
      (:fn-source (:type-of (:field-of from-decl :it)))))

  (:field from         (:ref from-name))
  (:field from-ref     (:ref-companion "Entity" from-name))
  (:field select       (:ref select-fields))
  (:field where        (:slot-runtime-expr where))
  (:field typeAnnotations
    (:object
      (:field where  (:ref where-type))
      (:field select (:ref select-types))))
  (:field loc (:loc)))
```

The descriptor stops being a tree and becomes a directed acyclic graph: each
`:bind` is a node, each `:field` is an output. The descriptor compiler
topo-sorts the graph and runs nodes in dependency order. Cross-form lookups
(`:lookup-declaration`, `:field-of`, `:type-of`) become primitive operations
in the calculus, not Lisp escape hatches.

The seed of this is the `:primitive` mechanism that already exists for
`attribute-binding`. The future shape is to promote primitives to a typed
operation taxonomy with declared signatures and a uniform invocation form.

### 2. Named effects make cross-namespace elaboration declarative

For `view`'s peer-namespace problem, give the descriptor language a single
primitive that dispatches into another registered elaboration namespace:

```lisp
(define-elaboration view-elaboration
  (:hook view/construct)
  (:form define-view)
  (:kind "View")
  (:result-type "ViewDef")
  (:name name (:declaration-name) (:default "anonymous-view"))

  (:bind layout-expr (:slot-expr layout))
  (:bind layout-tree (:elaborate-in viewspec layout-expr))
  (:bind defs-map
    (:assignments def
      (:key name)
      (:value (:elaborate-in viewspec (:slot-expr layout)))))
  (:bind root-tree
    (:if defs-map
      (:assoc layout-tree :defs defs-map)
      (:ref layout-tree)))

  (:field root   (:ref root-tree))
  (:field layout (:ref root-tree))
  ...)
```

`:elaborate-in <namespace> <expr>` is a named effect. The runtime dispatches
to the named namespace, runs the descriptors registered there against the
expression tree, and returns the result. The `viewspec` namespace itself is
built out of `define-elaboration` declarations, same as the canonical IR
namespace; namespaces are first-class registers rather than ad-hoc
compiler invocations.

This generalizes beyond view. Future namespaces — a SQL dialect for queries,
a state-machine dialect for processes, a UI grammar beyond viewspec — plug
into the same mechanism.

### 3. Types make the calculus checkable

Every binding and field has a derived or declared type. Every primitive has
a typed signature:

```
:slot-string         : Slot[String?]
:slot-string-list    : Slot[List[String]]
:identifier          : Slot[String?]
:lookup-declaration  : (String, :kind String) -> Decl[K]?
:field-of            : (Decl[K], String) -> FieldDecl?
:type-of             : FieldDecl -> Type?
:elaborate-in        : (Namespace, Expr) -> IR?
```

The descriptor compiler runs Hindley-Milner over the dataflow graph and
either produces a typed elaboration plan or rejects the descriptor at
compile time. Misnaming a slot, plugging a string-list into a string field,
looking up a declaration of the wrong kind — all become compile errors with
spans, not runtime mysteries.

This is where the architectural payoff compounds: once descriptors are
typed, authoring tools can derive editor schemas from them, the IR's
expected shape becomes a property of the language rather than a runtime
convention, and descriptor compilation is itself a typecheckable operation
that fails early.

## What this enables beyond view and query

Eliminating the two imperative outliers is the surface motivation. The
deeper wins follow from the structure:

- **Bidirectional projection for the structural subset.** Descriptors that
  do not invoke cross-form effects (`:lookup-declaration`, `:elaborate-in`)
  are pure functions of their input form. Their inverse exists, which gives
  free IR-to-form reconstruction for authoring UIs, diff views, and
  round-trip serialization. The type system tags each descriptor as
  `Forward` or `Bidirectional` based on whether it touches effects.
- **Incremental elaboration.** Each `:lookup-declaration from-name` is a
  tracked edge in the elaboration graph. When the entity referenced by
  `from-name` changes, only descriptors with that edge re-run. For a
  thousand-file ontology this is the difference between "recompile
  everything" and "recompile what depends on the change." Salsa-style
  memoization, internal to the elaborator.
- **Static analyzability for agents and humans.** "What does this elaborator
  depend on" becomes a graph query. "If I rename this entity field, what
  view IRs change" is answerable from descriptor metadata alone, without
  running the elaborator.
- **Cross-namespace composition.** Today viewspec is special-cased through
  an opaque `meta/compile-descriptor-tree` call. With `:elaborate-in`,
  arbitrarily many elaboration namespaces compose through the same
  primitive. The architecture stops privileging one peer compiler.
- **`meta-fn` becomes removable.** `meta-fn` is the imperative form that
  exists because the declarative form is not yet expressive enough. Once
  the declarative form covers everything, `meta-fn` can be retired from the
  language entirely. The kernel's interpreter stops needing to be a full
  Lisp; it can shrink to a small typed evaluator over descriptors.

## What it costs

This is a research-quality redesign of the elaboration layer, not a slice.

- **It is a new language design.** Bindings, effects, type signatures for
  primitives, namespace dispatch, dataflow semantics. The design has to
  land in two engines (OCaml and TypeScript) and the prelude.
- **The type system is the hard part.** Hindley-Milner over the descriptor
  dataflow with primitives that have polymorphic signatures (lookup returns
  `Decl[K]` parameterized by kind) is non-trivial. The wrong shape produces
  a language that looks elegant on paper but is hostile to author.
- **Cross-namespace semantics have subtle questions.** What does
  `viewspec`'s elaboration return — a Lisp value, an IR object, a typed
  thing? Same env or a fresh one? How do errors in the peer namespace
  surface, with which spans? These are real questions, not hand-waving.
- **The imperative side already works.** `meta/lookup-declaration` and
  `meta/compile-descriptor-tree` exist today as `meta-fn` primitives. The
  work is not implementing cross-form lookup; it is giving it a typed
  declarative surface and threading it through the descriptor compiler in
  both engines.
- **Estimated scope: multi-month.** Same league as the module system and
  the persistent query graph.

## A middle path

Most of the wins from the maximally ambitious version come from bindings
and named effects. Types, bidirectional inversion, and reactive incremental
elaboration are deeper and independently large.

A middle path that eliminates the imperative outliers without committing to
the typed-calculus architecture:

1. **Add `:bind` and a few cross-form primitives** — `:lookup-declaration`,
   `:field-of`, `:type-of` — without a real type system. Untyped, but
   expressive enough to migrate `query`. Roughly one week per engine.
2. **Add `:elaborate-in <namespace>`** as a primitive that dispatches to a
   registered peer elaborator. No type analysis across namespaces; just a
   function call expressed declaratively. Migrates `view`. Roughly three
   days per engine.
3. **Skip the type system, the bidirectional inversion, and the reactive
   incremental elaboration.** These are the deep wins, but each is large
   and not gated on view/query parity.

This is two-to-three weeks of total work across both engines and the
prelude. It eliminates the imperative outliers. It does not graduate the
descriptor language into a typed calculus.

## Sequencing relative to other architectural work

The typed-dataflow elaborator is not the right next step from the current
state. Two structural changes have higher leverage at the language scale we
care about (a thousand-file ontologies):

- **A module system with explicit imports** unblocks parallelism, scoped
  type checking, and incremental rebuild. It is the single biggest lever
  for both author comprehension and compile speed.
- **A content-addressed query graph for the build pipeline** turns daemon
  restart and CI runs into hash-validated cache loads.

The typed-dataflow elaborator works _better_ on top of these because its
cross-namespace and cross-form references are already defined within a
clean dependency graph. Doing the typed elaborator first means redesigning
parts of it later when modules land. Doing modules and the query graph
first gives the typed elaborator a foundation it can lean on.

The honest sequencing:

1. Finish the descriptor migration trivial wave (deletes vestigial
   `meta-fn` bodies).
2. Pin `view` and `query` as deliberate imperative outliers in
   `design-decisions.md` referencing this doc.
3. Module system with explicit imports.
4. Content-addressed query graph.
5. Typed-dataflow elaborator (this doc), once the foundation exists.

If you find yourself reaching for this doc to migrate `view` or `query`,
ask first whether modules and the query graph have landed. If not, the
middle path (untyped `:bind` and `:elaborate-in`) is the right scope. If
they have, the maximally ambitious version is the right scope, because
each layer it depends on is already in place.

## Decision criteria

This work is worth picking up when at least three of the following are
true:

- The module system and query graph have landed.
- Authoring tools (form editors, diff displays) need bidirectional
  projection from IR to form.
- A second peer elaboration namespace appears beyond `viewspec`, making
  cross-namespace dispatch a recurring need rather than a special case.
- Typed elaboration errors are recurring sources of agent/human confusion
  during authoring.
- The `meta-fn` mechanism becomes a meaningful drag on engine size,
  startup, or correctness — likely once the kernel grows to cover more of
  the language and the imperative interpreter starts to feel oversized.

If fewer than three are true, the middle path or the status quo is the
correct decision.

## Status

This doc is intentionally light on implementation detail. The shape of the
typed calculus, the invocation syntax, the namespace-dispatch semantics —
all of these will change when this work begins, informed by what the
foundation layers look like at that point. The purpose here is to record
direction, not to lock in design. The decisions that _are_ load-bearing
about the descriptor language today are in `design-decisions.md`; the
current execution state is in `elaboration-migration.md`; this doc points
forward.
