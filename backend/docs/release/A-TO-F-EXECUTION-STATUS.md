# A→F + Hardening execution status (2026-07-24)

**Product name:** `Phan_mem_ban_hang_online`  
**Naming map:** [`NAMING-PHAN-MEM-BAN-HANG-ONLINE.md`](./NAMING-PHAN-MEM-BAN-HANG-ONLINE.md)  
**Production go-live:** **NOT authorized**.  
**DOC_GATE scope C:** 157/157 Done; Auth0 PASS; harden P0–P2 **Fully complete (ops)** — decisions in [`HO-NEXT-P0-P2.md`](./HO-NEXT-P0-P2.md).

## Live staging (renamed)

| Role | URL |
|------|-----|
| API | https://phan-mem-ban-hang-online-api.fly.dev |
| Web Admin | https://phan-mem-ban-hang-online-web.fly.dev |
| Super Admin | https://phan-mem-ban-hang-online-ops.fly.dev |
| IdP | Auth0 Free · `dev-51apo48jpnewe6oa.us.auth0.com` |
| IdP interim (standby) | https://phan-mem-ban-hang-online-oidc.fly.dev — **keep** |
| DB | Supabase Free · ref `lrcsbrmqlyvkxxspbezi` · display **`Phan_mem_ban_hang_online-staging`** · Free waiver |
| Redis | **N/A v1** — [`ADR-014-redis-staging-v1.md`](./ADR-014-redis-staging-v1.md) |

Legacy Fly apps `ai-sales-*-staging` **đã destroy**.

## HO còn lại (optional / irreversible)

Only if you want more than staging ops complete: Pro upgrade · book vendor · open schema P6–P9 · P5.2 · Tauri vault · **`authorize production go-live`**.  
See [`HO-NEXT-P0-P2.md`](./HO-NEXT-P0-P2.md).
