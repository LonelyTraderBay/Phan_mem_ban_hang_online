# Staging API deploy — Fly.io (Phase A2 scaffold)

**Status:** Scaffold only. Running these steps does **not** mark `BE-FND-015` Done until
[`staging-cutover.md`](./staging-cutover.md) PASS on managed infra.

> **Legacy Fly apps** `ai-sales-*-staging` (including `ai-sales-api-staging`) were **destroyed**. Use the canonical names below — see [`NAMING-PHAN-MEM-BAN-HANG-ONLINE.md`](./NAMING-PHAN-MEM-BAN-HANG-ONLINE.md).

**Prerequisites**

1. Human Owner completed [`A1-SECRETS-FILL-GUIDE.md`](./A1-SECRETS-FILL-GUIDE.md) → `backend/.env.staging` exists locally (gitignored).
2. `node tools/preflight-staging-env.mjs` exits **0**.
3. [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed.

**Target (API — this runbook)**

| Item | Value |
|---|---|
| Fly app | `phan-mem-ban-hang-online-api` |
| Region | `sin` (Singapore, near Supabase `ap-southeast-1`) |
| Internal port | `3000` |
| Public health URL | `https://phan-mem-ban-hang-online-api.fly.dev/health` |

**Sibling staging apps** (separate deploy runbooks / configs):

| Role | App | URL |
|---|---|---|
| Web Admin | `phan-mem-ban-hang-online-web` | https://phan-mem-ban-hang-online-web.fly.dev |
| Super Admin | `phan-mem-ban-hang-online-ops` | https://phan-mem-ban-hang-online-ops.fly.dev |
| IdP interim | `phan-mem-ban-hang-online-oidc` | https://phan-mem-ban-hang-online-oidc.fly.dev |

---

## 1) Authenticate

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\backend
fly auth login
fly auth whoami
```

## 2) Create app (first time only)

Skip if the app already exists (`fly apps list`).

```powershell
fly apps create phan-mem-ban-hang-online-api --org personal
```

> Use your Fly org slug instead of `personal` if different. App name must match [`fly.toml`](../../fly.toml).

## 3) Set secrets from `.env.staging`

**Never commit `.env.staging`. Never paste secret values into chat, PRs, or this doc.**

Import every non-comment line from the local file:

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\backend
Get-Content .env.staging | fly secrets import
```

Verify names only (values redacted):

```powershell
fly secrets list
```

### Required secret keys (names only — fill values in `.env.staging`)

| Key | Notes |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string |
| `OIDC_ENABLED` | Must be `true` on staging |
| `OIDC_ISSUER` | Auth0 tenant URL (`https://<tenant>.auth0.com/`) or interim `https://phan-mem-ban-hang-online-oidc.fly.dev` |
| `OIDC_CLIENT_ID` | Auth0 Regular Web App |
| `OIDC_CLIENT_SECRET` | Auth0 client secret |
| `OIDC_REDIRECT_URI` | `https://phan-mem-ban-hang-online-web.fly.dev/api/auth/oidc/callback` (or custom web-admin host) |
| `OIDC_SCOPES` | `openid profile email` |
| `SESSION_COOKIE_SECURE` | Must be `true` |
| `SESSION_COOKIE_NAME` | `ais_session` |
| `SESSION_ABSOLUTE_TTL_HOURS` | e.g. `12` |
| `REFRESH_TTL_DAYS` | e.g. `30` |
| `JWT_ENABLED` | `false` for Phase A Web Admin cookie auth |

### Optional keys (set if used)

| Key |
|---|
| `REDIS_URL` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `AI_SERVICE_URL` |
| `WALKING_SKELETON_ENABLED` |
| `OIDC_AUTHORIZATION_ENDPOINT` |
| `OIDC_TOKEN_ENDPOINT` |
| `OIDC_USERINFO_ENDPOINT` |

Non-secret runtime defaults (`NODE_ENV`, `SERVICE_NAME`, `PORT`, `LOG_LEVEL`) are in [`fly.toml`](../../fly.toml) `[env]`.

## 4) Deploy

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\backend
fly deploy
```

Watch logs:

```powershell
fly logs
```

## 5) Health check

```powershell
curl.exe -fsS https://phan-mem-ban-hang-online-api.fly.dev/health
```

Expected: HTTP **200** with JSON health payload (`service: api`).

Readiness (same payload today):

```powershell
curl.exe -fsS https://phan-mem-ban-hang-online-api.fly.dev/ready
```

## 6) Post-deploy (not automatic)

| Step | Runbook |
|---|---|
| Migrate staging DB | [`staging-cutover.md`](./staging-cutover.md) §1 |
| OIDC smoke | [`staging-cutover.md`](./staging-cutover.md) §3 |
| FE deploy | [`../../../frontend/docs/runbooks/staging-fe-deploy.md`](../../../frontend/docs/runbooks/staging-fe-deploy.md) |

## Gaps (intentional — Phase A2 scaffold)

- **Migrations** are not run inside the Docker image; run `node tools/migrate.mjs` with staging env before smoke.
- **CORS / cookie `SameSite` tuning** for cross-origin Web Admin → API may need follow-up once real HTTPS hosts are known.
- **Custom domain** (e.g. `api.staging.example.com`) not configured — using default `*.fly.dev` hostname.
- **CI deploy** (`BE-FND-014`): optional in `staging-preflight` when `run_fly_deploy=true` and `FLY_API_TOKEN` is set on Environment `staging` (skips when absent); see [`BE-FND-014-staging-ci.md`](./BE-FND-014-staging-ci.md).

## Related

- [`Dockerfile`](../../Dockerfile) · [`fly.toml`](../../fly.toml)
- [`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md)
- [`A1-SECRETS-FILL-GUIDE.md`](./A1-SECRETS-FILL-GUIDE.md)
