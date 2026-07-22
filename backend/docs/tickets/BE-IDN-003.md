---
ticket_id: BE-IDN-003
title: OIDC BFF login + session cookie + CSRF (Web Admin)
owner: Backend AI Agent
phase: P2
risk: critical
status: done
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
- CSRF double-submit helper (`assertCsrfDoubleSubmit`) for subsequent cookie mutations (GAP-006)
- Enumeration-safe failure redirects; OIDC error codes (`AUTH_OIDC_*`)
- Minimal `GET /me` SessionBootstrap from session cookie
- Audit: `auth.oidc.login` success (no tokens)

**Out of scope**

- Web Admin email/password form as primary login (explicitly rejected by Human Owner 2026-07-21)
- Windows desktop PKCE + vault (ADR-FE-014 / later ticket)
- Argon2id password verify for `credential_type=password`
- Full refresh rotation / logout / switch-tenant (BE-IDN-005/006/009)
- JWKS signature verification hardening (follow-up; nonce + state + PKCE enforced)

# Dependencies

Blocked on **BE-IDN-001** — unblocked. Contract freeze: GAP-009 Closed.

See: `docs/collaboration/gap-009-oidc-bff-contract.md`, `docs/data/identity-migration-design.md`,
`docs/tickets/BE-IDN-test-matrix.md`.

# Domain invariants and state transitions

- Server establishes tenant context; never trust client `tenant_id` for authorization.
- Refresh/access material stored hashed server-side only; browser gets cookies only.
- No hard-delete of audit/session ledger rows — revoke via status flags.

# Contract

- OpenAPI: `startOidcLogin`, `completeOidcLogin`, `getCurrentContext` (no contract change required — frozen).
- Errors: `AUTH_OIDC_STATE_INVALID`, `AUTH_OIDC_EXCHANGE_FAILED`, `AUTH_OIDC_PROVIDER_ERROR`.
- Session cookie name (implementation): `ais_session` (HttpOnly); CSRF cookie: `csrf_token` (non-HttpOnly).

# Authorization and data classification

- OIDC start/callback: `x-permission: public`
- `/me`: session gate via opaque refresh cookie hash lookup
- Classification: IdP tokens/secrets = restricted; PII redacted in logs

# Persistence and migration

- `infra/migrations/000006_oidc_bff.sql` — `oidc_login_states` + SECURITY DEFINER helpers
- Env: `OIDC_ENABLED`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, optional endpoint overrides + session cookie knobs

# Transaction, concurrency and idempotency

- Callback code exchange is single-use; state consume is one-time
- State/nonce mismatch → `AUTH_OIDC_STATE_INVALID`
- Session + refresh + audit in SECURITY DEFINER establish path

# Audit, telemetry and operations

- Audit: `auth.oidc.login` success (provider only; no code/token)
- Rollback: `OIDC_ENABLED=false` / omit OIDC env; no hard-delete

# Acceptance criteria

- [x] Web Admin happy path: start → IdP → callback → session cookies → `GET /me` 200 SessionBootstrap (unit)
- [x] Invalid/missing state → `AUTH_OIDC_STATE_INVALID` (callback 302 `/login?error=…`)
- [x] Code exchange failure → `AUTH_OIDC_EXCHANGE_FAILED`
- [x] IdP `error=` → `AUTH_OIDC_PROVIDER_ERROR`
- [x] MFA-required path redirects to `/2fa` without session cookies
- [x] CSRF double-submit helper enforced (mutations wire in later IDN tickets)
- [x] No access_token in Web Admin JSON success bodies
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix (unit; live IdP/DB deferred)
- [x] FE sync note — OpenAPI unchanged; FE already has ops; set `BACKEND_CONTRACTS_ROOT` if regenerating
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-003`.

Evidence: `modules/identity/src/application/oidc-bff.test.ts` — 10 passed.

# Completion manifest

- Contracts changed: none (GAP-009 already frozen)
- Migration: `infra/migrations/000006_oidc_bff.sql`
- Tests/evidence: `pnpm exec vitest run modules/identity` — 10 passed; `pnpm typecheck` OK
- Known risks: live IdP + Postgres proof deferred (no Docker); JWKS signature verify not yet; MFA challenge token deferred to BE-IDN-008; rate-limit Redis deferred
