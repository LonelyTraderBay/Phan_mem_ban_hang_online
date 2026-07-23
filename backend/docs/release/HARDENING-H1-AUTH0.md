# Hardening H1 — Auth0 Free (HO console)

**Target callback (temporary until FE host exists):**  
`https://ai-sales-api-staging.fly.dev/api/v1/auth/oidc/callback`

**Final callback (after H3):**  
`https://<web-admin>/api/v1/auth/oidc/callback`  
(and keep Allowed Web Origins / Logout URLs in sync)

## Steps

1. https://auth0.com → Free tenant
2. Applications → Create → **Regular Web Application** → `AI Sales Web Admin (staging)`
3. Settings → Allowed Callback / Logout / Web Origins as above → Save
4. Copy Domain, Client ID, Client Secret into password manager
5. Run (local, never paste secret in chat):

```powershell
cd backend
# Edit .env.staging keys OIDC_* then:
node tools/preflight-staging-env.mjs
```

Or after Fly is up, agent will `fly secrets set` from your filled `.env.staging`.

## Interim if Auth0 not ready

Agent may deploy `tools/staging-oidc-server.mjs` as a **Fly app** `ai-sales-oidc-staging` (HTTPS permanent) until Auth0 is wired — not production IdP.
