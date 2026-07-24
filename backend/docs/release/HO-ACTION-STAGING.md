# HO Action — Staging sign-off (A0)

Checklist: [`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md)  
Status board: [`A-TO-F-EXECUTION-STATUS.md`](./A-TO-F-EXECUTION-STATUS.md)  
Secrets guide: [`A1-SECRETS-FILL-GUIDE.md`](./A1-SECRETS-FILL-GUIDE.md)

## Ủy quyền ký thay (2026-07-23)

HO: *“cho phép quyết định cho bạn ký thay tôi đúng tiêu chuẩn cho hoàn thiện.”*  
Agent đã ký **mọi quyết định A0 có thể ký đúng chuẩn** và **provision managed Postgres** + **migrate 33/33**.  
Agent **không** tick mục 4 / **không** đổi `BE-FND-015` → Done khi chưa cutover PASS đủ.

## Đã ký / đã làm

- [x] Mục **0** — bậc A + **Supabase Free** + hard cap **$25/mo**
- [x] Mục **6** — chi tiêu, secret khi có file, cấm prod đến `BE-HRD-010`, ủy quyền Agent
- [x] Policy OIDC/FE: `OIDC_ENABLED=true`, `SESSION_COOKIE_SECURE=true`, MSW off
- [x] Provider/region: Supabase `ap-southeast-1`
- [x] IdP vendor: **Auth0 Free**
- [x] Redis: **N/A Phase A**; object store: Supabase Storage (sau)
- [x] Hosting target: API **Fly.io** · FE **Cloudflare Pages / Vercel**
- [x] **Provisioned:** `ai-sales-staging` / `lrcsbrmqlyvkxxspbezi` · PG 17.6 · `ACTIVE_HEALTHY`
- [x] **Migrate staging:** 33/33 in `app.schema_migrations` (2026-07-23)
- [x] A1 fill guide + `node tools/write-env-staging.mjs`
- [x] A2 Fly/FE deploy runbooks + `Dockerfile` / `fly.toml`
- [x] B CI workflow migrate+health (needs GH Environment `staging`)
- [x] C–F agent packs (see [`HO-GATES-HRD.md`](./HO-GATES-HRD.md))

## Còn lại trước cutover đầy đủ (console — không invent)

1. [`A1-SECRETS-FILL-GUIDE.md`](./A1-SECRETS-FILL-GUIDE.md) → hoặc:

```powershell
cd backend
node tools/write-env-staging.mjs
node tools/preflight-staging-env.mjs
```

2. Auth0 Free Regular Web App + HTTPS redirect (sau khi có Web Admin host)
3. Follow [`staging-fly-deploy.md`](./staging-fly-deploy.md) + [`staging-fe-deploy.md`](../../../frontend/docs/runbooks/staging-fe-deploy.md)
4. Báo: *“A0 secrets ready — chạy preflight + staging-cutover.”*

## Chuẩn không được phá

- Local Postgres ≠ staging.
- Không paste secret vào chat/git.
- Không mark `BE-FND-015` Done cho đến migrate + smoke + health (+ OIDC khi host sẵn) trên cloud.
