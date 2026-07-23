# Hardening H3 — FE deploy evidence

**Date:** 2026-07-23  
**Scaffold:** PASS — `frontend/apps/web-admin/vercel.json`, `frontend/apps/super-admin/vercel.json`, [`HARDENING-H3-FE-DEPLOY.md`](../../../frontend/docs/runbooks/HARDENING-H3-FE-DEPLOY.md)

## Deploy

| Step | Result |
|---|---|
| vercel.json SPA + API rewrites → Fly | **READY** in repo |
| `vercel login` / `VERCEL_TOKEN` | **BLOCKED-HO** — CLI not installed / no token in agent env |
| Live Web Admin HTTPS | **DEFERRED** |
| Live Super Admin HTTPS | **DEFERRED** |
| Auth0 callback URLs on FE hosts | **DEFERRED** (needs H3 hosts + Auth0 console) |

## HO unblock

1. `npm i -g vercel` then `vercel login` (or set `VERCEL_TOKEN`).
2. Follow [`HARDENING-H3-FE-DEPLOY.md`](../../../frontend/docs/runbooks/HARDENING-H3-FE-DEPLOY.md) after Fly API URL is live (H2 billing).
3. Until then, FE live-local against tunnel API remains valid for BFF smoke.
