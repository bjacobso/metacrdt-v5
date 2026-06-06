# Architecture & naming — the MetaCRDT umbrella

**MetaCRDT** is the umbrella: the primitive, the thesis, and the org
(`metacrdt.com`, `@metacrdt`, the GitHub/X handles). Everything in this project —
triples, Datalog, workflows, forms, constraints, tasks, permissions, views,
agents, documents, applications — is a **consequence** of one primitive:

> a convergent graph of facts, constraints, intentions, and effects.

The ontology isn't the primitive. The workflow isn't the primitive. The schema
isn't the primitive. *The primitive is the convergent fact graph* — and that's
what "MetaCRDT" names. This doc is the map: where every layer, package, and prior
idea lives. (Companion: [manifesto.md](./manifesto.md) for the *why*,
[SPEC.md](../SPEC.md) for the protocol, [metacrdt.md](./metacrdt.md) for the
positioning, [VISION.md](../VISION.md) for the pillars.)

---

## The layer stack

```
MetaCRDT — the umbrella: the primitive, the thesis, the org
│
├─ PROTOCOL          SPEC.md  ·  "Open Ontology" = the open spec / community effort
│
├─ FEATURE PACKAGES  (what the substrate does — pure, runtime-agnostic)
│   @metacrdt/core ....... events, content hash, ≺ order, fold, visibility   (SPEC §4–5)
│   @metacrdt/schema ..... schema-as-facts (types, attributes, cardinality)
│   @metacrdt/query ...... the Datalog engine / derivation evaluator         (SPEC §6)
│   @metacrdt/workflow ... durable flows & steps
│   @metacrdt/forms ...... form defs + collection
│   @metacrdt/agent ...... agent participation
│
├─ THE HARNESS       @metacrdt/runtime  ·  the IR + service interfaces (multi-runtime)
│
├─ TARGETS           (compile bindings — SPEC §8.3)
│   @metacrdt/convex ......... Convex relay / system-of-record  (reference impl)
│   @metacrdt/cloudflare ..... Durable-Object edge replica + WS sync
│   @metacrdt/local .......... browser/SQLite local-first (the foldkit client)
│
├─ TOOLING           Onlang/Forma = DSL frontend → IR  ·  Schematics = the IDE/authoring surface
│
├─ ONTOLOGY          "Alpha Ontology" = the default shipped blueprint
│                     (the standard library: staffing/compliance types+rules, generalized)
│
└─ APPLICATIONS      Onboarded = the first app (the datarooms vertical), buyer-facing
```

## Three axes, kept separate

The common mistake is to flatten these into one list (e.g. putting `cloudflare`
next to `workflow`). They are **different axes**, and keeping them apart is the
whole point of the harness:

- **Features** (`core` / `schema` / `query` / `workflow` / `forms` / `agent`) —
  *what the substrate does*. Pure; depend only on `@metacrdt/core` + service
  interfaces. They MUST NOT know about any runtime.
- **The IR / harness** (`@metacrdt/runtime`) — *the portable program* + the
  service interfaces (`Store`, `HLC`, `Sched`, `Transport`) that features are
  written against.
- **Targets** (`convex` / `cloudflare` / `local`) — *where it runs*. Each provides
  the service Layers; each is a SPEC §8.3 transport binding.

> One feature set → many targets, guaranteed to converge, because every target
> embeds the *same* deterministic `@metacrdt/core` (SPEC §5). The shared core is
> the convergence guarantee; the targets only swap I/O.

## Where prior names land

| Prior name | Becomes |
| --- | --- |
| **Open Ontology** | the open spec / community effort (SPEC.md) |
| **Alpha Ontology** | the default ontology shipped with MetaCRDT (the standard blueprint library) |
| **Onlang / Forma** | the DSL / compiler frontend (authoring → IR) |
| **Schematics** | the IDE / tooling |
| **Onboarded** | the first application built on MetaCRDT (datarooms / compliance) |
| **Meta-Effects** | absorbed: the runtime is `@metacrdt/runtime` + Effect Layers |

## How *this repo* factors in

Every module already maps cleanly — which is the evidence the taxonomy is real,
not invented:

| This repo (`convex-triples`) | Package |
| --- | --- |
| `convex/lib/visibility.ts` + the fold + `factEvents` semantics | `@metacrdt/core` |
| `convex/attributes.ts`, `convex/lib/meta.ts` | `@metacrdt/schema` |
| `convex/datalog.ts`, `convex/lib/engine.ts` | `@metacrdt/query` |
| `convex/flows.ts` | `@metacrdt/workflow` |
| `convex/forms.ts` | `@metacrdt/forms` |
| `convex/facts.ts` mutations + Convex bindings | `@metacrdt/convex` (target) |
| `convex/appconfig.ts` blueprint + the Effect-Schema DSL | Schematics / Onlang |
| the staffing blueprint | first entry in **Alpha Ontology** |
| `src/` (the React app) | **Onboarded** (datarooms) |
| `SPEC.md` | **Open Ontology** |

## Three disciplines

1. **A map, not a migration.** This repo stays one reference implementation until
   the boundaries are *proven*. Factoring into nine packages now is the
   premature-coupling trap. **Publish `@metacrdt/core` first** — it's the
   determinism guarantee, the most reusable, and the thing SPEC pins; everything
   else extracts as it stabilizes. (Tracked in [TODO.md](../TODO.md).)
2. **The name is the thesis — so protect what makes it true.** *Databases store
   facts; CRDTs synchronize facts; MetaCRDT synchronizes facts, logic, workflows,
   permissions, agents, and interfaces.* That sentence is only true because the log
   is a G-Set CRDT (SPEC §4) and derivation **converges because it is a
   deterministic fold** (SPEC §6). Guard the determinism discipline (shared core,
   no `Date.now()`/`Math.random()` in the fold) or the claim deflates into
   marketing.
3. **Brand by audience, not one global name.** `metacrdt.com` is the substrate's
   developer/research home (the labs); a compliance buyer is sold **Onboarded**
   ("built on MetaCRDT"). Nobody buys a CRDT; they buy onboarding. The live demo on
   `chatty-hare-94` is a *research preview of the substrate*, so MetaCRDT/datarooms
   branding is correct **there** — just don't let it become the buyer-facing name.
