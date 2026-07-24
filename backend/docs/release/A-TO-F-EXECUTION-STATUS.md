# A→F + Hardening execution status (2026-07-24)

**Product name:** `Phan_mem_ban_hang_online`  
**Naming map:** [`NAMING-PHAN-MEM-BAN-HANG-ONLINE.md`](./NAMING-PHAN-MEM-BAN-HANG-ONLINE.md)  
**Production go-live:** **NOT authorized**.  
**DOC_GATE scope C (W1–W4 + T7):** 157/157 backlog CSV Done; Auth0 wire PASS (OIDC start → Auth0 authorize 302).

## Live staging (renamed)

| Role | URL |
|------|-----|
| API | https://phan-mem-ban-hang-online-api.fly.dev |
| Web Admin | https://phan-mem-ban-hang-online-web.fly.dev |
| Super Admin | https://phan-mem-ban-hang-online-ops.fly.dev |
| IdP | Auth0 Free · `dev-51apo48jpnewe6oa.us.auth0.com` |
| IdP interim (standby) | https://phan-mem-ban-hang-online-oidc.fly.dev |
| DB | Supabase Free · ref `lrcsbrmqlyvkxxspbezi` · display name **`Phan_mem_ban_hang_online-staging`** (confirmed 2026-07-24) |

Legacy Fly apps `ai-sales-*-staging` **đã destroy**.

## HO còn lại

1. Pro / vendor / prod gates như trước
