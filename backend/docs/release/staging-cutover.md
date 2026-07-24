# Staging cutover runbook (BE-FND-015 + BE-IDN-003)

**Gate:** Human Owner signed [`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md) mục 0–2 + 6.  
**Do not** run this against laptop Postgres and mark `BE-FND-015` Done.

## Prerequisites

1. Copy [`.env.staging.example`](../../.env.staging.example) → `backend/.env.staging` (gitignored).
2. Fill managed `DATABASE_URL`, real IdP, `https://` redirect, `SESSION_COOKIE_SECURE=true`.
3. Preflight:

```powershell
cd backend
node tools/preflight-staging-env.mjs
```

Exit 0 required before continue.

## 1) Migrate

```powershell
cd backend
Get-Content .env.staging | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] }
}
node tools/migrate.mjs
```

## 2) Smoke invite → accept

```powershell
# Optional: set SMOKE_TENANT_ID / SMOKE_ACTOR_ID / SMOKE_OWNER_ROLE_ID after first seed
$env:SMOKE_MIGRATE = "0"
node tools/smoke-invite-accept.mjs
```

Update evidence in [`../tickets/BE-B0-staging-smoke.md`](../tickets/BE-B0-staging-smoke.md) with **staging** host (no secrets).

## 3) API + OIDC

Start API with staging env (same pattern as `tools/dev-api-local.mjs` but load `.env.staging`).

Verify:

```text
GET {STAGING_API}/health                     → 200
GET {STAGING_API}/api/v1/auth/oidc/start     → 302 to IdP
IdP login → callback → GET /api/v1/me        → 200
```

## 4) Frontend

```powershell
cd frontend
$env:VITE_PUBLIC_ENABLE_MSW = "false"
$env:VITE_PUBLIC_API_PROXY_TARGET = "https://REPLACE_API_HOST"   # or direct apiBaseUrl in runtime config
# Deploy / serve Web Admin on https:// staging host matching OIDC_REDIRECT_URI
```

## 5) Playwright (opt-in)

```powershell
cd frontend
$env:E2E_AGAINST_API = "1"
$env:E2E_API_TARGET = "https://REPLACE_API_HOST"
$env:E2E_OIDC = "1"   # only if IdP test user allowed
pnpm --filter @ai-sales/web-admin run test:e2e:api
```

## 6) Close Phase A

Only after all of the above PASS on **managed** staging:

1. Tick mục 4 on [`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md).
2. Append OUTBOX evidence (no secrets).
3. Propose `BE-FND-015` status change from `doc-frozen` → implementation Done **with HO ack**.

## Related

- Wave 0 pack: `.env.staging.example`, `tools/preflight-staging-env.mjs`
- Local surrogate (not staging): [`../../frontend/docs/runbooks/local-oidc-live.md`](../../frontend/docs/runbooks/local-oidc-live.md)
- Next: [`BE-FND-014`](../tickets/BE-FND-014.md) CI→staging after A PASS
