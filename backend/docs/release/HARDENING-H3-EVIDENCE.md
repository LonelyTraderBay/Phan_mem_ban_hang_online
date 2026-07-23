# Hardening H3 — FE deploy evidence

**Date:** 2026-07-24  
**Path:** Fly static (nginx) — Vercel skipped (no `VERCEL_TOKEN` in agent env)

## URLs (permanent HTTPS)

| App | URL |
|---|---|
| Web Admin | https://ai-sales-web-admin-staging.fly.dev |
| Super Admin | https://ai-sales-ops-staging.fly.dev |
| API (existing) | https://ai-sales-api-staging.fly.dev |
| IdP interim | https://ai-sales-oidc-staging.fly.dev |

## Results

| Check | Result |
|---|---|
| Web Admin `/` | **200** |
| Super Admin `/` | **200** |
| `OIDC_REDIRECT_URI` → Web Admin `/api/auth/oidc/callback` | **Set** on Fly API |
| Probe via Web Admin BFF OIDC→`/me` | **PASS** — Staging Tenant, perms=75 |

## Deploy how

From `frontend/`:

```powershell
fly deploy -c fly.web-admin.staging.toml --remote-only --yes
fly deploy -c fly.ops.staging.toml --remote-only --yes
```

Runtime: `runtime-config.staging.json` copied in Docker build; MSW off.
