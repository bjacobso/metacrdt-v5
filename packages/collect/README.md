# @metacrdt/collect

Portable collection semantics for MetaCRDT.

This package owns pure form-definition lowering, submission validation, submission-to-fact derivation, requirement clause emission, scope-key helpers, and collection token predicates. It does not own Convex mutations, `ctx.db`, scheduler wiring, URL routing, token generation, or collection-run persistence.

It depends only on `@metacrdt/core` and `@metacrdt/query`, matching the workflow/collect extraction plan and the package-consolidation layering rules.
