# Node Production Hardening

## Status

`@metacrdt/node` has memory, SQLite, and Postgres runtime services; HTTP/SSE
sync routes; a native `node:http` listener adapter; a packaged dev-server CLI;
a sync SDK client; production assembly helpers; and deployment recipes. This
spec tracks production hardening around those shipped seams.

## Remaining Slices

### 1. Auth Middleware Examples

Objective: document and test structural auth middleware around the existing
HTTP/SSE handler without choosing a framework.

Deliverables:
- Example bearer-token middleware.
- Example request metadata propagation.
- Tests for allowed, rejected, and missing-token requests.

### 2. Peer Sync Retry/Backoff

Objective: add a small retry policy helper for one-shot peer sync clients.

Deliverables:
- Bounded retry/backoff options.
- Tagged errors for exhausted retries.
- Tests with deterministic timers/fake clients.

### 3. Observability Hooks

Objective: expose framework-neutral hooks for sync request and storage
operation telemetry.

Deliverables:
- Structural callback interface.
- Examples for logs/metrics.
- Tests that hooks do not affect protocol results.

### 4. Process Manager Templates

Objective: provide deployment templates for common Node process managers.

Deliverables:
- systemd example.
- Docker Compose example.
- Environment variable reference.

## Non-Goals

- Do not choose a production web framework.
- Do not choose a hosted Postgres provider.
