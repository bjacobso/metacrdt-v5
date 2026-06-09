# Effect Type

This document sketches an `Effect<A, E, R>` type for the language:

```text
Effect<Success, Error, Requirements>
```

The goal is to model effectful computations with typed success values, typed
error values, and explicit runtime requirements. This is closer to Effect-TS,
ZIO, or Koka's typed computation discipline than to making resumable algebraic
effect handlers the default operational model.

## Why

Platform logic needs to answer three questions:

```text
What can this computation return on success?
What can this computation fail with?
What capabilities/environment does it require to run?
```

For example:

```lisp
(: load-customer
  (-> CustomerId
      (Effect Customer
              (Union CustomerNotFound StripeUnavailable)
              [stripe/read log/write])))
```

This says `load-customer` succeeds with `Customer`, can fail with one of the
listed typed errors, and requires `stripe/read` plus `log/write`.

## Design Position

The language can have effectful source syntax without requiring every backend
to implement resumable effect handlers:

```text
source syntax
  -> typed Effect<A, E, R>
  -> typed logic IR with capability calls
  -> backend/runtime binding
```

The `Effect` type is a static contract. Capability calls are the runtime
boundary. Resumable handlers can remain an advanced or experimental feature.

## Basic Syntax

Explicit type annotation:

```lisp
(: refund
  (-> RefundRequest
      (Effect RefundResult
              (Union RefundDenied StripeError ApprovalDenied)
              [stripe/read stripe/write slack/approval log/write])))
```

Do notation:

```lisp
(define (refund request)
  (do!
    (_ <- (log! :info "refund requested" {:id request.customerId}))
    (customer <- (stripe/get-customer! {:id request.customerId}))
    (_ <- (check-refund-policy request customer))
    (_ <- (when! (> request.amount 100)
            (slack/request-approval!
              {:channel "#support-ops"
               :message "Approve refund?"
               :request request})))
    (stripe/process-refund! request)))
```

Inferred type:

```text
Effect<RefundResult,
       RefundDenied | StripeError | ApprovalDenied,
       stripe/read | stripe/write | slack/approval | log/write>
```

## Errors As Values

Errors should be schema-backed values:

```lisp
(define-error CustomerNotFound
  (:fields
    (field id CustomerId))
  (:status 404))

(define-error StripeUnavailable
  (:fields
    (field reason String)
    (field retryAfter (Optional Duration)))
  (:status 503))
```

An error value can be constructed, matched, serialized, documented, returned in
OpenAPI, inspected by workflow retry logic, or used by policy.

```lisp
(fail (CustomerNotFound {:id id}))
```

Errors are not unstructured strings and should not be hidden in exceptions at
the language boundary.

## Requirements

The `R` parameter is a set of required capabilities or environment services:

```text
stripe/read
stripe/write
log/write
employee/read
employee/write
slack/approval
secret/github-token
clock
random
```

These requirements feed:

- typechecking
- runtime manifests
- deploy-time capability checks
- tests and mocks
- policies
- workflow planning
- agent tool availability

If a handler declares fewer requirements than its body needs, the compiler
should report that mismatch.

## Handler Checking

Source:

```lisp
(define-http-handler get-customer
  (:method GET)
  (:path "/customers/{id}")
  (:path-params (field id CustomerId))
  (:returns Customer)
  (:errors CustomerNotFound)
  (:requires stripe/read log/write)
  (:body
    (do!
      (_ <- (log! :info "get customer" {:id id}))
      (customer <- (stripe/get-customer! {:id id}))
      (match customer
        ((Some value) (succeed value))
        (None (fail (CustomerNotFound {:id id})))))))
```

Body inference:

```text
Effect<Customer,
       CustomerNotFound | StripeUnavailable,
       stripe/read | log/write>
```

Declared contract:

```text
returns Customer
errors CustomerNotFound
requires stripe/read | log/write
```

Diagnostic:

```text
Unhandled error StripeUnavailable.

The body of get-customer can fail with StripeUnavailable, but the handler
declares only CustomerNotFound.

Either:
  add StripeUnavailable to (:errors ...)
  handle it with match/catch
  map it to a declared error
```

## Catching And Mapping Errors

```lisp
(catch
  (stripe/get-customer! {:id id})
  (StripeUnavailable err)
    (fail (ServiceUnavailable
      {:service "stripe" :retryAfter err.retryAfter})))
```

Type effect:

```text
before: Effect<Customer, StripeUnavailable, stripe/read>
after:  Effect<Customer, ServiceUnavailable, stripe/read>
```

This keeps API error surfaces intentional.

## Requirements Elimination

A requirement is eliminated when a runtime provides it:

```text
program : Effect<A, E, stripe/read | log/write>
runtime provides stripe/read and log/write
run(program, runtime) : Result<A, E>
```

Tests can provide mock requirements:

```lisp
(test-effect "refund under limit"
  (:run (refund request))
  (:provide
    (stripe/read mock-stripe-read)
    (stripe/write mock-stripe-write)
    (log/write test-log))
  (:expect-success RefundResult))
```

## Relationship To Capability Calls

Every `!` operation should have an effect type:

```text
log!                    : LogEntry -> Effect<Unit, Never, log/write>
stripe/get-customer!    : Lookup -> Effect<Option Customer, StripeError, stripe/read>
slack/request-approval! : ApprovalRequest -> Effect<Approval, ApprovalDenied, slack/approval>
```

During lowering, these become typed logic IR capability calls:

```text
CapabilityCall
  capability: stripe/read
  operation: get-customer
  input: Lookup
  output: Option Customer
  errors: StripeError
```

The `Effect` type is what the typechecker sees. `CapabilityCall` is what
backends and runtimes see.

## Relationship To Workflows

Workflow steps can use the error channel for retry and compensation:

```lisp
(step process-refund
  (:retry
    (on StripeRateLimited (:max 5) (:backoff :exponential))
    (on StripePermanentFailure (:max 0)))
  (:do
    (stripe/process-refund! request)))
```

The compiler can validate that retry rules reference errors the step can
actually produce.

## Relationship To Policies

Policies can inspect requirements before deployment or invocation:

```lisp
(define-policy no-prod-writes-from-dev
  (deny tool/invoke
    (:when
      (and
        (= context.environment :prod)
        (contains tool.requirements stripe/write)
        (= subject.role :developer)))))
```

This is much harder if requirements are implicit in arbitrary code.

## Relationship To OpenAPI And Agent Tools

For HTTP routes:

```text
A -> success response schema
E -> error response schemas
R -> deployment/runtime requirements
```

For agent tools:

```text
A -> tool output schema
E -> tool failure schemas
R -> required tool bindings/capabilities
```

This lets OpenAPI, MCP, OpenAI tools, tests, and runtime manifests all derive
from the same typed contract.

## Algebraic Handlers

This design does not forbid algebraic handlers. It avoids making them the
default runtime semantics.

Useful places for real handlers may include:

- local test interpreters
- pure simulations
- workflow suspension experiments
- advanced language research
- custom interpreters for domain-specific effects

But production I/O should start with typed capabilities and explicit
requirements because that model is easier to lower to JavaScript, Rust, Wasm,
serverless runtimes, workflow engines, and policy analyzers.

## Implementation Sequence

1. Add `Effect<A, E, R>` as a type constructor in the type representation.
2. Represent `R` as a normalized set of capability identifiers.
3. Represent `E` as a union of schema-backed error types.
4. Give `!` operations effectful function types.
5. Add `do!`, `succeed`, `fail`, `catch`, and `when!` lowering to typed logic
   IR.
6. Check handler/tool/workflow declarations against inferred `A`, `E`, and `R`.
7. Add diagnostics for undeclared errors, missing requirements, unused declared
   requirements, and impossible catches.
8. Emit `E` and `R` into runtime manifests, OpenAPI, agent tool contracts, and
   workflow step metadata.

## Design Rule

`Effect<A, E, R>` should be the typed computation contract. It should not be a
backdoor for runtime-value artifact construction, untyped exceptions, or hidden
host calls.
