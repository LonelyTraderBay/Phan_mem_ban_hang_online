# HO next — P0→P2 harden (one pager)

**Date:** 2026-07-24  
**Agent status:** Agent-auto tasks for harden P0–P2 run to completion; items below need **Human Owner**.

## Already green (do not redo)

- DOC_GATE backlog **157/157 Done**
- Auth0 staging + rotated secret + Fly secrets + browser login
- Supabase display `Phan_mem_ban_hang_online-staging`
- `node tools/verify-staging-scope-c.mjs` 16/16
- Commit `0b2e7a4` on `main` + staging-preflight [run 30068221660](https://github.com/LonelyTraderBay/Phan_mem_ban_hang_online/actions/runs/30068221660) PASS (see H5 / OUTBOX)

## Decisions for you

| # | Topic | Options | Cap note |
|---|--------|---------|----------|
| 1 | Redis | Keep **N/A v1** ([ADR-014](./ADR-014-redis-staging-v1.md)) **or** provide managed `REDIS_URL` | Managed Redis = extra $ |
| 2 | Interim OIDC Fly app | **Keep standby** (default) **or** destroy `phan-mem-ban-hang-online-oidc` | Saves Fly $ if destroy |
| 3 | Supabase Pro | Stay **Free + waiver** **or** upgrade org **Pro $25** for daily backup/branch drill | Do **not** enable PITR ~$100 add-on under $25 cap — [PITR-PRO-COST-GATE](./PITR-PRO-COST-GATE.md) |
| 4 | Vendor pentest | Book vendor with [VENDOR-PENTEST-HANDOFF](./VENDOR-PENTEST-HANDOFF.md) **or** accept self-check only until prod | Recommended before prod |
| 5 | Billing UI bind | Reply *“approve billing UI bind”* to close [CONTRACT_GAP](../../../frontend/docs/collaboration/CONTRACT_GAP_BILLING_NOTIFICATIONS.md) | Unlocks FE work |
| 6 | Schema P6–P9 | Reply which gates to open: `shipping_labels` / `support_tickets` / `job_runs` / pgvector — [SCHEMA-GATES](./SCHEMA-GATES-P6-P9.md) | |
| 7 | Audit P5.2 | Reply *“open P5.2 dual-write contract window”* when all writers dual-write | |
| 8 | Tauri vault | Reply *“approve native vault”* (ADR-FE-014) | Desktop |
| 9 | Production | Explicit *“authorize production go-live”* — **HRD-010 Done ≠ go-live** | Irreversible risk |

## Suggested reply templates

- `Redis N/A OK` / `Redis URL=...`
- `Destroy interim OIDC` / `Keep OIDC standby`
- `Stay Free waiver` / `Supabase Pro enabled — run branch drill`
- `Vendor booked` / `Vendor waived until prod`
- `Approve billing UI bind`
- `Open schema gates: shipping_labels, job_runs`
- `Authorize production go-live` (only when ready)
