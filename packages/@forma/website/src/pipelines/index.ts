import { PRELUDE_SOURCE } from "@forma/ts/expander";
import type { PipelineDef } from "./types";

const helloSource = `(let [rate 150
      hours 40
      revenue (* rate hours)
      cost 4000
      margin (- revenue cost)
      margin-pct (/ margin revenue)]
  {:revenue revenue
   :cost cost
   :margin margin
   :margin-pct (round (* margin-pct 100))})`;

const pipesSource = `(define orders [12 30 18 7])

(->> orders
  (map (fn [total] (* total 100)))
  (reduce + 0))`;

const typesSource = `(fn [x] (+ x 1))`;

const typesRecordSource = `(fn [order]
  (+ (get order :subtotal) (get order :tax)))`;

const typesBrokenSource = `(fn [x] (+ x "oops"))`;

const gradesSource = `(define grade (fn [score]
  (cond
    (>= score 90) "A"
    (>= score 80) "B"
    (>= score 70) "C"
    (>= score 60) "D"
    :else "F")))

(map grade [95 82 75 63 45])`;

const entitiesSource = `(define-entity Customer
  [:id String]
  [:email String]
  [:plan Keyword])

(define-query activeCustomers
  (from Customer)
  (where (= :plan :pro))
  (select [:id :email]))`;

const effectTsSource = `(checkout
  {:cart-id "cart_123"
   :customer-id "cus_456"
   :coupon "SUMMER"})`;

const alchemySource = `(define-stack forma-demo
  (worker api
    :route "/api/*"
    :runtime :cloudflare)
  (kv sessions)
  (durable-object pipeline-cache))`;

const threadLastMacro = preludeSection(";; ->>") ?? `(define-macro ->> [x & forms]
  ...)`;

export const pipelines: readonly PipelineDef[] = [
  {
    id: "hello",
    title: "A Tiny Program",
    tagline: "Numbers and maps flow from source text into a concrete value.",
    badge: "live",
    source: helloSource,
    passes: ["parse", "evaluate"],
    narration: [
      {
        stage: "source",
        md: "Start with a small accounting expression. It is plain text, but every bracket and symbol will become structured data.",
      },
      {
        stage: "parse",
        md: "The read pass turns characters into an S-expression tree. Forma keeps spans, so every tree node still knows where it came from.",
      },
      {
        stage: "evaluate",
        md: "Evaluation runs the program in your browser and returns a map. The compiler did not need a server to understand or run this source.",
      },
    ],
  },
  {
    id: "pipes",
    title: "The Pipe Operator Is a Library",
    tagline: "Threading syntax expands away before the rest of the compiler sees it.",
    badge: "live",
    source: pipesSource,
    passes: ["parse", "expand"],
    context: {
      label: "Prelude macro loaded before expansion",
      code: threadLastMacro,
    },
    narration: [
      {
        stage: "source",
        span: [29, 33],
        md: "`->>` looks like built-in syntax, but it is just a macro from the Forma prelude.",
      },
      {
        stage: "expand",
        md: "After expansion, the pipe is gone. What remains is ordinary function application that the later passes already understand.",
      },
    ],
  },
  {
    id: "types",
    title: "Types Without Writing Types",
    tagline: "Infer the shape of a function from how its body uses values.",
    badge: "live",
    source: typesSource,
    passes: ["parse", "expand", "typecheck"],
    variants: [
      {
        id: "inferred",
        label: "Scalar",
        source: typesSource,
        stage: "typecheck",
        description: "Scalar function inference path.",
      },
      {
        id: "record-row",
        label: "Record",
        source: typesRecordSource,
        stage: "typecheck",
        description: "Infer an open record shape from field reads.",
      },
      {
        id: "type-error",
        label: "Type error",
        source: typesBrokenSource,
        stage: "typecheck",
        description: "Real typecheck diagnostic path.",
      },
    ],
    narration: [
      {
        stage: "source",
        md: "There are no type annotations here. The body adds one, so the argument and result are constrained by use.",
      },
      {
        stage: "typecheck",
        md: "The typecheck pass produces the headline inferred type and a table of every expression type the engine exposes. The record variant infers a row shape from `get` calls.",
      },
      {
        stage: "typecheck",
        md: "Switch to the type-error variant, or edit `1` into a string, to make the diagnostic land on the typecheck stage instead of turning into a runtime surprise.",
      },
    ],
  },
  {
    id: "grades",
    title: "Macros, Types, Eval Together",
    tagline: "`cond` desugars, a grade function infers, then the program evaluates.",
    badge: "live",
    source: gradesSource,
    passes: ["parse", "expand", "typecheck", "evaluate"],
    narration: [
      {
        stage: "source",
        md: "This example uses a friendly `cond`, a function definition, and a final map over scores.",
      },
      {
        stage: "expand",
        md: "`cond` expands into nested conditionals, so typechecking and evaluation only need the smaller core language.",
      },
      {
        stage: "typecheck",
        md: "The grade function infers as a number-to-string function from the branches it returns.",
      },
      {
        stage: "evaluate",
        md: "The final pass produces the grade list. One source passed through every live stage.",
      },
    ],
  },
  {
    id: "entities",
    title: "Elaboration: Programs That Describe Systems",
    tagline: "Descriptor-looking source becomes an ontology-shaped artifact.",
    badge: "preview",
    source: entitiesSource,
    passes: ["parse"],
    preview: {
      targetLabel: "Ontology IR JSON",
      language: "json",
      output: JSON.stringify(
        {
          entities: [
            {
              name: "Customer",
              fields: [
                { name: "id", type: "String" },
                { name: "email", type: "String" },
                { name: "plan", type: "Keyword" },
              ],
            },
          ],
          queries: [
            {
              name: "activeCustomers",
              from: "Customer",
              where: ["=", "plan", "pro"],
              select: ["id", "email"],
            },
          ],
        },
        null,
        2,
      ),
    },
    narration: [
      {
        stage: "parse",
        md: "The live read pass still proves this is Forma-shaped source. The final IR pane is a preview fixture until descriptor bootstrap is exposed here.",
      },
      {
        stage: "target",
        md: "Elaboration means the program returns a system description, not just a value. This pane is clearly marked preview.",
      },
    ],
  },
  {
    id: "effect-ts",
    title: "Target: Effect-Flavored TypeScript",
    tagline: "A future backend can emit TypeScript while preserving compiler provenance.",
    badge: "preview",
    source: effectTsSource,
    passes: ["parse"],
    preview: {
      targetLabel: "Generated Effect TypeScript",
      language: "typescript",
      output: `export const checkout = Effect.gen(function* () {
  const cart = yield* Cart.load("cart_123").pipe(withSpan("2:3-2:22"));
  const customer = yield* Customer.load("cus_456").pipe(withSpan("3:3-3:27"));
  const priced = yield* Pricing.applyCoupon(cart, "SUMMER");
  return yield* Orders.create({ customer, priced });
});`,
    },
    narration: [
      {
        stage: "parse",
        md: "The live pass verifies the source shape. The target pane is the roadmap backend, not a hidden server call.",
      },
      {
        stage: "target",
        md: "Only effectful bindings get `yield*`; provenance comments keep emitted code tied to original spans.",
      },
    ],
  },
  {
    id: "alchemy",
    title: "Target: Infrastructure",
    tagline: "A Forma system description can point at concrete Cloudflare resources.",
    badge: "preview",
    source: alchemySource,
    passes: ["parse"],
    preview: {
      targetLabel: "Alchemy v2 TypeScript",
      language: "typescript",
      output: `import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect } from "effect";

export default Alchemy.Stack(
  "forma-demo",
  { providers: Cloudflare.providers() },
  Effect.gen(function* () {
    const sessions = yield* Cloudflare.KVNamespace("sessions");
    const pipelineCache = yield* Cloudflare.DurableObjectNamespace("pipeline-cache");

    const api = yield* Cloudflare.Worker("api", {
      main: "./src/api.ts",
      bindings: { sessions, pipelineCache },
      routes: ["/api/*"],
    });

    return { url: api.url };
  }),
);`,
    },
    narration: [
      {
        stage: "source",
        md: "The source describes the system at the level a product thread usually starts from: worker, storage, durable cache.",
      },
      {
        stage: "target",
        md: "The generated target is previewed as an Alchemy `Stack`, matching the documented v2 shape for Cloudflare resources.",
      },
    ],
  },
];

export function getPipeline(id: string | undefined): PipelineDef {
  return pipelines.find((pipeline) => pipeline.id === id) ?? pipelines[0]!;
}

function preludeSection(marker: string): string | null {
  const start = PRELUDE_SOURCE.indexOf(marker);
  if (start === -1) return null;
  const next = PRELUDE_SOURCE.indexOf("\n;; ", start + marker.length);
  return PRELUDE_SOURCE.slice(start, next === -1 ? undefined : next).trim();
}
