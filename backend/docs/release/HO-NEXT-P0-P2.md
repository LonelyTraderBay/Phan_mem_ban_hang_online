# HO next — P0→P2 harden + go-live unlock

**Date:** 2026-07-24  
**Agent status:** Harden P0–P2 Fully complete (ops). **Production go-live AUTHORIZED** (HO chọn B + Prod Free). Wave: schema P6/P7 + FE billing + H9 cutover.

## Already green

- DOC_GATE **157/157 Done**; Auth0 staging; verify 16/16; CI run 30068221660
- Harden ops decisions (Redis N/A, OIDC standby, Free waiver staging, vendor waived until booked)

## Decisions (updated for go-live wave)

| # | Topic | Decision |
|---|--------|----------|
| 1 | Redis | N/A OK (staging + prod v1) |
| 2 | Interim OIDC | Keep standby |
| 3 | Supabase staging | Stay Free waiver |
| 4 | Vendor | Waived until booked (self-check) |
| 5 | Billing UI bind | **Approved** — FE implement in go-live wave |
| 6 | Schema | **Open P6 `shipping_labels` + P7 `job_runs`**; **P8 pgvector deferred**; **P9 `support_tickets` Deferred** (external tool) |
| 7 | Audit P5.2 | Still deferred (expand window stays) |
| 8 | Tauri | Deferred |
| 9 | Production | **AUTHORIZED** — Prod Free + DR waiver; no PITR; cutover via H9 |
| 10 | Prod DB | **Supabase Free** project `Phan_mem_ban_hang_online-prod` |

## Prod hosts (target)

| Role | Name |
|------|------|
| API | `phan-mem-ban-hang-online-api-prod` |
| Web | `phan-mem-ban-hang-online-web-prod` |
| Ops | `phan-mem-ban-hang-online-ops-prod` |
