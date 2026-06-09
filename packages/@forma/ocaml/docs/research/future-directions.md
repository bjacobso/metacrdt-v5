---
title: Future Directions
status: draft
created: 2026-04-08
updated: 2026-04-08
capabilities:
  [
    adts,
    pattern-matching,
    measures,
    type-providers,
    active-patterns,
    effects,
    collections,
    performance,
  ]
tags: [future, types, patterns, effects, performance]
---

# Future Directions

Promising directions for the language, not yet commitments. These
reinforce the architecture already in place: explicit tagged data,
exhaustive dispatch, semantic types over raw primitives, and clean
separation between generic language features and host-specific
vocabulary.

## Goals

- preserve the engine as a host-neutral, reusable foundation
- expand the language with high-leverage primitives rather than
  host-local conveniences
- make DSL authoring safer by giving more meaning to values and
  patterns
- keep hot-path performance visible when language abstractions are
  used at scale

## Guiding principles

### Prefer tagged unions over ad hoc unions

The language should continue to prefer explicit, nominal sum types with stable
discriminants over unstructured "either this shape or that shape" unions.

Why:

- they document intent better at API boundaries
- they support exhaustive pattern matching
- they reduce structural ambiguity as systems grow
- they compose well across parser, analyzer, compiler, and runtime boundaries

The current system already leans this way through `_tag` and `kind`
discriminants. The future language direction should deepen that discipline,
not relax it.

### Keep semantic data nominal

If a union or collection has domain meaning, it should usually have a name.
Language features should make it easy to define nominal types that carry
documentation, invariants, and pattern-matching affordances.

### Design with representation in mind

Type-level expressiveness and runtime representation should be considered
together. A feature that is elegant at the source level but causes pathological
allocation behavior in hot paths may still need a lower-level representation
strategy under the hood.

## Candidate primitives

## 1. Nominal tagged unions and algebraic data types

The language should continue to strengthen support for named algebraic data
types rather than leaning on ad hoc unions.

This is already consistent with the architecture:

- syntax and IR layers use explicit discriminants
- runtime and compiler data structures rely on exhaustive dispatch
- user-facing Lisp forms already point toward explicit `data` declarations

Future work in this area:

- first-class syntax for nominal sum types
- explicit constructor naming and payload typing
- exhaustiveness diagnostics in match expressions
- better contract export so downstream tools can depend on named unions rather
  than inferred structural combinations

## 2. Representation-aware unions and packed layouts

At the source level, discriminated unions are the right abstraction. At runtime,
especially on JavaScript engines, millions of heap-allocated union-shaped
objects can create GC pressure.

The language layer should eventually define an implementation strategy for
representation-sensitive hot paths. This does not mean changing source-level
semantics. It means allowing lower layers or optimized runtimes to choose more
compact physical layouts where appropriate.

Likely directions:

- packed array or typed-array representations for homogeneous AST or IR segments
- compact tag tables plus payload arenas for hot-path evaluation structures
- lower-level encodings for query/runtime kernels where object allocation is too expensive
- preserving the same logical tagged-union semantics at the contract boundary

Boundary note:

- the language layer owns the semantic model
- concrete packing strategies may be implemented in the language VM, compiler backends, or runtime kernels depending on the hotspot

## 3. Units of measure

Units of measure are a strong fit for a language used to model real-world
systems. Many ontology values are not "just numbers"; they are currencies,
weights, durations, distances, rates, or quantities with conversion rules.

Potential goals:

- attach measures to numeric types
- reject invalid arithmetic across incompatible units
- allow explicit conversions and normalization rules
- support dimension analysis for derived values

Examples of language-level benefit:

- prevent accidental addition of incompatible currencies
- distinguish duration from timestamp and quantity from scalar
- encode domain invariants earlier in the authoring loop

Boundary note:

- generic measure semantics belong in the language layer
- ontology-specific unit catalogs or business conversion policies belong above the language layer

## 4. Type providers

Type providers are a good long-term fit for a language that sits next to live
schemas, external APIs, and graph-shaped data sources.

In the generic language layer, a type provider should mean:

- a compile-time or analysis-time interface for discovering types from an external source
- a stable contract for surfacing provided symbols, types, fields, and diagnostics
- reproducible behavior when provider inputs are versioned or cached

Potential uses above the language layer:

- reflecting external SQL schemas
- surfacing graph/entity shapes from a runtime catalog
- importing documented API contracts into the language service

Boundary note:

- the generic provider mechanism belongs in `language/contracts/types`
- provider implementations that inspect ontology/runtime state belong in compiler or runtime integrations, not in the core language package itself

## 5. Active patterns

Pattern matching is already central to the architecture. Active patterns would
extend that model by letting developers define custom matchers that transform,
validate, or classify data during the match itself.

Potential value:

- encapsulate reusable semantic parsing logic
- keep business logic clean by moving recognition rules into named patterns
- make matching useful for more than raw structural decomposition

Examples of what active patterns could express:

- parsing an email-like string into structured parts
- classifying a value into domain-relevant cases
- interpreting graph-backed facts into semantic views before branch selection

Boundary note:

- generic pattern machinery belongs in the language layer
- active patterns that query ontology state must be carefully constrained so compile-time and runtime usage remain legible

## 6. Computation expressions and effect-aware sequencing

The language already lives in an ecosystem that cares deeply about effects,
results, and typed failure. A computation-expression style primitive would make
effectful sequencing more ergonomic than deeply nested conditionals or manual
short-circuit handling.

Possible goals:

- an effect-aware sequencing form analogous to monadic `do` notation
- standard short-circuit behavior for `Result`, `Option`, or `Effect`-like values
- smoother workflow and action authoring where many steps can fail or branch
- improved readability over deeply nested callback-like forms

Related ergonomic primitives:

- a first-class pipe operator for left-to-right data flow
- standard combinators for railway-oriented result handling
- syntax sugar that lowers into existing effect semantics without introducing a separate effect model

Boundary note:

- the language can own the generic sequencing and desugaring rules
- runtime-specific effect constructors still belong to the layers that define those runtime services

## 7. Non-empty and cardinality-aware collections

The language should make it easy to express collection invariants that are
common in modeling work, especially "one or more" requirements.

Potential primitives:

- `NonEmptyList`
- `NonEmptyVector`
- cardinality-aware sequence schemas
- pattern-matching forms that preserve the proof that a head exists

Why this matters:

- many model invariants are cardinality constraints, not just element types
- it reduces repeated runtime checks for "must contain at least one item"
- it maps cleanly to ontology constraints such as minimum cardinality on relationships or fields

Boundary note:

- the generic collection types belong in the language layer
- ontology-level cardinality policies belong in compiler/runtime semantics built on top of them

## Expected layering

These features should be introduced with careful layering:

- `language` owns the generic primitive, semantics, and contracts
- `compiler` may specialize those primitives for ontology authoring
- `runtime` may expose provider inputs, catalogs, or optimized representations
- `application` may surface them in IDE/editor UX, but should not redefine their meaning

## Open questions

- Which of these should become core syntax versus library-plus-desugaring?
- Which features need stable contract surfaces before syntax is finalized?
- How much representation control should the language expose directly versus leaving to implementation?
- How do type providers remain reproducible and cacheable rather than becoming hidden ambient dependencies?
- Which pattern features are safe at compile time, runtime, or both?

## Related

- [Language Layer README](./README.md)
- [Lisp Type System](./type-system.md)
- [Lisp Runtime Substrate](./language-runtime.md)
- [Language Contracts](./contracts.md)
