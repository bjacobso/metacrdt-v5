# Descriptor Payload Matrix

This is the human-readable companion to the Phase 3 matrix enforced by
`scripts/reset-gate.mjs`. The gate owns the executable checks; this file
records the intent so future reset work can distinguish deliberate generic
payloads from accidental JSON escape hatches.

The package boundary is typed before serialization. These rows cover the
corpus-emitted canonical declaration kinds in the current golden corpus
(`scripts/gates.mjs`, 440 declarations across 45 corpus sources). Every
non-HTTP row must have a descriptor payload contract, a typed canonical
validator module, and a malformed fixture asserted by `scripts/emit.mjs`.
HTTP rows are validated through `Artifact_http_validator` and
`Http_ir_validation`, with malformed/reference coverage in
`scripts/http-api.mjs`.

`loc` remains an optional source metadata object across payload families; it is
not treated as domain vocabulary and is not repeated in every row below.

| kind                | count | descriptor contract        | validator                  | generic JSON fields                                                                                          |
| ------------------- | ----: | -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Record`            |   118 | `RecordPayload`            | `Canonical_record_decl`    | `fields.*` values are record literals keyed by author-defined entity fields.                                 |
| `Link`              |    72 | `LinkPayload`              | `Canonical_edge_decl`      | `fields[].value` preserves relation field literals without teaching OCaml every domain field type.           |
| `Entity`            |    52 | `EntityPayload`            | `Canonical_entity_decl`    | `fieldTypes.*`, `fields[].type`, `fields[].required`, and `fields[].indexed` remain descriptor schema terms. |
| `Query`             |    50 | `QueryPayload`             | `Canonical_query_decl`     | `where`, `datalog`, and `typeAnnotations` are query-language payloads owned by the descriptor/query DSL.     |
| `Action`            |    38 | `ActionPayload`            | `Canonical_operation_decl` | `inputs[].type`, `inputs[].required`, and `do` are expression/type terms owned by the operation DSL.         |
| `View`              |    29 | `ViewPayload`              | `Canonical_surface_decl`   | `columns[].expr` and `layout` are UI/query descriptors, not host OCaml records yet.                          |
| `Constraint`        |    20 | `ConstraintPayload`        | `Canonical_rule_decl`      | `when`, `message`, and task assignment title/body values are rule expression/template payloads.              |
| `Relation`          |    17 | `RelationPayload`          | `Canonical_edge_decl`      | `fields[].type`, `fields[].required`, and `fields[].indexed` remain descriptor schema terms.                 |
| `DocumentLocale`    |    10 | `DocumentLocalePayload`    | `Canonical_content_decl`   | Locale entry keys keep descriptor/content references as values while labels/descriptions are typed.          |
| `Document`          |     9 | `DocumentPayload`          | `Canonical_content_decl`   | `pages[].fields[].options[]` keeps content option objects extensible.                                        |
| `DocumentLocalized` |     7 | `DocumentLocalizedPayload` | `Canonical_content_decl`   | None beyond optional source metadata.                                                                        |
| `Workspace`         |     6 | `WorkspacePayload`         | `Canonical_surface_decl`   | None; workspace payloads are name/title plus view references.                                                |
| `Process`           |     4 | `ProcessPayload`           | `Canonical_workflow_decl`  | `nodes[].inputs[].expr`, `nodes[].inputs[].type`, and `edges[].guard` are workflow expression/type terms.    |
| `Schema`            |     4 | `SchemaPayload`            | `Artifact_http_validator`  | HTTP schema graphs are validated by the HTTP IR validator rather than the typed canonical validators.        |
| `TaskDefinition`    |     2 | `TaskPayload`              | `Canonical_workflow_decl`  | `inputs[].type` remains a workflow type term.                                                                |
| `HttpApi`           |     1 | `HttpApiPayload`           | `Artifact_http_validator`  | HTTP endpoint/schema graphs are validated by the HTTP IR validator rather than typed canonical validators.   |
| `PdfMapping`        |     1 | `PdfMappingPayload`        | `Canonical_content_decl`   | `documentRef`, computed mapping expressions, and assignment values remain content mapping DSL payloads.      |

## Malformed Fixture Coverage

| kind                | malformed fixture                            |
| ------------------- | -------------------------------------------- |
| `Record`            | `define-malformed-record-payload`            |
| `Link`              | `define-malformed-link-payload`              |
| `Entity`            | `define-malformed-entity-payload`            |
| `Query`             | `define-malformed-query-payload`             |
| `Action`            | `define-malformed-operation-payload`         |
| `View`              | `define-malformed-surface-payload`           |
| `Constraint`        | `define-malformed-rule-payload`              |
| `Relation`          | `define-malformed-edge-payload`              |
| `DocumentLocale`    | `define-malformed-content-locale-payload`    |
| `Document`          | `define-malformed-content-payload`           |
| `DocumentLocalized` | `define-malformed-content-localized-payload` |
| `Workspace`         | `define-malformed-workspace-payload`         |
| `Process`           | `define-malformed-workflow-payload`          |
| `Schema`            | `scripts/http-api.mjs`                       |
| `TaskDefinition`    | `define-malformed-task-payload`              |
| `HttpApi`           | `scripts/http-api.mjs`                       |
| `PdfMapping`        | `define-malformed-content-mapping-payload`   |
