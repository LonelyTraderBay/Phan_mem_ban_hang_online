# Hardening H3 — Permanent FE staging deploy (Vercel)

**Status:** Scaffold committed (H3). Deploy + smoke PASS does **not** mark Phase A Done — follow
[`staging-cutover.md`](../../../backend/docs/release/staging-cutover.md) and
[`staging-fe-deploy.md`](./staging-fe-deploy.md).

**Architecture (ADR-FE-004):** Two apps, **two Vercel projects**, **two HTTPS origins** — never
share a hostname between Web Admin and Super Admin.

| App | Package | Suggested host | `vercel.json` |
|---|---|---|---|
| Web Admin | `@ai-sales/web-admin` | `https://app.<staging-domain>` | [`apps/web-admin/vercel.json`](../../apps/web-admin/vercel.json) |
| Super Admin | `@ai-sales/super-admin` | `https://ops.<staging-domain>` | [`apps/super-admin/vercel.json`](../../apps/super-admin/vercel.json) |

**API target (default):** `https://ai-sales-api-staging.fly.dev` — edit each `vercel.json`
`destination` if Fly app URL differs. Vercel does not expand env vars inside `vercel.json`; override
the URL in git or use Vercel **Project → Settings → Rewrites** for a dashboard-only change.

---

## Prerequisites

1. Fly API staging is up — [`backend/docs/release/staging-fly-deploy.md`](../../../backend/docs/release/staging-fly-deploy.md).
2. [Vercel CLI](https://vercel.com/docs/cli) installed (`npm i -g vercel` or `pnpm dlx vercel`).
3. `VERCEL_TOKEN` in env or `vercel login` (never commit the token).
4. Patch `public/runtime-config.json` per app for staging (`environment`, `oidcClientId`, `buildSha`)
   — **do not commit Auth0 secrets**; client id only.

---

## 1) Local build verify (MSW off)

From repo root:

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\frontend
pnpm install
pnpm contracts:sync

# Web Admin
$env:VITE_PUBLIC_ENABLE_MSW = "false"
$env:VITE_PUBLIC_API_PROXY_TARGET = "https://ai-sales-api-staging.fly.dev"
pnpm --filter @ai-sales/web-admin run build
# → apps/web-admin/dist

# Super Admin (separate origin — separate build; no API proxy env needed)
$env:VITE_PUBLIC_ENABLE_MSW = "false"
Remove-Item Env:VITE_PUBLIC_API_PROXY_TARGET -ErrorAction SilentlyContinue
pnpm --filter @ai-sales/super-admin run build
# → apps/super-admin/dist
```

---

## 2) Vercel project setup (once per app)

Create **two** projects in the Vercel dashboard (or link via CLI below).

### Web Admin project

| Setting | Value |
|---|---|
| Framework | Vite |
| Root Directory | `frontend/apps/web-admin` |
| Install Command | `cd ../.. && pnpm install` |
| Build Command | `cd ../.. && pnpm contracts:sync && pnpm --filter @ai-sales/web-admin run build` |
| Output Directory | `dist` |
| Environment variables | `VITE_PUBLIC_ENABLE_MSW=false` |

Custom domain: `app.<staging-domain>`.

### Super Admin project (separate)

| Setting | Value |
|---|---|
| Root Directory | `frontend/apps/super-admin` |
| Install Command | `cd ../.. && pnpm install` |
| Build Command | `cd ../.. && pnpm contracts:sync && pnpm --filter @ai-sales/super-admin run build` |
| Output Directory | `dist` |
| Environment variables | `VITE_PUBLIC_ENABLE_MSW=false` |

Custom domain: `ops.<staging-domain>`.

`vercel.json` in each app root is picked up automatically when Root Directory points at that folder.

---

## 3) Deploy commands (CLI)

Link each app once (`vercel link` inside the app directory). Use a **non-production** deploy first,
then `--prod` after smoke.

### Web Admin

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\frontend\apps\web-admin

# Optional: non-interactive CI (set in secret store, never commit)
# $env:VERCEL_TOKEN = "<from password manager>"

$env:VITE_PUBLIC_ENABLE_MSW = "false"
vercel deploy
# After smoke on preview URL:
vercel deploy --prod
```

### Super Admin (separate project + origin)

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\frontend\apps\super-admin

$env:VITE_PUBLIC_ENABLE_MSW = "false"
vercel deploy
vercel deploy --prod
```

### Prebuilt deploy (build locally, upload `dist` only)

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\frontend
$env:VITE_PUBLIC_ENABLE_MSW = "false"
pnpm --filter @ai-sales/web-admin run build
cd apps\web-admin
vercel deploy --prebuilt

cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\frontend
$env:VITE_PUBLIC_ENABLE_MSW = "false"
pnpm --filter @ai-sales/super-admin run build
cd apps\super-admin
vercel deploy --prebuilt
```

---

## 4) Runtime config (staging)

Keep relative API paths so rewrites apply:

**Web Admin** — `apiBaseUrl: "/api"`, `sseUrl: "/realtime/stream"` (see
[`apps/web-admin/public/runtime-config.json`](../../apps/web-admin/public/runtime-config.json)).

**Super Admin** — `apiBaseUrl: "/ops-api"`, `sseUrl: "/ops-api/realtime/stream"` (see
[`apps/super-admin/public/runtime-config.json`](../../apps/super-admin/public/runtime-config.json)).

Patch `environment`, `oidcClientId`, `buildSha` at build time; do not commit IdP client secrets.

---

## 5) Auth0 alignment (after H3 hosts exist)

Update Auth0 (see [`HARDENING-H1-AUTH0.md`](../../../backend/docs/release/HARDENING-H1-AUTH0.md)):

1. Allowed Callback URL: `https://<web-admin-host>/api/auth/oidc/callback` (rewritten to Nest).
2. Allowed Logout URLs / Web Origins: `https://<web-admin-host>`.
3. Super Admin OIDC client (shared vs separate Auth0 app) — **HO decision pending**.

Set API secret `OIDC_REDIRECT_URI` to the same callback URL.

---

## 6) Smoke checks (required before claiming deploy PASS)

```text
GET https://<web-admin>/runtime-config.json          → 200, environment=staging
GET https://<web-admin>/api/health (or known route)  → reaches Fly /api/v1/...
GET https://<ops>/runtime-config.json                → 200 (separate origin)
GET https://<ops>/ops-api/...                        → reaches Fly /api/v1/...
```

Then [`staging-cutover.md`](../../../backend/docs/release/staging-cutover.md) §3–5.

---

## Gaps (H3 — not blocking scaffold commit)

| Gap | Owner / action |
|---|---|
| `VERCEL_TOKEN` + `vercel link` per project | HO or agent with secret store access |
| Custom domains `app.*` / `ops.*` DNS | HO / DNS provider |
| Auth0 callback on final web-admin host | H1 + cutover |
| Super Admin separate Auth0 client | HO decision |
| Nest **CORS** for direct API origin calls | Backend if `apiBaseUrl` ever points at Fly URL |
| **SSE** long-lived proxy through Vercel | Not validated; may need direct API URL or different host |
| Playwright against staging HTTPS | `staging-cutover.md` §5 (`E2E_AGAINST_API`) |
| Cloudflare Pages alternative | [`staging-fe-deploy.md`](./staging-fe-deploy.md) Option A (`_redirects`) |

## Related

- [`staging-fe-deploy.md`](./staging-fe-deploy.md) — full FE staging reference
- [`HARDENING-H1-AUTH0.md`](../../../backend/docs/release/HARDENING-H1-AUTH0.md)
- [`ADR-FE-004`](../adr/ADR-FE-004-super-admin-deployment.md)
