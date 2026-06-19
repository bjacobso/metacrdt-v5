# Schematics under the MetaCRDT umbrella

> `brainstorm` This is an integration sketch, not a build spec. It records the
> current thesis for treating Schematics as the Terraform-like authoring,
> validation, and deployment workbench for MetaCRDT projects.

## One-sentence thesis

Schematics should be the artifact workbench for MetaCRDT: a project is authored
as schema-routed files, including markdown files with embedded Forma Lisp; those
files elaborate into the MetaCRDT ontology IR, lower to facts, and deploy through
a `pull -> plan -> apply` loop against Convex, Cloudflare, Node, or local
targets.

This makes Schematics more than an IDE. It becomes the operational surface for a
Forma-authored MetaCRDT project:

```text
markdown + embedded Forma
  -> Schematics artifact routes and validation
  -> Forma parse/eval/type/elaboration
  -> MetaCRDT Ontology IR
  -> schema-as-facts + views + flows + grants
  -> target plan
  -> apply as convergent MetaCRDT transactions
```

## Why this fits

MetaCRDT already draws the layers this way:

- MetaCRDT is the substrate: the convergent graph of facts, constraints,
  intentions, and effects.
- Forma is the Lisp authoring language that lowers toward the shared ontology
  IR.
- Schematics is the tooling surface for schema-routed artifacts, diagnostics,
  agent edits, and config-as-code deployment.

Schematics already has the right primitive: an artifact project routes files to
schemas, exposes views and diagnostics, and gives humans and agents the same
typed edit surface. Its deploy loop already looks like Terraform for arbitrary
configuration APIs: `pull`, edit files, `plan`, `apply`, and monitor drift.

MetaCRDT needs exactly that loop, but with a different desired-state unit. The
unit is not a cloud resource. It is a desired fact program: ontology definitions,
rules, forms, flows, actions, grants, generated views, and target bindings.

## Proposed authoring shape

A MetaCRDT project should be a Schematics project with first-class markdown
artifacts. Markdown is for the team; Forma is for the machine-readable program.

Example file:

````markdown
---
kind: metacrdt.module
name: staffing
target: convex-demo
---

# Staffing

This module defines the default staffing ontology and compliance workflow.

```forma
(define-entity Worker
  (:field [worker/name String {:required true}])
  (:field [worker/status (enum active terminated) {:required true}]))

(define-entity Placement
  (:field [placement/worker (Ref Worker) {:required true}])
  (:field [placement/employer (Ref Employer) {:required true}]))

(define-form i9
  (:title "Form I-9")
  (:fields i9/ssn i9/work-auth))

(define-process onboarding (:subject Worker) (:start i9)
  (:step i9 (:collect i9) (:next done))
  (:step done (:done)))
```
````

The markdown parser should preserve:

- frontmatter as document-level metadata;
- prose headings as human context;
- fenced `forma` blocks as typed source modules;
- source ranges for the markdown block and every nested Forma AST node.

That gives the Schematics IDE useful behavior: diagnostics land on the exact
Lisp form inside the markdown document, previews can show the derived ontology
IR, and agent patches can edit the same source humans review.

## Artifact schema

The first project type could be `MetacrdtProject`, with routes like:

| Route | Artifact | Validates |
| --- | --- | --- |
| `ontology/**/*.md` | `MarkdownFormaModule` | frontmatter, fenced Forma blocks, module identity |
| `views/**/*.md` | `MarkdownFormaViewModule` | view/lens definitions that lower to ViewSpec |
| `targets/*.yaml` | `TargetBinding` | Convex/Cloudflare/Node target config |
| `plans/*.yaml` | `DeploymentPlanPolicy` | allowed target, dry-run/apply policy, drift thresholds |
| `generated/**/*.json` | `DerivedArtifact` | generated IR snapshots, target manifests, API docs |

The critical artifact is `MarkdownFormaModule`:

```text
source text
  -> markdown AST + frontmatter
  -> list of fenced Forma source ranges
  -> Forma reader/evaluator/type checker
  -> descriptor/module values
  -> MetaCRDT Ontology IR
  -> Effect Schema validation
  -> relation and reference diagnostics
```

This extends Schematics' source-mapped parser plan. JSON/YAML source maps remain
useful, but markdown+Forma needs a composed source map:

```text
Ontology issue path
  -> IR node provenance
  -> Forma AST span
  -> markdown fenced-code span
  -> file line/column
```

The composed map is the reason to keep Forma spans and Schematics diagnostics in
one runtime contract instead of treating embedded Lisp as opaque text.

## Deploy model

Schematics' config-as-code engine should deploy MetaCRDT declarations by
planning over facts, not by mutating target-specific tables directly.

`pull`

- Reads the current target state: ontology facts, active blueprint version,
  generated views, grants, flows, and deploy metadata.
- Hydrates a local Schematics workspace when bootstrapping from an existing
  runtime.
- Records source provenance when the runtime knows which git commit or artifact
  hash produced the facts.

`plan`

- Parses and validates the desired workspace.
- Elaborates Forma and markdown artifacts into the ontology IR.
- Lowers the IR to the desired fact set and derived artifacts.
- Diffs desired facts against target facts.
- Classifies operations as assert, supersede, retract, generate, or target
  binding change.
- Reports impact in MetaCRDT terms: changed entity types, attributes, forms,
  flow transitions, grants, view specs, and target capabilities.

`apply`

- Writes a MetaCRDT transaction containing the desired fact changes and
  provenance.
- Lets the target runtime fold, materialize, and react.
- Stores deploy metadata back into the Schematics lockfile or manifest: target
  id, transaction id, source commit, IR hash, generated artifact hashes.

`drift`

- Compares the deployed fact set and generated artifacts with the workspace.
- Treats runtime facts without source provenance as drift, unless policy marks
  them as runtime-owned.
- Reports drift at the authoring level where possible: the changed Forma form,
  markdown module, or target binding.

This preserves the MetaCRDT law: deployment is still a fact transaction, so
audit, time travel, provenance, and convergence remain properties of the same
log.

## Where the package boundaries should land

Do not immediately merge all Schematics packages into `@metacrdt/*`. The better
near-term framing is:

- `@schematics/artifacts`, `@schematics/core`, `@schematics/ide`,
  `@schematics/agent`, and `@schematics/protocol` stay general-purpose.
- `@schematics/alchemy` remains the generic plan/apply engine, but grows a
  MetaCRDT provider.
- A new adapter package, likely `@metacrdt/schematics` or
  `@schematics/metacrdt`, owns the `MarkdownFormaModule`, MetaCRDT artifact
  routes, IR previews, and target deploy provider.
- `@forma/ts` keeps owning Lisp parsing, evaluation, typing, spans, and
  descriptor elaboration.
- `@metacrdt/schema` or `@metacrdt/runtime` owns the ontology IR and
  fact-lowering semantics.

That keeps the dependency arrows sane:

```text
@schematics/*        generic artifact/editor/deploy workbench
@forma/ts            generic Lisp language frontend
@metacrdt/schema     ontology IR + fact lowering
@metacrdt/runtime    service contracts + target-neutral runtime
@metacrdt/schematics glue: markdown+Forma artifacts -> IR -> plan/apply
```

The umbrella claim can still be stronger than the package names: Schematics is
the MetaCRDT authoring and deployment surface, but its core remains reusable for
other schema-backed workbenches.

## Incremental path

1. Add Schematics as context under `.context/schematics` so its current
   artifact, parser, provider, and deploy design stays visible while planning.
2. Define `MarkdownFormaModule` in an adapter package or local experiment:
   frontmatter schema, markdown parser, fenced `forma` extraction, and source
   ranges.
3. Connect `@forma/ts` parsing and type diagnostics to Schematics diagnostics
   with exact source locations inside markdown files.
4. Elaborate a small subset of Forma forms into the existing staffing blueprint
   shape, then into the planned ontology IR.
5. Add a read-only Schematics preview that shows the derived IR, lowered facts,
   and generated ViewSpec.
6. Implement `plan` against the Convex demo target by comparing desired lowered
   facts with current schema/config facts.
7. Implement `apply` as a MetaCRDT transaction through the target binding.
8. Add IR snapshot tests so markdown+Forma source changes produce reviewed,
   deterministic artifacts.
9. Generalize the provider to Cloudflare/Node once the Convex path proves the
   contract.

The first useful demo should be deliberately small: one markdown file defining
`Worker`, `Placement`, one form, one flow, one view, and one grant, with a plan
that shows exactly which facts would be asserted.

## Design questions

- Does the shared ontology IR live in `@metacrdt/schema`, `@metacrdt/runtime`,
  or a new `@metacrdt/ir` once there are multiple compilers?
- How much behavior should Forma evaluate before IR generation, versus how much
  should remain as IR data for target runtimes to interpret?
- Should markdown prose be pure documentation, or can headings/sections carry
  semantic identity for generated modules?
- Is `apply` allowed to generate target-specific files, or must every generated
  artifact be reproducible from facts plus source?
- What is the lockfile boundary: Schematics workspace lockfile, MetaCRDT deploy
  metadata facts, or both?
- How should runtime-authored facts coexist with source-authored facts without
  producing false drift?

## Naming posture

For developer-facing docs:

- MetaCRDT names the substrate and runtime law.
- Forma names the Lisp language and elaboration frontend.
- Schematics names the workbench: authoring, validation, preview, agent edits,
  deploy plans, and drift.

That sentence is the merge story: Schematics does not replace MetaCRDT or Forma;
it gives them a concrete project structure and deployment loop.
