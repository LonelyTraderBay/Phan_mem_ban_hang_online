# Hardening H1 — Auth0 Free (HO console + Agent wire)

**Status:** READY for HO console — interim IdP still `https://ai-sales-oidc-staging.fly.dev`

## Exact URLs (current Fly staging)

| Setting | Value |
|---|---|
| Allowed Callback URLs | `https://ai-sales-web-admin-staging.fly.dev/api/auth/oidc/callback` |
| Allowed Logout URLs | `https://ai-sales-web-admin-staging.fly.dev/` |
| Allowed Web Origins | `https://ai-sales-web-admin-staging.fly.dev` |
| (optional) API direct callback | `https://ai-sales-api-staging.fly.dev/api/v1/auth/oidc/callback` |

## HO steps (browser, ~10 min)

1. https://auth0.com → create **Free** tenant (or use existing).
2. Applications → **Create Application** → name `AI Sales Web Admin (staging)` → type **Regular Web Applications**.
3. Settings → paste Callback / Logout / Web Origins above → **Save**.
4. Copy into password manager (never chat/git):
   - Domain (e.g. `xxx.us.auth0.com`)
   - Client ID
   - Client Secret
5. Tell agent: *“Auth0 staging credentials ready in `.auth0-staging.env`”* after creating the local file (next section).

## Local file (gitignored) — HO or Agent on your machine

Create `backend/.auth0-staging.env` (already in `.gitignore` patterns via `*.env` / add if needed):

```env
AUTH0_DOMAIN=YOUR_TENANT.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
```

Then:

```powershell
cd backend
node tools/wire-auth0-staging.mjs
node tools/preflight-staging-env.mjs
# Apply to Fly (secrets not printed):
Get-Content .env.staging | flyctl secrets import -a ai-sales-api-staging
```

## Agent after wire

1. Redeploy not required if only secrets change (Fly rolls machines on secrets set).
2. Probe: `node tools/probe-staging-oidc-me.mjs https://ai-sales-web-admin-staging.fly.dev`
3. Expect IdP host = your Auth0 domain (not `ai-sales-oidc-staging.fly.dev`).
4. Optional: scale down / destroy `ai-sales-oidc-staging` after Auth0 PASS.

## Interim (current)

Fly `ai-sales-oidc-staging` remains active until Auth0 wire PASS.
