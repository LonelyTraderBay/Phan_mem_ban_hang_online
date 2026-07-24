# A→F + Hardening execution status (2026-07-24)

**Product name:** `Phan_mem_ban_hang_online`  
**Production go-live:** **AUTHORIZED** — cutover **BLOCKED-HO (secrets)**; see [`HARDENING-H9-PROD.md`](./HARDENING-H9-PROD.md).  
**DOC_GATE:** 157/157 · Staging: P6/P7 schema + FE billing bind Done.

## Live staging

| Role | URL |
|------|-----|
| API | https://phan-mem-ban-hang-online-api.fly.dev |
| Web Admin | https://phan-mem-ban-hang-online-web.fly.dev |
| Super Admin | https://phan-mem-ban-hang-online-ops.fly.dev |
| IdP | Auth0 Free · `dev-51apo48jpnewe6oa.us.auth0.com` |
| DB | Supabase Free · `Phan_mem_ban_hang_online-staging` |
| Schema | thru `000041` (shipping_labels + job_runs) |

## Production (provisioned)

| Role | Value |
|------|------|
| Supabase | `Phan_mem_ban_hang_online-prod` · `sppdnlpbkdasmjealhjm` |
| Fly | `phan-mem-ban-hang-online-{api,web,ops}-prod` |
| Migrate | 000001–000002 only until HO fills `.env.production` |
| Next | HO: DB password + Auth0 Production → `prod secrets ready` |

[`HO-ACTION-PROD.md`](./HO-ACTION-PROD.md) · [`HO-NEXT-P0-P2.md`](./HO-NEXT-P0-P2.md)
