# Phase A evidence — BE-FND-015 (staging cloud)

**Status:** Phase A cutover **PASS** on managed Supabase + HTTPS (2026-07-23). Hardening re-verify: [`HARDENING-H4-EVIDENCE.md`](./HARDENING-H4-EVIDENCE.md).  
**IdP:** Staging OIDC (`tools/staging-oidc-server.mjs`) behind Cloudflare quick tunnel (Auth0 Free still preferred; see [`HARDENING-H1-AUTH0.md`](./HARDENING-H1-AUTH0.md)).  
**API HTTPS:** Cloudflare quick tunnel → local Nest + `.env.staging`. Fly auth OK but **app create BLOCKED** on Fly billing — [`HARDENING-H2-EVIDENCE.md`](./HARDENING-H2-EVIDENCE.md).

## Provision

| Item | Value |
|---|---|
| Provider | Supabase Free (cap $25/mo) |
| Project | `ai-sales-staging` / `lrcsbrmqlyvkxxspbezi` |
| Region | `ap-southeast-1` |
| Postgres | 17.6 · pooler `aws-0-ap-southeast-1.pooler.supabase.com:6543` |
| DB role | `ais_staging_api` (login; secrets only in gitignored files) |
| Schema | thru `000034` (34 migrations) |
| API URL (H4 verify) | `https://refers-ceramic-northeast-illustrated.trycloudflare.com` |
| OIDC issuer (H4 verify) | `https://gaming-near-configuration-rev.trycloudflare.com` |
| CI | [staging-preflight #30020298095](https://github.com/LonelyTraderBay/Phan_mem_ban_hang_online/actions/runs/30020298095) **PASS** |

| Check | Command / proof | Result |
|---|---|---|
| Preflight env | `node tools/preflight-staging-env.mjs` | **PASS** |
| Migrate | `app.schema_migrations` thru `000034` | **PASS** |
| Smoke invite/accept | seed + invite/accept `perms=75` | **PASS** |
| Health | `GET {API}/health` → 200 (local + tunnel) | **PASS** |
| OIDC → /me | start → IdP → callback → `GET /api/v1/me` 200, tenant Staging, perms present | **PASS** |
| FE MSW off + HTTPS | Web Admin host | **DEFERRED** — BFF path proven via API callback; FE Pages deploy still open |
| Playwright API | opt-in | **DEFERRED** |

**HO ack to advance ticket:** Agent delegated sign-off 2026-07-23 **Date:** 2026-07-23

After PASS: checklist mục 4 + OUTBOX updated; `BE-FND-015` proposed Done.

See [`A-TO-F-EXECUTION-STATUS.md`](./A-TO-F-EXECUTION-STATUS.md).
