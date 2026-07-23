# Hardening H2 — Fly deploy evidence

**Date:** 2026-07-23  
**Fly auth:** PASS (`flyctl auth whoami` after browser login)  
**Script:** [`tools/run-hardening-h2.ps1`](../../tools/run-hardening-h2.ps1) (ASCII-safe; ignores flyctl stderr noise)

## Result

| Step | Result |
|---|---|
| `flyctl auth login` / whoami | **PASS** |
| `fly apps create ai-sales-oidc-staging` | **BLOCKED-HO** — Fly requires payment method |
| `fly apps create ai-sales-api-staging` | **BLOCKED-HO** — same |
| `GET https://ai-sales-api-staging.fly.dev/health` | **N/A** (app not created) |

Fly error (no secrets): `We need your payment information to continue! Add a credit card or buy credit: https://fly.io/dashboard/lonelytraderbay/billing`

Within hard cap **$25/mo**, shared-cpu Machine is expected ~$2–5/mo after card on file.

## HO unblock (one action)

1. Open https://fly.io/dashboard/lonelytraderbay/billing → add card or credit (stay under $25/mo cap).
2. From `backend/`:

```powershell
flyctl auth whoami
.\tools\run-hardening-h2.ps1
```

3. Confirm `health=200` on `https://ai-sales-api-staging.fly.dev/health`.
4. Update GH Environment secret `STAGING_API_BASE_URL` to the Fly URL; re-run `staging-preflight.yml`.

## Interim HTTPS (until Fly billing)

Cloudflare quick tunnels + local Nest + `tools/staging-oidc-server.mjs` remain the verified HTTPS path (see H4 / PHASE-A evidence). Not permanent — recreate tunnels when processes die.
