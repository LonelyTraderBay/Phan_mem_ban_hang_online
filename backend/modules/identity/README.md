# Identity module

## Purpose

Authentication, sessions, credentials, MFA, devices, refresh tokens.

## Owned data

See `docs/data/data-dictionary.md` (Identity / Tenant section) and
`docs/data/identity-migration-design.md` (`000005_identity_schema.sql`).

Primary tables: `users`, `user_credentials`, `user_sessions`, `refresh_tokens`,
`devices`, `mfa_factors`, `recovery_codes`, plus `oidc_login_states` (`000006`).

## OpenAPI tags

Auth, Sessions

## Task IDs

`BE-IDN-*` — tickets in `docs/tickets/`. Test matrix: `docs/tickets/BE-IDN-test-matrix.md`.

## Recommended ticket order

| Order | Ticket | Status gate |
|---|---|---|
| 1 | **BE-IDN-001** schema + RLS (`000005`) | done |
| 2 | BE-IDN-002 tenant provision / owner invite | done |
| 3 | BE-IDN-003 OIDC BFF + session/CSRF cookies (`000006`) | done |
| 4 | BE-IDN-004 access JWT (ES256 + kid dual-accept) | done |
| 5 | BE-IDN-005 refresh family (`000007`) | done |
| 6 | BE-IDN-006 logout / session / device revoke (`000008`) | done |
| 7 | BE-IDN-007 password reset (`000009`) | done |
| 8 | BE-IDN-008 MFA / GAP-008 verify body (`000009`) | done |
| 9 | BE-IDN-009 switch tenant + `/me` bootstrap enrich (`000010`) | done |
| 10 | BE-IDN-015 security suite | done |

Member/role tickets: BE-IDN-010…014 under `modules/tenant` + `@ai-sales/security` field policy + `modules/audit` list/export.

## OIDC BFF (BE-IDN-003)

- Routes: `GET /api/v1/auth/oidc/start`, `GET /api/v1/auth/oidc/callback`, `GET /api/v1/me`
- Cookies: `ais_session` (HttpOnly opaque refresh), `csrf_token` (double-submit)
- Enable with `OIDC_ENABLED=true` + issuer/client/secret/redirect URI (+ `DATABASE_URL`)

## Access JWT (BE-IDN-004)

- Library: `@ai-sales/security` — `createAccessTokenService` / `parseBearerAuthorization`
- Loader: `loadAccessTokenService` from this module
- Enable with `JWT_ENABLED=true` + issuer/audience/active kid + PKCS8 PEM
- Dual-accept: set `JWT_PREVIOUS_KID` + `JWT_PREVIOUS_PUBLIC_KEY_PEM` during rotation window

## Refresh rotation (BE-IDN-005)

- Route: `POST /api/v1/auth/refresh` (CSRF + `ais_session` cookie)
- Rotate → new HttpOnly cookie; Web Admin `access_token` always null in JSON
- Reuse of used refresh → `AUTH_REFRESH_REUSED` + family/session revoke

## Logout / revoke (BE-IDN-006)

- `POST /api/v1/auth/logout` — revoke current session + clear cookies
- `DELETE /api/v1/sessions/{id}` / `DELETE /api/v1/devices/{id}` — owner-only; double revoke → `DEVICE_ALREADY_REVOKED`
- `GET /api/v1/devices` — list devices
- Outbox: `com.aisales.identity.session-revoked.v1` (`docs/collaboration/idn006-session-revoked-event.md`)

## Password reset (BE-IDN-007)

- `POST /api/v1/auth/password/forgot` — enumeration-safe; `credential_type=password` only
- `POST /api/v1/auth/password/reset` — single-use hashed token; revokes sessions on success
- Not Web Admin OIDC recovery (GAP-009)

## MFA (BE-IDN-008)

- OIDC MFA path → redirect `/2fa?challenge_id=…` (no session cookies until verify)
- `POST /api/v1/auth/mfa/verify` — TOTP; bad code → `AUTH_MFA_INVALID`; challenge single-use
- Step-up: `assertRecentAuth` → `AUTH_RECENT_AUTH_REQUIRED` until MFA within window
- Enroll helper: `enrollTotpFactor` (no public enroll OpenAPI yet)

## Switch tenant (BE-IDN-009)

- `POST /api/v1/auth/switch-tenant` — CSRF + cookie session; body `{ tenant_id }`
- Rebinds `session.tenant_id` / membership; returns `SessionBootstrapResponse`
- Inactive membership → `MEMBERSHIP_INACTIVE`; unknown/no membership → `TENANT_CONTEXT_INVALID`
- Client must re-read context via response or `GET /me` (never swap tenant client-side only)

## Agent read order

1. This README
2. `docs/data/identity-migration-design.md`
3. Next unblocked ticket under `docs/tickets/`
4. `pnpm agent:contract-slice --tag Auth`
5. Relevant blueprint section via `docs/ai/blueprint-index/05-identity-auth.md`
