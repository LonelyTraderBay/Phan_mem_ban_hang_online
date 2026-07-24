# Task 7 Report — Wire Auth0, preflight, Fly secrets, smoke

**Date:** 2026-07-24  
**Commits:** none (HO rule)

## Done
1. Confirmed `backend/.auth0-staging.env` present (gitignored).
2. `node tools/wire-auth0-staging.mjs` — OK (issuer Auth0; redirect Web Admin callback).
3. `node tools/preflight-staging-env.mjs` — OK (warn: REDIS_URL unset/local).
4. Fly secrets import to `phan-mem-ban-hang-online-api` — OK (filtered KEY=VALUE only; machine rolling update succeeded).
5. Smoke:
   - `GET https://phan-mem-ban-hang-online-api.fly.dev/health` → **200**
   - `GET https://phan-mem-ban-hang-online-web.fly.dev/api/auth/oidc/start` → **302** Location → Auth0 `/authorize` (correct client_id + redirect_uri)

## Docs updated
- `HARDENING-H1-AUTH0.md` — Auth0 PASS
- `A-TO-F-EXECUTION-STATUS.md` — IdP = Auth0; go-live still NOT authorized
- `OUTBOX.md` — evidence entry (no secrets)
- `autonomous-progress.md` — T7 PASS

## HO follow-up
- Browser login confirm `/me`
- Rotate Client Secret (exposed in chat) + re-import
- Optional: Supabase display rename

## Status
**DONE** (wire + automated OIDC start smoke). Full interactive login left to HO browser.
