# Naming — Phan_mem_ban_hang_online (staging)

**Canonical product name:** `Phan_mem_ban_hang_online`  
**Fly DNS slug:** lowercase + hyphens (Fly requirement)

## Database

| Field | Value |
|---|---|
| Display name (HO rename in dashboard) | `Phan_mem_ban_hang_online-staging` |
| Provider | Supabase |
| Project ref (immutable) | `lrcsbrmqlyvkxxspbezi` |
| Region | `ap-southeast-1` |

> Supabase **ref/URL host không đổi được** — chỉ đổi tên hiển thị trên dashboard.

## Fly apps (staging)

| Role | App name | URL |
|---|---|---|
| API | `phan-mem-ban-hang-online-api` | https://phan-mem-ban-hang-online-api.fly.dev |
| Web Admin | `phan-mem-ban-hang-online-web` | https://phan-mem-ban-hang-online-web.fly.dev |
| Super Admin | `phan-mem-ban-hang-online-ops` | https://phan-mem-ban-hang-online-ops.fly.dev |
| IdP interim | `phan-mem-ban-hang-online-oidc` | https://phan-mem-ban-hang-online-oidc.fly.dev |

## Legacy names (to destroy after cutover)

`ai-sales-api-staging`, `ai-sales-web-admin-staging`, `ai-sales-ops-staging`, `ai-sales-oidc-staging`
