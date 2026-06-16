# Account Config-as-Code and Multi-Tenant Plan

## Goal

Make an account visible and editable as configuration-as-code, then use that
same configuration boundary to support multiple tenants in one application.

Target experience:

- If Ben signs in as a staffing demo user, the app opens the staffing tenant:
  staffing types, forms, flows, obligations, actions, data, and config history.
- If another user signs in as a legal workflow demo user, the app opens the legal
  workflow tenant with a different configured account shape.
- Each tenant's configured account shape is declared in versionable JSON/YAML and
  Forma for now, with a path toward a Terraform-like deployment workflow: source,
  compile/elaborate, dump, plan, review, apply, and track runtime state changes.

## What "Terraform-Like" Means Here

This should not be a Terraform provider, Terraform module, or HCL track right
now. The intended workflow is the Terraform-style product experience:
declarative desired state, plan before apply, reviewable diffs, idempotent
applies, persisted state/change history, and drift detection. The
implementation should be native to this runtime and modeled after Open
Ontology's deployment flow.

Open Ontology's runtime deployment lifecycle uses this boundary:

```text
source bundle -> compile -> artifact -> diff -> plan -> apply -> active runtime state
```

The same source can be driven from code, CLI, or UI, but all entry points
converge on the same deploy service. Its `@open-ontology/deploy` package adapts
compiled source into prepared runtime deploy input, supports `--dump` for the
deploy payload, supports `--plan` for dry-run review, and applies only after a
plan is produced. Remote deploy follows the same split by posting the compiled
project to a plan endpoint and then applying the returned plan id.

The corresponding Forma account workflow should be:

```text
Forma/JSON/YAML source bundle
  -> account config IR
  -> account deploy artifact
  -> tenant runtime diff
  -> deployment plan
  -> reviewed apply
  -> active tenant runtime state + deployment history
```

Open Ontology also defines SaaS configuration as code as a mirror/edit/validate/
test/plan/diff/apply workflow. That is the right analogy: a tenant account
config mirror is compared with desired Forma source before approved changes are
applied to the runtime target.

This is a greenfield tenant-runtime plan. Product completion is evaluated for
fresh data instances where tenant-owned rows are created with `tenantId` from the
start. Live data migration, backfills, default-tenant promotion, and
widen-migrate-narrow rollout gates are explicit non-goals for this branch.

The Open Ontology submodule confirms two product boundaries we should preserve:

- Deployed source is read-only by default; edits begin by creating a draft.
- Code-first, CLI, and UI deploy paths converge on the same dump/plan/apply
  service rather than inventing separate deployment semantics per entry point.

## Implementation Status

Implemented in this branch:

- Tenant and membership tables with role-based tenant authorization.
- Demo tenant creation for staffing and legal workflow accounts.
- Demo tenant provisioning can now create only the staffing or legal account for
  the current principal, so demo personas can start in one tenant instead of
  always receiving both.
- Single-demo-tenant provisioning also installs that tenant's account config and
  seeds matching demo data, so staffing and legal personas start with usable
  tenant-local resources.
- Bulk demo tenant provisioning now uses the same setup path for both staffing
  and legal tenants, and demo data seeding is repeatable without duplicating
  current facts.
- Bundled runtime demo blueprints are kept aligned with checked-in account
  sources for exported tenant config, including staffing E-Verify workflow
  attributes.
- Tenant switcher in the app shell.
- URL-addressable tenant routes under `/t/:tenantSlug/...`, with the shell,
  command menu, guided tour, and common entity links preserving tenant context
  while existing unprefixed routes remain available.
- Tenant-scoped config manifests, config history, `planConfig`, and `applyConfig`.
- Account config JSON/YAML examples under `configs/accounts/`.
- Account Config UI for JSON/YAML/Forma source editing, source-format
  conversion, plan preview, apply, manifest, graph, and history.
- Dedicated System Console route for engine/debug views, with the legacy
  `/data-model` URL redirected to it.
- Tenant-scoped facts, fact events, current projections, transactions, rules,
  derived facts, flow definitions/runs/events, and rule invalidations.
- Tenant-aware reads for entities, facts, schema definitions, forms, actions,
  flow definitions/runs, rule listings, and derived-fact inspection.
- Tenant-aware materialization so tenant rules solve against tenant facts and
  emit tenant-local derived projections.
- Main workspace UI routes now pass the selected tenant into overview, entity,
  compliance, flow, transaction, action, and System Console reads/writes rather
  than falling back to global account reads.
- Entity, flow, and compliance workspaces now choose tenant-kind-aware demo
  defaults and setup actions, so legal tenants install legal workflows and use
  Matter/matter-intake subjects instead of staffing bootstrap copy and Worker
  defaults.
- Staffing demo setup now seeds demo facts and compliance obligations inside
  the selected tenant.
- The Confect compliance dry-run sidecar now accepts a tenant selector, verifies
  membership, and reads facts/rules through tenant-prefixed indexes.
- Server-rendered UI tests cover the tenant switcher plus Account Config plan
  and apply-job rendering states.
- Export-current-config query and Account Config UI export/load controls.
- Runtime export filters entity definitions through the active owned manifest,
  so exporting after a deployment change produces a valid desired-state config
  instead of leaking stale historical definition facts.
- `pnpm account-config validate|plan|export` command shape for JSON/YAML file
  validation and live Convex plan/export workflows.
- Server-side and CLI config diagnostics for duplicates, unknown references,
  invalid field types, missing form fields, bad flow step targets, invalid
  requirement guards, and invalid action assertions.
- Flow diagnostics now also validate compact step config references, including
  collect form/scope references, branch route targets, assert/action result
  attributes, and timing field types before a deployment plan is approved.
- Flow diagnostics now also validate compact branch `where` clauses for known
  attribute references, including close-match repair hints and authored step-line
  source locations for Forma branch predicate typos.
- Convex server-side account config validation now enforces those flow-step
  diagnostics before `planConfig`, apply jobs, or `applyConfig` accept a tenant
  deployment, and the bundled staffing blueprint declares the E-Verify result
  attribute used by its onboarding flow.
- Field diagnostics now validate select option payloads, rejecting select fields
  without usable options and non-select fields carrying ignored option lists.
- Field diagnostics now validate form field types against matching declared
  attribute value types when a form field reuses an account attribute name,
  while leaving evidence-only form fields unconstrained.
- Action field diagnostics now validate input field types against matching
  declared attribute value types when an action input reuses an account
  attribute name, including string-shaped entity/date inputs.
- Account config diagnostics now also validate account metadata, requirement
  validity windows, action field labels, and form-opening action scopes so the
  shared validator matches the checked-in source schema more closely.
- Account config diagnostics now validate literal values against declared
  attribute value types for requirement guards, branch where clauses, workflow
  assertions/action results, and action assertions before drafts or deployment
  plans can reach runtime apply.
- Typed literal validation diagnostics from authored Forma now map back to the
  relevant requirement, flow step, or action source block, so editor navigation
  and structured CLI diagnostics can point to the line that needs repair.
- Form field type mismatch diagnostics from authored Forma now map back to the
  exact field line, so source review can distinguish bad account attribute
  bindings from ordinary evidence fields.
- Action field type mismatch diagnostics from authored Forma now map back to
  the exact action field line, so `$arg.*` inputs and action UI fields stay
  aligned with the account attribute model before deploy.
- Form-opening action scope diagnostics now support runtime placeholders such as
  `$arg.scope` when they reference declared action fields, while still rejecting
  unknown static attributes and unknown action-argument placeholders.
- `configs/accounts/schema.json` now documents the account config IR shape for
  JSON/YAML source review, including resource definitions, fields, workflow
  steps, action effects, requirements, and timing config.
- `configs/accounts/schema.json` now also documents the semantic field/action
  input compatibility rules enforced by validator preflight when source fields
  reuse declared account attribute names.
- Plan output now reports added, changed, removed, and dangerous resource
  changes.
- Account deployment plans now also surface account metadata changes separately
  from resource diffs and treat metadata-only edits as non-empty reviewable
  plans, so name/kind/slug changes cannot silently disappear behind an artifact
  digest change.
- Persisted config apply jobs with completed/failed status, error capture, and
  retry support.
- Tenant-owned runtime tables now require `tenantId` in the Convex schema from
  the start. This branch targets fresh data instances, so live backfills,
  default-tenant promotion, and narrowing gates are outside product scope.
- Legacy global public write paths for tenant-owned data are blocked once any
  tenant exists.
- Fact-id mutations now authorize against the stored fact tenant, so callers
  cannot modify tenant facts by guessing a `factId` without membership.
- Fact lifecycle writes (`retractFact`, `tombstoneFact`, and `correctFact`) now
  require `{ tenantSlug, factId }`, authorize editor access to the requested
  tenant, and reject mismatched tenant/fact pairs instead of falling back to
  legacy global writes.
- Legacy global fact/entity read paths are blocked once any tenant exists,
  while tenant-owned runtime paths use explicit tenant context.
- Legacy global config, engine, overview, flow, rule, action, form, compliance,
  and Datalog read paths are blocked once any tenant exists.
- Tenantless legacy read-adapter tests now also cover representative overview
  activity, config history, fact query/timeline, flow run/definition,
  type-scoped action, attribute lookup, compliance, and derived-rule inspection
  surfaces after tenants exist.
- Host fact-event protocol verification now accepts explicit tenant context and
  reads through tenant-prefixed indexes, while tenantless verification is blocked
  once tenants exist.
- External collection-token tests now run through explicit fresh tenant setup
  and prove identical form/subject/scope collection links in two tenants submit
  facts and resume runs only for the tenant that issued the token.
- Terraform-style JSON artifact elaboration has been removed from the package
  and CLI; the native account deploy artifact is the deploy boundary.
- Runtime-neutral `@metacrdt/account-config` package for account config
  validation, manifest extraction, Forma conversion, and native account deploy
  artifact elaboration.
- Forma S-expression account config authoring support in
  `@metacrdt/account-config`, including parse-to-IR, IR-to-Forma source, and
  Forma source validation through the same account config diagnostics.
- Forma sources can now be written as a single `(account-config ...)` bundle
  wrapper containing the usual tenant, entity, form, flow, requirement, and
  action forms; parsing still lowers through the same IR and nested diagnostics
  point at the authored inner resource.
- Forma account bundles now also accept plural grouping wrappers such as
  `(attributes ...)`, `(entities ...)`, `(forms ...)`, `(flows ...)`,
  `(requirements ...)`, and `(actions ...)` for larger tenant source files,
  while section-specific validation rejects misplaced resources at the authored
  line.
- Misplaced Forma resources in grouped wrappers now report the found form head
  and, when it is a known account-config resource, suggest the matching wrapper
  to move it under while preserving the authored source location.
- Forma resource bodies now also accept grouped child wrappers such as
  `(fields ...)` inside forms/actions, `(requirements ...)` inside forms,
  `(steps ...)` inside flows, and `(asserts ...)` inside actions; normalization
  still emits the existing compact IR-shaped Forma.
- Compact Forma entity bodies now also accept grouped child wrappers such as
  `(attributes ...)`, `(forms ...)`, `(requirements ...)`, `(flows ...)`, and
  `(actions ...)`, so large domain entities can organize their local account
  resources without changing the lowered IR.
- Compact Forma `(entity ...)` authoring now lowers inline attributes into the
  shared account config IR, so a tenant account can define entity types and
  their fields together while still producing the same deploy artifact.
- Compact Forma entity blocks now also lower nested forms, flows, requirements,
  and actions into the shared IR; entity-scoped flows/actions default to the
  surrounding entity type for faster authoring.
- Compact Forma now supports `(tenant ...)` metadata as the clearer tenant-level
  alias for the underlying account metadata IR.
- Compact Forma attributes and fields now support positional authoring
  shorthands such as `(attr client entityRef)` and
  `(field ssn string "SSN" (required) (pii))`, while still lowering into the
  same shared account config IR and deployment artifact.
- Forma attributes, entity types, compact entities, and entity-local attributes
  now accept `(help "...")` as an alias for `(description "...")`, matching the
  documentation shorthand already available on forms, flows, requirements,
  actions, and fields.
- Top-level compact Forma now accepts `(attr ...)` as an alias for
  `(attribute ...)`, and normalization/editor snippets emit the compact alias so
  standalone attributes and entity-local attributes use the same authoring shape.
- Top-level compact `(attr ...)` definitions now also participate in source
  location mapping, so validation diagnostics on standalone compact attributes
  point to the authored line just like `(attribute ...)` definitions.
- Compact Forma field shorthands now also accept positional descriptions after
  type/label/options, and normalization emits that compact form instead of a
  named `(description ...)` block when the field can be rendered positionally.
- Forma form/action fields now support authored help text via
  `(description "...")` or `(help "...")`, normalize to field `description`, and
  carry that metadata through JSON/YAML schema validation and deploy artifacts.
- Forma form, flow, requirement, and action resources now also support authored
  `(description "...")` or `(help "...")` metadata, validate it consistently in
  the shared package and Convex deploy preflight, and carry it through native
  account deploy artifacts for review/diff context.
- Compact Forma select fields now support positional options as
  `(field status select "Status" ["open" "closed"])`, and normalization emits
  that form while still accepting named `(options [...])`.
- Compact Forma tenant, entity, form, and flow metadata now support positional
  authoring shorthands such as `(tenant acme-staffing "Acme Staffing" staffing)`,
  `(entity Worker "A staffed worker.")`, `(form i9 "Form I-9")`, and
  `(flow onboarding "Worker onboarding")`.
- Compact Forma form and flow metadata now also accept positional descriptions
  after their titles, and flows accept a following positional start step when
  title/description are present, lowering to the same deploy-review IR.
- Top-level compact Forma flows now also accept positional subject metadata as
  `(flow flow_name SubjectType "Title" "Description" start ...)`, while
  entity-scoped flows continue to inherit their subject from the surrounding
  entity block.
- Top-level Forma `entity-type` forms now support positional attribute vectors,
  so authors can write `(entity-type Matter ["matter.status" client])` without
  the heavier named `(attributes [...])` wrapper when they do not want a compact
  entity block.
- Compact Forma `entity` blocks now also support positional attribute vectors,
  such as `(entity Matter ["matter.status" client] "A legal matter.")`, and
  normalization emits that form for reference-only entity attributes while
  preserving nested `(attr ...)` definitions when definitions need review.
- Forma normalization now emits those compact attribute and field shorthands,
  including bare boolean field flags, so generated tenant source is closer to
  the authored shape accepted by the parser.
- Forma normalization now also emits compact positional tenant, entity, form,
  and flow metadata, keeping canonical source aligned with the Account Config
  editor starter/snippets.
- Compact Forma requirements and actions now support positional authoring
  shorthands such as `(requirement i9 employer 1095)`,
  `(action terminate Worker "Terminate worker" ...)`, entity-scoped
  `(action terminate "Terminate worker" ...)`, and positional
  `(opens-form i9 employer)` scope.
- Compact Forma requirement and action shorthands now also accept positional
  descriptions, lowering into the same `description` IR used by deploy review,
  source outline details, and generated artifacts.
- Compact Forma requirements now accept `(when attr value)` as a clearer guard
  alias for `(guard attr value)`, and normalization emits `(when ...)` while
  preserving the same `[attribute, value]` requirement guard IR.
- Forma normalization now emits compact positional descriptions for forms,
  flows, requirements, and actions when the surrounding resource can be rendered
  with the compact metadata shorthand.
- Compact Forma action fields now have an action-specific path, including
  `(default-value ...)` / `(default ...)` support, select-default validation, and
  rejection of form-only `pii` metadata on action inputs. Normalization now emits
  the shorter `(default ...)` alias.
- Convex server-side account config validation now enforces the same action
  field contract before `planConfig`, apply jobs, or `applyConfig` accept a
  tenant deployment.
- Convex server-side account config validation now also enforces requirement
  validity-window types and form-opening action scopes, including `$arg.*`
  placeholders backed by declared action fields.
- Form-opening actions can omit assertions; package and Convex runtime
  validation now normalize missing action assertions to an empty object for the
  same deployment/runtime behavior.
- Forma normalization and source-authoring helpers now emit the compact
  requirement/action forms as well, including positional requirement scopes,
  top-level action applies-to/label shorthands, and compact `opens-form` scope
  syntax.
- Compact requirement guards now accept pair, vector, or map authoring forms
  under either `(guard ...)` or `(when ...)`, normalize source back to
  `(when ...)`, and preserve the same `[attribute, value]` deployment IR guard.
- Compact Forma action assertions and workflow assert steps now accept the same
  pair, vector, or map attribute/value authoring forms as requirement guards,
  including falsey map values, while normalizing back to compact `(assert ...)`
  source and preserving the same deploy IR.
- Forma editor source-aware completions now suggest guarded requirements when
  the draft contains a reusable form, scope attribute, and guard attribute.
- Requirement completions now skip forms that already have requirements, so
  generated snippets avoid known duplicate-resource diagnostics.
- Requirement completions now emit the compact `(requires ...)` alias accepted
  at top level, keeping generated editor snippets aligned with canonical Forma
  requirement authoring.
- Action completions now prefer scalar/status attributes over generic names or
  entity references, so suggested actions assert a useful tenant-domain field.
- Flow and action completions now skip generated names that already exist in the
  draft, avoiding duplicate-resource suggestions for common generated snippets.
- Compact Forma flow steps now support common shorthands like `(collect ...)`,
  `(branch ...)`, `(assert ...)`, `(action ...)`, `(notify ...)`, and `(done)`,
  lowering them into the same deployment IR step objects without raw config maps
  for the common workflow cases.
- Compact Forma workflow steps now also support positional next ids as
  `(step collect_i9 (collect i9 employer) done)`, and normalization emits that
  compact step shape while still accepting named `(next done)`.
- Compact Forma flow bodies now also accept direct step children such as
  `(collect collect_i9 i9 employer (next done))` and `(done)`, so common
  flows can omit the surrounding `(step ...)` wrapper while lowering to the same
  deployment IR and source-located diagnostics.
- Direct compact done steps now infer the conventional `done` step id when
  authored as `(done)`, and normalization emits that shorter form for terminal
  done steps.
- Compact Forma form blocks now accept nested requirement declarations such as
  `(requires employer 1095 "Verify employment eligibility.")`, lowering into
  the same requirement IR while source diagnostics point back to the nested
  authored line.
- Compact Forma also accepts `(requires ...)` as the top-level and entity-local
  alias for `(requirement ...)`, so authors can use the same requirement spelling
  everywhere while normalization still emits form-local requirements when the
  referenced form is present.
- Compact Forma requirements now accept `(scope attr)` as an alias for
  `(scope-attr attr)`, matching the scoped `collect` and `opens-form` authoring
  style while preserving the same `scopeAttr` IR.
- Compact Forma requirements now also accept `(valid-for days)` as a readable
  named alias for `validityDays`, while normalization keeps emitting the compact
  positional validity-window form.
- Forma normalization now emits requirements inside their referenced form as
  `(requires ...)` when possible, keeping canonical checked-in source closer to
  the compact authoring shape while preserving the same deployment IR.
- Compact collect steps now support positional scoping as `(collect form scope)`,
  and normalization emits that form while still accepting `(scope-from scope)`.
- Compact collect steps also accept scoped `(collect form (scope attr))`
  authoring, matching the clearer scoped `opens-form` action syntax while still
  lowering to the existing `scopeFrom` workflow IR.
- Compact action workflow steps now support positional result syntax such as
  `(action "Review" status reviewed)`, and normalization emits that form while
  still accepting named `label`, `result-attr`, and `result-value` parts.
- Compact notify workflow steps now support positional channel, recipient, and
  template syntax such as `(notify "Opened" email "$arg.owner" opened-email)`,
  and normalization emits that compact shape while still accepting named parts.
- Compact collect/action workflow steps now preserve runtime timing controls such
  as `(reminder-seconds 60)`, `(escalate-seconds 300)`, `(expire-seconds 900)`,
  and `(delay-seconds 2)`.
- Compact branch steps now support positional routing and subject bindings as
  `(branch where ifTrue ifFalse subjectVar)`, while still accepting named
  `(subject-var worker)` and lowering to the shared workflow IR.
- Compact wait steps now support positional scheduling as `(wait 3)`, plus
  `(delay ...)` and `(pause ...)` aliases for authored timing steps, lowering to
  the same `{ seconds: 3 }` workflow IR while normalization emits canonical
  `(wait ...)` source.
- Compact notify steps now support deploy-review metadata such as
  `(channel ...)`, `(to ...)`, `(template ...)`, and `(delay-seconds ...)`,
  normalize that metadata back to Forma, and validate notify config shape in
  both the shared package and Convex deployment preflight.
- Compact Forma actions now support scoped `(opens-form form (scope attr))`
  syntax, lowering to the existing `opensForm` IR.
- Forma emission now uses the clearer `(tenant ...)` metadata header while still
  accepting the older `(account ...)` header.
- Account Config UI can load the live tenant export as JSON, YAML, or Forma,
  and can convert the current source draft between those formats before
  plan/apply.
- Account Config UI includes a selected-tenant-aware compact Forma starter so
  the deploy loop can begin from authored Forma instead of generated JSON/YAML.
- Account Config UI includes insertable compact Forma snippets for common
  authoring blocks while preserving the same validation and deployment path.
- The compact Forma starter and snippets now use the positional metadata,
  attribute, field, and resource-description shorthands accepted by the shared
  parser, so new drafts start with deploy-review documentation by default.
- Focused Account Config source tests now enforce those compact starter/snippet
  shorthands, including positional step-next syntax, so the UI authoring surface
  stays aligned with normalized Forma.
- Forma source parsing now returns structured diagnostics with reader
  line/column locations and resource paths for parser errors, unknown forms, and
  validation failures mapped back to authored blocks.
- CLI `validate` and `validate-forma` now preserve those structured Forma
  diagnostics in JSON/YAML output, so CI and code review artifacts can point to
  the authored line instead of only showing a collapsed parse error.
- CLI `validate` and `validate-forma` review output now also includes source
  file, format, and source digest metadata; JSON/YAML validation emits
  structured `{ message }` diagnostics as well as the legacy `errors` array.
- CLI `validate --output json|yaml` now also reports malformed JSON/YAML parse
  failures as structured review artifacts with source metadata instead of
  falling back to plain stderr.
- Forma lowering errors inside known account-config forms now also carry
  authored source locations, so malformed compact fields or step metadata point
  back to the line that needs repair instead of producing unlocated parse
  failures.
- Account Config UI renders those source diagnostics under the editor so users
  can connect validation failures to the Forma block they wrote.
- Account Config UI diagnostics now include source-line navigation that focuses
  and selects the reported editor line.
- Forma validation diagnostics now map form-field, action-field, and flow-step
  errors to the nested authored block where possible, so editor navigation and
  CLI review artifacts point at the exact field or step rather than only the
  parent form, action, or flow.
- Duplicate nested Forma diagnostics now use the same field/step source mapping,
  so repeated form fields, action fields, and flow steps point at the duplicate
  authored block instead of the parent resource.
- Unknown top-level Forma account-config forms now include repair hints for
  common ambiguous authoring mistakes, including JSON/camelCase resource heads
  such as `entityType` and nested-only resources such as `field`, `steps`, or
  `asserts` used at top level.
- Unknown Forma account-config heads now also suggest Forma spellings for
  JSON/IR-style deployment vocabulary such as `accountConfig`, `entityTypes`,
  `startStepId`, `opensForm`, action-result fields, branch routes, and collect
  timing controls.
- Unknown Forma account-config heads now also use close-match suggestions for
  ordinary authored typos such as `acount`, `entitty`, or `requiremnt`, pointing
  back to the nearest valid Forma head while preserving the authored source
  location.
- Grouped Forma wrapper diagnostics now also suggest close allowed child heads
  for ordinary typoed children such as `(forms (fom ...))` or
  `(fields (fild ...))`, while preserving the existing move-to-wrapper hints for
  known resources placed under the wrong wrapper.
- Account config reference diagnostics now suggest close valid resource names
  for likely typos across attributes, forms, entity types, flow step targets,
  requirement guards, action targets, opens-form targets, and `$arg.` action
  field scopes.
- Account config enum diagnostics now suggest close valid values for account
  kind, attribute value types, form/action field types, and flow step types, so
  common Forma/JSON/YAML typos such as `strng`, `entity-ref`, or `colect` point
  at the accepted deployment vocabulary.
- Account Config UI now renders a parsed source outline from the shared account
  config IR, grouping attributes, types, forms, flows, requirements, and actions
  with useful per-resource details.
- Source outline details now include authored resource descriptions when present,
  so documentation written in Forma/JSON/YAML is visible in the Account Config
  review surface instead of only living in the deploy artifact.
- Account Config source review now renders a resource graph derived from the
  parsed IR, showing relationships such as entity type attributes, entity-scoped
  flows/actions, collected forms, requirement scopes, and asserted attributes.
- The same graph derivation now lives in `@metacrdt/account-config` and is
  exposed through `pnpm account-config graph <source>`, so checked-in
  JSON/YAML/Forma tenant sources can be inspected outside the UI.
- `check-sources` now includes a stable resource graph digest, edge count, and
  edge list for every checked-in tenant source, and fails review when different
  formats for the same tenant produce different graph digests.
- `@metacrdt/account-config` can render resource graph edges as Mermaid, and
  `pnpm account-config graph --output mermaid <source>` emits a reviewable
  visual graph from the same JSON/YAML/Forma deploy source.
- The CLI graph command now also supports `--output yaml`, so graph digests and
  edge lists can be stored in the same structured review format as validation,
  source checks, dumps, diffs, and exports.
- Local CLI review artifact tests now execute the `graph --output yaml` and
  `outline --output json` commands against checked-in Forma source, proving the
  command surface emits account metadata, stable digests, graph edges, and
  line-numbered navigation without requiring live Convex credentials.
- Account Config source review now shows the same Mermaid graph artifact in the
  UI next to the parsed resource graph, so visual review can happen without
  leaving the draft/deploy workflow.
- Account Config graph Mermaid artifacts now derive account metadata directly
  from the parsed source IR, so both read-only active mirrors and editable
  drafts include the tenant/account label in visual review output.
- Source outline entries now carry best-effort source-line locations and can
  focus/select the matching editor line when clicked.
- Account Config UI now includes a Forma completion menu with template snippets
  and source-aware suggestions derived from the current draft IR, such as
  requirements, collect steps, and actions using known forms, scopes, and types.
- Account Config UI snippets now include a grouped `(account-config ...)` bundle
  template that demonstrates the plural Forma section wrappers for larger
  tenant source files, including nested `(fields ...)`, `(steps ...)`, and
  `(asserts ...)` resource-body wrappers.
- Account Config UI snippets now also include a grouped compact entity template
  for entity-local attributes, forms, requirements, flows, and actions.
- Forma completion suggestions now expose those grouped bundle and grouped
  entity templates directly in the completion dropdown, with parse-through and
  browser-facing preview coverage for larger tenant authoring starts.
- The selected-tenant compact Forma starter now also uses grouped compact entity
  sections, so new drafts begin in the same scalable authoring shape supported
  by the parser and snippets.
- Account Config UI source-aware suggestions now also include compact top-level
  flow snippets that use positional subject metadata and parse back through the
  same deployment IR.
- Forma completion snippets now use label-based template lookup instead of
  brittle array positions, include form-with-requirement and collect-flow
  templates, and generate bounded source-aware requirements, collect steps,
  flows, and actions across the current draft resources while avoiding known
  duplicate flow/action suggestions.
- Forma completion suggestions now also generate nested form/action field
  snippets from known scalar attributes, while skipping `entityRef` scope
  attributes that should not become literal input fields.
- Forma completion suggestions now also generate compact review-form snippets
  from an entity type's compatible scalar/date/boolean attributes, using select
  options for status/priority-style fields and suppressing duplicate generated
  form names already present in the draft.
- Forma completion suggestions now also generate compact branch/action workflow
  step snippets from the preferred scalar/status attribute, parse those snippets
  back through the shared IR, and suppress them when the generated step ids
  already exist in the draft.
- Forma completion suggestions now also generate compact notify workflow step
  snippets from entityRef/contact-style attributes, parse those snippets back
  through the shared IR, and suppress them when the generated notify step id
  already exists in the draft.
- Forma completion suggestions now also generate compact form-opening action
  snippets from known forms, entity types, and reusable scope attributes, parse
  those snippets back through the shared IR, and suppress duplicate generated
  action names in the draft.
- Source-aware Forma requirement, branch, and action snippets now infer useful
  placeholder values from status/state/stage and priority/risk-style attributes,
  so generated tenant code starts with values such as `active` or `medium`
  instead of an abstract `"value"` token when the draft gives enough context.
- Account Config completion rendering now shows the selected suggestion's
  source-aware/template status, detail text, and generated Forma source preview
  before insertion, with SSR coverage for source-aware field snippets.
- Account Config UI now includes source-aware editing controls to normalize the
  current JSON/YAML/Forma draft through the shared IR and expand/compact the
  resource outline for larger tenant configs.
- Source conversion tests now prove checked-in Forma can be formatted through
  JSON, YAML, and Forma and parsed back without changing account metadata or the
  resource graph semantics used for review.
- Account Config UI now includes source-resource jump navigation built from the
  parsed outline, so users can choose a resource and focus/select its source
  line in the editor.
- Source-resource navigation now resolves requirement outline entries to
  top-level `(requires ...)` aliases or form-local nested `(requires ...)` lines,
  so canonical Forma requirements jump to the authored requirement block instead
  of only the parent form.
- Source-resource navigation now also exposes tenant account metadata as a jump
  target and resolves scoped grouped requirements by form plus scope, so larger
  grouped source files do not collapse distinct requirement review points onto
  the first matching form.
- Account Config UI now uses a dedicated account config source editor component
  with stable sizing and a line-number gutter instead of rendering a raw
  textarea directly in the page.
- `@metacrdt/account-config` now exposes a shared source-outline derivation, and
  `pnpm account-config outline --output json|yaml <source>` emits account,
  resource, detail, line, source digest, artifact digest, and outline digest
  metadata for code review.
- `check-sources` now includes the same source-outline review block for every
  checked-in tenant source and compares outline digests across source formats,
  so JSON/YAML/Forma drift is caught alongside artifact and graph drift.
- Forma source drafts in Account Config now use the existing `@forma/editor`
  CodeMirror integration, including syntax highlighting, line numbers, bracket
  matching, structural editing keymaps, account-config diagnostics,
  source-aware completions, hover details, and semantic resource highlighting.
- Forma editor hover details now resolve actual account resources under the
  cursor before falling back to completion hints, so authors can inspect
  attribute types/cardinality, form field counts, flow subject/step counts, and
  action assertion counts in-place while editing tenant source.
- Larger checked-in Forma tenant examples now live next to JSON/YAML sources in
  `configs/accounts/staffing.forma` and `configs/accounts/legal-workflows.forma`.
- Checked-in Forma tenant examples are normalized with the compact multiline
  Forma emitter, so draft comparison and source review operate on the same
  canonical source shape.
- JSON/YAML-to-Forma emission now uses compact workflow step shorthands for
  common step types, so generated Forma is closer to authored tenant source.
- `pnpm account-config validate` and live dry-run `plan` now accept JSON, YAML,
  or Forma source through the same account-source reader.
- `pnpm --silent account-config forma|from-forma|validate-forma` commands for
  JSON/YAML/Forma round trips.
- `from-forma`, `validate-forma`, `normalize-forma --check`, and live `export`
  now accept `--output json|yaml`, so authored Forma, normalization checks, and
  runtime tenant state can be reviewed as either JSON or YAML source artifacts
  while keeping the same deploy IR.
- `from-forma --output json|yaml` now also returns structured Forma diagnostics
  for invalid authored source instead of collapsing conversion failures into a
  plain error.
- Invalid `from-forma --output json|yaml` and `normalize-forma --check --output
  json|yaml` artifacts now include source file, format, and source digest
  metadata alongside the structured Forma diagnostics.
- Local `validate` and `check-sources` now also accept `--output json|yaml`, so
  CI/review evidence can be captured in either structured format across the
  source validation and deploy-artifact review loop.
- `pnpm account-config normalize-forma <config.json|yaml|yml|forma>` now
  round-trips any account source through the shared IR and emits normalized
  compact Forma for checked-in source review.
- CLI review coverage now validates compact timing aliases such as `(delay ...)`
  and `(pause ...)` and proves normalization rewrites them to canonical
  `(wait ...)` source before deployment review.
- `pnpm account-config normalize-forma --check <config.forma>` now verifies that
  a checked-in Forma source already matches normalized compact output for CI and
  review hygiene.
- `normalize-forma --check --output json|yaml` now emits source and normalized
  digests plus added/removed line counts, so CI review artifacts can explain a
  formatting failure without dumping the full normalized source.
- `normalize-forma --check --output json|yaml` now also returns structured Forma
  diagnostics for invalid source instead of failing before writing reviewable
  output.
- `pnpm account-config normalize-forma --write <config.forma>` now rewrites a
  checked-in source to the normalized compact multiline Forma shape.
- `pnpm account-config check-sources [configs/accounts]` now validates all
  checked-in JSON/YAML/Forma account sources, fails review if any Forma source
  is not normalized, and proves each source can dump a deploy artifact plus a
  valid local initial deployment plan with source/artifact digests.
- `check-sources` now preserves structured Forma diagnostics with source
  locations in its JSON/YAML output, so repository-wide source checks expose the
  same authored-line evidence as single-file validation.
- `check-sources` now also reports malformed JSON/YAML parse failures as
  structured per-file diagnostics with source digests, so repository-wide review
  output stays machine-readable even when checked-in source cannot be parsed.
- `check-sources` now reports denormalized Forma as an explicit per-file error
  with the `normalize-forma --write` remediation command instead of only failing
  the aggregate result.
- `check-sources` now also groups checked-in sources by tenant slug and fails if
  different source formats for the same tenant produce different deploy artifact
  digests.
- `check-sources` now emits an aggregate review summary with file counts,
  account counts, per-account formats, validity, and stable artifact/graph/
  outline digests so CI logs and code review can understand the source gate at a
  glance before drilling into per-file artifacts.
- The root `pnpm test:all` path now runs `pnpm check:account-config`, so the
  checked-in account source gate is part of the standard verification command.
- Forma normalization now emits compact `(entity ...)` blocks from entity type
  and attribute IR, keeping shared or unreferenced attributes valid without
  duplicate definitions.
- Entity-scoped flows and actions now normalize into their corresponding compact
  entity blocks, omitting redundant `subject-type` and `applies-to` metadata
  while preserving the same shared IR on round trip.
- Normalized Forma now formats nested entity, form, and flow resources over
  multiple indented lines so generated checked-in source is reviewable instead
  of a single long S-expression.
- Legacy `terraform` and `terraform-module` commands have been removed; the
  CLI surface is deployment-native.
- Account deploy artifact generation in `@metacrdt/account-config`, including
  `dumpAccountDeploy`, stable source/artifact digests, and deployment-native
  resource maps derived from the shared account config IR.
- Runtime-neutral `planAccountDeploy` and `planAccountDeployFromConfig` helpers
  compare prepared account deploy artifacts locally, reporting added, changed,
  removed, unchanged, dangerous removals, empty plans, and source/target
  artifact digests for CI-style review before a live Convex deploy.
- Runtime-neutral `deployAccountIfMain(import.meta, config, target)` supports
  code-first demo/script entrypoints by producing the same dump and local plan,
  then optionally delegating remote plan, approval, and apply operations to a
  host-provided target without coupling the package to Convex.
- Runtime-neutral `approveAccountDeploy(tenant, planId, target)` gives
  code-first deploy callers an explicit host adapter for approving a persisted
  runtime deployment plan by tenant and plan id without coupling the package to
  Convex.
- Runtime-neutral `applyAccountDeploy(tenant, planId, target)` gives
  code-first deploy callers an explicit host adapter for applying an approved
  runtime deployment plan by tenant and plan id without coupling the package to
  Convex.
- `pnpm account-config dump <source>` and compatibility `dump-deploy <source>`
  commands emit the full source IR plus prepared account deploy artifact for
  JSON, YAML, or Forma source.
- Local `dump`, `dump-deploy`, and `diff-deploy` now accept
  `--output json|yaml`, so deploy-review artifacts can be stored as either JSON
  or YAML without requiring a live Convex deployment.
- Artifact-producing local commands that accept `--output json|yaml` now also
  write validation failures in that requested format, keeping failed graph,
  dump, diff, and live plan preflight output usable as CI review artifacts.
- Local artifact-producing commands such as `graph`, `outline`, `dump`, and
  `diff-deploy` now include source file, format, source digest, and structured
  diagnostics when semantic account-config validation fails.
- `pnpm account-config diff-deploy [--current <account.deploy.json>] <source>`
  produces a local deployment diff from JSON/YAML/Forma source and an optional
  current deploy artifact or dump, without requiring a Convex deployment.
- Local `diff-deploy` review output now also includes source file/format/account
  metadata plus source and prepared artifact digests/manifests, so idempotent
  and non-idempotent diffs carry enough context for code review without running
  a separate dump command.
- Persisted `accountDeploymentPlans` and `accountDeploymentStates` tables for
  tenant deployment plans, source/artifact digests, apply status, and active
  deployment pointers.
- `accountDeploy.planFromArtifact`, `accountDeploy.applyPlan`,
  `accountDeploy.currentDeployment`, `accountDeploy.listPlans`, and
  `accountDeploy.reviewPlan` Convex functions for runtime-owned deployment
  plan/apply/review flow.
- `accountDeploy.approvePlan` approval gate; deployment plans now move through
  `planned -> approved -> applied`.
- `accountDeploy.planRollback` creates a fresh planned deployment from a stored
  earlier artifact/config so rollback is reviewable before apply.
- `pnpm account-config deploy-current`, `deploy-list`, `plan-deploy`,
  `rollback-deploy`, `review-deploy`, `approve-deploy`, and `apply-deploy`
  command shapes for live deployment inspection, planning, rollback planning,
  review snapshot export, approval, and applying through Convex.
- Live deployment commands now accept `--output json|yaml`, so deployment plans,
  active-state reads, and draft listings can be captured in reviewable YAML.
- `pnpm account-config draft-save --tenant <slug> [--name <name>]`,
  `draft-list --tenant <slug> [--limit <n>]`, and
  `draft-export --tenant <slug> [--name <name>]` command shapes for importing
  checked-in source into a runtime draft, reviewing saved runtime drafts, and
  redirecting draft source back into checked-in `configs/accounts/*` files
  before deployment approval.
- `draft-save` preserves checked-in source path/digest metadata and review notes,
  saves Forma parse diagnostics for invalid source repair, and records the
  deploy artifact digest when the source is valid for the selected tenant.
- `pnpm account-config plan-deploy --tenant <slug> --draft <name>` can now link
  a CLI-created deployment plan to the saved runtime draft it came from after
  verifying the local source text digest, source format, and artifact digest
  against that draft.
- Account Config UI now creates persisted deployment plans from the current
  draft source, approves and applies selected plans through the deployment API,
  creates rollback plans from applied deployments, and shows active deployment
  plus recent deployment-plan status and digests.
- Account Config UI now follows the Open Ontology draft boundary: the active
  tenant source mirror is read-only by default, users explicitly create a draft
  from active source or checked-in/starter Forma, and deployment planning is
  disabled until a draft exists.
- Persisted `accountConfigDrafts` table and tenant-authorized
  `accountConfigDrafts.listDrafts`, `latestDraft`, `saveDraft`, and
  `deleteDraft` functions preserve draft source, format, diagnostics, source
  digest, checked-in source path/digest, review note, optional artifact digest,
  server validation result, updated actor, and timestamps across reloads.
- Account Config UI can now save the current source as a named draft, reload a
  saved draft into the editor, delete saved drafts, and preserve invalid source
  drafts with diagnostics for later repair.
- Account Config UI can load bundled checked-in Forma tenant sources into a
  draft, compare the current draft text digest with the checked-in source digest,
  and save review notes with the draft before deployment planning.
- Account Config UI now renders selected saved-draft review metadata before
  deployment planning, including validation status, checked-in source path,
  checked-in match/diff status, source digest, and review note, with
  browser-facing render coverage.
- Account Config saved-draft selection is now a shared reviewed component with
  browser-facing loading, empty, selected, and busy-state coverage before a
  draft is loaded back into the source editor.
- Account Config UI now resolves checked-in source selections through the active
  tenant's source list, so switching tenants cannot leave a previous tenant's
  checked-in Forma file selected for draft comparison or loading.
- Account Config checked-in source selection is now a shared reviewed component
  with browser-facing no-source, match, diff, and stale-selected-path fallback
  coverage.
- Account Config UI now renders an explicit Draft -> Review & Deploy -> Active
  Deployment workflow state panel, summarizing source readiness, pending or
  approved deployment plans, dangerous changes, and the active artifact.
- Account Config UI now includes a Drift source-mirror panel that compares the
  current draft artifact, exported live tenant mirror, active deployment
  artifact, manifest counts, resource previews, diagnostics, and dry-run change
  totals.
- Account resource graphs now include authored attribute dependencies for flow
  collect scopes, requirement guards, and static action opened-form scopes, so
  drift/deploy review can surface scope and guard dependencies rather than only
  direct form/action/assertion links.
- Deployment plans now persist normalized review metadata for source format and
  digest, artifact digest and manifest, semantic diff totals, dangerous changes,
  rollback ancestry, and bounded source/artifact payload previews.
- Deployment plans can now link back to the saved draft that produced them,
  preserving draft name, text digest, checked-in source metadata, review note,
  artifact digest, and saved-by metadata in the persisted review payload.
- Account Config deployment review now renders draft-linked plan metadata with
  explicit checked-in source match/diff status, checked-in path, review note,
  and browser-facing coverage.
- Draft-linked deployment plans now require the caller to submit the saved draft
  source digest, and the server rejects stale draft links whose source digest,
  source format, or artifact digest no longer matches the deployment payload.
- Deployment plans now also persist a bounded resource graph review block with a
  graph digest, edge count, and edge preview, and the Account Config deployment
  panel renders that graph metadata next to the semantic diff and artifact
  manifest.
- Deployment plans now record the active deployment baseline they were reviewed
  against; approval and apply both reject stale plans, and stale attempts record
  a failed result instead of advancing review state or mutating runtime state if
  another deployment has changed the tenant's active artifact in the meantime.
- Deployment planning now verifies submitted source/artifact digests and artifact
  payloads against the account config before persisting a plan, so review
  metadata cannot be forged independently from the deployable config.
- Deployment planning now also validates account metadata at the deploy boundary
  and rejects configs whose account slug does not match the target tenant.
- CLI and Account Config UI deployment entry points now preflight that same
  account-slug/tenant match before calling the runtime deployment planner.
- CLI deployment preflight failures now honor `--output json|yaml`, so account
  slug/tenant mismatches can be captured as structured review artifacts before
  any live Convex call is attempted, including source file, format, digest, and
  diagnostics metadata.
- Account Config UI renders deployment review details for each plan: semantic
  change totals, artifact manifest counts, dangerous changes, approval state,
  rollback ancestry, and side-by-side source/artifact payload inspection.
- Rollback planning is constrained to applied deployment targets, carries target
  digest/apply metadata into the review payload, and renders rollback-specific
  approve/apply labels in Account Config.
- Tests covering membership visibility, tenant-scoped config manifests/history,
  plan isolation, duplicate logical entity isolation, tenant-local lowered
  config resources with shared names, tenant-scoped demo seeding, export round
  trips, Confect dry-run tenant isolation, and the Account Config/System Console
  navigation split.
- Frontend rendering tests cover tenant switcher states, plan diff/error/danger
  rendering, failed apply-job retry rendering, and checked-in staffing/legal
  account graph review artifacts with distinct tenant-specific edges.
- Convex tests cover the account config draft lifecycle: save, server
  validation capture, checked-in source metadata, review notes, update,
  list/latest, membership isolation, and delete.
- Convex deployment tests now cover the greenfield Forma path end to end:
  create two fresh tenants, parse Forma sources, dump deploy artifacts through
  the shared package, plan/approve/apply both tenants, and verify active
  deployment state plus config manifests/history remain isolated.
- Convex deployment tests now also cover the checked-in Forma authoring loop:
  create fresh tenants, save checked-in Forma as tenant drafts with review
  metadata, plan from the saved draft, approve/apply, inspect active deployment,
  export tenant config, and verify staffing/legal resources and drafts remain
  isolated.
- Convex deployment tests now cover repeated deployment of the active artifact:
  re-planning produces an empty, non-destructive, non-stale deployment plan, and
  applying it skips runtime config writes while advancing the active deployment
  review state.
- Convex deployment artifact validation now matches the shared account-config
  package artifact shape for authored form, flow, requirement, and action
  descriptions, so package-generated artifacts can be submitted to the runtime
  deploy planner without digest drift.
- The Account Config workflow panel now exposes the source-review loop as one
  visible path: checked-in/draft source, parse diagnostics, normalized source
  status, graph/navigation counts, deployment plan state, and active deployment
  state.
- Source-review navigation now has the same flattened jump-list shape in the
  shared account-config package, CLI `outline` output, CLI `check-sources`
  review payloads, and Account Config UI selector, including line numbers,
  resource details, and the authored source-line preview.
- Component-owned entity action and flow execution can now use the selected
  tenant's configured account surface: the UI passes `tenantSlug` for configured
  actions/flows, and the component wrapper resolves tenant-local action, flow,
  and cardinality definitions before writing component-owned events.
- Component-owned configured action and flow entry points now require
  `tenantSlug` at the Convex validator boundary, so component-owned runtime
  execution cannot load tenant-configured definitions through an unscoped
  fallback. Tests cover missing tenant context rejection for both entry points.
- Entity-detail, component-owned entity, and compliance dry-run UI paths now skip
  configured runtime action/flow/compliance operations unless a tenant is
  selected, and mutation calls pass an explicit `tenantSlug` instead of keeping
  an unscoped legacy fallback shape.
- Core public runtime write APIs now require `tenantSlug` at the Convex argument
  boundary for fact assertion, schema/resource definition, configured action
  execution, flow start/definition/collection, compliance setup/seed/submit, and
  config apply/setup paths. Tests now cover that missing tenant context is
  rejected before tenant-owned runtime data can be written.
- Greenfield tenant-context tests now explicitly cover the configuration-as-code
  authoring/deploy surface: attribute/type/form/action/rule/flow definitions,
  demo flow/compliance setup, apply jobs/actions, and bundled staffing/legal
  setup all reject missing `tenantSlug` at the public API boundary.
- Account Config source review now renders a normalized source diff from the
  current draft to its normalized JSON/YAML/Forma form, including added/removed
  line counts and a bounded review preview.
- Account Config normalized source diff review now also shows displayed-line
  counts and top-level truncated status before the scrollable diff body, with
  browser-facing coverage for truncated and already-formatted review states.
- Account Config normalized source diff review now also carries source format,
  draft source digest, normalized digest, checked-in source path, and
  checked-in match status through the deployment review surface, so the
  formatting artifact can be tied back to the exact source under review.
- Browser-facing source diff coverage now exercises both normalize-needed and
  already-formatted draft states, so repeated deploy reviews do not imply a diff
  when the source already matches canonical output.
- Account Config deployment review now presents a top-level review artifact for
  the current actionable plan, combining normalized source diff, active baseline
  drift, draft/live artifact drift snapshots, artifact manifest count, resource
  graph edge count, semantic diff count, dangerous-change count, and plan status
  before the per-plan approval/apply controls.
- Deployment review artifacts can now be exported by plan id through
  `accountDeploy.reviewPlan` and
  `pnpm account-config review-deploy --tenant <slug> --plan`, including
  source/artifact review payloads, draft review metadata, baseline vs current
  active deployment comparison, and stale-plan copy for code review.
- Account Config deployment plans now include an expandable browser-facing
  review snapshot with the `review-deploy` CLI export command, compact JSON
  artifact, plan id, and stale/fresh baseline status before approval or apply.
- Browser-facing deployment review coverage now asserts stale repeated-deploy
  plans show the expected-active artifact, current-active artifact, stale status,
  review export command, checked-in draft status, and artifact manifest summary.
- Account Config deployment review now disables stale approve/apply controls
  with explicit re-plan copy when the active deployment no longer matches the
  plan's reviewed baseline.
- Browser-facing deployment review coverage now also asserts idempotent empty
  plans render as fresh no-change reviews with matching active baselines,
  zero-change semantic diffs, review export commands, and manifest summaries.
- Browser-facing deployment review coverage now also covers failed deployment
  plans, showing failed-state copy, persisted apply error text, review export
  command, and no approve/apply controls for a failed plan.
- Server-side deployment review export coverage now also proves failed stale
  apply plans retain failure status, error text, source/artifact review
  metadata, and current active baseline data through `accountDeploy.reviewPlan`.
- Browser-facing rollback review coverage now asserts empty rollback plans render
  as already active while still exposing rollback target metadata, fresh baseline
  status, review export command, and approval affordances.
- Account Config rollback review now surfaces target source digest, artifact
  digest, original plan id, and applied time in the rollback target panel, with
  browser-facing coverage for complete and partially populated target metadata.
- Browser-facing deployment panel coverage now also exercises initial loading
  and no-plan states, including missing active deployment copy and the absence
  of review/approval affordances before a plan exists.
- Browser-facing deployment review coverage now also exercises the intermediate
  state where a deployment plan is available while the active deployment
  baseline is still loading, including checking-state review snapshots and
  export commands.
- Browser-facing deployment review coverage now also exercises truncated
  resource graph metadata, preserving the `N+ edges` review signal, graph
  digest, and bounded edge preview for larger tenant definitions.
- Browser-facing plan coverage now asserts metadata-only account changes render
  as reviewable dry-run plans even when every resource-kind diff is empty.
- Browser-facing workflow coverage now also exercises blocked/unready source
  states, including missing checked-in source, unparsed draft source, waiting
  normalization/graph review, loading plan review, and no active deployment.
- Browser-facing drift coverage now exercises unparseable draft source, loading
  live and active mirrors, missing live mirrors, missing active deployments, and
  source diagnostics before a fresh tenant has any deployed config mirror.
- Tenant config history now supports server-side review filters for
  manifest-changing applies and specific changed resource kinds, and the Account
  Config history panel requests those filtered slices directly instead of only
  hiding rows in the browser.
- The Account Config history filter and manifest-change list are now extracted
  into a reusable browser-facing panel with render coverage for filter options,
  selected resource-kind filters, added/removed manifest chips, and idempotent
  apply rows.
- The Account Config history panel now also renders transaction audit metadata
  from the server history query, including transaction id, actor, changed kinds,
  event counts, and post-apply manifest counts, with browser-facing render
  coverage.
- The Account Config history panel now also summarizes audit impact per
  transaction with total manifest changes, added/removed counts, and explicit
  idempotent apply status.
- Browser-facing history coverage now also exercises loading and empty filtered
  history states, so fresh tenants and filters with no matching deployment
  applies still present a clear review/audit panel.
- Forma editor completions now include type-aware field alternatives for source
  attributes, including inferred select options for status/priority-like string
  attributes and required checkbox snippets for boolean attributes, with parse-
  through coverage that proves the snippets lower into valid account config IR.
- Forma editor completions now also include defaulted select-field variants for
  status/priority-like attributes, so authors can insert reviewable options and
  a valid default value in one snippet while still lowering through the same IR.
- Forma editor completions now infer citizenship select options for I-9-style
  attributes such as `i9/citizenship`, and generated review-form completions
  carry those domain options through the same deploy-valid field syntax.
- Forma editor completions now also infer staffing workflow select options for
  `worker.status` and `everify.status`, including deploy-valid default values
  and generated review-form field output aligned with the checked-in staffing
  account source.
- Context-sensitive Forma completions distinguish field defaults from workflow
  assertions, so E-Verify fields can default to `pending` while generated branch
  and action snippets assert the completed `verified` state.
- Forma editor completions now infer legal workflow select options and default
  literals for `matter.status`, aligning generated fields, guards, branches, and
  actions to the checked-in legal source's `open`/`closed` lifecycle states.
- Generated Forma labels now preserve common domain acronyms/product spellings
  such as SSN, I-9, and E-Verify, so inserted field labels are reviewable without
  hand-editing cosmetic casing.
- Forma editor completions now also include defaulted boolean, number, and date
  field variants with type-correct default literals, and browser-facing
  completion coverage renders those snippets before insertion.
- Forma editor completions now also include required string, select, number, and
  date field variants for compatible account attributes, with parse-through
  coverage proving those snippets lower to required form fields and
  browser-facing coverage for the required select preview.
- Forma editor completions now also suggest PII-marked string/date form fields
  for sensitive-looking attributes such as SSN, email, phone, and birth-date
  fields, with parse-through coverage and browser-facing completion preview
  coverage.
- PII-aware completions now also include required+PII field variants for
  sensitive string/date evidence fields, so common forms such as identity
  collection can insert both review constraints in one deploy-valid snippet.
- Generated entity review-form completions now propagate those PII hints into
  the generated form fields, so larger suggested forms preserve sensitive-field
  metadata without requiring a separate field-snippet edit.
- Context-sensitive Forma completions now emit typed boolean and number literals
  for generated requirement guards, branch predicates, workflow action steps, and
  top-level assertions, so snippets targeting non-string attributes pass the
  same deployment literal validation without manual edits.
- Context-sensitive Forma completions now enumerate multiple viable entity-ref
  scopes for generated requirement and collect-step snippets, so accounts with
  several reusable scopes such as client, responsible attorney, employer, job,
  and venue can insert deploy-valid scoped Forma without hand-editing the first
  suggested scope.
- Context-sensitive Forma completions now generate scoped flow variants from
  known form requirement scopes and tenant entity-ref attributes, with distinct
  flow and collect-step ids for secondary scopes such as responsible attorney.
- Generated flow completion labels now include the collected form as well as the
  entity and secondary scope, so accounts with several forms no longer show
  duplicate-looking `Flow for ...` suggestions in the review UI.
- Source-aware completion coverage now asserts generated labels stay unique for
  bundled staffing/legal account sources and duplicate-heavy authoring fixtures,
  protecting the Account Config completion dropdown from ambiguous entries.
- Generated flow completions now suppress duplicates by existing collect-flow
  behavior, not only by generated flow name, so custom-named flows that already
  collect the same form for the same entity and scope prevent duplicate snippets.
- Generated collect-step completions now suppress duplicates by existing collect
  behavior, not only by generated step id, so custom-named workflow steps that
  already collect the same form and scope prevent duplicate step snippets.
- Generated notify-step completions now suppress duplicates by existing notify
  behavior, not only by generated step id, so custom-named notification steps
  with the same channel, recipient, and template prevent duplicate snippets.
- Generated branch-step completions now suppress duplicates by existing branch
  behavior, not only by generated step ids, so custom-routed workflow branches
  over the same attribute and literal value prevent duplicate route snippets.
- Generated delay-step completions now suppress duplicates by existing wait
  behavior, not only by generated step id, so custom-named delay/wait steps with
  the same pause duration prevent duplicate delay snippets.
- Generated action completions now suppress duplicates by existing action
  behavior only when the same entity, attribute, and literal value are already
  asserted, so existing close/cancel actions do not hide useful active-state
  action snippets.
- Generated action completion labels now include the asserted attribute and
  literal value, so the review UI distinguishes actions such as setting a status
  to active from other actions on the same entity.
- Generated scope-aware Forma completions now avoid using ordinary string/status
  attributes as evidence scopes when entity-ref scopes are available, keeping
  suggested requirements, flows, collect steps, and form-opening actions aligned
  to reusable entity references.
- Context-sensitive Forma completions now also generate scoped form-opening
  action snippets from known form requirement scopes and tenant entity-ref
  attributes, so authors can open the same review form under the correct
  reusable scope without manually rewriting `opens-form`.
- Form-opening action completions now suppress duplicates by existing action
  behavior, not only by generated action name, so a custom-named action that
  already opens the same form for the same entity and scope prevents a duplicate
  snippet.
- Generated entity review-form completions now include an inline scoped
  requirement when the entity has an entity-ref attribute, so a generated form
  can become a deployable evidence surface without a separate hand-authored
  requirement block.
- Secondary scoped Forma collect-step completions now generate distinct step ids
  and suppress suggestions whose generated step id already exists, so larger
  workflows can combine several scoped collection steps without duplicate-step
  diagnostics.
- Browser-facing completion coverage now renders those generated typed-literal
  snippets through the Account Config completion panel, so the review UI shows
  the same deploy-valid Forma source authors will insert.
- Browser-facing completion coverage now also renders secondary scoped
  requirement and collect-step snippets, proving the Account Config completion
  panel exposes those multi-scope Forma suggestions with deploy-valid step ids.
- Forma editor completions now also include a compact delay-step snippet using
  the `(delay ...)` timing alias, with parse-through coverage proving it lowers
  to the canonical wait-step IR, duplicate generated step ids are suppressed,
  and browser-facing completion coverage renders the inserted Forma preview.
- Forma editor completions now also include a compact terminal `(done)` workflow
  step snippet when the draft does not already define one, with parse-through
  coverage and browser-facing completion preview coverage for compact flow
  authoring.
- Shared account-config diagnostics now validate form and action field default
  values against their field types, so string, number, boolean, and select
  defaults are rejected before a draft or deployment plan reaches runtime apply.
- Shared account-config diagnostics now also validate date form-field defaults
  as string-shaped values, matching the checked-in JSON schema contract and the
  generated date-field authoring snippets.
- Authored Forma date default failures now surface through structured CLI
  diagnostics and the Account Config source diagnostics panel with source-line
  locations, so reviewers can jump directly to the bad date field before deploy.
- Forma normalization now preserves form-field default values as `(default ...)`
  metadata, matching action-field defaults and preventing deploy-review
  formatting from dropping authored field defaults during source round trips.
- The checked-in JSON schema now documents and permits `defaultValue` on form
  fields as well as action fields, keeping JSON/YAML authoring contracts aligned
  with Forma parsing, normalization, and shared deploy validation.
- The checked-in JSON schema now also encodes type-specific `defaultValue`
  constraints for form and action fields, catching string/number/boolean default
  shape errors earlier in JSON/YAML source review while shared validation still
  enforces select option membership.
- CLI validation coverage now exercises JSON/YAML-source field defaults through the
  same structured `account-config validate` path used by deploy review, proving
  bad string/number/boolean defaults and invalid select defaults are rejected
  before runtime apply.
- Repository-wide `check-sources` coverage now also rejects invalid YAML field
  defaults through structured review output, so the checked-in source gate
  catches the same default problems before deploy artifacts are approved.
- Browser-facing source diagnostic coverage now renders field default failures
  from parsed Forma source with source-line jump affordances, so authors see
  invalid form/action defaults in the Account Config review UI as well as CLI
  review artifacts.
- Forma duplicate-resource diagnostics now retain all source occurrences and add
  first/duplicate line hints for top-level resources and nested form/action/flow
  children while keeping the duplicate occurrence as the editor location.
- Forma source diagnostics now also flag duplicate singleton metadata such as
  repeated form titles, field labels, flow starts, step next targets, and action
  opened forms with authored duplicate locations, so ambiguous source cannot
  silently deploy by taking the first entry.
- Browser and CLI review-artifact coverage now render/export those duplicate
  singleton metadata diagnostics with line/column locations, so source reviewers
  see ambiguous form titles and field labels before deployment.
- Runtime-neutral Forma helper entrypoints now also reject non-null-config source
  diagnostics, so code-first deploy callers cannot bypass duplicate singleton
  metadata checks by using `accountConfigFromFormaSource` directly.
- Browser-facing source diagnostics are now rendered through a reusable Account
  Config panel with coverage for duplicate line hints, resource paths,
  line/column labels, and jump-to-line affordances.
- The Account Config source diagnostics panel now shows the diagnostic count and
  has browser-facing coverage for typed literal validation messages with
  requirement, flow-step, and action source paths.
- The Account Config source diagnostics panel now also has browser-facing
  coverage for parser repair hints from real Forma parse diagnostics, including
  typoed grouped-wrapper child heads and top-level account-config heads.
- Browser-facing render coverage now parses the checked-in staffing and legal
  Forma sources, renders each account config resource graph, and verifies the
  graph panels preserve distinct tenant-specific workflow, form, requirement,
  action, and Mermaid review metadata.
- Account Config resource graph review now summarizes relation counts such as
  attributes, collect, scope, guard, requires, asserts, action, and flow edges
  before the edge chips and Mermaid artifact, with browser-facing coverage for
  checked-in staffing and legal graphs.
- Fresh-instance Convex coverage now runs the actual checked-in Forma authoring
  loop for staffing and legal tenants through normalized source parsing, draft
  save and export/readback, deployment review artifact inspection,
  approve/apply, tenant config export, manifest checks, cross-tenant resource
  isolation, and an idempotent repeated deployment plan from the same checked-in
  artifact.
- Direct draft and deployment plan id access is covered for tenant isolation:
  non-members cannot list or fetch drafts, delete a known draft id, review a
  known deployment plan id, approve it, or apply it.
- The checked-in staffing sources and bundled runtime blueprint now declare the
  `i9/citizenship` attribute used by the onboarding branch predicate, so
  branch-where validation and `check-sources` agree with runtime behavior.
- Tenant-scoped config reconciliation now removes tenant-local runtime artifacts
  for dropped attributes, entity types, forms, actions, requirements, and flows,
  and the appconfig behavior suite now runs through a fresh tenant instead of the
  legacy global setup path.
- Flow cancellation now requires an explicit `tenantSlug` at the public mutation
  boundary, matching the greenfield write invariant that runtime writes carry
  tenant context instead of relying on id-only legacy authorization.
- Manual rule recomputation now requires `{ tenantSlug, ruleId }`, authorizes
  the caller as an admin of the requested tenant, and rejects mismatched
  tenant/rule pairs before scheduling derived-fact materialization.
- Failed apply-job retry now requires `{ tenantSlug, jobId }`, authorizes the
  caller as an admin of that tenant, and rejects mismatched tenant/job pairs
  before rerunning deployment apply.
- Deployment plan approval, apply, and rollback planning now require
  `{ tenantSlug, planId }`, authorize against the requested tenant first, and
  reject mismatched tenant/plan pairs before changing deployment state.
- Draft deletion, apply-job reads, and deployment plan review snapshots now also
  require an explicit tenant selector and reject mismatched tenant/id pairs, so
  draft, job, and review-artifact access uses the same tenant boundary as
  deploy approval and apply.
- CLI review-artifact coverage now exercises local `check-sources`,
  `normalize-forma --check`, `dump`, and idempotent `diff-deploy --current`
  flows without requiring a live Convex deployment.
- CLI review-artifact coverage now also verifies invalid Forma `validate`
  output preserves parser repair hints and source locations for typoed grouped
  wrapper child heads, so CI artifacts show the same fix guidance as the UI.
- The account-config CLI no longer exposes migration/backfill/default-tenant
  commands; its product surface is now the greenfield source, dump, diff, draft,
  plan, approve, apply, rollback, export, and deploy-inspection workflow.
- CLI review-artifact coverage now also asserts old migration/backfill/default-
  tenant command names are rejected and absent from usage output, keeping the
  account-config command surface aligned to fresh tenant deployments.
- The leftover `convex/tenantMigration.ts` public default-tenant and backfill
  functions have been disabled; fresh tenant provisioning now uses
  `tenants.createTenant`, `tenants.ensureDemoTenant`, or
  `tenants.ensureDemoTenants`, and tests assert fresh runtime rows are
  tenant-owned from creation.

Still deferred:

- Continue expanding Forma account-language coverage beyond the current compact
  entity, attribute, field, workflow, requirement, action, grouped resource, and
  CodeMirror-backed editor integration.
- Keep the fresh-instance tenant-boundary audit current as new runtime surfaces
  are added; current public write paths require explicit tenant context and
  representative tenantless read adapters are blocked once tenants exist.
- Continue broadening greenfield browser-level UX coverage beyond the current
  workflow, drift, deployment review, source diff, graph, and history-filter
  render coverage.
- Continue account-authoring ergonomics work around diagnostic refinement for
  ambiguous authoring mistakes and deeper context-sensitive Forma completions.

Not deferred:

- Live migration, backfill, default-tenant promotion, and widen-migrate-narrow
  rollout work are not required for this branch. Fresh data instances are the
  product target.

## Baseline Before This Work

Config-as-code existed, but it was single-account.

- `convex/appconfig.ts` exposes `applyConfig({ config })`.
- The bundled `STAFFING_BLUEPRINT` lowers attributes, entity types, forms,
  flows, requirements, and actions into the current store.
- Config ownership is tracked through the hard-coded entity `config:default`.
- `convex/configHistory.ts` reads the `config:default` manifest and shows history
  and diffs.
- `src/pages/DataModel.tsx` already visualizes config history, manifest counts,
  system processes, actions, and an advanced assertion/query console.

Auth existed, but tenant authorization did not.

- Better Auth is wired through `convex/auth.ts` and `convex/auth.config.ts`.
- Protected writes derive identity from `ctx.auth.getUserIdentity()`.
- Read/write helpers derive a principal from `identity.tokenIdentifier`.
- There were no `tenants`, `memberships`, `tenantId`, tenant-scoped indexes, or
  server-side tenant context checks in the app schema.

So the answer to "was there already a way to have multi tenants?" was: not yet.
The app had authenticated users and one global account substrate. This branch
introduces the tenant boundary for fresh data instances.

## Design Principles

1. Tenant context is a backend invariant, not a UI convention.
2. The server may accept a tenant selector such as `tenantSlug`, but every query
   and mutation must verify membership from Convex auth before reading/writing.
3. Never accept `userId`, email, role, or principal from client args for
   authorization.
4. Every tenant-owned table needs a tenant field and indexes that include it.
5. Config, data, flows, derived facts, and history should all share the same
   tenant boundary.
6. JSON/YAML and the UI are authoring front-ends over the same config IR.
7. Later Forma deployment elaboration should compile from the same IR, not from
   a second bespoke representation.
8. The runtime should own deploy semantics: artifact boundaries, diff rules,
   plan/apply, activation, rollback, and versioned runtime state transitions.
9. The application should own hosted workflow concerns: who reviews, approves,
   promotes, and operates tenant deployments.

## Proposed Data Model

Add tenant identity and membership tables:

```ts
tenants: {
  slug: string;
  name: string;
  kind?: "staffing" | "legal" | "custom";
  createdAt: number;
  updatedAt: number;
}

tenantMemberships: {
  tenantId: Id<"tenants">;
  principal: string; // identity.tokenIdentifier
  role: "owner" | "admin" | "editor" | "viewer";
  createdAt: number;
}
```

Indexes:

- `tenants.by_slug`
- `tenantMemberships.by_principal`
- `tenantMemberships.by_tenant_and_principal`

Add `tenantId` to tenant-owned tables:

- `transactions`
- `factEvents`
- `facts`
- `currentFacts`
- `rules`
- `derivedFacts`
- `flowRuns`
- `flowDefs`
- `flowEvents`
- `ruleInvalidations`

Add tenant-prefixed indexes for every tenant read path. Examples:

- `transactions.by_tenant_and_txTime`
- `transactions.by_tenant_and_actor`
- `factEvents.by_tenant_and_tx`
- `facts.by_tenant_and_e_a`
- `currentFacts.by_tenant_and_e_a`
- `rules.by_tenant_and_name`
- `flowDefs.by_tenant_and_name`

Keep system-level component/auth tables global unless they store account data.

## Tenant Context API

Add a backend helper such as `convex/lib/tenantAuth.ts`:

```ts
requireTenant(ctx, tenantSlugOrId): Promise<{
  tenantId: Id<"tenants">;
  principal: string;
  role: "owner" | "admin" | "editor" | "viewer";
}>
```

Rules:

- Derive `principal` from `ctx.auth.getUserIdentity().tokenIdentifier`.
- Resolve tenant by slug or id.
- Verify a membership row.
- For writes, require `owner`, `admin`, or `editor`.
- For config changes, initially require `owner` or `admin`.
- Return `tenantId` and pass it down to query/write helpers.

Public functions should take `tenantSlug` or `tenantId` only as a selector. The
authorization decision must come from the membership lookup.

## Config-as-Code Shape

Support JSON, YAML, and Forma as equivalent source formats over the same config
IR. JSON remains the simplest export/debug format because it round-trips
directly through Convex, YAML remains available for human-authored account
files, and Forma becomes the intended higher-level authored source for the
deployment workflow.

Suggested files:

```text
configs/accounts/staffing.json
configs/accounts/legal-workflows.json
configs/accounts/legal-workflows.yaml
configs/accounts/schema.json
```

Each account config should include metadata plus the existing resource sections:

```json
{
  "account": {
    "slug": "acme-staffing",
    "name": "Acme Staffing",
    "kind": "staffing"
  },
  "attributes": [],
  "entityTypes": [],
  "forms": [],
  "flows": [],
  "requirements": [],
  "actions": []
}
```

Near-term changes:

- Rename the conceptual unit from `config:default` to tenant-scoped config.
- Replace `CONFIG_ENTITY = "config:default"` with a helper like
  `configEntity(tenantId)`.
- Update `applyConfig` to write config-owned facts and manifest rows for one
  verified tenant.
- Update `configHistory.history` and `currentManifest` to require tenant context.
- Add an import/export path so a tenant can be round-tripped:
  `current tenant facts -> account config source -> plan -> apply`.

## Visualization and Update Surface

Build a first-class "Account Config" surface rather than hiding this inside
"Data model".

Recommended routes:

- `/t/:tenantSlug` or a global tenant switcher in the shell.
- `/config` for the selected tenant's account map.
- `/config/history` for tenant-scoped config diffs.
- `/config/source` for JSON/YAML/Forma import/export and plan/apply.

Initial visualization:

- Account summary: tenant name, slug, current config version/time, artifact counts.
- Resource graph: entity types -> attributes -> forms -> flows -> requirements -> actions.
- Config manifest: grouped lists of owned artifacts.
- Diff timeline: added/removed/changed artifacts per apply transaction.
- Drift panel: live tenant store vs checked-in config file.

Initial updates:

- Load a JSON/YAML/Forma config file or paste source into an editor.
- Validate it client-side enough for fast feedback, then server-side with Convex
  validators.
- Run `planConfig` as a dry run.
- Show added, changed, removed, and dangerous changes.
- Apply only after explicit user action.

Do not make the UI mutate forms/flows through a separate path. UI edits should
produce the same account config IR and then call plan/apply.

## Multi-Tenant Implementation Phases

### Phase 1: Tenant Skeleton

- Add `tenants` and `tenantMemberships`.
- Add mutations for creating demo tenants and assigning the current principal.
- Add `listMyTenants` and `getTenantBySlug`.
- Add tenant switcher in `Layout`.
- On fresh instances, create all tenant-owned runtime data through explicit
  tenant context rather than preserving a global fallback path.

Acceptance:

- Signed-in user can see only tenants where they have membership.
- Anonymous users cannot write tenant data.

### Phase 2: Tenant-Scoped Config

- Add tenant context helper.
- Change `applyConfig`, `setupStaffing`, `configHistory.history`, and
  `configHistory.currentManifest` to require a tenant selector.
- Move the config manifest from `config:default` to tenant-specific ownership.
- Add `configs/accounts/staffing.json`.
- Add `configs/accounts/legal-workflows.json`.
- Add `configs/accounts/legal-workflows.yaml`.

Acceptance:

- Applying the staffing config affects only the staffing tenant.
- Applying the legal workflow config affects only the legal tenant.
- Config history for each tenant is isolated.

### Phase 3: Tenant-Scoped Fact Store

- Add `tenantId` to fact/event/projection/rule/flow tables.
- Add tenant-prefixed indexes.
- Thread `tenantId` through `createTransaction`, `assertInTx`,
  `retractInTx`, current projections, Datalog sources, materializers, rules,
  flows, compliance, and overview queries.
- Update tests to create two tenants with conflicting entity ids and verify
  isolation.

Acceptance:

- `worker:maria` in staffing and `matter:maria` or even another `worker:maria`
  in legal do not collide.
- Queries never read across tenant boundaries.
- Derived obligations and flow runs are tenant-local.

### Phase 4: Account Config Plan/Apply

- Add `planConfig({ tenantSlug, config })` as a query or action that returns a
  dry-run diff.
- Add `validateConfig` for unknown attributes, duplicate names, missing form
  fields, missing flow targets, invalid requirement guards, and unsafe removes.
- Add `applyConfig` job semantics if config grows beyond one Convex mutation's
  safe size.
- Persist apply status facts/rows so failed large applies can be resumed or
  marked failed.

Acceptance:

- User can preview config changes before applying.
- Idempotent re-apply reports no material changes.
- Removing a config-owned artifact reconciles only that tenant's configured
  artifact, not runtime data.

### Phase 5: Account Config UI

- Split current `Data model` into:
  - Account Config
  - System/Engine Console
  - Transaction Log
- Add tenant-aware config graph and manifest views.
- Add JSON/YAML source editor/import.
- Add plan/apply review screen.
- Add export current tenant config.

Acceptance:

- A user can understand the current tenant account shape without reading code.
- A user can update the tenant account shape through JSON/YAML and see the
  resulting diff before apply.

### Phase 6: Forma Account Deployment Pipeline

- Treat Forma as the primary authoring/elaboration layer over the account config
  IR.
- Define a stable IR package that can be consumed by:
  - Convex `planConfig` / `applyConfig`
  - UI source editor
  - CLI import/export
  - Forma elaboration
  - account deploy artifact generation
- Add an account deployment package or module with Open Ontology-shaped APIs:
  - `dumpAccountDeploy(config)`: pure deploy payload for inspection, CI
    artifacts, and source-review diffs.
  - `planAccountDeploy(tenant, artifact)`: compare desired artifact with active
    tenant runtime state and return a persisted/reviewable plan.
  - `applyAccountDeploy(tenant, planId)`: apply an approved plan idempotently.
  - `deployAccountIfMain(import.meta, config, target)`: optional code-first
    entrypoint for local demos and scripts.
- Add runtime endpoints/functions analogous to Open Ontology remote deploy:
  - `accountDeploy.planFromCompiled` or `accountDeploy.planFromArtifact`
  - `accountDeploy.applyPlan`
  - `accountDeploy.currentDeployment`
- Persist deployment state separately from authored source:
  - deployment id, tenant id, source digest, artifact digest, plan summary,
    destructive flag, status, actor, timestamps, and apply transaction ids.
  - active deployment pointer per tenant.
  - enough source/artifact metadata to explain and roll back runtime state.
- Add a CLI shape such as:

```bash
pnpm account-config validate --output yaml configs/accounts/staffing.json
pnpm account-config validate configs/accounts/legal-workflows.yaml
pnpm account-config check-sources --output yaml
pnpm account-config graph --output yaml configs/accounts/staffing.forma > account.graph.yaml
pnpm account-config plan --tenant acme-staffing --output yaml configs/accounts/staffing.json
pnpm account-config export --tenant acme-staffing --output yaml > configs/accounts/staffing.export.yaml
pnpm --silent account-config forma configs/accounts/staffing.json > configs/accounts/staffing.forma
pnpm --silent account-config validate-forma --output yaml configs/accounts/staffing.forma
pnpm --silent account-config from-forma --output yaml configs/accounts/staffing.forma > configs/accounts/staffing.from-forma.yaml
pnpm account-config normalize-forma configs/accounts/staffing.forma > configs/accounts/staffing.normalized.forma
pnpm account-config normalize-forma --check --output yaml configs/accounts/staffing.forma
pnpm account-config normalize-forma --write configs/accounts/staffing.forma
pnpm --silent account-config dump --output yaml configs/accounts/staffing.forma > account.deploy.yaml
pnpm --silent account-config diff-deploy --output yaml --current account.deploy.yaml configs/accounts/staffing.forma
pnpm account-config deploy-current --tenant acme-staffing --output yaml
pnpm account-config deploy-list --tenant acme-staffing --limit 10 --output yaml
pnpm account-config plan-deploy --tenant acme-staffing --draft main --output yaml configs/accounts/staffing.forma
pnpm account-config rollback-deploy --tenant acme-staffing --plan <appliedPlanId> --output yaml
pnpm account-config review-deploy --tenant acme-staffing --plan <planId> --output yaml
pnpm account-config approve-deploy --tenant acme-staffing --plan <planId> --output yaml
pnpm account-config apply-deploy --tenant acme-staffing --plan <planId> --output yaml
pnpm account-config draft-save --tenant acme-staffing --name main --review-note "source review" --output yaml configs/accounts/staffing.forma
pnpm account-config draft-list --tenant acme-staffing --limit 10 --output yaml
pnpm account-config draft-export --tenant acme-staffing --name main > configs/accounts/staffing.forma
```

The account deploy artifact and runtime plan/apply service are the deploy
pipeline boundary. Terraform is only an analogy for desired-state planning, not a
runtime integration surface.

UI workflow should mirror the Open Ontology deploy loop:

- Active tenant source is read-only by default.
- User creates a draft from active source or checked-in Forma.
- Draft edits validate continuously and preserve source diagnostics.
- Review & Deploy shows semantic diffs, dangerous/destructive flags, and plan
  metadata.
- Deploy applies the approved plan and advances the tenant's active deployment
  pointer.
- History shows source/artifact digests, plan summaries, actor, timestamps, and
  apply transactions.

## Fresh Data Strategy

This branch assumes fresh data instances. Tenant-owned runtime rows require
`tenantId` at the schema boundary from the start, and public application
reads/writes should flow through a verified tenant selector instead of a global
account namespace. Migration/backfill/default-tenant commands are not part of
the account-config CLI product surface, and the plan no longer depends on
widen-migrate-narrow, default-tenant promotion, or a live backfill gate.

## Testing Plan

Add Convex tests for:

- Membership checks: no membership, viewer, editor, admin.
- Tenant list only returns memberships for the current principal.
- Applying staffing and legal configs creates separate manifests.
- Same logical entity id can exist in two tenants without cross-read.
- Config history only shows transactions for the selected tenant.
- Sensitive read grants remain tenant-scoped.
- Flow definitions, flow runs, rules, derived facts, and obligations do not leak.
- Tenantless legacy read adapters reject global access once tenants exist across
  representative fact, config, overview, flow, action, attribute, compliance,
  and rule surfaces.

Add UI tests or focused component coverage for:

- Tenant switcher state.
- Account Config graph with two different tenant configs.
- Plan/apply diff rendering.

## Resolved Decisions

- YAML is supported alongside JSON and Forma for validation, dump, diff, graph,
  and live deploy review output.
- This branch starts with custom tenant and membership tables; Better Auth
  organizations can still be considered later for invitations and org
  management, but they are not the current tenant boundary.
- Tenant-owned runtime rows use required, separate, indexed `tenantId` fields
  rather than globally namespaced logical ids.

## Open Decisions

- Should config source of truth be checked-in files, the store, or hybrid
  overlays? Recommendation: hybrid for now: checked-in base config plus
  store-owned overlays/import/export until the deploy pipeline is real.
- What should the stable deploy artifact contain beyond current account config
  resources: tenant metadata, seed data, permissions, integrations, UI layout,
  or only declarative account shape?
- Should deployment rollback mean re-applying an older artifact, switching an
  active deployment pointer, or both? Recommendation: start with re-plan and
  re-apply from a stored older artifact, because the runtime tables are already
  materialized state.

## Next Useful Slice

The first deployment slice is implemented, compact/grouped Forma authoring is
available, and the UI/CLI now enforce a read-only active mirror plus explicit
draft boundary with persisted source drafts, checked-in source comparison,
review notes, deploy review exports, and draft export for code review. Fresh
Convex coverage now exercises the full checked-in Forma loop across staffing and
legal tenants.

1. Continue broadening browser-level review coverage for the repeated deploy
   loop as new review states are added.
2. Continue extending Forma only where it improves real account authoring, with
   emphasis on better diagnostics, source-aware completions, and reviewable
   normalized output for larger tenant definitions.
3. Keep the fresh-instance tenant audit current when new public runtime
   surfaces are added; migration/backfill/default-tenant work stays outside this
   branch unless the product target changes.

This proves the clarified product idea: a tenant can be deployed from a Forma
definition, changes are tracked as reviewable plans, and the runtime records
which deployment is active.
