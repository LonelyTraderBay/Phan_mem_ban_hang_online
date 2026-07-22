---
ticket_id: BE-IDN-009
title: Tenant switch and request context resolution
owner: Backend AI Agent
phase: P2
risk: high
status: done
---

# Business outcome

Switch tenant binds `session.tenant_id`; resolve request context; GET `/me` bootstrap.

# Actor and use case

Authenticated Web Admin (BFF cookie session) switching among active memberships.

# In scope / Out of scope

In scope: `POST /auth/switch-tenant` (CSRF), session tenant/membership rebind, SessionBootstrap on switch + `/me`.

Out of scope: `GET /tenants/current` product surface (separate tenant ops); FE UI.

# Dependencies

Blocked on **BE-IDN-003** and **BE-IDN-005** — unblocked. GAP-004 `/me` SessionBootstrap already closed.

# Domain invariants and state transitions

- Server binds tenant from membership; never trust client `tenant_id` for authorization beyond selecting which membership to activate.
- Inactive membership → `MEMBERSHIP_INACTIVE`; no membership / unknown tenant → `TENANT_CONTEXT_INVALID`; suspended tenant → `TENANT_INACTIVE`.
- Same session id; version bumps; refresh cookie not rotated.

# Contract

- OpenAPI `switchTenant` already frozen → `SessionBootstrapResponse`.

# Persistence and migration

- `infra/migrations/000010_switch_tenant.sql` (`app.session_switch_tenant`)

# Acceptance criteria

- Switch updates context
- /me SessionBootstrap shape
- MEMBERSHIP_INACTIVE / TENANT_CONTEXT_INVALID
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix
- [x] Contract/generated client note — OpenAPI unchanged; FE sync not required
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-009`.

Evidence: `modules/identity/src/application/switch-tenant.test.ts` — identity suite 29 passed.

# Completion manifest

- Contracts changed: none (OpenAPI frozen)
- Migration: `infra/migrations/000010_switch_tenant.sql`
- Tests/evidence: `pnpm exec vitest run modules/identity` — 29 passed; typecheck OK
- Known risks: live Postgres proof deferred; `GET /tenants/current` not implemented in this ticket
