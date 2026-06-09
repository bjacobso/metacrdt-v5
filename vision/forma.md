# Vision — Forma: a Lisp that lowers to the MetaCRDT DSL

> Part of the `vision/` set — see [`README.md`](./README.md). This is a
> forward-looking design exploration, **vision + brainstorm, not a build spec**.
> It is the authoring-language companion to [`dsl.md`](./dsl.md) (the Effect-`Schema`
> builder DSLs) and [`api.md`](./api.md) (the JIT `HttpApi`). Where those propose a
> TypeScript builder surface, this proposes a **Lisp** surface — and, crucially,
> shows that both are *front-ends to one shared IR*, not competing ideas.

> **Direction note (current):** unlike most of `vision/`, this doc is *aligned with*
> the present MetaCRDT direction rather than rebased away from it. The Effect-native
> mandate (SPEC §1.2, PLAN Goal 111) and Confect at the Convex boundary revive the
> Schema-everywhere authoring story that earlier Convex notes had cut. The
> language engine already exists as `@metacrdt/forma` (extracted from Open
> Ontology: reader, evaluator, type inference, and a `descriptor → Effect Schema`
> elaboration path). What does **not** yet exist is the shared IR these front-ends
> lower to, and the binding from that IR to targets. This doc names that missing
> middle.

---

## 0. The idea in one breath

Write an ontology — entities, attributes, constraints, rules, forms, flows,
actions, grants — as a small Lisp document. Forma **elaborates** it into a single
**MetaCRDT DSL** (an Effect-`Schema` ontology IR). The IR compiles into a
**Confect-shaped typed runtime** (services, handlers, typed errors) and **lowers
to facts**. The same IR then **binds to a target** — Convex today, Cloudflare or
Node later — and every target converges because they share `@metacrdt/core`.

> One ontology, authored once. Many front-ends. One IR. Many targets.

---

## 1. The layering

```text
AUTHORING          Forma (Lisp)            dsl.md builders (TS)      blueprint literal (TS)
  (front-ends)     (define-entity …)       Entity.make().attr(…)     { entityTypes: […] }
                          │                        │                        │
                          └──────────── elaborate / construct ──────────────┘
                                               │
THE MetaCRDT DSL                               ▼
  (the shared IR)            Effect-Schema Ontology IR   ← lives in @metacrdt/schema
                             { entityTypes, attributes, constraints, rules,
                               forms, flows, actions, grants } as Schema
                                               │
                          ┌────────────────────┼─────────────────────┐
RUNTIME SHAPE             ▼                     ▼                      ▼
  (Confect-like)   typed services/handlers   fact-lowering        JIT HttpApi (api.md)
                   (Spec.make().add(…))       (→ schema-as-facts)  (IR → REST surface)
                                               │
TARGETS                          ┌─────────────┼──────────────┐
  (SPEC §8.3)                    ▼             ▼               ▼
                            @metacrdt/convex  @metacrdt/      @metacrdt/node
                            (Convex tables)   cloudflare       (sqlite/pg)
                                              (DO + SQLite)
                                               │
                                    all converge via @metacrdt/core
```

Read top to bottom: **author → IR → runtime shape → target.** Forma is one
authoring front-end; the IR is the unification point; the Confect-like runtime is
how the IR becomes typed functions; targets are where it executes.

---

## 2. The Forma surface

Forma reuses the primitives MetaCRDT already names — *facts, constraints,
intentions, effects* — as Lisp forms. The syntax below is the Open Ontology
language Forma was extracted from; the alignment work is mapping each form onto a
MetaCRDT IR node rather than inventing new syntax.

**Entities and attributes** (lower to schema-as-facts — `type:` / `attr:` carriers):

```lisp
(define-entity Worker
  (:field [worker/name   String {:required true}])
  (:field [worker/status (enum active terminated) {:required true}]))

(define-entity Placement
  (:field [placement/worker   (Ref Worker)   {:required true}])
  (:field [placement/employer  (Ref Employer) {:required true}])
  (:field [placement/venue     (Ref Venue)])) ; customer-defined type, no migration
```

**Constraints and rules** (lower to derived facts / Datalog `where`+`emit`):

```lisp
(define-constraint i9-required
  (:severity error)
  (:when    [?p type Placement] [?p placement/employer ?e])
  (:require (form i9 (:scope ?e) (:validity-days 1095))))
```

**Forms, flows, actions, grants** (the "reactions over facts"):

```lisp
(define-form i9 (:title "Form I-9") (:fields i9/ssn i9/work-auth))

(define-process onboarding (:subject Worker) (:start i9)
  (:step i9     (:collect i9)        (:next handbook))
  (:step handbook (:collect handbook) (:next done)))

(define-action terminate (:applies-to Worker)
  (:assert [worker/status "terminated"]))

(define-grant analyst (:read worker/* (:deny i9/ssn))) ; PII gated, per authorization.md
```

Each form names a MetaCRDT primitive: entities/attributes are *facts*,
constraints/rules are *derived coherence*, processes/actions are *intentions and
effects*, grants are *coordination* (SPEC §9). Nothing here is target-specific.

---

## 3. What it lowers to: the MetaCRDT DSL (the shared IR)

Forma's elaboration already terminates at an Effect Schema (`@metacrdt/forma`'s
`descriptor → protocol-effect-schema` path). The unification step is to make that
target a **named, shared IR** living in `@metacrdt/schema` (which already owns
fact-lowering via `attributeDefinitionFacts` / `entityTypeDefinitionFacts`):

```ts
// @metacrdt/schema — the MetaCRDT ontology DSL, as Effect Schema
export const EntityType = Schema.Struct({
  name: Schema.String,
  attributes: Schema.Array(AttributeRef),
  description: Schema.optional(Schema.String),
});
export const Ontology = Schema.Struct({
  entityTypes:  Schema.Array(EntityType),
  attributes:   Schema.Array(AttributeDef),
  constraints:  Schema.Array(Constraint),
  rules:        Schema.Array(Rule),
  forms:        Schema.Array(FormDef),
  flows:        Schema.Array(FlowDef),
  actions:      Schema.Array(ActionDef),
  grants:       Schema.Array(Grant),
});
```

This is the convergence point for **all four** authoring front-ends:

- **Forma** — `(define-entity …)` → `ProtocolDescriptor` → `Ontology` IR.
- **`dsl.md` builders** — `Entity.make().attribute(…)` *is* a thin facade that
  emits the same IR.
- **blueprint literal** — `STAFFING_BLUEPRINT` is the IR written as data (already
  shipped, just not yet Schema-typed).
- **Confect tables/specs** — consume the IR for typed function signatures.

They stop being competing surfaces and become emitters of one schema.

---

## 4. The runtime shape (Confect-like)

The IR does not run directly; it compiles into a **typed runtime shape** modeled
on Confect's existing pattern — `Spec.make().add(group)` with `Schema`-typed
args/returns and tagged errors. From one `Ontology` the compiler can derive:

- **typed read/write functions** per entity type (get/list/assert/retract), with
  args/returns as `Schema` and errors as `Schema.TaggedError`
  (`UnknownEntity`, `CardinalityConflict`, `DeniedRead`);
- **derivation** for constraints/rules (Datalog `where`+`emit`, per
  `@metacrdt/query`);
- **flow/collection** handlers for processes and forms;
- optionally the **JIT `HttpApi`** of [`api.md`](./api.md) — the same IR compiled
  into a REST surface.

This runtime shape is **target-neutral**: it is expressed against
`@metacrdt/runtime`'s Effect service tags (`EventStoreService`,
`RuntimeClockService`, …, per SPEC §1.2), not against Convex or Cloudflare APIs.

---

## 5. Lowering to targets

A target *provides the Layers* the runtime shape depends on, and *lowers the IR's
fact set* into its own storage:

| Target | Fact lowering | Functions | Reactivity |
| --- | --- | --- | --- |
| `@metacrdt/convex` | `applyConfig` → schema-as-facts in Convex tables | Confect functions | native reactive queries |
| `@metacrdt/cloudflare` | IR → DO + SQLite triple store ([cloudflare-target.md](../docs/cloudflare-target.md)) | DO RPC methods | WebSocket push (stretch) |
| `@metacrdt/node` | IR → sqlite/postgres adapter | HTTP/SSE handlers | LISTEN/NOTIFY or hooks |

The same `Ontology` produces the same facts on every target, and the targets
converge because each embeds `@metacrdt/core` (the convergence guarantee — see
[`../docs/targets.md`](../docs/targets.md)). Forma authored it once; it now runs
anywhere a target Layer exists.

---

## 6. Why a Lisp, not just the TS builder

The `dsl.md` builders and Forma both emit the IR, so why keep Forma?

- **Homoiconic + macro-extensible.** New ontology constructs (a new kind of rule,
  a domain macro like `define-compliance-matrix`) are library code in the same
  language, not changes to the host TypeScript.
- **Agent-writable and reviewable.** A small S-expression document is a natural
  surface for agents to *propose* ontology changes as facts (SPEC "agent
  participation"), and for humans to diff.
- **One language for shape and behavior.** Entities, rules, flows, and actions
  are all Lisp forms over the same evaluator — facts and reactions in one grammar.
- **Already typed.** Forma carries Hindley–Milner inference, so a Lisp ontology is
  checked before it ever reaches the IR.

The TS builders stay the first-class surface for app developers; Forma is the
*portable, extensible, agent-friendly* surface for the ontology itself.

---

## 7. Conservative path & status

End-state above is ambitious. The incremental path keeps each step shippable:

1. **Define the IR** as Effect Schema in `@metacrdt/schema`; make the existing
   `STAFFING_BLUEPRINT` parse as the IR (no behavior change). *Unblocks everything.*
2. **Builder facade** (`dsl.md` style) that emits the IR. Pure ergonomics.
3. **Confect-from-IR**: generate one entity type's typed functions from the IR,
   proving the runtime-shape compile.
4. **Forma adapter**: wire `@metacrdt/forma`'s `ProtocolDescriptor → Ontology`,
   so a Lisp `define-entity` round-trips to the same facts as the blueprint.
5. **Second target**: lower the IR onto Cloudflare DO+SQLite, proving
   target-neutrality with a cross-target conformance test (`@metacrdt/testkit`).

### Status / open items

- **Built:** `@metacrdt/forma` language engine; `@metacrdt/schema` fact-lowering;
  the plain-TS blueprint; Confect typed-function sidecar; runtime service Layers.
- **Not built / unscheduled:** the shared `Ontology` IR, the builder facade, the
  Forma→IR adapter, IR→Confect function generation, and IR→non-Convex lowering.
- **Open questions:**
  1. Does the IR live in `@metacrdt/schema`, or a dedicated `@metacrdt/ir`?
     (Consolidation doc leans: keep it in schema/runtime until two compilers need
     it.)
  2. How much of constraints/flows is IR data vs. Forma-evaluated behavior?
  3. Is the JIT `HttpApi` ([`api.md`](./api.md)) per-target, or a shared
     IR→`HttpApi` compile reused by every target?

> Where this doc conflicts with shipped reality, the code wins; this is the
> intended shape, not a description of what runs today.
