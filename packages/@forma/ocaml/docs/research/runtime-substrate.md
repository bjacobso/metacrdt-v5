---
title: Runtime Substrate
status: accepted
created: 2026-03-30
updated: 2026-04-08
capabilities: [lisp, parser, expansion, vm, evaluator, runtime-substrate]
tags: [runtime, evaluator]
---

# Runtime Substrate

The generic Lisp runtime onlang exposes to hosts. This is the substrate on
which domain vocabularies (entity forms, query forms, API forms) are
registered through preludes; it is not itself a domain language.

## Owns

- parsing and source representation contracts
- macro expansion boundary
- evaluator and (future) VM runtime boundary
- normalization rules before runtime execution
- generic execution semantics used by elaboration and runtime evaluation

## Key rule

The substrate is host-neutral language infrastructure. It is distinct
from any host that exposes a domain-authoring environment on top of it.
See [Design Decisions](../design-decisions.md) § 3 for why no domain
vocabulary lives in the engine.

## Future directions

Active patterns, effect-aware sequencing forms, and representation-aware
packed layouts are tracked in
[Future Directions](./future-directions.md).
