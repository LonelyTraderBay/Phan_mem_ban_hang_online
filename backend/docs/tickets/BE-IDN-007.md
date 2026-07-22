---
ticket_id: BE-IDN-007
title: Password forgot/reset single-use flow
owner: Backend AI Agent
phase: P2
risk: high
status: done
---

# Business outcome

Forgot/reset with single-use hashed tokens for `credential_type=password` accounts only (not Web Admin OIDC primary path — GAP-009).

# Actor and use case

Unauthenticated local-credential recovery; OIDC/IdP users recover via IdP.

# In scope / Out of scope

In scope: `POST /auth/password/forgot`, `POST /auth/password/reset`, Argon2id hash, session revoke on reset, enumeration-safe forgot.

Out of scope: email transport productization (token issuance path ready; delivery via outbox later); Web Admin email/password login.

# Dependencies

Blocked on **BE-IDN-003** — unblocked.

# Domain invariants and state transitions

- Tokens stored hashed only; single-use; expired/reused → reject.
- Forgot always returns identical EmptyOk (enumeration-safe).
- Successful reset revokes all user sessions/refresh tokens.

# Contract

- OpenAPI ops already frozen (`requestPasswordReset`, `resetPassword`).

# Persistence and migration

- `infra/migrations/000009_password_reset_mfa_challenges.sql` (`password_reset_tokens` + SECURITY DEFINER)

# Acceptance criteria

- Reset once
- Reuse/expired rejected
- Enumeration-safe forgot response
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix
- [x] Contract/generated client note — OpenAPI unchanged; FE sync not required
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-007`.

Evidence: `modules/identity/src/application/password-reset.test.ts` — identity suite 25 passed.

# Completion manifest

- Contracts changed: none (OpenAPI frozen)
- Migration: `infra/migrations/000009_password_reset_mfa_challenges.sql`
- Tests/evidence: `pnpm exec vitest run modules/identity` — 25 passed; typecheck OK
- Known risks: email delivery not wired (ops must enqueue notify separately); live Postgres proof deferred without Docker
