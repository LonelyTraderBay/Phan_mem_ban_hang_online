# Local Postgres + mock OIDC + FE (Mode C Wave 1)

## One-time

1. Postgres running (`postgresql-x64-17` or Docker).
2. `backend/.env.local` from [`.env.example`](../../backend/.env.example) with real `DATABASE_URL`.

## Seed

```powershell
cd backend
# load .env.local into process env, then:
node tools/seed-dev-tenant.mjs
```

Account: **owner@dev.local** (tenant code `dev`).

## Mock IdP + API

```powershell
# Terminal A
node tools/mock-oidc-server.mjs

# Terminal B — set OIDC_ENABLED=true in .env.local (see .env.example), then:
node tools/dev-api-local.mjs
```

## Web Admin (proxy, MSW off for live)

```powershell
cd frontend
$env:VITE_PUBLIC_ENABLE_MSW='false'
$env:VITE_PUBLIC_API_PROXY_TARGET='http://127.0.0.1:3000'
pnpm --filter @ai-sales/web-admin run dev
```

Open http://localhost:5173/login → **Tiếp tục với IdP** → mock IdP auto-approves → session cookie → `/me` 200.

If OIDC callback returns 500 with `column reference "user_id" is ambiguous`, apply migrations through `000033` (PG17 `#variable_conflict` fix for `oidc_establish_session*`).

## E2E against API

```powershell
cd frontend
# Prefer stopping any MSW-on Vite on :5173 first so Playwright starts MSW-off + proxy.
$env:E2E_OIDC='1'
pnpm --filter @ai-sales/web-admin run test:e2e:api
```

Default CI e2e keeps MSW. Full OIDC Playwright needs mock IdP + API + migrations ≥000033 (see `docs/tickets/FE-E2E-API-slice2.md`).
