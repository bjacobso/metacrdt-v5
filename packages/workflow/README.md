# @metacrdt/workflow

Portable workflow semantics for MetaCRDT.

This package owns pure workflow step types, value resolution, DAG validation, wait-key derivation, flow-definition lowering, and target-neutral step transitions. It does not own Convex mutations, `ctx.db`, scheduler execution, fact writes, branch solving, external actions, or flow-run persistence.

It depends on `@metacrdt/core`, `@metacrdt/query`, `@metacrdt/runtime`, and `effect`, matching the workflow/collect extraction plan and the package-consolidation layering rules.
