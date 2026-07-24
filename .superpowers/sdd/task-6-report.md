# Task 6 Report — wire-auth0 Fly hint + HO handoff

**Date:** 2026-07-24 | **Status:** PASS (Steps 1–2); STOP for HO (Step 3) | **Commits:** none

## Summary

Updated `wire-auth0-staging.mjs` final hint to `-a phan-mem-ban-hang-online-api`. Confirmed `HARDENING-H1-AUTH0.md` callback/logout/web-origin URLs use `phan-mem-ban-hang-online-web.fly.dev` — no doc edits. Did not run wire-auth0 or import secrets.

## HO handoff — create `backend/.auth0-staging.env` (gitignored)

After Auth0 Free console steps in `HARDENING-H1-AUTH0.md`:

```env
AUTH0_DOMAIN=YOUR_TENANT.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
```

Then: `node tools/wire-auth0-staging.mjs` → `node tools/preflight-staging-env.mjs` → `Get-Content .env.staging | flyctl secrets import -a phan-mem-ban-hang-online-api`. Reply when file exists locally — Task 7 blocked until then.

## Files modified

1. `backend/tools/wire-auth0-staging.mjs` — line 73 app name
