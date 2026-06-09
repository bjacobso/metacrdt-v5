# SaaS Configuration

This document sketches how the language can model SaaS configuration as code.
The goal is not to clone Terraform resource syntax. The goal is to use the
language's typed declarations, schema algebra, capability model, policies, and
canonical IR to manage operational configuration across APIs like GitHub,
Slack, Linear, Stripe, Cloudflare, and internal admin systems.

This is a package-scoped exploration of the broader direction described in
[../../../LISP.md](../../../LISP.md). The reusable ideas here are provider
preludes, desired-state IR, plan/apply runtimes, visible raw escape hatches,
and multi-vendor ontology composition. Those ideas should eventually graduate
into top-level product or architecture specs once canonical IR and prelude
metatypechecking are stronger.

The key distinction:

```text
source Lisp describes desired state
deployment runtime performs effects
```

Elaboration should not eagerly mutate remote systems. It should produce typed
desired-state IR, diagnostics, dependency graphs, policy requirements, and
provider manifests. A separate planner/apply runtime reads remote state through
provider capabilities, computes a plan, applies approved changes, and records
audit facts.

## Why This Fits

Many SaaS products expose operational configuration through REST or GraphQL:

- teams, groups, roles, users, and memberships
- repositories, branch rules, webhooks, apps, and secrets
- projects, labels, workflows, automations, and integrations
- billing plans, feature flags, environments, and tenant defaults
- SSO settings, SCIM mappings, API tokens, and access policies

These are not usually CPU-bound programs. They are typed operational models with
side-effectful deployment. That matches the platform's strengths:

- schemas describe resource shapes
- modules organize reusable configuration
- canonical IR stores desired state independent of provider SDKs
- capabilities bind provider read/write APIs
- policies gate dangerous changes
- the triple store can retain desired state, observed state, plans, applies,
  drift, and audit history
- agents can inspect structured diagnostics and propose safe patches

## Example

An application team could describe GitHub configuration with provider-specific
prelude forms:

```lisp
(module acme.github.config
  (:import open-ontology/saas/github :as github)
  (:export org-config platform-team api-repo))

(github/define-org org-config
  (:login "acme")
  (:billing-email "ops@acme.example"))

(github/define-team platform-team
  (:org org-config)
  (:slug "platform")
  (:members
    (member "ada@acme.example" :role :maintainer)
    (member "linus@acme.example" :role :member)))

(github/define-repo api-repo
  (:org org-config)
  (:name "api")
  (:visibility :private)
  (:teams
    (team platform-team :permission :maintain))
  (:branch-protection
    (branch "main"
      (:required-checks ["typecheck" "test"])
      (:required-reviews 2)
      (:dismiss-stale-reviews true))))
```

The source says what should exist. It does not say which REST endpoints to call
or in which order.

## Desired-State IR

Provider preludes should elaborate to generic desired-resource declarations,
not directly to provider calls:

```json
{
  "kind": "DesiredResource",
  "provider": "github",
  "resourceType": "repo.branchProtection",
  "name": "api-repo/main",
  "identity": {
    "org": "acme",
    "repo": "api",
    "branch": "main"
  },
  "desired": {
    "requiredChecks": ["typecheck", "test"],
    "requiredReviews": 2,
    "dismissStaleReviews": true
  },
  "dependsOn": ["github.repo:acme/api"],
  "lifecycle": {
    "delete": "retain",
    "drift": "report"
  }
}
```

Provider-specific forms are still useful for ergonomics and validation, but the
engine should preserve a host-neutral envelope:

```text
DesiredResource
  provider      - stable provider id, for example github
  resourceType  - provider resource kind, for example repo.branchProtection
  identity      - stable lookup key used for import, diff, and apply
  desired       - schema-checked desired payload
  dependsOn     - resource ids that must exist first
  lifecycle     - delete, replace, drift, and import behavior
  policyRefs    - policies that must allow the change
  sourceSpan    - source location for diagnostics and plan output
```

## Provider Definitions

A provider package should declare the schemas, resources, capabilities, and
identity rules it supports.

```lisp
(module open-ontology.saas.github
  (:export GithubOrg GithubRepo define-org define-repo github-provider))

(define-provider github-provider
  (:id "github")
  (:auth
    (token :env "GITHUB_TOKEN"))
  (:capabilities
    github/read-org!
    github/read-repo!
    github/create-repo!
    github/update-repo!
    github/update-branch-protection!))

(define-resource GithubRepo
  (:provider github-provider)
  (:type "repo")
  (:identity
    (:org String)
    (:name String))
  (:schema
    (struct
      (field org String)
      (field name String)
      (field visibility (Enum :private :public :internal)))))
```

The provider declaration should compile to metadata consumed by planner and
apply runtimes. The language engine does not need to know GitHub-specific
resource shapes.

## Plan, Diff, Apply

Deployment should be a separate runtime pipeline over emitted IR:

```text
Lisp source
  -> parse / expand / typecheck / elaborate
  -> desired-state IR
  -> provider manifest
  -> read observed state through capabilities
  -> normalize observed state
  -> diff desired vs observed
  -> policy check
  -> plan artifact
  -> approved apply
  -> audit facts and events
```

A plan artifact should be explicit and reviewable:

```json
{
  "kind": "Plan",
  "changes": [
    {
      "action": "update",
      "resource": "github.repo.branchProtection:acme/api/main",
      "before": { "requiredReviews": 1 },
      "after": { "requiredReviews": 2 },
      "requiresApproval": false,
      "sourceSpan": {
        "sourceId": "acme/github/config.onlang",
        "startLine": 19,
        "startColumn": 7
      }
    }
  ]
}
```

Apply then executes the plan using provider capabilities. It should not
re-elaborate and invent new changes during apply.

## Capability Boundary

REST and GraphQL calls should be represented as provider capabilities:

```lisp
(define-capability github/update-branch-protection!
  (:input GithubBranchProtectionUpdate)
  (:output GithubBranchProtection)
  (:errors GithubNotFound GithubRateLimited GithubPermissionDenied)
  (:requires
    (secret "github/token")
    (permission :github/admin-repo))
  (:audit true))
```

Planner capabilities are mostly reads:

```text
github/read-org!
github/read-team!
github/read-repo!
github/read-branch-protection!
```

Apply capabilities are writes:

```text
github/create-team!
github/update-team!
github/create-repo!
github/update-repo!
github/update-branch-protection!
```

Separating read and write capabilities makes dry-run, import, drift detection,
and policy enforcement easier to reason about.

## Lifecycle Semantics

Every desired resource should declare or inherit lifecycle behavior:

```lisp
(github/define-repo api-repo
  (:org org-config)
  (:name "api")
  (:visibility :private)
  (:lifecycle
    (:delete :retain)
    (:replace :deny)
    (:drift :report)))
```

Useful lifecycle knobs:

- `:delete :retain | :destroy | :orphan | :deny`
- `:replace :allow | :deny | :approval-required`
- `:drift :ignore | :report | :reconcile`
- `:import :manual | :auto`
- `:secrets :reference-only`

The safe default for SaaS configuration should be conservative: retain on
delete, deny replacement unless explicitly allowed, and report drift before
reconciling.

## Imports And Discovery

SaaS configuration often starts from existing remote state. The platform should
support import workflows:

```text
discover provider resources
  -> observed-state IR
  -> generated source skeletons
  -> user/agent review
  -> committed desired state
```

Import should be explicit because remote systems often contain legacy state,
manual exceptions, bot-created resources, or sensitive fields. Generated source
should preserve unknown or unmanaged fields as comments or ignored metadata
rather than silently dropping them.

## Drift Detection

Because the triple store is time-traveling, drift can become a first-class
artifact:

```text
desired resource at commit A
observed resource at time T
diff desired vs observed
classify as expected, ignored, policy violation, or pending reconcile
```

Drift events can feed dashboards, alerts, pull requests, or agent tasks.

```lisp
(define-policy github-protected-branches
  (deny drift
    (:where
      (= resource.type "repo.branchProtection")
      (= diff.path "requiredReviews")
      (< observed.value desired.value))))
```

## Policy Gates

Policy should run before apply. Examples:

- deny public repositories unless an exception is attached
- require approval before deleting teams or webhooks
- require SSO enforcement for admin groups
- deny token material in source
- limit which modules may manage production organizations
- require drift reconciliation through pull request review

Policies should inspect plan IR, not provider-specific API calls. That keeps
policy portable across providers.

## Agent Workflows

This model is especially useful for agentic coding:

- Agents can read module summaries instead of entire provider packages.
- Diagnostics can point to exact resource fields and suggest valid values.
- Drift can become a structured task: observed value, desired value, policy,
  source span, and candidate patch.
- Plan output gives agents a reviewable explanation of consequences.
- Generated provider schemas constrain edits and reduce hallucinated fields.

Example agent task:

```text
Drift detected:
  github.repo.branchProtection:acme/api/main
  requiredReviews observed 1, desired 2

Options:
  update remote to desired value
  patch source if the manual change is intentional
  attach policy exception
```

## Relationship To Terraform

Terraform's strongest ideas are worth keeping:

- desired state instead of imperative scripts
- provider plugins
- plan before apply
- import of existing resources
- state snapshots
- dependency graphs

But this platform can improve the fit for SaaS operations:

- richer schemas and type projection
- Lisp macros for provider-specific ergonomics
- first-class policies and audit history
- generated agent context
- typed capability boundaries instead of provider SDK leakage
- canonical IR that can feed docs, dashboards, OpenAPI, MCP tools, and runtime
  workflows

## Implementation Sequence

This should come after typed IR dominance begins. A practical first slice:

1. Add a generic `DesiredResource` typed IR envelope.
2. Define schema algebra support for resource identity and desired payloads.
3. Implement one provider prelude, preferably GitHub or Linear.
4. Emit a plan-only artifact with fake observed state.
5. Add provider read capabilities and real diffing.
6. Add policy checks over plan IR.
7. Add apply capabilities behind explicit approval.
8. Record desired, observed, plan, apply, and drift facts in the triple store.

The first milestone does not need to mutate a real SaaS API. It should prove
that source elaborates into stable desired-state IR and that a planner can
produce useful diffs.

## Design Rule

The OCaml engine should not know about GitHub, Slack, Linear, or any SaaS
resource shape. It should know generic language machinery:

```text
module
schema
typed declaration envelope
desired resource envelope
capability declaration
policy declaration
logic IR
diagnostics
```

Provider packages define the rest. Backends and deployment runtimes consume the
IR and bind provider capabilities.
