# Logic IR

This document sketches the portable executable core for the language. The
current architecture is strong at declaration elaboration: source forms become
canonical declarations such as schemas, records, queries, APIs, modules, and
desired resources. Platform features like HTTP handlers, workflows, policies,
agent tools, and provider apply steps also need executable logic.

The goal is a typed logic IR that can be interpreted, analyzed, tested, or
lowered to targets like JavaScript, Rust, workflow runtimes, and serverless
hosts.

## Problem

Declaration IR answers:

```text
what exists?
what is its schema?
what does it export?
what route/resource/tool/workflow is defined?
```

Logic IR answers:

```text
what happens when it runs?
which capabilities can it call?
what can it return?
what errors can it raise?
what facts/events does it emit?
what transaction or workflow boundaries does it require?
```

Without this layer, handler and workflow bodies either stay as opaque Lisp AST
or leak runtime `Eval.value` into artifact generation. That would make backend
generation, static analysis, policy checks, and agent repair much weaker.

## Example Source

```lisp
(define-http-handler get-employee
  (:method GET)
  (:path "/employees/{id}")
  (:path-params (field id EmployeeId))
  (:returns Employee)
  (:errors EmployeeNotFound)
  (:requires employee/read! log/write!)
  (:body
    (let [employee (query-one! :employee/by-id {:id id})]
      (match employee
        ((Some value)
          (do
            (log! :info "employee fetched" {:id id})
            (ok value)))
        (None
          (raise! EmployeeNotFound {:id id}))))))
```

The handler declaration describes the route. The `:body` lowers to typed logic
IR.

## IR Shape

A minimal portable logic IR should include:

```text
Literal             string, number, bool, nil, keyword
Var                 local reference
Let                 lexical binding
If                  conditional
Match               variant / enum / optional / error matching
Do                  ordered block
Call                pure function call
CapabilityCall      host/runtime operation, for example log! or query-one!
Construct           record / variant / schema-shaped value
FieldGet            record field access
Raise               typed error construction
Try                 local error recovery
Return              explicit return boundary, when useful for handlers
```

Capability calls are the important boundary. They represent effectful
operations without requiring every backend to implement resumable effect
handlers.

```json
{
  "kind": "CapabilityCall",
  "capability": "log/write",
  "inputType": "LogEntry",
  "outputType": "Unit",
  "errorTypes": [],
  "args": {
    "level": "info",
    "message": "employee fetched",
    "fields": { "id": { "var": "id" } }
  }
}
```

## Typechecking

Logic IR should be generated after or during typechecking, not after evaluation.
The typechecker should know:

- local binding types
- schema-projected types
- function signatures
- capability input/output/error signatures
- handler input/output/error contracts
- pattern match exhaustiveness where possible

For the example handler:

```text
id                       : EmployeeId
query-one! result         : Option Employee
match Some value binding  : Employee
ok value                  : HttpResponse Employee
raise! EmployeeNotFound   : never / typed error
handler result            : HttpResponse Employee throws EmployeeNotFound
```

## Capability Calls

The source syntax can remain effect-like:

```lisp
(log! :info "message" {:id id})
(query-one! :employee/by-id {:id id})
(emit-event! EmployeeViewed {:id id})
```

But the compiler should lower these to explicit capability calls:

```text
CapabilityCall(capability, input, output, errors, span)
```

This gives backends and analyzers a stable contract:

- JavaScript backend emits function calls against a capability record.
- Rust backend emits trait calls or context methods.
- Workflow backend emits durable activities.
- Test backend replaces capabilities with mocks.
- Policy backend denies calls that are not permitted.

## Target Lowering

For JavaScript source generation, the handler could lower conceptually to:

```javascript
export async function getEmployee(ctx, request) {
  const id = request.params.id;
  const employee = await ctx.capabilities.queryOne(":employee/by-id", { id });

  if (employee._tag === "Some") {
    await ctx.capabilities.logWrite({
      level: "info",
      message: "employee fetched",
      fields: { id },
    });
    return ctx.http.ok(employee.value);
  }

  throw ctx.errors.EmployeeNotFound({ id });
}
```

The generated code is not the source of truth. The typed logic IR is.

## Design Rules

- Do not use runtime `Eval.value` as the production representation for
  executable bodies.
- Keep provider/runtime operations behind capability calls.
- Keep pure logic portable.
- Preserve source spans on every logic node.
- Treat JavaScript, Rust, workflow engines, tests, and interpreters as backends
  over the same IR.

## Implementation Sequence

1. Define a small typed logic IR for literals, variables, let, if, do, call,
   match, construct, and capability call.
2. Lower one handler body form into logic IR without backend generation.
3. Typecheck capability calls against a capability registry.
4. Add golden diagnostics for unknown capability, bad input shape, bad return
   type, and non-exhaustive match.
5. Add a JavaScript-source sketch backend for one handler.
6. Reuse the same logic IR for agent tools and workflow steps.
