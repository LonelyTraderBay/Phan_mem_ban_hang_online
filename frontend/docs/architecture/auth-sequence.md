# Auth sequence

**Status:** Current — F01 (aligned GAP-009 / ADR-FE-013)  
**Date:** 2026-07-21  
**Authority:** ADR-FE-013 (OIDC + BFF HttpOnly cookie), spec §9, `packages/auth`,
`backend/docs/collaboration/gap-009-oidc-bff-contract.md`

This document describes the client sequence for Web Admin. OpenAPI is source of truth after
`pnpm contracts:sync`.

## Login (Web Admin)

```text
/login — user clicks IdP CTA
  → browser navigates to GET /auth/oidc/start?return_to=/...  (operationId: startOidcLogin)
  → BFF 302 → IdP
  → IdP 302 → GET /auth/oidc/callback?code&state  (operationId: completeOidcLogin)
  → BFF sets HttpOnly session + CSRF cookies; 302 → return_to (or /2fa if MFA)
  → app /auth/callback (transient) then bootstrapSession()
       GET /me  (operationId: getCurrentContext)
  → 200 SessionBootstrapResponse
  → authenticated

Do NOT call deprecated POST /auth/login for Web Admin.
```

## Bootstrap (cold start / refresh)

```text
App start
  → load runtime config
  → bootstrapSession()
       GET /me  (credentials: same-origin)
  → 200 + SessionBootstrap
       user, tenant, session, device, permissions[], feature_flags
  → auth state: authenticated

  → 401
       auth state: anonymous (or single-flight refresh if mid-session)
```

## 401 refresh (single-flight)

```text
Any API call → 401 with AUTH_TOKEN_EXPIRED (retryable)
  → coalesce concurrent 401s into ONE POST /auth/refresh  (EmptyCommandRequest / CSRF)
  → refresh 200 AuthResponse (web: no usable access_token in JS)
       retry original request exactly once
  → refresh fail (AUTH_REFRESH_REUSED | AUTH_SESSION_REVOKED | network)
       clear session, query cache; route to /login
```

JavaScript never reads access/refresh tokens (cookie-only on web).

## 403 — do not refresh

```text
Any API call → 403 (INSUFFICIENT_PERMISSION, AUTH_RECENT_AUTH_REQUIRED, CSRF_TOKEN_INVALID, …)
  → NEVER call refresh
  → ForbiddenState / step-up UI as appropriate
```

## Tenant switch

```text
User picks tenant
  → POST /auth/switch-tenant  { tenant_id }  (SwitchTenantRequest + CSRF)
  → 200 SessionBootstrapResponse (and/or client re-GET /me)
  → reset tenant-scoped query cache
  → navigate to safe default route
```

## Cross-tab

Logout / session revoke in one tab → broadcast → other tabs clear auth + cache.

## Related

- Runbook: `docs/runbooks/auth-session.md`
- Gate: `backend/docs/readiness/ENTERPRISE_DOC_GATE.md`
