# FE-F01 exit — Settings slice + MSW bootstrap

**Status:** READY-MOCK exit checklist  
**Date:** 2026-07-23  
**Scope:** Wave 1 F01 — tenant settings, audit logs, notifications placeholder, MSW dev/e2e wiring

## Delivered

- [x] `apps/web-admin/src/main.tsx` — opt-in MSW via `VITE_PUBLIC_ENABLE_MSW=true`
- [x] `apps/web-admin/public/mockServiceWorker.js` — MSW service worker
- [x] Settings routes: `/settings/tenant`, `/settings/audit-logs`, `/settings/notifications`
- [x] MSW overrides: `GET/PATCH /tenants/current`, `GET /audit-logs` in `settingsHandlers.ts`
- [x] Playwright: anonymous smoke (401 override), `auth.msw.spec.ts` IdP journey via `page.route`
- [x] Session bootstrap fixture includes `tenant.read`, `tenant.update`, `audit.read`

## Preflight gates (unchanged from F01-preflight.md)

- Design-specs: `settings-tenant.md`, `settings-audit-logs.md` — READY-MOCK
- Notifications: no OpenAPI preference contract — EmptyState only (no invented fields)
- Permissions: `tenant.read` / `tenant.update` / `audit.read` from matrix only

## Verify locally

```sh
pnpm install
pnpm --filter @ai-sales/web-admin typecheck
pnpm --filter @ai-sales/web-admin run test:e2e
```

## Not in scope (F01 exit)

- READY-INTEGRATION against staging Identity
- Notification preference API or toggles
- DataTable / date filters on audit logs (MISSING COMPONENT per design-spec)
