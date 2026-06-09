# Cloudflare Live Query SDK

## Status

Cloudflare already has structural live-query pieces: persisted subscription
rows, reconnect hydration, authenticated Worker routing, SQLite Durable Object
assembly, write-route publishing, a structural WebSocket client, result diff
metadata, and a structural session helper. This spec tracks the remaining
frontend/SDK layer.

## Remaining Slices

### 1. Browser Session Storage Boundary

Objective: persist stable live-query connection ids and subscription metadata in
a small browser-facing helper without choosing React or an auth provider.

Deliverables:
- Storage interface with localStorage implementation.
- Session restore helper over `createDurableObjectSqliteLiveQuerySession`.
- Tests with fake storage and fake socket.

### 2. Auth Token Boundary

Objective: allow the live-query client/session helper to request tokens through
a caller-provided async provider.

Deliverables:
- Token provider interface.
- URL/header/query-param integration matching existing Worker auth.
- Tests for token refresh and auth failure surfacing.

### 3. React Hooks Package Slice

Objective: expose ergonomic React hooks after the structural browser helpers are
stable.

Deliverables:
- `useLiveQuerySession`.
- `useCurrentQuery`.
- Loading/error/reconnect states.
- Tests around subscription lifecycle.

## Non-Goals

- Do not change core protocol semantics.
- Do not bake in a specific application auth provider.
- Do not require React for the structural client.
