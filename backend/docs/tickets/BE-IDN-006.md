---
ticket_id: BE-IDN-006
title: Logout/session/device revoke + SSE/session event hooks
owner: Backend AI Agent
phase: P2
risk: high
status: done
---

# Business outcome

Logout, session/device revoke, emit session events for FE realtime/poll.

# Actor and use case

Authenticated Web Admin (BFF cookie session) ending session or revoking own devices/sessions.

# In scope / Out of scope

In scope: `POST /auth/logout`, `DELETE /sessions/{id}`, `DELETE /devices/{id}`, `GET /devices`, outbox `com.aisales.identity.session-revoked.v1` + SSE close hook docs.

Out of scope: SSE transport implementation (later realtime ticket); FE UI; hard-delete.

# Dependencies

Blocked on **BE-IDN-005** — unblocked.

See: `docs/collaboration/idn006-session-revoked-event.md`, `docs/tickets/BE-IDN-test-matrix.md`.

# Domain invariants and state transitions

- Revoke via flags (`revoked` / `revoked_at`); no hard-delete.
- Cross-user session/device → `RESOURCE_NOT_FOUND` (404).
- Double revoke → `DEVICE_ALREADY_REVOKED` (409).

# Contract

- OpenAPI ops already frozen (`logout`, `revokeSession`, `revokeDevice`, `listDevices`).
- Event docs: `docs/collaboration/idn006-session-revoked-event.md`.

# Authorization and data classification

- Logout/refresh mutations: CSRF required.
- Session/device revoke: authenticated owner + CSRF.
- Outbox payload has ids only (no tokens).

# Persistence and migration

- `infra/migrations/000008_session_device_revoke.sql`

# Transaction, concurrency and idempotency

- SECURITY DEFINER revoke helpers; logout idempotent when already revoked.
- Device/session double-revoke → conflict error (not silent).

# Audit, telemetry and operations

- Audit: `auth.logout`, `auth.session.revoke`, `auth.device.revoke`
- Outbox: `com.aisales.identity.session-revoked.v1` with `close_sse: true`

# Acceptance criteria

- Logout clears session
- DEVICE_ALREADY_REVOKED on double revoke
- Event/poll contract documented
- [x] Permission/tenant isolation tests (other user 404)
- [x] Contract/generated client note — OpenAPI unchanged; FE sync not required
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-006`.

Evidence: `modules/identity/src/application/logout-revoke.test.ts` — identity suite 20 passed.

# Completion manifest

- Contracts changed: none (OpenAPI frozen); event documented in collaboration note
- Migration: `infra/migrations/000008_session_device_revoke.sql`
- Tests/evidence: `pnpm exec vitest run modules/identity` — 20 passed; typecheck OK
- Known risks: live Postgres/SSE proof deferred; AsyncAPI channel entry for session-revoked still optional follow-up; device-revoke audit uses placeholder tenant when no session tenant
