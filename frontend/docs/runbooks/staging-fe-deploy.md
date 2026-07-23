# Staging frontend deploy — Web Admin + Super Admin (Phase A2 scaffold)

**Status:** Scaffold only. Deploying static assets does **not** complete Phase A until OIDC +
API smoke PASS on real HTTPS hosts ([`backend/docs/release/staging-cutover.md`](../../../backend/docs/release/staging-cutover.md)).

**Architecture (ADR-FE-004):** Web Admin and Super Admin are **two separate apps, two separate
origins, two separate sessions**. Do not deploy them to the same hostname.

| App | Package | Suggested staging host pattern |
|---|---|---|
| Web Admin | `apps/web-admin` | `https://app.<staging-domain>` |
| Super Admin | `apps/super-admin` | `https://ops.<staging-domain>` |

---

## Build-time env vars (`VITE_PUBLIC_*`)

From the FE codebase (`apps/web-admin/vite.config.ts`, `apps/web-admin/src/main.tsx`,
`playwright.config.ts`):

| Variable | Staging value | Purpose |
|---|---|---|
| `VITE_PUBLIC_ENABLE_MSW` | `false` | Disables MSW worker in `main.tsx` |
| `VITE_PUBLIC_API_PROXY_TARGET` | `https://<staging-api-host>` | **Dev server only** — Vite proxies `/api` → `{target}/api/v1` |

> **Gap:** `VITE_PUBLIC_API_PROXY_TARGET` is read only by the Vite **dev** proxy
> (`server.proxy` in `vite.config.ts`). Production static hosting must use platform rewrites
> (below) or point `runtime-config.json` `apiBaseUrl` at the real API origin.

### Other `VITE_PUBLIC_*` references

| Variable | Where used | Staging note |
|---|---|---|
| `VITE_PUBLIC_WEB_ADMIN_LOGIN_URL` | `apps/windows-client` only | Not required for Web/Super Admin staging |

---

## Runtime config (`public/runtime-config.json`)

Each app loads `/runtime-config.json` at boot ([`packages/config`](../../packages/config)).
Patch per environment **before** or **during** build (do not commit secrets here).

### Web Admin (`apps/web-admin/public/runtime-config.json`)

```json
{
  "environment": "staging",
  "apiBaseUrl": "/api",
  "sseUrl": "/realtime/stream",
  "oidcClientId": "<Auth0 client id — same as OIDC_CLIENT_ID>",
  "releaseVersion": "0.1.0-staging",
  "buildSha": "<git sha>",
  "telemetryEnabled": false,
  "supportUrl": "/help"
}
```

Keep `apiBaseUrl: "/api"` when the host platform rewrites `/api/*` to the Nest API (recommended).

### Super Admin (`apps/super-admin/public/runtime-config.json`)

```json
{
  "environment": "staging",
  "apiBaseUrl": "/ops-api",
  "sseUrl": "/ops-api/realtime/stream",
  "oidcClientId": "<Auth0 client id for ops app if separate>",
  "releaseVersion": "0.1.0-staging",
  "buildSha": "<git sha>",
  "telemetryEnabled": false,
  "supportUrl": "/help"
}
```

---

## Local build (verify before cloud upload)

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\frontend
pnpm install
pnpm contracts:sync

# Web Admin
$env:VITE_PUBLIC_ENABLE_MSW = "false"
$env:VITE_PUBLIC_API_PROXY_TARGET = "https://ai-sales-api-staging.fly.dev"
pnpm --filter @ai-sales/web-admin run build
# output: apps/web-admin/dist

# Super Admin (separate origin — separate build)
$env:VITE_PUBLIC_ENABLE_MSW = "false"
pnpm --filter @ai-sales/super-admin run build
# output: apps/super-admin/dist
```

---

## Option A — Cloudflare Pages (two projects)

Create **two** Pages projects (ADR-FE-004 separate origins).

### Web Admin project

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `pnpm install && pnpm contracts:sync && pnpm --filter @ai-sales/web-admin run build` |
| Build output | `apps/web-admin/dist` |
| Environment variables | `VITE_PUBLIC_ENABLE_MSW=false` |

**API rewrite** — add `apps/web-admin/public/_redirects` (or Pages dashboard → Redirects):

```text
/api/*  https://ai-sales-api-staging.fly.dev/api/v1/:splat  200
```

> Replace API host with your real staging API URL after Fly deploy.

### Super Admin project (separate custom domain)

| Setting | Value |
|---|---|
| Build output | `apps/super-admin/dist` |
| Environment variables | `VITE_PUBLIC_ENABLE_MSW=false` |

**Ops API rewrite** (`apps/super-admin/public/_redirects`):

```text
/ops-api/*  https://ai-sales-api-staging.fly.dev/api/v1/:splat  200
```

Deploy Super Admin on `ops.<staging-domain>` — **not** the same hostname as Web Admin.

---

## Option B — Vercel (two projects)

### Web Admin

| Setting | Value |
|---|---|
| Root | `frontend` |
| Install | `pnpm install` |
| Build | `pnpm contracts:sync && pnpm --filter @ai-sales/web-admin run build` |
| Output | `apps/web-admin/dist` |
| Env | `VITE_PUBLIC_ENABLE_MSW=false` |

`frontend/apps/web-admin/vercel.json` (create at deploy time — not committed in A2):

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ai-sales-api-staging.fly.dev/api/v1/:path*"
    }
  ]
}
```

### Super Admin (separate Vercel project + domain)

```json
{
  "rewrites": [
    {
      "source": "/ops-api/:path*",
      "destination": "https://ai-sales-api-staging.fly.dev/api/v1/:path*"
    }
  ]
}
```

---

## Auth0 / OIDC alignment

After both FE hosts exist:

1. Set `OIDC_REDIRECT_URI` (API secret) to `https://<web-admin-host>/api/auth/oidc/callback`.
2. Auth0 Application → Allowed Callback URLs: same URL.
3. Allowed Logout URLs: `https://<web-admin-host>/login` (adjust to real route).
4. Super Admin may need a **second** Auth0 app if ops uses a different client — not decided in A2.

---

## Smoke checks (no Done claim until PASS)

```text
GET https://<web-admin>/runtime-config.json     → 200, environment=staging
GET https://<web-admin>/api/... (via rewrite)   → reaches API /api/v1/...
GET https://<ops>/runtime-config.json           → 200 (separate origin)
```

Then follow [`backend/docs/release/staging-cutover.md`](../../../backend/docs/release/staging-cutover.md) §3–5.

---

## Gaps (Phase A2 scaffold)

- `_redirects` / `vercel.json` examples above are **documentation only** — not committed; HO/agent adds at deploy time.
- **CORS** on Nest API for browser calls that bypass rewrites (direct `apiBaseUrl` URL) not configured in repo yet.
- **SSE** (`sseUrl`) rewrite/proxy not validated on static hosts.
- **Super Admin OIDC** client strategy (shared vs separate Auth0 app) pending HO decision.
- **Playwright against staging** — see `staging-cutover.md` §5 (`E2E_AGAINST_API`, `E2E_API_TARGET`).

## Related

- [ADR-FE-004](../adr/ADR-FE-004-super-admin-deployment.md)
- [local-oidc-live.md](./local-oidc-live.md) (local surrogate — not staging)
- [`backend/docs/release/staging-fly-deploy.md`](../../../backend/docs/release/staging-fly-deploy.md)
