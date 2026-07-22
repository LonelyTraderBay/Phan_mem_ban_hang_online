---
ticket_id: BE-IDN-010
title: Member invitation/accept/suspend/revoke
owner: Backend AI Agent
phase: P2
risk: high
status: done
---

# Business outcome

Invite/accept/suspend/revoke members; specific `INVITE_*` errors; `USER_LAST_OWNER` guard.

# Actor and use case

Tenant admins with `member.*` permissions; public `acceptInvitation`.

# In scope / Out of scope

In scope: `inviteMember`, `acceptInvitation`, `listMembers`, `suspend`/`activate`/`revoke`, `resendInvitation`, invite error taxonomy, last-owner guard.

Out of scope: email delivery productization (token issued; outbox later); Postgres SECURITY DEFINER adapter (in-memory store wired for API; persistence follow-up).

# Dependencies

Blocked on **BE-IDN-002** — unblocked.

# Acceptance criteria

- Accept happy path
- INVITE_EXPIRED / REVOKED / ALREADY_ACCEPTED
- USER_LAST_OWNER guard
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix
- [x] Contract/generated client note — OpenAPI unchanged; FE sync not required
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-010`.

Evidence: `modules/tenant/src/application/members-roles.test.ts`, `modules/identity/src/application/accept-invitation.test.ts` — suite 44 passed.

# Completion manifest

- Contracts changed: none (OpenAPI frozen)
- Migration: deferred (in-memory `InMemoryMembersRolesRepository`; tables already in `000005`)
- Tests/evidence: `pnpm exec vitest run modules/tenant modules/identity` — 44 passed; typecheck OK
- Known risks: process-local in-memory directory until Postgres adapters; invite token not emailed (ops hook later); accept without session binder returns AuthResponse with null session_id
