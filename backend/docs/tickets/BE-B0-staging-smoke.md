# BE-B0 — Staging / local Postgres smoke (invite-accept)

**Status:** DONE (local Postgres 17 native) — 2026-07-23; extended by Remain Waves seed + mock OIDC  
**Script:** `backend/tools/smoke-invite-accept.mjs`  
**Seed:** `backend/tools/seed-dev-tenant.mjs` → `owner@dev.local`  
**Mock IdP:** `backend/tools/mock-oidc-server.mjs`

## Evidence

```
Applying 000031_fix_accept_invitation_ambiguity.sql... ok
invite ok: … invited
accept ok: … perms= 75
```

- PostgreSQL 17 service `postgresql-x64-17` Running
- DB `ai_sales`, role `app_schema_owner`
- Migrations through `000031`
- Env: `backend/.env.local` (gitignored)

## Connection (local only)

```
DATABASE_URL=postgres://app_schema_owner:change-me-local-only@127.0.0.1:5432/ai_sales
```

Re-run:

```powershell
cd backend
Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] } }
$env:SMOKE_MIGRATE = "1"
node tools/smoke-invite-accept.mjs
```

## Notes

- Docker Desktop installed but engine still Stopped (WSL not installed yet) — native Postgres used instead.
- Local setup: after create DB, run `ALTER EXTENSION citext SET SCHEMA app;` before migration `000026` (function `search_path=app,pg_temp`).
- `000031` fixes PG17 `tenant_id` ambiguity in `accept_invitation`.
- Re-verified 2026-07-23: migrations thru `000033` (no pending); smoke invite+accept OK; OIDC mock → `/me` 200. **Not** cloud staging (`BE-FND-015` still BLOCKED-HO).
