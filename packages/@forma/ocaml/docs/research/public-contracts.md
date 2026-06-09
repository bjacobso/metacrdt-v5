---
title: Public Contracts
status: planned
created: 2026-04-01
updated: 2026-04-01
capabilities: [contracts, syntax, analysis, types, service, api-surface]
tags: [contracts, api, stable]
---

# Public Contracts

Target API shapes onlang should expose to host consumers (compilers,
editors, LSPs) through stable subpaths. These decouple hosts from
engine internals.

These subpaths are not current exports. They are targets for a future
cleanup once the JSON ABI has stabilized and at least one real host
has migrated.

## Contract subpaths

### `onlang/contracts/syntax`

Owns: spans, diagnostics, tokens, syntax trees, normalized form shapes.

Does not own: project loading, type inference, runtime IR.

### `onlang/contracts/analysis`

Owns: standalone semantic analysis over normalized forms, symbol
references, definitions, analysis diagnostics.

Does not own: filesystem access, runtime IR construction.

### `onlang/contracts/types`

Owns: type-provider interface, type display shapes,
hover/completion/definition/reference contracts.

Does not own: a public commitment to a specific HM implementation.

### `onlang/contracts/service`

Owns: document lifecycle, editor/LSP-facing analysis API.

Does not own: project loading, runtime provisioning.

## Dependency rules

Hosts should avoid engine internals (evaluator, vm, builtins) when a
stable contract exists. Until these contracts are implemented, hosts
may consume the concrete descriptor, reader, and type subpaths they
need. Editor-adjacent hosts that embed the engine's concrete tree for
structural editing are the expected exception and should be treated
as intentional tight coupling.
