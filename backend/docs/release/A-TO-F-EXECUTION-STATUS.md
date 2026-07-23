# A→F execution status (2026-07-23)

**Plan:** A→F Staging → Prod Readiness — **READINESS COMPLETE** (no production go-live).

| Phase | Status | Notes |
|-------|--------|-------|
| A1–A3 | **PASS** | Supabase managed DB; `.env.staging`; HTTPS tunnels; health+OIDC→/me |
| A4 | **Done** | `BE-FND-015` Done — [`PHASE-A-EVIDENCE.md`](./PHASE-A-EVIDENCE.md) |
| B | **Done*** | GH Environment + secrets set; workflow file needs **git push** for Actions run |
| C | **Done*** | Agent ASVS self-check — [`ASVS-SELFCHECK-EVIDENCE.md`](./ASVS-SELFCHECK-EVIDENCE.md); vendor optional later |
| D | **Done*** | Free plan PITR **waived** — Pro required for branch restore |
| E | **Done** | Pilot Staging Tenant — [`PILOT-TENANT-EVIDENCE.md`](./PILOT-TENANT-EVIDENCE.md) |
| F | **Done** | Readiness only — [`PROD-READINESS-DEFECT-CLOSURE.md`](./PROD-READINESS-DEFECT-CLOSURE.md); **no prod go-live** |

\*Starred items use HO-delegated waivers / interim controls (tunnel IdP, agent scanner, PITR waiver).

## Live verify URLs (ephemeral Cloudflare tunnels)

Tunnels die when processes stop — recreate with `cloudflared` + `dev-api-staging.mjs` if needed.

## Hardening still recommended (not blocking readiness)

1. Swap staging OIDC → Auth0 Free long-lived
2. `flyctl auth login` + permanent Fly API URL
3. Push workflow + `gh workflow run staging-preflight.yml`
4. Vendor pentest before real production launch
5. Supabase Pro if strict PITR required
