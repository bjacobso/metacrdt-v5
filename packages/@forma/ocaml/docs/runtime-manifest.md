# Runtime Manifest

This document sketches the manifest emitted for an elaborated package. The
manifest is the bridge between language artifacts and runtime hosts. It should
tell deployers, agents, UIs, policy engines, and backend generators what the
package contains and what it requires.

## Purpose

Canonical IR contains detailed declarations. A runtime manifest is a compact
index over those declarations:

```text
what can be run?
what routes/tools/workflows/resources exist?
what schemas and policies are exported?
what capabilities, secrets, and permissions are required?
what backend artifacts were emitted?
what source/module hashes produced this package?
```

Hosts should be able to inspect a manifest before loading or executing a
package.

## Manifest Shape

```json
{
  "kind": "RuntimeManifest",
  "package": {
    "name": "acme/people-ops",
    "version": "0.1.0"
  },
  "build": {
    "engine": "onlang-ocaml",
    "engineVersion": "0.1.0",
    "sourceHash": "sha256:...",
    "preludeHash": "sha256:..."
  },
  "modules": [],
  "schemas": [],
  "routes": [],
  "agentTools": [],
  "workflows": [],
  "desiredResources": [],
  "policies": [],
  "capabilities": [],
  "secrets": [],
  "artifacts": []
}
```

The manifest should not replace canonical IR. It should summarize it and link
back to declaration ids.

## Sections

Useful first sections:

- `modules`: module names, exports, source hashes, dependency hashes
- `schemas`: exported schema names, JSON Schema refs, type names
- `routes`: HTTP methods, paths, input/output/error schemas, policies
- `agentTools`: tool names, schemas, capabilities, policies
- `workflows`: workflow names, inputs, outputs, step count, capabilities
- `desiredResources`: provider, type, identity, lifecycle, policies
- `policies`: policy names, targets, mode, source spans
- `capabilities`: required capability names, read/write classification
- `secrets`: secret refs, never secret values
- `artifacts`: backend outputs, media types, hashes

## Capability Manifest

Capabilities should be explicit:

```json
{
  "name": "github/update-branch-protection",
  "mode": "write",
  "inputSchema": "GithubBranchProtectionUpdate",
  "outputSchema": "GithubBranchProtection",
  "errors": ["GithubNotFound", "GithubRateLimited"],
  "requires": {
    "secrets": ["github/token"],
    "permissions": ["github/admin-repo"]
  }
}
```

This lets a host reject a package before execution if the required bindings are
not available.

## Route Manifest

```json
{
  "name": "get-employee",
  "method": "GET",
  "path": "/employees/{id}",
  "pathParams": "GetEmployeePathParams",
  "success": "Employee",
  "errors": ["EmployeeNotFound"],
  "capabilities": ["employee/read", "log/write"],
  "policies": ["employee-record-access"]
}
```

The route manifest can feed OpenAPI generation, deployment, documentation, and
runtime authorization.

## Agent Context

The same manifest should support a reduced agent-context view:

```text
package summary
module exports
tool contracts
route contracts
policy summaries
known capabilities
source spans for repair
```

Agents should consume this before reading full source files.

## Versioning

The manifest needs stable ids and hashes:

```text
package name/version
module source hash
prelude hash
canonical IR hash
backend artifact hash
schema version
provider version
```

Hosts can use these hashes for cache keys, drift detection, reproducibility,
and audit.

## Relationship To Backends

Backends should produce named artifacts:

```json
{
  "name": "openapi.json",
  "backend": "openapi",
  "mediaType": "application/json",
  "hash": "sha256:...",
  "declarationRefs": ["route:get-employee"]
}
```

Possible backend artifacts:

- canonical IR JSON
- OpenAPI
- JSON Schema bundle
- MCP tool definitions
- JavaScript source
- Rust source
- workflow runtime definition
- SaaS plan
- documentation

## Implementation Sequence

1. Emit a minimal manifest for modules, schemas, and backend artifacts.
2. Add required capabilities and secrets.
3. Add routes and agent tools.
4. Add workflows and desired resources.
5. Add policy summaries.
6. Add source hashes and declaration refs.
7. Add reduced agent-context export.

## Design Rule

Runtime hosts should load packages by inspecting typed IR plus manifest data,
not by evaluating source again. Source is for authors and diagnostics; IR and
manifests are the deployment boundary.
