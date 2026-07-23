# Hardening H4 — Cutover re-verify (HTTPS)

**Date:** 2026-07-23  
**Tool:** `node tools/probe-staging-oidc-me.mjs`

## Hosts used

| Role | URL | Permanence |
|---|---|---|
| API | `https://refers-ceramic-northeast-illustrated.trycloudflare.com` | Cloudflare quick tunnel (interim; Fly blocked on billing — see HARDENING-H2-EVIDENCE.md) |
| OIDC IdP | `https://gaming-near-configuration-rev.trycloudflare.com` | Staging mock IdP behind tunnel (Auth0 Free still preferred) |

## Results

| Check | Result |
|---|---|
| Preflight (`.env.staging`) | PASS (earlier same session) |
| `GET /health` | **200** |
| OIDC start → IdP → callback | **PASS** (cookies `ais_session`,`csrf_token`) |
| `GET /api/v1/me` | **200** — tenant `Staging Tenant`, `perms=75` |

```text
health=200
oidc_start=302 idp_host=gaming-near-configuration-rev.trycloudflare.com
idp=302 callback=yes
callback=302 cookies=ais_session,csrf_token
me=200
tenant=Staging Tenant perms=75
PASS
```

## Permanent hosts

**Deferred:** Fly app create requires payment method (`HARDENING-H2-EVIDENCE.md`). After HO adds Fly billing and H2 script succeeds, re-run this probe against `https://ai-sales-api-staging.fly.dev` and update this file + GH `STAGING_API_BASE_URL`.
