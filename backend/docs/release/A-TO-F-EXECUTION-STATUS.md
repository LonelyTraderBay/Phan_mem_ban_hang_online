# A→F + Hardening execution status (2026-07-23)

**Plan:** A→F Staging → Prod Readiness + post A→F Hardening Completion.  
**Production go-live:** **NOT authorized** (H9 waits for explicit HO: *“authorize production go-live”*).

## A→F readiness

| Phase | Status | Notes |
|-------|--------|-------|
| A1–A3 | **PASS** | Supabase managed DB; `.env.staging`; HTTPS; health+OIDC→/me |
| A4 | **Done** | `BE-FND-015` — [`PHASE-A-EVIDENCE.md`](./PHASE-A-EVIDENCE.md) |
| B | **Done** | GH Environment `staging` + secrets; CI run **PASS** — [`HARDENING-H5-EVIDENCE.md`](./HARDENING-H5-EVIDENCE.md) |
| C | **Done*** | Agent ASVS self-check — [`ASVS-SELFCHECK-EVIDENCE.md`](./ASVS-SELFCHECK-EVIDENCE.md); vendor optional before prod |
| D | **Done*** | Free plan PITR **waived** — Pro/branch restore needs upgrade within $25/mo |
| E | **Done** | Pilot Staging Tenant — [`PILOT-TENANT-EVIDENCE.md`](./PILOT-TENANT-EVIDENCE.md) |
| F | **Done** | Readiness only — [`PROD-READINESS-DEFECT-CLOSURE.md`](./PROD-READINESS-DEFECT-CLOSURE.md); **no prod go-live** |

## Hardening H1–H9

| ID | Status | Evidence |
|----|--------|----------|
| H1 Auth0 | **Interim READY*** | [`HARDENING-H1-AUTH0.md`](./HARDENING-H1-AUTH0.md) — staging mock IdP until Auth0 Free console |
| H2 Fly API | **PASS** | `https://ai-sales-api-staging.fly.dev` — [`HARDENING-H2-EVIDENCE.md`](./HARDENING-H2-EVIDENCE.md) |
| H3 FE HTTPS | **Scaffold READY*** | vercel.json + runbook; deploy needs `VERCEL_TOKEN` — [`HARDENING-H3-EVIDENCE.md`](./HARDENING-H3-EVIDENCE.md) |
| H4 Re-verify | **PASS** | health+OIDC→/me on Fly — [`HARDENING-H4-EVIDENCE.md`](./HARDENING-H4-EVIDENCE.md) |
| H5 CI | **PASS** | [Actions run 30020298095](https://github.com/LonelyTraderBay/Phan_mem_ban_hang_online/actions/runs/30020298095) |
| H6 PITR | **Waiver kept*** | Free; Pro not enabled within cap without HO card upgrade |
| H7 Pentest | **Self-check kept*** | Vendor optional before prod go-live |
| H8 Board | **Done** | This file + OUTBOX |
| H9 Prod | **Not started** | Requires HO phrase *authorize production go-live* |

\*Starred = HO residual (billing / Auth0 console / Vercel token) or interim tunnel hosts.

## HO one-liners to finish permanent hosts

1. ~~Fly billing~~ **Done** — API + interim OIDC on Fly
2. `vercel login` → [`HARDENING-H3-FE-DEPLOY.md`](../../../frontend/docs/runbooks/HARDENING-H3-FE-DEPLOY.md)
3. Auth0 Free app → wire `.env.staging` / Fly secrets per [`HARDENING-H1-AUTH0.md`](./HARDENING-H1-AUTH0.md)
4. Optional: destroy empty app `phan-mem-ban-hang-online`; Supabase Pro PITR; vendor pentest before prod
