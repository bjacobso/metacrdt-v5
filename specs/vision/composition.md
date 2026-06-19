# Vision — The dance: how the instruments compose

> Part of the `vision/` set — see [`README.md`](./README.md). Status: `📐`
> for the contract shapes, `💭` for the capability negotiation. Companions:
> [`forma.md`](./forma.md) (the language), the schematics exploration
> ([`../explorations/schematics.md`](../explorations/schematics.md)), and
> [`../reference/targets.md`](../reference/targets.md) (targets/adapters).
>
> The question this doc answers: **how do Forma, the `ontology` prelude,
> MetaCRDT, and Schematics fit together while remaining mutually ignorant?**
> Each instrument is useful alone; none imports another's internals; the
> composition is owned by exactly one place. This doc names the seams.

---

## The principle: artifacts, not imports

Purity between modules is not achieved by discipline about `import`
statements. It is achieved by making every seam a **serializable, versioned,
schema-validated artifact**. A layer consumes the artifact produced above it
and produces the artifact consumed below it. No layer holds a reference to
another layer's objects — only to data both sides can validate independently.

Consequences:

- any layer can be reimplemented against its artifacts (the conformance
  posture, applied to internal seams);
- every seam is snapshot-testable (same input artifact → same output
  artifact, byte-stable);
- the IDE and the deploy pipeline are not special — they are just two more
  consumers of the same artifacts.

Exactly one package is allowed to know everything: the **distribution**
(the `@open-ontology/*` adapter layer). It assembles the dance; it contains
no semantics of its own.

## The cast, and the one thing each may know

| Instrument | Is | May know | Must never know |
| --- | --- | --- | --- |
| **Forma host** (`@forma/host`, engines) | reader, kernel eval, descriptor registry, sessions, spans | its own meta-API (`define-form`, `meta-fn`) | what an "entity" is; any IR kind; any runtime |
| **`ontology` prelude** (today `preludes/ontology.lisp` + `ontology-compiler.lisp`) | the vocabulary: `define-entity`, `define-constraint`, `define-process`, … as derived forms + elaboration hooks | Forma's meta-API **and** the IR schema — it is the only module that knows both syntax and IR | storage, targets, Schematics, the runtime |
| **Ontology IR** (`@metacrdt/schema` for now) | pure data: typed, versioned node kinds with provenance | Effect Schema only | Forma, preludes, runtimes, files |
| **MetaCRDT** (`@metacrdt/core`, `runtime`, targets) | the fact log + the runtime semantics for IR kinds | the IR (through one pure lowering function) and its own protocol | Forma source, markdown, spans, the IDE |
| **Schematics** (`@schematics/*`) | artifact routing, validation surface, IDE, agent tools, plan/apply engine | a generic *language service* interface and opaque-but-schema'd payloads (IR previews, plans) | ontology semantics — it must work equally for an Okta provider |
| **Distribution** (`@open-ontology/*`) | the composition: project type, prelude registry, pipeline wiring | everything | nothing is off-limits — but it owns **zero semantics** |

The brand-level statement of the same table: *Forma is ignorant of
ontologies; the `ontology` prelude teaches it. MetaCRDT is ignorant of
syntax; the IR feeds it. Schematics is ignorant of both; artifacts flavor
it. Open Ontology is the only one who knows the whole dance.*

## The seven contract artifacts

Each seam is one artifact. These are the things to specify, version, and
snapshot-test — everything else is implementation.

1. **PreludeSet** — `manifest declares → registry resolves`.
   A resolved, ordered list of `(name, version, source-hash)` plus a
   combined **fingerprint**. Produced by the prelude registry from
   `(import ontology ontology/documents)` (today: the unresolved
   `(:preludes core)` tokens — see *Current state*). The fingerprint
   threads through every downstream artifact: nothing is interpretable
   without knowing which vocabulary produced it.

2. **Session / LanguageService** — `host ↔ workbench`.
   The one *interface* (not data) seam: load sources, get diagnostics with
   spans, completions, hover. Schematics depends on this generic interface;
   the ontology flavor arrives entirely through which PreludeSet the
   session loaded. The IDE has no ontology code — `define-entity`
   completion exists because the prelude declared the form.

3. **IR bundle** — `elaboration → everyone downstream`.
   `{ preludeFingerprint, manifest, nodes[] }` where each node is a typed
   kind (EntityType, Relation, Query, Constraint, Process, Action, View,
   Workspace, Document, …) carrying **provenance**: IR node → Forma AST
   span → fenced-block span → file line/column (the composed source map).
   Deterministic: same sources + same PreludeSet ⇒ byte-identical bundle.
   This is the artifact both MetaCRDT and Schematics consume — neither
   ever sees Forma source.

4. **Desired fact set** — `IR → substrate`, via one pure function.
   `lower(IRBundle) → facts[]`. Lives beside the IR schema; no I/O, no
   target knowledge. Schema definitions, rules, flow defs, grants, view
   specs — all as the facts they will be. (Today `applyConfig` fuses
   lowering with writing; the extraction into a pure `lower` is the gap.)

5. **Plan** — `desired facts ⟷ target facts`.
   The diff, classified: assert / supersede / retract / generate / binding
   change, with impact in ontology terms (changed types, flows, grants) —
   reportable at the *authoring* location via artifact 3's provenance.
   Produced by the deploy engine (`@schematics/alchemy` + the MetaCRDT
   provider); consumed by humans, agents, and `apply`.

6. **Target capability manifest** — `runtime → plan`.
   A target declares which IR node kinds and versions it implements
   (`convex: entities@2, constraints@1, processes@1; no workspaces`).
   Plan fails fast when the bundle requires capabilities the target lacks.
   `💭` — does not exist yet; becomes urgent the day there are two targets.

7. **Transaction + deploy provenance** — `apply → log`.
   One MetaCRDT transaction carrying the fact changes plus
   `{ source commit, IR hash, preludeFingerprint, actor }`. Deployment
   inherits audit, time travel, and drift detection from the substrate
   instead of reimplementing them; drift = facts whose provenance no
   longer matches any source.

## The dance, in order

```
 (ontology (:id "staffing") (:version "1.0.0")
   (import ontology ontology/documents)          ── manifest
   (:files "policy.md" "flows.md"))
        │
        ▼
 [1] PreludeSet        registry resolves names → versioned sources + fingerprint
        ▼
 [2] Session           host loads kernel+compiler intrinsics, then the set;
        │              descriptor registry assembled; markdown fences extracted;
        │              parse/expand/typecheck → diagnostics with composed spans
        ▼
 [3] IR bundle         elaboration hooks (from the prelude) emit typed nodes
        │              with provenance; deterministic, snapshot-tested
        ▼
 [4] Desired facts     lower(IR) — pure, target-ignorant
        ▼
 [5] Plan              diff vs target facts; gated by [6] capabilities
        ▼
 [7] Apply             one provenance-stamped transaction
        ▼
     Runtime           MetaCRDT folds & reacts: schema-as-facts, rules,
                       flows, grants, generated views — the model runs
```

Two consumers tap the middle of the pipeline rather than the end:

- **The IDE loop** (Schematics): artifacts 1–3, continuously. Diagnostics
  on keystroke, IR preview, "what would this change derive" — same
  session, same bundle, no deploy.
- **The agent loop**: identical to the IDE loop plus `propose_patch` —
  agents read artifact 2's diagnostics and artifact 5's plans through the
  same typed tools humans use. No separate AI path exists.

## Current state vs. this design

- `✅` Prelude-as-vocabulary: `preludes/ontology.lisp` defines the full
  `define-*` surface as derived forms; the host session tracks preludes
  with fingerprints (`@forma/host` `preludeFingerprint`).
- `🚧` Artifact 1: prelude loading today is a **hardcoded bootstrap**
  (`bundle-preludes.ts` → generated string constants → fixed-order
  `bootstrapFromSources`), and manifest tokens like `(:preludes core)`
  are parsed but resolved by nothing. The registry is the missing piece —
  and the moment to rename the token to `(import ontology)`.
- `🚧` Artifact 3: elaboration exists in the open-ontology repo's compiler;
  the composed markdown→Forma→IR source map is designed, not built
  (schematics exploration, steps 2–4).
- `🚧` Artifact 4: `applyConfig` lowers-and-writes in one motion; the pure
  `lower` with an equivalence test against the legacy path is the
  extraction to do.
- `✅` Artifact 5 engine: `@schematics/alchemy` plan/apply is implemented
  and tested for five SaaS providers; the MetaCRDT provider is unwritten.
- `💭` Artifact 6: capability manifests are this doc's only new invention.
- `📐` Artifact 7: deploy-metadata-as-facts decided (no lockfile for
  MetaCRDT targets); not yet implemented.

## Open questions

- **Version skew.** A bundle elaborated under `ontology@2` deployed to a
  runtime that implements `ontology@1` semantics — is artifact 6 enough,
  or do IR kinds need per-kind migration the way facts do?
- **Who owns the IR schema** once a second emitter exists (the n8n/Workato
  explorations) — stay in `@metacrdt/schema`, or split `@metacrdt/ir`?
  (Decision so far: don't pre-abstract.)
- **Effect emission.** The same PreludeSet could generate TS types /
  Effect Schemas for runtime authors (the missing Effect-TS backend) —
  is that a third consumer of artifact 3, or a separate codegen seam?
- **How much evaluates at elaboration time** vs. ships as IR data for the
  runtime to interpret (carried over from the schematics exploration —
  still open).
