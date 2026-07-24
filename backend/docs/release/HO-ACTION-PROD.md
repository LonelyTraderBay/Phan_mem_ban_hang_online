# HO Action — Production go-live (H9)

**Authorized:** 2026-07-24 — HO chọn B + Prod Free + DR waiver (no PITR; no pgvector).  
**Runbook:** [`HARDENING-H9-PROD.md`](./HARDENING-H9-PROD.md)  
**Readiness:** [`PROD-READINESS-DEFECT-CLOSURE.md`](./PROD-READINESS-DEFECT-CLOSURE.md) — GO

## Targets

| Role | Value |
|------|------|
| Supabase | `Phan_mem_ban_hang_online-prod` · Free · `ap-southeast-1` |
| Fly API | `phan-mem-ban-hang-online-api-prod` |
| Fly Web | `phan-mem-ban-hang-online-web-prod` |
| Fly Ops | `phan-mem-ban-hang-online-ops-prod` |
| Auth0 | Separate Regular Web app **Production** |
| Redis | N/A v1 |
| Secrets file | `backend/.env.production` (gitignored) |

## HO console steps (secrets — never chat/git)

1. Supabase Dashboard → create/confirm Free project `Phan_mem_ban_hang_online-prod` → Database password → pooler URL → put in `.env.production` as `DATABASE_URL`.
2. Auth0 → Applications → Create Regular Web **Production** → Callbacks:

```
https://phan-mem-ban-hang-online-web-prod.fly.dev/api/auth/oidc/callback
```

Logout / Web Origins:

```
https://phan-mem-ban-hang-online-web-prod.fly.dev/
https://phan-mem-ban-hang-online-web-prod.fly.dev
```

3. Put Domain, Client ID, Client Secret + new session secrets into `.env.production` (do **not** reuse staging cookie secrets).

## Agent steps

```powershell
cd backend
# after .env.production exists:
node tools/preflight-prod-env.mjs   # when present
Get-Content .env.production | Where-Object { $_ -match '^\s*[^#][^=]+=' } | flyctl secrets import -a phan-mem-ban-hang-online-api-prod
# migrate with DATABASE_URL from .env.production
pnpm migrate
fly deploy -c fly.prod.toml
```

FE: deploy web/ops with `fly.web-admin.prod.toml` / ops prod toml.

## Waivers retained

- PITR / Pro upgrade: waived under $25 cap
- Vendor pentest: self-check until booked
- P8 pgvector / P9 support_tickets / P5.2 contract / Tauri: deferred
