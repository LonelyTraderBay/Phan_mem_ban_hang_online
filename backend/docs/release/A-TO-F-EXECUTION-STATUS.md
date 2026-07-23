# A→F + Hardening execution status (2026-07-24)

**Plan:** A→F + [`2026-07-24-staging-hardening-completion.md`](../superpowers/plans/2026-07-24-staging-hardening-completion.md)  
**Production go-live:** **NOT authorized** (H9 waits for *authorize production go-live*).

## A→F readiness

| Phase | Status | Notes |
|-------|--------|-------|
| A1–A4 | **Done** | Supabase + evidence |
| B–F | **Done*** | CI PASS; ASVS/PITR waivers; readiness only |

## Hardening H1–H9

| ID | Status | Evidence |
|----|--------|----------|
| H1 Auth0 | **Interim READY*** | Fly staging-oidc until Auth0 Free console |
| H2 Fly API | **PASS** | https://ai-sales-api-staging.fly.dev |
| H3 FE HTTPS | **PASS** | Web Admin + Ops on Fly — [`HARDENING-H3-EVIDENCE.md`](./HARDENING-H3-EVIDENCE.md) |
| H4 Re-verify | **PASS** | OIDC→/me via Web Admin BFF |
| H5 CI | **PASS** | staging-preflight green |
| H6 PITR | **Waiver kept*** | Free |
| H7 Pentest | **Self-check kept*** | Vendor optional before prod |
| H8 Board | **Done** | This file |
| H9 Prod | **Not started** | Needs HO phrase |

## Live staging URLs

- API: https://ai-sales-api-staging.fly.dev
- Web Admin: https://ai-sales-web-admin-staging.fly.dev
- Super Admin: https://ai-sales-ops-staging.fly.dev
- IdP (interim): https://ai-sales-oidc-staging.fly.dev

## HO còn lại (không chặn staging)

1. Auth0 Free swap (optional, recommended before prod)
2. Optional Supabase Pro PITR / vendor pentest
3. Production: only *authorize production go-live*
