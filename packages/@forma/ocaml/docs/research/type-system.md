---
title: Type System
status: accepted
created: 2026-03-30
updated: 2026-04-08
capabilities: [type-system, hm, kinds, effects, hkt, typeclasses]
tags: [types]
---

# Type System

Scope and boundaries of onlang's type system. See
[Architecture](../architecture.md) for where this fits in the pipeline
and [Design Decisions](../design-decisions.md) § 2 for the effect-system
choice that shapes how types interact with effects.

## Owns

- Hindley-Milner inference
- kinds, higher-kinded types, and row-shaped effect contexts
- typeclass and constraint semantics
- schema and effect typing contracts shared with elaboration
- diagnostic inputs consumed by hosts and editors

## Boundary

Type inference and type semantics belong to the engine. Editor
presentation of errors and interactive remediation belong to host
tooling (an LSP built on top, a REPL, etc.) — the engine emits typed
diagnostics; how they are rendered is not its concern.

## Future directions

Nominal tagged ADTs, units of measure, type providers, and non-empty
collections are tracked in [Future Directions](./future-directions.md).
