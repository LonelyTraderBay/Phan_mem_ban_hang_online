---
ticket_id: BE-IDN-008
title: TOTP MFA/recovery codes/step-up
owner: Backend AI Agent
phase: P2
risk: critical
status: done
---

# Business outcome

TOTP enroll/verify, recovery codes (store), step-up recent-auth window.

# Actor and use case

OIDC login when verified MFA factor exists; sensitive actions requiring recent MFA (`assertRecentAuth`).

# In scope / Out of scope

In scope: `POST /auth/mfa/verify` (`MfaVerifyRequest`), OIDC redirect `/2fa?challenge_id=`, single-use challenges, `AUTH_MFA_INVALID`, `AUTH_RECENT_AUTH_REQUIRED`, enroll helper + recovery code hashes.

Out of scope: public enroll OpenAPI ops (application helper for now); WebAuthn.

# Dependencies

Blocked on **BE-IDN-003** — unblocked. Closes GAP-008 runtime for typed verify body.

# Domain invariants and state transitions

- Challenge single-use; bad code does not consume challenge.
- MFA-required OIDC path defers session until verify succeeds.
- Step-up marks `last_mfa_at` on session metadata (10-minute default window).

# Contract

- OpenAPI `verifyMfa` already frozen (GAP-008).

# Persistence and migration

- `infra/migrations/000009_password_reset_mfa_challenges.sql` (`mfa_challenges` + SECURITY DEFINER helpers)

# Acceptance criteria

- MFA required path
- AUTH_MFA_INVALID
- Typed verify body
- Step-up AUTH_RECENT_AUTH_REQUIRED
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix
- [x] Contract/generated client note — OpenAPI unchanged; FE sync not required
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-008`.

Evidence: `modules/identity/src/application/mfa-verify.test.ts` — identity suite 25 passed.

# Completion manifest

- Contracts changed: none (OpenAPI frozen)
- Migration: `infra/migrations/000009_password_reset_mfa_challenges.sql`
- Tests/evidence: `pnpm exec vitest run modules/identity` — 25 passed; typecheck OK
- Known risks: TOTP secrets stored as UTF-8 bytes until envelope encryption; public enroll HTTP ops not in OpenAPI yet; live Postgres/IdP proof deferred
