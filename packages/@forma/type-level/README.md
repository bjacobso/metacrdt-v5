# @forma/type-level

Forma embedded in the TypeScript type system. The type system acts as a
**third forma engine** — alongside `@forma/ts` and `@forma/ocaml` — except this
one runs inside `tsc`. Every call executes with the *real* `@forma/ts`
evaluator (prelude, macros, step limits); the **type** of the result is
computed at compile time by a type-level engine over the same source literal.
The test suite asserts both sides for every case, holding the engines in
agreement the same way the forma-zero conformance suite holds ts and ocaml in
agreement.

## Typed mode (the default): forma types, TS bindings

`forma(source, bindings?)` types the program the way forma's type system sees
it — widened (`number`, not `3`) — and accepts a scope of plain TS values
whose *types* seed the checker and whose *values* seed the evaluator:

```ts
import { forma } from "@forma/type-level";

const n = forma("(+ a b)", { a: 1, b: 3 });
//    ^? const n: number                       — and n === 4 at runtime

const v = forma("(map (fn [x] (* x factor)) xs)", { xs: [1, 2, 3], factor: 2 });
//    ^? const v: number[]                     — [2, 4, 6]

const r = forma(
  `(let [total (reduce (fn [acc o] (+ acc (get o :amount))) 0 orders)]
     {:count (count orders) :total total})`,
  { orders: [{ amount: 10 }, { amount: 20 }] },
);
//    ^? const r: { ":count": number; ":total": number }
```

TS objects cross the boundary as keyword-keyed forma maps (`{ user: { age: 42 } }`
lets the program say `(get user :age)`, typed `number`); arrays become lists.
This is the end-to-end story: TS values flow in typed, forma results flow out
typed, and `(+ 1 "x")` or a misspelled binding is a **compile-time** error:

```ts
type Oops = TypeOf<'(+ 1 "x")'>; // { __formaTypeError: "arithmetic expects numbers" }
```

Widening is what makes this mode scale. There is no tuple arithmetic at all —
`(+ a b)` just checks both sides against `number` — so negatives, floats, and
arbitrarily large values are fine, and `map`/`filter`/`reduce` apply their
closure to the *element type* once instead of once per element. Keywords stay
literal (they are row labels; `get` needs them), everything else widens.
`if`/`cond` over a `boolean` condition produce the union of their branches.

## Exact mode: value-level evaluation in the type system

`formaExact(source)` runs the original party trick — a full type-level
*evaluator* whose result is the literal value:

```ts
const x = formaExact("(+ 1 2)");                        // x: 3
const d = formaExact("(map (fn [x] (* x 2)) [1 2 3])"); // d: [2, 4, 6]
const g = formaExact("(get {:a 1 :b 2} :b)");           // g: 2
```

Exact mode carries the heavy machinery and its caps: tuple-counter arithmetic
limits operands to 3 digits (results may be larger — `(* 150 40)` is exactly
`6000`), no negatives or floats, and per-element list traversal. Typed mode
has none of these.

## Pure type-level API (no runtime at all)

```ts
type T = TypeOf<"(+ a b)", { a: number; b: number }>; // number
type V = Infer<"(+ 1 2)">; // 3
type A = Ast<"(+ 1 2)">; // typed AST, mirrors @forma/ts SExpr minus loc
```

`parse(source)` returns the real reader's output (locations stripped) typed as
`Program<S>` — already enough for typed inline DSL authoring: a function can
accept forma source written inline in TS and pattern-match its structure at
the type level.

## How it works

- `src/lex.ts` — `Tokenize<S>`: template-literal-type lexer.
- `src/parse.ts` — `Parse<S>` / `ParseProgram<S>`: recursive-descent parser
  producing AST types structurally identical to `@forma/ts` `SExpr` (minus `loc`).
- `src/infer.ts` — typed mode: an abstract interpreter over widened types,
  with type-level closures checked at application sites.
- `src/eval.ts` + `src/nat.ts` — exact mode: the same interpreter shape over
  literal values, with tuple-counter arithmetic.

Both modes support: literals, keywords, `nil`, vectors, map literals,
`if` `cond` `let` `do` `fn` and top-level `define`/`def`, arithmetic,
comparisons, `not`/`and`/`or`, `str`, and `count` `nth` `first` `rest`
`concat` `conj` `get` `map` `filter` `reduce` — including closure application
like `((fn [x] (* x x)) 7)`.

## Known limits (and why)

- **No tagged templates.** ``forma`(+ 1 2)` `` can't work: TypeScript types
  the strings of a tagged template as `TemplateStringsArray`, which erases the
  literal type (microsoft/TypeScript#33304). `forma("(+ 1 2)")` and
  ``forma(`(+ 1 2)`)`` both preserve it via a `const` type parameter.
- **No type-level recursion in user functions** — a `define`d function can be
  called but can't call itself at the type level (the closure captures the env
  from before its own binding). The runtime engine has no such limit.
- **Source length** is bounded by tsc's ~1000-iteration tail-recursion cap in
  the lexer — fine for expressions and small programs, not the 6800-line
  prelude.
- **Typed mode is a checker, not full HM** — there's no unification, so a
  standalone `fn` has no principal type; closures are typed at application
  sites (like a type-level abstract interpreter). `reduce` approximates its
  fixpoint with one step: `Init | Apply<F, [Init, El]>`.

## Where this could go

- Run a slice of the forma-zero conformance suite at the type level — three
  engines, one fixture set.
- Real type-level unification (forma's HM lives in `@forma/ts/type`) would
  give standalone function types and let `fn` values escape to TS as
  `(x: number) => number`.
- Wire typed mode into the Convex layer: queries that accept forma source +
  bindings and return values typed end-to-end in app code.
