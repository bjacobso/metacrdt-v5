# Agent Tools

This document sketches how the language can define agent-facing tools. The same
schemas, typed logic IR, policies, and capabilities used for application code
should also generate MCP tools, OpenAI-compatible tool schemas, documentation,
tests, and runtime manifests.

## Goals

- Define tools once and emit multiple agent/runtime representations.
- Keep tool inputs and outputs schema-checked.
- Make permissions and capabilities explicit.
- Generate compact summaries for agents.
- Support deterministic tests and mocked capabilities.

## Example

```lisp
(define-schema FindEmployeeInput
  (:kind struct)
  (:fields
    (field query String)
    (field includeInactive (Optional Bool))))

(define-agent-tool find-employee
  (:title "Find employee")
  (:description "Find employees by name, email, or internal id.")
  (:input FindEmployeeInput)
  (:output (Array Employee))
  (:requires employee/read! log/write!)
  (:policy employee-record-access)
  (:body
    (do
      (log! :info "agent employee search" {:query input.query})
      (query! :employee/search input))))
```

The same declaration should be able to emit:

```text
MCP tool definition
OpenAI tool schema
runtime route or RPC handler
permission manifest
test harness
agent-readable summary
documentation
```

## Tool IR

An agent tool declaration should elaborate to:

```text
AgentTool
  name
  title
  description
  input schema
  output schema
  error schemas
  required capabilities
  policies
  body logic IR
  examples
  safety notes
  source span
```

The body should lower to typed logic IR. The tool declaration should be data
that backends can consume without re-parsing source.

## Schema Export

Tool input and output schemas should come from the language schema algebra:

```text
schema IR
  -> JSON Schema
  -> OpenAPI components
  -> MCP inputSchema
  -> OpenAI tool parameters
  -> Effect Schema / Zod / serde exporters
```

The schema exporter must preserve descriptions, examples, refinements, optional
fields, enums, tagged unions, and brands where the target format supports them.

## Safety Model

Tools should declare what they can do:

```lisp
(:requires employee/read! log/write!)
(:policy employee-record-access)
(:rate-limit (:per-user "60/minute"))
(:audit true)
```

Dangerous tools should be visibly different:

```lisp
(define-agent-tool deactivate-user
  (:input DeactivateUserInput)
  (:output DeactivateUserResult)
  (:requires employee/write! github/deactivate-user!)
  (:approval required)
  (:audit true)
  (:body ...))
```

This lets hosts decide which tools are available to which agents in which
contexts.

## Agent Summaries

Each module should be able to emit a compact tool summary:

```json
{
  "tool": "find-employee",
  "description": "Find employees by name, email, or internal id.",
  "input": "FindEmployeeInput",
  "output": "Array<Employee>",
  "capabilities": ["employee/read", "log/write"],
  "policies": ["employee-record-access"],
  "examples": [{ "query": "ada", "includeInactive": false }]
}
```

Agents should not need to read provider source code to understand a tool's
contract.

## Testing

Tool tests should be first-class:

```lisp
(test-tool find-employee
  (:input {:query "ada" :includeInactive false})
  (:mock employee/read!
    (returns [{:id "employee:ada" :name "Ada"}]))
  (:expect-output
    [{:id "employee:ada" :name "Ada"}]))
```

The test backend can execute logic IR with mocked capabilities.

## Implementation Sequence

1. Define `AgentTool` IR with input/output schemas and required capabilities.
2. Lower one tool body to typed logic IR.
3. Emit JSON Schema for tool input.
4. Emit MCP-compatible tool metadata.
5. Add policy checks for tool invocation.
6. Add test-tool support with capability mocks.
7. Add agent summaries to module and runtime manifest output.
