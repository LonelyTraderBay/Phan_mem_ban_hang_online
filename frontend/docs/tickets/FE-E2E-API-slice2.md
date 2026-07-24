# FE — Playwright against real API (Wave 2 / slice 2)

**Status:** READY-MOCK by default; local live path is opt-in  
**Date:** 2026-07-23

## Delivered

- Added `e2e/catalog.api.spec.ts`.
  - Runs only with `E2E_AGAINST_API=1`.
  - Calls the real `GET /api/v1/products`.
  - Sends `x-actor-id`, `x-tenant-id`, and `x-permissions` using the fixed local seed IDs.
  - Supports `E2E_ACTOR_ID`, `E2E_TENANT_ID`, and `E2E_PERMISSIONS` overrides.
  - Skips when the API health endpoint is unavailable.
- Added `e2e/auth.oidc.api.spec.ts`.
  - Runs only with `E2E_OIDC=1`.
  - Checks API health, mock IdP health, and the OIDC start redirect before navigating.
  - Skips when the API or mock IdP is unavailable, or OIDC is disabled.
  - Verifies the browser path ends at the authenticated dashboard.
- Kept the anonymous API auth coverage in `e2e/auth.api.spec.ts`.

## Local seed and mock IdP

The seed script uses these non-production IDs:

- Tenant: `01900000-0000-7000-8000-00000000a100`
- Owner actor: `01900000-0000-7000-8000-00000000b100`
- Account: `owner@dev.local`

Start the local dependencies in separate terminals:

```powershell
cd backend
node tools/seed-dev-tenant.mjs
node tools/mock-oidc-server.mjs
node tools/dev-api-local.mjs
```

Then run the live API slice:

```powershell
cd frontend
pnpm --filter @ai-sales/web-admin run test:e2e:api
```

Run the full mock-IdP browser journey explicitly:

```powershell
$env:E2E_OIDC = "1"
pnpm --filter @ai-sales/web-admin run test:e2e:api
```

`backend/.env.local` must have `OIDC_ENABLED=true` and point the issuer/token settings at
`http://127.0.0.1:9090`. The default mock suite remains MSW-backed and does not require these
processes.

## Remaining gaps

- There is no CI job that provisions Postgres, seeds it, starts the API and mock IdP, then runs
  this live Playwright slice.
- Catalog live coverage is header-authenticated; a browser catalog journey after OIDC is still
  separate work.
- Orders, AI, inbox, and channel live journeys still use READY-MOCK handlers.
- Inbox realtime currently subscribes to the configured SSE URL but does not interpret event
  payloads; event-driven list refresh waits for a confirmed UI event mapping.
- Channel health detail is limited to fields in `ChannelAccountResource`; latency, webhook lag,
  and error-rate dimensions are not in the frozen tenant contract.
