# Remain Completion Waves — Evidence & HO handoff

**Date:** 2026-07-23  
**Plan:** Remain Completion Waves (Mode C)  
**Status:** Agent-complete (local). Staging/pentest/prod = BLOCKED-HO.

## Wave evidence

| Wave | Deliverable | Evidence |
|---|---|---|
| 1 | Seed + mock OIDC + runbook | `backend/tools/seed-dev-tenant.mjs`, `mock-oidc-server.mjs`, `.env.example`, `frontend/docs/runbooks/local-oidc-live.md` — seed OK for `owner@dev.local` |
| 2 | API e2e CAT + OIDC docs | `FE-E2E-API-slice2.md`, `e2e/*api*.spec.ts` |
| 3 | Inbox SSE + channel health + MSW perms | `InboxRoute` + `@ai-sales/realtime`; channel health MSW; sessionBootstrap includes `order.read`/`ai.*` |
| 4 | Metric catalog + F09 + Super Admin fetch | `backend/contracts/metrics/metric-catalog.yaml` synced; Dashboard/Reports catalog lists; Super Admin tenants fetch graceful |
| 5 | F10 login CTA + ADRs | Windows `App.tsx` openExternal; `ADR-012` audit export; `ADR-013` payment providerEvents |
| 6 | This handoff | — |

## Follow-on (post-waves, same day)

| Item | Evidence |
|---|---|
| `GET/PATCH /tenants/current` | BE module + live 200 with seed headers |
| PG17 OIDC establish fix | migrations `000032` / `000033` (`#variable_conflict use_column`) |
| Bootstrap unwrap `{ data }` | `@ai-sales/auth` `bootstrapSession` accepts BE envelope + MSW flat shape |
| Inbox SSE resume/resync | `sessionStorage` lastEventId + conversation event reload |
| Live API e2e | **11/11** `test:e2e:api` with `E2E_OIDC=1` (incl. dashboard after IdP) |
| Super Admin tenants UX | 401/403/network differentiated EmptyState/ErrorPanel |
| F10 vault fail-closed | `createUnavailableCredentialVaultAdapter` + capability badges |

## Local verify checklist

```powershell
cd backend
node tools/seed-dev-tenant.mjs
# Terminal A: node tools/mock-oidc-server.mjs
# Terminal B: node tools/dev-api-local.mjs  (OIDC_ENABLED=true in .env.local)

cd ../frontend
$env:VITE_PUBLIC_ENABLE_MSW='false'
$env:VITE_PUBLIC_API_PROXY_TARGET='http://127.0.0.1:3000'
pnpm --filter @ai-sales/web-admin run dev
# Browser: http://localhost:5173/login → IdP

$env:E2E_OIDC='1'
pnpm --filter @ai-sales/web-admin run test:e2e:api
```

## HO still required (do not agent-open)

- Cloud staging spend (BE-FND-015) — điền [`HO-STAGING-CHECKLIST.md`](../../../backend/docs/release/HO-STAGING-CHECKLIST.md) + [`HO-ACTION-STAGING.md`](../../../backend/docs/release/HO-ACTION-STAGING.md)
- Cutover: [`staging-cutover.md`](../../../backend/docs/release/staging-cutover.md) sau `node tools/preflight-staging-env.mjs`
- Pentest / PITR / pilot / production — [`HO-GATES-HRD.md`](../../../backend/docs/release/HO-GATES-HRD.md)
- Real IdP (Auth0/Okta) + KMS PII envelope
- Managed object storage for imports
- Native Tauri credential vault (ADR-FE-014)
- Billing/notification UI bind (contract gap doc still OPEN for field binding)

## Unlock Wave 0 (agent, 2026-07-23)

Prepared without claiming staging Done: `.env.staging.example`, `preflight-staging-env.mjs`, `dev-api-staging.mjs`, CI preflight workflow scaffold.

## Accounts (local only)

| Email | Tenant | Notes |
|---|---|---|
| owner@dev.local | code `dev` | Full Owner permissions via seed |
