# FE — Playwright against real API (drop MSW gradually)

**Status:** Slice 1 DONE — anonymous auth + health against local Postgres API  
**Date:** 2026-07-23

## Delivered

- Vite proxy: `VITE_PUBLIC_API_PROXY_TARGET` rewrites `/api` → `{target}/api/v1`
- Playwright dual mode:
  - default = MSW (`test:e2e`)
  - `E2E_AGAINST_API=1` = MSW off (`test:e2e:api`)
- Specs: `e2e/auth.api.spec.ts`
- BE: `GET /me` registered whenever `DATABASE_URL` is set (even if OIDC off)

## Verify

```powershell
cd frontend
pnpm --filter @ai-sales/web-admin run test:e2e:api
# Expected: 5 passed (chromium-api)
```

Evidence 2026-07-23: **5 passed** against local Postgres API (MSW off).

## Still MSW / not in this slice

- Full IdP login → session → `/me` 200 (needs `OIDC_ENABLED` + IdP)
- Catalog/customers authenticated list against API
- CI job spinning Postgres + API (local-only for now)
