---
ticket_id: BE-IDN-003
title: OIDC BFF login + session cookie + CSRF (Web Admin)
owner: Backend AI Agent
phase: P2
risk: critical
status: blocked
---

# Business outcome

Web Admin authenticates via **OIDC Authorization Code + same-origin BFF**. The BFF sets
`HttpOnly` / `Secure` / `SameSite=Lax`-or-stricter session cookies; JavaScript never sees
access/refresh tokens (ADR-008, ADR-FE-013, GAP-009).

# Actor and use case

Anonymous browser user on Web Admin → IdP → BFF callback → authenticated session → `GET /me`.

# In scope / Out of scope

**In scope**

- `GET /auth/oidc/start` (`startOidcLogin`) — store state, 302 to IdP
- `GET /auth/oidc/callback` (`completeOidcLogin`) — validate state, exchange code, set session + CSRF cookies, 302 to `return_to` (or `/2fa` if MFA required)
- Cookie session establishment aligned with refresh rotation (ADR-008)
- CSRF double-submit on subsequent cookie mutations (GAP-006)
- Enumeration-safe / rate-limited failure paths; OIDC error codes (`AUTH_OIDC_*`)
- Audit: login success/failure (no tokens), logout hooks deferred to BE-IDN logout ticket if split

**Out of scope**

- Web Admin email/password form as primary login (explicitly rejected by Human Owner 2026-07-21)
- Windows desktop PKCE + vault (ADR-FE-014 / later ticket)
- Argon2id password verify for `credential_type=password` (invite accept / password reset / deprecated `POST /auth/login` only — not this ticket)
- FE UI (FE F01 READY-MOCK against MSW until this lands)

# Dependencies

Blocked on **BE-IDN-001** (credentials/sessions schema). Contract freeze: GAP-009 Closed.

See: `docs/collaboration/gap-009-oidc-bff-contract.md`, `docs/data/identity-migration-design.md`,
`docs/tickets/BE-IDN-test-matrix.md`.

# Domain invariants and state transitions

- Server establishes tenant context; never trust client `tenant_id` for authorization.
- Refresh/access material stored hashed server-side only; browser gets cookies only.
- No hard-delete of audit/session ledger rows — revoke via status flags.

# Contract

- OpenAPI: `startOidcLogin`, `completeOidcLogin`, plus existing `verifyMfa` / `refreshSession` /
  `logout` / `getCurrentContext` (Auth slice — no Generic on these ops).
- Errors: `AUTH_OIDC_STATE_INVALID`, `AUTH_OIDC_EXCHANGE_FAILED`, `AUTH_OIDC_PROVIDER_ERROR`,
  plus existing auth/MFA/rate-limit codes.
- `POST /auth/login` remains **deprecated** in OpenAPI — do not implement as Web Admin path.

# Authorization and data classification

- OIDC start/callback: `x-permission: public`
- Post-login: session gate / concrete permissions from bootstrap
- Classification: IdP tokens/secrets = restricted; PII redacted in logs

# Persistence and migration

- Uses sessions/refresh tables from BE-IDN-001; additive config for IdP client id/secret via env
  (no secrets in repo)

# Transaction, concurrency and idempotency

- Callback code exchange is single-use; replay → fail-closed
- State/nonce one-time; mismatch → `AUTH_OIDC_STATE_INVALID`
- Session + refresh + audit share one transaction where applicable

# Audit, telemetry and operations

- Audit: `auth.oidc.login` success/failure (no code/token), provider error class only
- Metrics: oidc_start, oidc_callback_success/fail, exchange_latency
- Rollback: disable OIDC routes / feature flag; no hard-delete

# Acceptance criteria

- [ ] Web Admin happy path: start → IdP → callback → session cookies → `GET /me` 200 SessionBootstrap
- [ ] Invalid/missing state → `AUTH_OIDC_STATE_INVALID` (or 302 to `/login` with safe error)
- [ ] Code exchange failure → `AUTH_OIDC_EXCHANGE_FAILED`
- [ ] IdP `error=` → `AUTH_OIDC_PROVIDER_ERROR`
- [ ] MFA-required path redirects to `/2fa` with challenge (ties BE-IDN-008)
- [ ] CSRF enforced on cookie mutations after login
- [ ] No access_token in Web Admin JSON success bodies
- [ ] Permission/tenant isolation tests per BE-IDN-test-matrix
- [ ] FE sync note after contract change
- [ ] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-003` (update row title to OIDC BFF when implementing).

# Completion manifest

- Contracts changed:
- Migration:
- Tests/evidence:
- Known risks:
