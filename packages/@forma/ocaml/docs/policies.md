# Policies

This document sketches a policy language for the platform. Policies should
govern API access, workflow execution, SaaS configuration plans, agent tools,
field redaction, drift reconciliation, and deployment actions.

The policy layer should operate over typed IR and runtime facts, not raw source
text or provider-specific API calls.

## Goals

- Make authorization and safety rules first-class declarations.
- Evaluate policies over plans, resources, routes, commands, entities, and
  runtime context.
- Produce explainable allow/deny decisions with source spans.
- Support static checks where possible and runtime checks where necessary.
- Give agents structured reasons and repair paths.

## Example

```lisp
(define-policy protected-github-repos
  (deny plan/apply
    (:when
      (and
        (= change.action :delete)
        (= resource.provider "github")
        (= resource.type "repo")))
    (:message "Deleting GitHub repositories requires a manual exception")))

(define-policy employee-record-access
  (allow employee/read
    (:when
      (or
        (= subject.role :hr-admin)
        (= subject.department resource.department)))))

(define-policy employee-ssn-redaction
  (redact Employee.ssn
    (:unless (= subject.role :hr-admin))))
```

## Policy Subjects And Targets

Policies should be able to reason about:

```text
subject        user, service account, agent, workflow instance
action         route call, capability call, plan apply, query, field read
resource       entity, desired resource, workflow, route, tool, field
context        tenant, environment, request metadata, time, approval state
change         plan diff, before/after values, drift classification
source         module, package, source span
```

The exact available fields depend on the policy target.

## Policy Kinds

Useful policy kinds:

- `allow` grants an action.
- `deny` blocks an action.
- `require-approval` marks an action as gated.
- `redact` hides or transforms fields.
- `require-capability` constrains runtime effects.
- `require-exception` allows break-glass workflows.
- `warn` emits non-blocking diagnostics.

The default should be explicit for each runtime surface. For production
deploy/apply operations, default-deny is safer. For local development, policy
packages may choose default-warn or default-allow.

## Evaluation Model

Policy evaluation should be deterministic over an input envelope:

```json
{
  "subject": { "type": "user", "id": "user:ada", "role": "engineer" },
  "action": "plan/apply",
  "resource": {
    "provider": "github",
    "type": "repo",
    "id": "github.repo:acme/api"
  },
  "change": {
    "action": "delete",
    "before": { "visibility": "private" },
    "after": null
  },
  "context": { "environment": "prod" }
}
```

Result:

```json
{
  "decision": "deny",
  "policy": "protected-github-repos",
  "message": "Deleting GitHub repositories requires a manual exception",
  "sourceSpan": {
    "sourceId": "policies/github.onlang",
    "startLine": 2,
    "startColumn": 3
  }
}
```

## Relationship To Queries

Policies need predicates. The language should reuse query and logic machinery
instead of inventing a separate expression language:

```lisp
(:when
  (and
    (= subject.department resource.department)
    (not (exists?
      (query :active-incident {:service resource.service})))))
```

The policy compiler should restrict which capabilities are available during
policy evaluation. Policies should not perform arbitrary remote writes.

## Static And Runtime Policy

Some checks can run during elaboration:

- unknown action names
- unknown resource fields
- invalid policy target
- missing referenced schemas
- impossible type comparisons

Other checks require runtime context:

- current user role
- tenant membership
- approval state
- observed remote resource state
- current incident status

The policy IR should support both.

## Agent Repair

Policies should emit repair-oriented diagnostics:

```text
Denied by protected-github-repos:
  deleting github.repo:acme/api is blocked

Possible repairs:
  remove the delete from source
  change lifecycle delete to retain
  attach a reviewed exception
  request manual approval
```

This makes policy useful for automated coding and operations agents.

## Implementation Sequence

1. Define a `Policy` declaration envelope with `allow`, `deny`, and `warn`.
2. Reuse typed logic IR for policy predicates.
3. Add policy checks over SaaS plan IR.
4. Add diagnostics with policy source spans and target source spans.
5. Add `redact` for entity/query results.
6. Add approval and exception integration.
7. Add policy summaries to runtime manifests and agent context artifacts.
