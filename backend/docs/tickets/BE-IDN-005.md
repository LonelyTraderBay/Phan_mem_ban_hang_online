---
ticket_id: BE-IDN-005
title: Refresh token family/rotation/reuse detection
owner: Backend AI Agent
phase: P2
risk: critical
status: done
---

# Business outcome

Refresh token family rotation; reuse detection revokes family.

# Actor and use case

Cookie-authenticated Web Admin (BFF) calling `POST /auth/refresh` with HttpOnly session cookie + CSRF double-submit.

# In scope / Out of scope

In scope: Refresh token family rotation, reuse detection (fail-closed family revoke), race-safe rotate, `POST /auth/refresh` + CSRF, AuthResponse without access_token for Web Admin.

Out of scope: logout/device revoke events (BE-IDN-006); desktop bearer refresh with access_token in JSON; FE UI.

# Dependencies

Blocked on **BE-IDN-004** — unblocked.

See also: `docs/adr/ADR-008-jwt-refresh-token-rotation.md`, `docs/tickets/BE-IDN-test-matrix.md`.

# Domain invariants and state transitions

- Refresh stored hashed only; plaintext only in HttpOnly cookie.
- Reuse of an already-used refresh → revoke entire `family_id` + session → `AUTH_REFRESH_REUSED`.
- Never trust client `tenant_id` for authorization.

# Contract

- OpenAPI: `refreshSession` (`POST /auth/refresh`) — unchanged (frozen).
- Errors: `AUTH_REFRESH_REUSED`, `AUTH_SESSION_REVOKED`, `CSRF_TOKEN_INVALID`.

# Authorization and data classification

- `x-permission: session` + CSRF required.
- Tokens/secrets restricted; audit without plaintext.

# Persistence and migration

- `infra/migrations/000007_refresh_rotation.sql` — `app.refresh_rotate_family` + resolve excludes `used_at` parents.

# Transaction, concurrency and idempotency

- `SELECT … FOR UPDATE` (Postgres) / mutex (in-memory): exactly one child per unused parent.
- Concurrent double-refresh: winner rotates; loser → family revoke (fail-closed).

# Audit, telemetry and operations

- Audit: `auth.refresh.rotate`, `auth.refresh.reuse`.
- Rollback: disable refresh route; no hard-delete.

# Acceptance criteria

- Rotate success
- Reuse → AUTH_REFRESH_REUSED + family revoke
- Concurrent refresh race safe
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix
- [x] Contract/generated client note — OpenAPI unchanged; FE already has `refreshSession`
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-005`.

Evidence: `modules/identity/src/application/refresh-session.test.ts` (+ OIDC suite) — 15 passed in `modules/identity`.

# Completion manifest

- Contracts changed: none
- Migration: `infra/migrations/000007_refresh_rotation.sql`
- Tests/evidence: `pnpm exec vitest run modules/identity` — 15 passed; `pnpm typecheck` OK
- Known risks: concurrent loser revokes winner’s new token (strict fail-closed); softer grace-window retry deferred if product needs it; live Postgres proof deferred
