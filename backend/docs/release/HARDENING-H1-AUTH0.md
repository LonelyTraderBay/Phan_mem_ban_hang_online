# Hardening H1 — Auth0 Free (HO console + Agent wire)

**Status:** Auth0 PASS (wire + Fly secrets + OIDC start→Auth0 302 + HO browser login) — 2026-07-24  
Issuer domain: `dev-51apo48jpnewe6oa.us.auth0.com` (no secrets in git).  
Browser login → app: **HO confirmed** 2026-07-24. Automated re-check: `node tools/verify-staging-scope-c.mjs` → 16/16 PASS.

## Exact URLs (Phan_mem_ban_hang_online staging)

| Setting | Value |
|---|---|
| Allowed Callback URLs | `https://phan-mem-ban-hang-online-web.fly.dev/api/auth/oidc/callback` |
| Allowed Logout URLs | `https://phan-mem-ban-hang-online-web.fly.dev/` |
| Allowed Web Origins | `https://phan-mem-ban-hang-online-web.fly.dev` |

See also [`NAMING-PHAN-MEM-BAN-HANG-ONLINE.md`](./NAMING-PHAN-MEM-BAN-HANG-ONLINE.md).

## HO steps (browser, ~10 min)

1. https://auth0.com → create **Free** tenant (or use existing).
2. Applications → **Create Application** → name `Phan_mem_ban_hang_online Web Admin (staging)` → type **Regular Web Applications**.
3. Settings → paste Callback / Logout / Web Origins above → **Save**.
4. Copy Domain, Client ID, Client Secret into password manager (never chat/git).
5. Create `backend/.auth0-staging.env` then:

```powershell
cd backend
node tools/wire-auth0-staging.mjs
node tools/preflight-staging-env.mjs
Get-Content .env.staging | flyctl secrets import -a phan-mem-ban-hang-online-api
```

## Rotate Client Secret (nếu đã lộ)

Icon mắt/copy **không** phải Rotate. Theo [Auth0 docs](https://auth0.com/docs/get-started/applications/rotate-client-secret):

1. Applications → app staging → tab **Settings**
2. **Cuộn xuống cuối trang** → mục **Danger Zone** → **Rotate** → Confirm
3. Lên đầu trang → tab **Credentials** → Client Secret (icon mắt) → copy secret **mới**
4. Cập nhật `backend/.auth0-staging.env` rồi bảo agent re-import Fly
