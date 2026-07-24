# Go-live wave SDD ledger (schema + billing + H9)

Plan: Schema Billing Go-live (Free) — 2026-07-24  
HO: B + Prod Free + DR waiver

| Wave | Status | Notes |
|------|--------|-------|
| W0 Unlock docs | **Done** | H9 AUTHORIZED; HRD-010 GO |
| W1 Schema P6/P7 | **Done** | `000040`/`000041` local+staging; worker job_runs |
| W2 FE billing | **Done** | BillingRoute bind; contract gap BOUND |
| W3 H9 runbook | **Done** | HO-ACTION-PROD + fly.prod.toml |
| W4 Prod infra | **Partial** | Supabase `sppdnlpbkdasmjealhjm` + Fly `*-prod`; secrets **BLOCKED-HO** |
| W5 Cutover | **BLOCKED-HO** | Needs `.env.production` + Auth0 Production |
| W6 Evidence | **Done** | H9 table + verify-prod-scope.mjs; staging FE fly deploy failed (tar mode) — code ready |

**Unblock:** HO fills `backend/.env.production` from `.env.production.example`, then reply `prod secrets ready`.
