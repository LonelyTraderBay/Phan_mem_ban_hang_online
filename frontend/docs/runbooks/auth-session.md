# Runbook: Auth session (local / MSW) — DRAFT

**Status:** DRAFT — F01  
**Date:** 2026-07-21

## Purpose

Debug Web Admin auth bootstrap and refresh against MSW without a real IdP/BFF.

## Prerequisites

- `pnpm install` at frontend root
- Know ADR-FE-013: cookie session; no token in `localStorage`
- Read `packages/test-utils/README.md` — default MSW handlers include a hand-written
  `GET /me` override (`authHandlers.ts`) returning `buildSessionBootstrap()`; use
  `server.use(...)` for anonymous/401 scenarios

## Common symptoms

| Symptom | Likely cause | What to do |
|---|---|---|
| Bootstrap `invalid_schema` | Override missing / wrong shape / stale generated stub winning | Confirm `authHandlers` is listed before generated handlers; override with `buildSessionBootstrap()` matching `packages/auth` zod schema |
| Infinite refresh loop | Refresh also 401 / handler missing | Ensure `POST /auth/refresh` MSW returns 200 once; failures must end in logged-out |
| 403 triggers refresh | Bug in refresh wrapper | 403 must never call refresh — add/adjust unit test |
| Login “works” but app empty | Permissions array empty or wrong keys | Check bootstrap `permissions` against `permissionKeys`; fail closed |
| Credential login vs IdP | Auth strategy waiver | Prefer IdP CTA; credential path may be stub — see SIGNOFF / design-spec `login.md` |

## Minimal MSW scenarios to keep green

1. Anonymous `GET /me` → 401 → app shows `/login`
2. Authenticated `GET /me` → 200 SessionBootstrap override
3. Data call 401 → single refresh 200 → retry 200
4. Refresh `AUTH_REFRESH_REUSED` → logged out, one redirect to login
5. Data call 403 → no refresh; Forbidden UI
6. `POST /auth/switch-tenant` → 200 → second `GET /me` with new tenant id

## What not to do

- Do not paste access tokens into localStorage “to unblock”
- Do not invent permission keys or error codes in handlers
- Do not treat scaffold login copy as final UX

## Related

- `docs/architecture/auth-sequence.md`
- `docs/tickets/F01-preflight.md`
- `docs/adr/ADR-FE-013-web-authentication.md`
