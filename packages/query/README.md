# @metacrdt/query

Target-neutral Datalog building blocks for MetaCRDT. State in MetaCRDT is a fold,
and derivation is just another fold — Datalog rules over facts. This package owns
the **pure** parts of that derivation: clause syntax, term operations, the
clause-pick planner, projection, pagination, aggregation, and rule-locality
analysis. It deliberately does not execute against any store.

## What Query Owns

- **Clause syntax & parsing** — `Term`, `PatternClause`, `CompareClause`,
  `ComputeClause`, `NotClause`, `OrClause`, and `parseTerm` / `parsePattern` /
  `parseClause` / `parseClauses`.
- **Term operations** — `resolveTerm`, `termVars`, `requiredVars`,
  `patternVars`, `clauseBoundVars`, `unifyPattern`, `valueKey`.
- **Planning** — `dynamicSelectivity`, `chooseNextClausePosition`,
  `selectNextClause`, `advanceBoundVars`, `initialSolverFrame`,
  `branchExternalRequiredVars` — the pure scheduler state for solving a body.
- **Comparison & compute predicates** — `COMPARISON_OPS`, `COMPUTE_OPS`,
  `compareValues`, `satisfiesCompare`, `computeValue`, `applyCompute`
  (deterministic arithmetic/string folds over already-bound variables).
- **Provenanced bindings** — `ProvenancedBinding`, `dedupeProvenancedBindings`,
  `extendProvenancedBinding`, `extendPatternCandidates`(`WithinLimit`),
  `passesNegationCandidates`, `filterCompareStates`, `applyComputeStates`,
  `mergeUniqueSources`, `patternInputForBinding`.
- **Projection, pagination, aggregation, emit shaping** — `project`,
  `paginateRows` / `ResultPage`, `aggregateBindings` / `AggSpec`,
  `derivedRowsFromBindings` / `resolveEmitTerm` / `DerivedRow`.
- **Limits & description** — `LIMITS`, `assertIntermediateRowsWithinLimit`,
  `describeClauses` for `explain`-style output.

## What Query Does Not Own

- Triple fetching, indexes, or read authorization — a **target** supplies the
  `TripleSource`; the reference runtime owns Convex-specific fetching, async join
  execution, negation I/O, and branch recursion.
- Materialization storage (`derivedFacts`) — that is the target/runtime.
- The event fold and visibility — that is `@metacrdt/core`.

The package is a library of pure helpers the solver composes; the I/O-bound
solving loop stays in the consuming runtime until the boundary is fully proven.

## Dependencies

None today. Operates over plain binding/triple shapes so any source — event log
or projection — can be injected by the caller.

## Relation to SPEC

Query implements the *derivation* discipline of [SPEC.md](../../SPEC.md): derived
values are pure deterministic folds over the same fact set. Because the helpers
are pure and order-disciplined, derivation converges wherever the base facts do.

## Usage

```ts
import { parseClauses, chooseNextClausePosition, project, aggregateBindings } from "@metacrdt/query";
```

## Extraction Boundary

This package must not import from `.context/open-ontology`. It is peeled
incrementally from `convex/lib/engine.ts` (and will absorb Open Ontology's
`logic-ast`); see [docs/package-consolidation.md](../../docs/package-consolidation.md).
