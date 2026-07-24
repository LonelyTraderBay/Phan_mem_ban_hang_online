# Design: DOC_GATE Code-complete → 100% (scope C, waves tuần tự)

**Date:** 2026-07-24  
**Status:** Approved (brainstorming §1–§3)  
**Scope label:** C = Tier A hygiene + CSV sync Blocked-HO + staging CI deploy path + Auth0  
**Approach:** Waves tuần tự W1 → W2 → W3 → W4

## Goal

Đưa `implementation_backlog.csv` lên **157/157 Done**, đóng foundation còn lệch (`BE-FND-006`, sync `BE-FND-014`), hoàn thiện phần staging còn thật (CI→Fly optional, Auth0 thay IdP tạm), và đồng bộ ticket/CSV với HO-GATES — **không** authorize production go-live.

## Non-goals

- Production go-live / cutover prod
- Vendor pentest trả phí; Supabase Pro PITR (giữ waiver trừ khi HO mua)
- Billing UI bind; Tauri native vault
- Schema gates P6–P9 (`shipping_labels`, `support_tickets`, `job_runs`, pgvector…)

## Wave map

| Wave | Purpose | Primary actor |
|------|---------|---------------|
| W1 | Close `BE-FND-006`; CSV Done for `FND-006` + `FND-014` | Agent |
| W2 | Optional Fly deploy job on `staging-preflight`; refresh legacy URLs in CI/staging docs | Agent + HO secret |
| W3 | Auth0 Free wire + smoke OIDC→`/me` | HO console then Agent |
| W4 | CSV/ticket Done for `FND-015`, `HRD-001/004/009/010`; ledger A=100% CSV | Agent |

**Hard order:** W1 → W2 → W3 → W4. W2 may PASS with documented “manual deploy only” if `FLY_API_TOKEN` absent; W3 still proceeds after W1.

## Live staging names (canonical)

| Role | Value |
|------|-------|
| API Fly app | `phan-mem-ban-hang-online-api` |
| Web Admin | `https://phan-mem-ban-hang-online-web.fly.dev` |
| Super Admin | `https://phan-mem-ban-hang-online-ops.fly.dev` |
| Interim IdP | `https://phan-mem-ban-hang-online-oidc.fly.dev` |
| Auth0 callback | `https://phan-mem-ban-hang-online-web.fly.dev/api/auth/oidc/callback` |

Legacy `ai-sales-*-staging` must not remain as source-of-truth in runbooks touched by W2/W3.

## Exit criteria (scope C complete)

1. Backlog + coverage CSV: **157 Done**
2. `BE-FND-006` ticket `status: Done` + completion manifest + package tests green
3. `BE-FND-014` CSV matches ticket Done; staging-preflight migrate+health evidence; deploy job present or explicitly deferred
4. Auth0 staging smoke: Web Admin login → `GET /me` 200; OUTBOX + A-TO-F updated (no secrets)
5. `FND-015` + `HRD-001/004/009/010` Done on tickets+CSV with correct semantics (readiness ≠ go-live)
6. Ledger: Tier A = 100% CSV; **production go-live NOT authorized**

## HO one-page checklist

**W2:** GitHub Environment `staging` secrets `STAGING_DATABASE_URL`, `STAGING_API_BASE_URL`; optional `FLY_API_TOKEN`.  
**W3:** Auth0 Free app + URLs per `HARDENING-H1-AUTH0.md`; local `backend/.auth0-staging.env` (never git/chat).  
**W4:** Supabase display rename; ack `HRD-010` = readiness only.

## Constraints

- Secrets only in `.env.staging` / GH Environment / Fly — never commit or paste into chat
- Cloud cap ~$25/month — no unsolicited Pro upgrades
- No auto-deploy to production
- Commits only when Human Owner asks (agent may prepare diffs)

## Related docs

- `backend/docs/readiness/ENTERPRISE_DOC_GATE.md`
- `.superpowers/sdd/autonomous-progress.md`
- `backend/docs/release/HO-GATES-HRD.md`
- `backend/docs/release/A-TO-F-EXECUTION-STATUS.md`
- `backend/docs/release/HARDENING-H1-AUTH0.md`
- `backend/docs/release/BE-FND-014-staging-ci.md`
