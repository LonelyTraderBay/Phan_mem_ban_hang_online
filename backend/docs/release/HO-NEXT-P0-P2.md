# HO next — P0→P2 harden (one pager)

**Date:** 2026-07-24  
**Agent status:** **Fully complete (ops)** — HO ủy quyền agent tự kiểm tra + điền tiêu chuẩn (chat 2026-07-24). Production go-live vẫn **NOT authorized**.

## Already green (do not redo)

- DOC_GATE backlog **157/157 Done**
- Auth0 staging + rotated secret + Fly secrets + browser login
- Supabase display `Phan_mem_ban_hang_online-staging`
- `node tools/verify-staging-scope-c.mjs` **16/16 PASS** (re-check 2026-07-24)
- Commits `0b2e7a4` / `a3263cf` on `main` + staging-preflight [run 30068221660](https://github.com/LonelyTraderBay/Phan_mem_ban_hang_online/actions/runs/30068221660) PASS

## Decisions (filled to standard)

| # | Topic | Decision | Basis |
|---|--------|----------|--------|
| 1 | Redis | **Redis N/A OK** | ADR-014 · no extra $ |
| 2 | Interim OIDC | **Keep OIDC standby** | Rollback Auth0 · H1 policy |
| 3 | Supabase Pro | **Stay Free waiver** | Cap ~$25 · no PITR ~$100 · H6 keep |
| 4 | Vendor pentest | **Vendor waived until prod** | Self-check / ASVS pack until HO books vendor |
| 5 | Billing UI bind | **Approve billing UI bind** | Unlocks FE slice; route stays EmptyState until FE implements |
| 6 | Schema P6–P9 | **Defer** — accept 98/101 for staging v1 | Open later with explicit gate reply per table |
| 7 | Audit P5.2 | **Defer** — do not open dual-write window yet | Open only when all writers ready |
| 8 | Tauri vault | **Defer** — web staging first | `approve native vault` later for desktop |
| 9 | Production | **NOT authorized** | Needs exact phrase `authorize production go-live` |

## Still needs explicit HO (not auto-filled)

- Upgrade Supabase Pro / book vendor / open a schema gate / open P5.2 / approve Tauri / **authorize production go-live**
