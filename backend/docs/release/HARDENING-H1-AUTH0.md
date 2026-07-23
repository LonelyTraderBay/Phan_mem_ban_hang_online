# Hardening H1 — Auth0 Free (HO console + Agent wire)

**Status:** READY for HO console — interim IdP `https://phan-mem-ban-hang-online-oidc.fly.dev`

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

## Interim (current)

Fly `phan-mem-ban-hang-online-oidc` until Auth0 wire PASS.
