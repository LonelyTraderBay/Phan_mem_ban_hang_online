# Hardening H2 — Fly deploy evidence

**Date:** 2026-07-23  
**Fly auth:** PASS  
**Script:** [`tools/run-hardening-h2.ps1`](../../tools/run-hardening-h2.ps1)

## Result

| Step | Result |
|---|---|
| `flyctl auth whoami` | **PASS** |
| `fly apps create ai-sales-oidc-staging` | **PASS** |
| `fly deploy -c fly.oidc.toml` | **PASS** — `https://ai-sales-oidc-staging.fly.dev/health` **200** |
| `fly apps create ai-sales-api-staging` | **PASS** |
| `fly secrets import` + `fly deploy -c fly.toml` | **PASS** |
| `GET https://ai-sales-api-staging.fly.dev/health` | **200** — checks passing |
| OIDC → `/me` on Fly | **PASS** — Staging Tenant, perms=75 |

**Notes:** First API deploy failed health (corepack cold-start + 256MB). Fixed: Dockerfile `node --import tsx`, `memory = 512mb`, grace 60s. Redeploy version 2 healthy.

**Do not use `fly launch` from repo root** — Dockerfiles live under `backend/`.

## HO residual

- Optional: destroy unused app `phan-mem-ban-hang-online` (empty launch from wrong cwd).
- Auth0 Free swap still preferred over interim Fly OIDC (`HARDENING-H1-AUTH0.md`).
- FE Vercel deploy still open (`HARDENING-H3-EVIDENCE.md`).
