# Support Agents

This document sketches how the language platform could model AI customer
support systems similar in shape to Parahelp: a customer-facing agent that
resolves support tickets, plus an internal agent that builds, evaluates, and
evolves the customer agent.

This is not a product spec for Parahelp. It is a platform design exercise for
modeling support automation as typed declarations, schemas, workflows,
capabilities, policies, evals, and runtime manifests.

## Product Shape

A support automation platform needs to model:

```text
Customer agent
  channels
  knowledge sources
  memory/configuration
  ticket classifiers
  ticket workflows
  tools/capabilities
  guardrails
  approvals
  deterministic checks
  escalation rules
  response style

Internal agent
  continuous tasks
  support analytics
  knowledge-gap detection
  memory/config updates
  tool configuration updates
  eval generation
  regression testing
  activity logs
  human review
```

The language is a good fit because the system is mostly structured operational
configuration plus controlled executable logic.

## Customer Agent

Example source:

```lisp
(module acme.support.customer-agent
  (:import open-ontology/support :as support)
  (:import acme.support.tools :as tools)
  (:export customer-support-agent))

(support/define-agent customer-support-agent
  (:display-name "Acme Support")
  (:channels zendesk intercom slack)
  (:knowledge docs help-center incidents changelog)
  (:memory support-memory)
  (:tools
    tools/stripe-retrieve-customer!
    tools/stripe-process-refund!
    tools/linear-search-issues!
    tools/slack-request-approval!
    tools/status-read!)
  (:guardrails
    low-confidence-escalation
    refund-approval-policy
    account-deletion-policy
    pii-redaction-policy)
  (:workflows
    refund-request
    account-deletion-request
    bug-report
    login-issue)
  (:response-style
    (:tone :clear)
    (:avoid ["over-promising" "guessing"])
    (:escalate-when-uncertain true)))
```

This should elaborate to an agent declaration plus references to concrete
channels, workflows, tools, policies, and knowledge sources.

## Ticket Workflows

Ticket workflows should be durable workflows specialized for support cases:

```lisp
(support/define-ticket-workflow refund-request
  (:matches
    (intent :refund-request)
    (has-field ticket.email))
  (:requires
    tools/stripe-retrieve-customer!
    tools/stripe-process-refund!
    tools/slack-request-approval!
    log/write!)
  (:steps
    (step load-customer
      (:do
        (tools/stripe-retrieve-customer! {:email ticket.email})))

    (step check-refund-policy
      (:after load-customer)
      (:do
        (check! refund-approval-policy
          {:ticket ticket :customer load-customer.result})))

    (approval approve-large-refund
      (:when (> load-customer.result.refundAmount 100))
      (:channel slack)
      (:message "Approve refund for this customer?"))

    (step process-refund
      (:after check-refund-policy approve-large-refund)
      (:idempotency-key ticket.id)
      (:do
        (tools/stripe-process-refund!
          {:customerId load-customer.result.id
           :amount load-customer.result.refundAmount})))

    (step reply
      (:after process-refund)
      (:do
        (support/draft-reply!
          (:template refund-approved-template)
          (:facts {:amount load-customer.result.refundAmount}))))))
```

The route/classifier decides that a ticket is a refund request. The workflow
defines the controlled path to resolution.

## Knowledge

Knowledge sources should be explicit and typed:

```lisp
(support/define-knowledge-source help-center
  (:kind :docs)
  (:source zendesk/help-center)
  (:sync (:schedule "*/15 * * * *"))
  (:visibility :customer-safe)
  (:indexes
    (:semantic true)
    (:keyword true)))

(support/define-knowledge-source incidents
  (:kind :status)
  (:source statuspage/incidents)
  (:visibility :internal)
  (:freshness (:max-age "5m")))
```

The source declaration should elaborate to:

```text
KnowledgeSource
  kind
  connector
  sync policy
  visibility
  retention
  index configuration
  policies
```

The runtime can use this to build retrieval indexes, enforce visibility, and
explain which sources supported an answer.

## Memory

Memory should be modeled as governed configuration, not untracked prompt text:

```lisp
(support/define-memory support-memory
  (:files
    support-style
    refund-rules
    escalation-rules)
  (:update-policy
    (:requires-review true)
    (:review-channel "#support-ops"))
  (:tests
    refund-regression-suite
    account-deletion-regression-suite))
```

Memory updates should be proposed, diffed, tested, reviewed, and audited like
code or SaaS configuration.

## Tools

Support tools are normal agent tools and capabilities:

```lisp
(define-agent-tool stripe-retrieve-customer
  (:input StripeCustomerLookup)
  (:output StripeCustomer)
  (:requires stripe/read!)
  (:policy customer-data-access)
  (:body
    (stripe/retrieve-customer! input)))

(define-agent-tool stripe-process-refund
  (:input StripeRefundRequest)
  (:output StripeRefundResult)
  (:requires stripe/write!)
  (:policy refund-approval-policy)
  (:approval required)
  (:audit true)
  (:body
    (stripe/process-refund! input)))
```

The important part is that every action-capable tool has an input schema,
output schema, policy, required capability, and audit behavior.

## Guardrails

Guardrails should be policies and deterministic checks, not only prompt text:

```lisp
(define-policy refund-approval-policy
  (require-approval support/refund
    (:when (> request.amount 100))
    (:approval-channel "#support-ops")))

(define-policy pii-redaction-policy
  (redact Customer.ssn
    (:unless (= subject.role :support-admin))))

(support/define-check low-confidence-escalation
  (:input DraftResponse)
  (:fail-when (< input.confidence 0.72))
  (:on-fail
    (support/escalate! {:reason :low-confidence})))
```

This gives deterministic enforcement around model behavior.

## Internal Agent

The internal agent evolves the customer agent through continuous tasks:

```lisp
(support/define-internal-agent support-ops-agent
  (:channels slack app)
  (:knowledge tickets docs codebase memory)
  (:tools
    support/search-tickets!
    support/propose-memory-change!
    support/run-evals!
    linear/create-issue!)
  (:tasks
    detect-knowledge-gaps
    summarize-support-trends
    test-draft-configurations
    sync-bug-reports-to-linear))
```

Continuous task example:

```lisp
(define-continuous-task detect-knowledge-gaps
  (:schedule "every weekday at 09:00 America/Los_Angeles")
  (:input recent-support-tickets)
  (:requires
    support/search-tickets!
    support/search-knowledge!
    support/propose-memory-change!
    slack/notify!)
  (:body
    (let [gaps (support/find-knowledge-gaps! recent-support-tickets)]
      (when (not-empty gaps)
        (do
          (support/propose-memory-change! {:gaps gaps})
          (slack/notify! "#support-ops"
            {:message "Knowledge gaps detected"
             :gaps gaps}))))))
```

These tasks should create proposed changes, not silently mutate production
configuration.

## Evals

Support agents need regression tests:

```lisp
(support/define-eval-case refund-under-limit
  (:ticket
    {:subject "Need a refund"
     :body "I was charged twice"
     :email "ada@example.com"})
  (:expect
    (:workflow refund-request)
    (:uses-tool stripe-retrieve-customer)
    (:does-not-require-approval true)
    (:response-includes "refund")))

(support/define-eval-suite refund-regression-suite
  (:cases refund-under-limit refund-over-limit refund-policy-denied)
  (:run-on
    memory-change
    tool-change
    workflow-change))
```

Eval results should become artifacts in the runtime manifest and audit log.

## Activity Log

The runtime should record all meaningful events:

```text
ticket classified
knowledge retrieved
tool proposed
approval requested
approval granted
capability executed
response drafted
response sent
ticket escalated
memory change proposed
eval suite run
configuration activated
```

These events should be stored as triples/facts so operators and agents can ask:

- why did the agent do this?
- what knowledge did it use?
- which policy allowed or denied the action?
- what changed between two versions?
- did the new memory file improve evals?

## Support IR

The support prelude should elaborate into generic IR nodes:

```text
SupportAgent
InternalAgent
ChannelBinding
KnowledgeSource
MemoryBundle
TicketClassifier
TicketWorkflow
GuardrailCheck
EscalationRule
EvalCase
EvalSuite
ContinuousTask
ActivityEventSchema
```

These are domain declarations defined by support preludes. The OCaml engine
should only know the generic declaration envelope, schemas, logic IR,
capabilities, policies, workflows, and manifests.

## Runtime Manifest

A deployed support package should summarize:

```text
agents
channels
knowledge sources
memory bundles
ticket workflows
agent tools
required capabilities
required secrets
policies
approval gates
eval suites
continuous tasks
activity event schemas
backend artifacts
```

This lets a host determine what the support agent can access and what it is
allowed to do before activating it.

## Agentic Coding Loop

The compelling loop is:

```text
observe support tickets
  -> detect gap or regression
  -> propose source/config/memory change
  -> run evals and policy checks
  -> produce plan and diff
  -> request human review if needed
  -> activate new runtime manifest
  -> monitor outcomes
```

The language makes this loop inspectable because each step has typed artifacts,
source spans, policies, and audit events.

## Implementation Sequence

1. Define `SupportAgent` and `KnowledgeSource` declaration envelopes.
2. Model one ticket workflow using existing workflow and capability concepts.
3. Add one support tool with input/output schemas and a mock capability.
4. Emit a support runtime manifest with channels, tools, policies, and evals.
5. Add eval-case declarations and a toy eval runner.
6. Add internal continuous tasks that propose changes rather than apply them.
7. Connect activity events to the triple store.

The first slice should be plan-only and mock-backed. It should prove that the
language can describe the system, typecheck tool/workflow boundaries, and emit a
manifest that a support runtime could execute.
