# A→F + Hardening execution status (2026-07-24)

**Product name:** `Phan_mem_ban_hang_online`  
**Naming map:** [`NAMING-PHAN-MEM-BAN-HANG-ONLINE.md`](./NAMING-PHAN-MEM-BAN-HANG-ONLINE.md)  
**Production go-live:** **NOT authorized**.  
**DOC_GATE scope C:** 157/157 Done; Auth0 PASS; harden P0–P2 **agent-complete** — see [`HO-NEXT-P0-P2.md`](./HO-NEXT-P0-P2.md).

## Live staging (renamed)

| Role | URL |
|------|-----|
| API | https://phan-mem-ban-hang-online-api.fly.dev |
| Web Admin | https://phan-mem-ban-hang-online-web.fly.dev |
| Super Admin | https://phan-mem-ban-hang-online-ops.fly.dev |
| IdP | Auth0 Free · `dev-51apo48jpnewe6oa.us.auth0.com` |
| IdP interim (standby) | https://phan-mem-ban-hang-online-oidc.fly.dev — keep until HO destroys |
| DB | Supabase Free · ref `lrcsbrmqlyvkxxspbezi` · display **`Phan_mem_ban_hang_online-staging`** |
| Redis | **N/A v1** — [`ADR-014-redis-staging-v1.md`](./ADR-014-redis-staging-v1.md) |

Legacy Fly apps `ai-sales-*-staging` **đã destroy**.

## HO còn lại

Full checklist: [`HO-NEXT-P0-P2.md`](./HO-NEXT-P0-P2.md) (Pro / vendor / billing bind / schema gates / P5.2 / Tauri / go-live).
