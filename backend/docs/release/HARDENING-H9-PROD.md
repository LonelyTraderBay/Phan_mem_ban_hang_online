# Hardening H9 — Production go-live

**Status:** **AUTHORIZED** · infra **partial** · cutover **BLOCKED-HO (secrets)**  
HO 2026-07-24 chọn B + Prod Free + DR waiver (no PITR; no pgvector P8).

## Provisioned (agent)

| Role | Value | Status |
|------|------|--------|
| Supabase | `Phan_mem_ban_hang_online-prod` · ref `sppdnlpbkdasmjealhjm` · Free · `ap-southeast-1` | ACTIVE_HEALTHY |
| Fly API | `phan-mem-ban-hang-online-api-prod` | app created |
| Fly Web | `phan-mem-ban-hang-online-web-prod` | app created |
| Fly Ops | `phan-mem-ban-hang-online-ops-prod` | app created |
| Migrate | `000001` + `000002` applied via MCP | **remaining 000003–000041 need `DATABASE_URL`** |
| Auth0 Production app | — | **BLOCKED-HO** |
| `.env.production` | example at `backend/.env.production.example` | **BLOCKED-HO** fill |
| Redis | N/A v1 | OK |
| PITR | Waived (Free) | OK |

## HO unblock (required for W5 cutover)

1. Supabase Dashboard → prod project → **Database** → reset/copy password → fill `DATABASE_URL` in gitignored `backend/.env.production` (see example).
2. Auth0 → create Regular Web **Production** app → Callbacks/Logout/Web Origins for `phan-mem-ban-hang-online-web-prod.fly.dev` → Domain/Client ID/Secret into `.env.production`.
3. Generate **new** session/cookie secrets (do not copy staging).
4. Tell agent: *“prod secrets ready”* — agent runs:

```powershell
cd backend
node tools/preflight-prod-env.mjs
# migrate remaining
Get-Content .env.production | ForEach-Object { if ($_ -match '^\s*([^#][^=]+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] } }
pnpm migrate
Get-Content .env.production | Where-Object { $_ -match '^\s*[^#][^=]+=' } | flyctl secrets import -a phan-mem-ban-hang-online-api-prod
fly deploy -c fly.prod.toml
```

Then FE: `fly deploy -c fly.prod.toml` from web-admin / super-admin dirs.  
Smoke: `node tools/verify-prod-scope.mjs`

## Smoke evidence

| Check | Result | When |
|-------|--------|------|
| Migrate version | partial (000001–000002) | 2026-07-24 |
| `GET /health` prod API | pending secrets/deploy | |
| OIDC start → Auth0 302 | pending | |
| `/api/me` unauth 401 | pending | |
| HO browser login | pending | |
| `/billing/plan` | pending | |

## Related

- [`HO-ACTION-PROD.md`](./HO-ACTION-PROD.md)
- [`PROD-READINESS-DEFECT-CLOSURE.md`](./PROD-READINESS-DEFECT-CLOSURE.md)
- Staging schema P6/P7 + FE billing: Done on staging in this wave
