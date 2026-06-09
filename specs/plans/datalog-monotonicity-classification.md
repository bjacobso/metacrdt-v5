# Datalog Monotonicity Classification

## Status

Spec ready. Implementation pending.

## Goal

Classify every Datalog rule as `monotone`, `non_monotone`, or `unknown` so the
runtime can distinguish CALM-backed convergence from deterministic `prec`-fold
convergence.

This is a metadata feature first: it should not change rule results. It makes
the convergence claim explicit in the engine and gives materializers a stable
hook for future scheduling choices.

## Definitions

- `monotone`: adding visible input facts cannot remove emitted facts for the
  same rule.
- `non_monotone`: adding visible input facts can remove or change emitted facts.
- `unknown`: the classifier cannot prove monotonicity from syntax.

The initial classifier is deliberately syntactic and conservative.

## Rule Syntax

Treat these clauses as monotone:

- positive triple patterns: `["?e", "attr", "?v"]`
- conjunction / join
- projection through `emit`
- equality and constant selection, when represented as positive binding
  constraints
- union, if the local rule language grows explicit disjunction

Treat these clauses as non-monotone:

- negation: `{ not: [...] }`
- set difference / anti-join aliases
- aggregation that can decrease or replace an output when inputs grow
- cardinality-one winner selection or any rule that observes "current value" as
  a singleton instead of the underlying event set

Treat these clauses as `unknown` until a narrower proof exists:

- custom predicates
- host callbacks
- external reads
- recursive rules other than the existing positive transitive closure form
- aggregates explicitly declared as lattice-monotone but not yet verified by
  the classifier

## API

Add a pure helper near the rule engine:

```ts
type RuleMonotonicity = "monotone" | "non_monotone" | "unknown";

type RuleMonotonicityReport = {
  classification: RuleMonotonicity;
  reasons: string[];
};

function classifyRuleMonotonicity(rule: {
  where?: unknown[];
  emit?: { e: string; a: string; v: unknown };
  closure?: unknown;
}): RuleMonotonicityReport;
```

The report must be deterministic and serializable.

## Persistence

Add optional fields to `rules`:

- `monotonicity?: "monotone" | "non_monotone" | "unknown"`
- `monotonicityReasons?: string[]`

`defineRule` computes these fields when a rule is created or updated. Existing
rules can be backfilled lazily by the next rule update or by a one-shot
migration.

## Runtime Behavior

For this slice:

- rule evaluation is unchanged
- conformance output may include monotonicity checks
- UI/API surfaces may show the tag

Later slices may use the tag:

- `monotone`: stream/materialize incrementally when possible
- `non_monotone`: re-fold or invalidate prior output on late arrivals
- `unknown`: use the conservative `non_monotone` materialization path

## Tests

Add classifier tests for:

- positive requirement rule: `monotone`
- task rule with `not submitted.<form>`: `non_monotone`
- positive transitive closure: `monotone`
- unknown/custom predicate: `unknown`
- aggregate placeholder: `non_monotone` unless explicitly whitelisted

Add a rule-definition test that persists the computed tag and reasons.

## Acceptance Criteria

- Every newly defined rule has a monotonicity report.
- Existing compliance requirement rules classify as `monotone`.
- Existing compliance task rules classify as `non_monotone`.
- No existing rule result changes.
- Typecheck and Datalog/compliance tests pass.

## Non-Goals

- No coordination or watermark protocol.
- No proof of user-authored custom predicates.
- No optimizer changes until the metadata is shipped and visible.
