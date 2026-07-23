# A→F + Hardening execution status (2026-07-24)

**Product name:** `Phan_mem_ban_hang_online`  
**Naming map:** [`NAMING-PHAN-MEM-BAN-HANG-ONLINE.md`](./NAMING-PHAN-MEM-BAN-HANG-ONLINE.md)  
**Production go-live:** **NOT authorized**.

## Live staging (renamed)

| Role | URL |
|------|-----|
| API | https://phan-mem-ban-hang-online-api.fly.dev |
| Web Admin | https://phan-mem-ban-hang-online-web.fly.dev |
| Super Admin | https://phan-mem-ban-hang-online-ops.fly.dev |
| IdP interim | https://phan-mem-ban-hang-online-oidc.fly.dev |
| DB | Supabase Free · ref `lrcsbrmqlyvkxxspbezi` · **đổi display name** → `Phan_mem_ban_hang_online-staging` trên dashboard |

Legacy Fly apps `ai-sales-*-staging` **đã destroy**.

## HO còn lại

1. Auth0 — [`HARDENING-H1-AUTH0.md`](./HARDENING-H1-AUTH0.md) (URL mới)
2. Supabase dashboard: rename project display → `Phan_mem_ban_hang_online-staging` (ref không đổi)
3. Pro / vendor / prod gates như trước
