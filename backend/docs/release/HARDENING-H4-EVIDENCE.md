# Hardening H4 — Cutover re-verify (HTTPS)

**Date:** 2026-07-23  
**Tool:** `node tools/probe-staging-oidc-me.mjs`

## Permanent hosts (Fly)

| Role | URL |
|---|---|
| API | `https://ai-sales-api-staging.fly.dev` |
| OIDC IdP (interim) | `https://ai-sales-oidc-staging.fly.dev` |

## Results

| Check | Result |
|---|---|
| Preflight (`.env.staging`) | **PASS** |
| `GET /health` | **200** |
| OIDC start → IdP → callback | **PASS** (`ais_session`, `csrf_token`) |
| `GET /api/v1/me` | **200** — `Staging Tenant`, `perms=75` |

```text
health=200
oidc_start=302 idp_host=ai-sales-oidc-staging.fly.dev
idp=302 callback=yes
callback=302 cookies=ais_session,csrf_token
me=200
tenant=Staging Tenant perms=75
PASS
```

GH Environment secret `STAGING_API_BASE_URL` updated to Fly URL; CI re-run after update.
