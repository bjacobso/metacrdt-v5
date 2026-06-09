# Workflows

This document sketches a workflow model for the language platform. Workflows are
longer-running operational processes: they coordinate capabilities, wait for
events, retry failed steps, request human approval, and record durable progress.

They should be declarations plus typed logic IR, not arbitrary scripts.

## Goals

- Model business and operations processes explicitly.
- Make retries, idempotency, timers, approval, and compensation visible.
- Emit workflow manifests that can run on different hosts.
- Keep workflow steps analyzable by policies and agents.
- Preserve audit history in the triple store.

## Example

```lisp
(define-workflow onboard-employee
  (:input OnboardEmployeeRequest)
  (:output Employee)
  (:requires
    employee/write!
    github/create-user!
    slack/invite-user!
    email/send!)
  (:steps
    (step create-employee
      (:idempotency-key request.email)
      (:do
        (employee/create! request)))

    (step create-github-user
      (:after create-employee)
      (:retry (:max 3) (:backoff :exponential))
      (:compensate
        (github/deactivate-user! create-github-user.result.id))
      (:do
        (github/create-user! {:email request.email})))

    (step invite-slack
      (:after create-employee)
      (:retry (:max 5) (:backoff :linear))
      (:do
        (slack/invite-user! {:email request.email})))

    (approval manager-approval
      (:after create-employee)
      (:assigned-to request.manager)
      (:message "Approve production access?"))

    (step send-welcome
      (:after invite-slack manager-approval)
      (:do
        (email/send! WelcomeEmail {:employee create-employee.result}))))
```

## Workflow IR

Workflow declarations should elaborate into:

```text
Workflow
  name
  input schema
  output schema
  required capabilities
  steps
  dependencies
  retry policies
  compensation logic
  timers / waits
  approval requirements
  emitted events
  source spans
```

Step bodies should lower to typed logic IR. Workflow metadata should remain
separate from executable logic so a planner can inspect it without interpreting
the whole body.

## Step Types

Useful first-class step kinds:

- `step` for ordinary capability-backed work
- `approval` for human decision points
- `wait-for-event` for event correlation
- `sleep-until` for timers
- `branch` for explicit conditional paths
- `foreach` for bounded fan-out
- `transaction` for short atomic sections
- `compensate` for rollback-like actions

The first implementation can support only `step`, `approval`, and dependency
edges. The syntax should leave room for the others.

## Runtime Semantics

The runtime should treat a workflow as a durable state machine:

```text
created
  -> running
  -> waiting
  -> running
  -> completed | failed | canceled | compensated
```

Each transition should be recorded as facts/events:

```text
workflow instance created
step scheduled
capability call requested
capability call completed
approval requested
approval granted
step failed
retry scheduled
workflow completed
```

That history should be queryable through the triple store.

## Idempotency

Every effectful step needs an idempotency story. The language should make this
explicit:

```lisp
(step create-github-user
  (:idempotency-key request.email)
  (:do
    (github/create-user! {:email request.email})))
```

If no idempotency key is declared, the compiler or workflow planner should warn
for unsafe capability calls.

## Compensation

Compensation is not true rollback. It is a best-effort follow-up action:

```lisp
(:compensate
  (github/deactivate-user! create-github-user.result.id))
```

The workflow IR should represent compensation as typed logic attached to a step.
Policies should be able to require compensation for specific classes of
resource-creating capabilities.

## Agent Workflows

Workflow IR is useful for agents because it exposes:

- what step failed
- which capability failed
- which retry policy applies
- whether approval is required
- which source span produced the step
- what patch could fix the workflow

An agent should be able to answer: "Why is onboarding blocked?" without reading
provider implementation code.

## Implementation Sequence

1. Define a `Workflow` declaration envelope and minimal `Step` IR.
2. Lower one workflow with ordered steps and capability calls.
3. Add static checks for missing capability permissions and invalid step refs.
4. Emit a workflow manifest artifact.
5. Add a toy interpreter that records step transitions.
6. Add approval and retry metadata.
7. Integrate with policy checks and runtime manifests.
