# GAP-009 — OIDC BFF contract (Web Admin auth channel)

**Status:** Closed (contract + ticket alignment 2026-07-21)  
**Priority:** P0  
**Authority:** Human Owner sign-off 2026-07-21 · ADR-008 · ADR-FE-013

## Problem

Web Admin auth was decided as **OIDC Authorization Code + same-origin BFF `HttpOnly` cookie**,
but OpenAPI still exposed `POST /auth/login` + `LoginRequest { email, password }` as the primary
Auth path, and ticket `BE-IDN-003` was titled/scoped as password login. An AI agent following
OpenAPI/ticket text would implement the **wrong** channel.

## Decision (locked)

| Client | Auth channel | Tokens in JS? |
|--------|--------------|---------------|
| **Web Admin** | OIDC Authorization Code via BFF (`GET /auth/oidc/start` → IdP → `GET /auth/oidc/callback`) | **Never** — session cookie only |
| **Windows desktop** | Authorization Code + PKCE (ADR-FE-014); vault holds refresh | React layer never sees raw refresh |
| **Email/password form on Web Admin** | **Out of scope** | N/A |

### OpenAPI operations (Auth tag)

| operationId | Method / path | Role |
|-------------|---------------|------|
| `startOidcLogin` | `GET /auth/oidc/start` | Begin OIDC; 302 to IdP (or document redirect) |
| `completeOidcLogin` | `GET /auth/oidc/callback` | Exchange code; set session + CSRF cookies; 302 to `return_to` |
| `verifyMfa` | `POST /auth/mfa/verify` | Step-up / post-login MFA when required |
| `refreshSession` | `POST /auth/refresh` | Cookie session rotation (empty body; CSRF required) |
| `logout` | `POST /auth/logout` | Clear session cookies (CSRF required) |
| `getCurrentContext` | `GET /me` | SessionBootstrap |
| `switchTenant` | `POST /auth/switch-tenant` | Typed `SwitchTenantRequest` |
| `login` | `POST /auth/login` | **Deprecated** — not Web Admin; retained only as non-browser local-credential escape hatch if ever enabled |

### Password forgot / reset

Remain in contract for **local-credential** accounts (`credential_type=password`, e.g. invite-set
password or future non-Web clients). Web Admin UX **must not** present them as the primary login
path; IdP owns recovery for OIDC users. FE design-specs for `/forgot-password` / `/reset-password`
stay READY-MOCK only for that local-credential edge case.

## Error codes added

- `AUTH_OIDC_STATE_INVALID`
- `AUTH_OIDC_EXCHANGE_FAILED`
- `AUTH_OIDC_PROVIDER_ERROR`

## Ticket impact

- `BE-IDN-003` rewritten: **OIDC BFF login + session cookie + CSRF** (not Argon2id password verify).
- Password hash verify (Argon2id) belongs only where `credential_type=password` is used (invite
  accept / password reset / deprecated `login`) — track under invite/credential tickets, not as
  Web Admin login.

## Agent rules

1. Do **not** implement Web Admin login as `POST /auth/login` with email/password.
2. Do **not** put access/refresh tokens in JSON for Web Admin success paths (cookie-only).
3. FE login primary CTA = navigate to `startOidcLogin` URL; after callback, `GET /me`.
4. Desktop must not reuse the BFF cookie flow — follow ADR-FE-014.
