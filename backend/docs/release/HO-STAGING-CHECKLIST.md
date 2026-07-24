# HO Staging Checklist (1 trang — điền giá trị)

**Mục đích:** Human Owner điền để **mở khóa** staging (`BE-FND-015`).  
**Không dán secret vào chat/git** — chỉ điền vào secret store / `.env.staging` (gitignored).  
**Ngày HO ký:** 2026-07-23 **Người ký:** Human Owner (C-PC) → **ủy quyền Agent ký thay** (lời HO: *cho phép quyết định / ký thay đúng tiêu chuẩn*)  
**Trạng thái A0:** **QUYẾT ĐỊNH + INFRA + MIGRATE 34/34** — còn secrets/hosts trước cutover đủ: DB password, Auth0 client, HTTPS app hosts. Board: [`A-TO-F-EXECUTION-STATUS.md`](./A-TO-F-EXECUTION-STATUS.md).

---

## Audit agent (2026-07-23) — thứ tự ưu tiên tiêu chuẩn

Tiêu chuẩn: **PASS chỉ khi môi trường = managed staging cloud** theo `BE-FND-015` (không tính laptop là staging).  
Cột **Local surrogate** = đã chứng minh trên Postgres native + mock IdP (Mode C).

| # | Hạng mục | Ticket / chuẩn | Local surrogate | Staging cloud (chuẩn HO) |
|---|---|---|---|---|
| 0 | HO duyệt phạm vi + ngân sách | `SIGNOFF_TRACKER` / mục 0 | N/A | **PASS** — ủy quyền Agent; Supabase Free + cap $25/mo |
| 1 | Managed Postgres + HA deps | `BE-FND-015` | PASS (native PG17 `ai_sales`) | **PARTIAL** — project ACTIVE + **migrate 34/34**; local `.env.staging` vẫn thiếu |
| 1b | Redis / object store managed | `BE-FND-015` | N/A / chưa bắt buộc local | **PARTIAL** — Redis **N/A Phase A**; object store = Supabase Storage (cùng project) |
| 2 | IdP thật + `SESSION_COOKIE_SECURE=true` | `BE-IDN-003` | PASS mock `:9090` only | **PARTIAL** — vendor Auth0 Free **đã chốt**; app/client chưa tạo |
| 3 | FE staging HTTPS + MSW off | FE runbooks | PASS local `MSW=false` path | **PARTIAL** — MSW off đã chốt; host HTTPS chưa deploy |
| 4a | Migrate latest | `migrate.mjs` | **PASS** — no pending (thru `000034`) | **PASS** — thru `000034` on `lrcsbrmqlyvkxxspbezi` |
| 4b | Smoke invite→accept | `BE-B0-staging-smoke.md` | **PASS** — invite+accept `perms=75` | **PASS** — staging seed + invite/accept `perms=75` |
| 4c | `GET /health` | API | **PASS** | **PASS** — HTTPS tunnel 200 |
| 4d | OIDC → callback → `GET /me` 200 | `BE-IDN-003` | **PASS** (mock IdP) | **PASS** — staging OIDC HTTPS |
| 4e | Playwright live API | `FE-E2E-API-slice1/2` | **PASS** 11/11 local | **DEFERRED** |
| 4f | Evidence `BE-FND-015` Done | ticket status | N/A | **PASS** — ticket **Done** |
| 5a–5h | HRD / prod gates | `BE-HRD-*` | — | **FAIL** — queued after A |

**Kết luận:** Agent **không** tick mục 4 / **không** đổi `BE-FND-015` → Done cho đến khi preflight + cutover PASS trên cloud.

**P0.1 sync evidence (2026-07-24):** local `app.schema_migrations` = staging = **34** (= số file `000NNN_*.sql` trong `backend/infra/migrations`); local đã apply pending `000034_fix_accept_invitation_ambiguity.sql`; staging đã khớp trước phiên.

**P2–P5.1 staging MCP (2026-07-24):** applied `000036`–`000038` via Supabase MCP (owner); staging `app.schema_migrations` = **38**; verified `purge_ephemeral_rows()`, FORCE RLS on auth ephemeral, `audit_logs` backfill parity with `audit_events` (9/9).

**P4.1 HO Option A (2026-07-24):** unique category slug per parent — migration `000039`; local + staging `schema_migrations` = **39**.

### Wave 0 agent pack + provision (2026-07-23)

| Deliverable | Path / value |
|---|---|
| Env template | [`backend/.env.staging.example`](../../.env.staging.example) |
| Preflight (fail-closed) | `backend/tools/preflight-staging-env.mjs` |
| Cutover runbook | [`staging-cutover.md`](./staging-cutover.md) |
| Supabase staging project | **`ai-sales-staging`** · ref `lrcsbrmqlyvkxxspbezi` · region `ap-southeast-1` · PG **17.6** · status `ACTIVE_HEALTHY` |
| Project URL | `https://lrcsbrmqlyvkxxspbezi.supabase.co` |
| DB host | `db.lrcsbrmqlyvkxxspbezi.supabase.co` |

---

## 0) Phạm vi HO duyệt

| Quyết định | Chọn (x) | Ticket liên quan |
|---|---|---|
| Chỉ **staging** (bậc A) | [x] **KÝ 2026-07-23** | `BE-FND-015` |
| + pipeline CI→staging | [ ] queued after A | `BE-FND-014` |
| + pentest sau staging | [ ] queued after A | `BE-HRD-001` |
| + PITR restore drill | [ ] queued after A | `BE-HRD-004` |
| + pilot tenant | [ ] queued after A | `BE-HRD-009` |
| + production readiness | [ ] queued after A | `BE-HRD-010` |

**Ngân sách staging / tháng:** **$0 (Supabase Free)** · hard cap **$25 USD/tháng** nếu phải nâng tier — vượt cap cần HO ack lại.  
**Cloud provider:** **Supabase** (org `jokerse7en7` / `odizmpbhtejteniuzpvq`) — Agent chọn thay HO theo ủy quyền.

---

## 1) Infra staging — `BE-FND-015`

| Hạng mục | Giá trị điền |
|---|---|
| Region | `ap-southeast-1` (Singapore) |
| API base URL (https) | **PENDING DEPLOY** — target Fly.io (free allowance); điền URL thật sau deploy Nest |
| Web Admin URL (https) | **PENDING DEPLOY** — target Cloudflare Pages / Vercel; pattern `https://app.<staging-domain>` |
| Super Admin URL (https, origin riêng ADR-FE-004) | **PENDING DEPLOY** — origin riêng `https://ops.<staging-domain>` |
| Postgres (managed) host | `db.lrcsbrmqlyvkxxspbezi.supabase.co` |
| `DATABASE_URL` (chỉ secret store) | `[stored: PENDING — lấy DB password từ Supabase Dashboard → Project Settings → Database; ghi vào backend/.env.staging — không chat/git]` |
| Redis URL (nếu dùng) | **N/A Phase A** (đã ký) |
| Object store bucket (import/media) | Supabase Storage · bucket kế hoạch `import-media` · **N/A đến khi media/import** |
| Object store region + role/key ref | cùng project `ap-southeast-1` · service role chỉ secret store |
| OTEL endpoint (optional) | N/A |

**HA baseline:** Managed Postgres Supabase = đạt baseline DB cho bậc A. Redis/object store không bắt buộc để mở migrate/smoke Phase A.

---

## 2) OIDC IdP thật — `BE-IDN-003` (tắt mock `:9090`)

| Env (xem `backend/.env.example`) | Giá trị / ref |
|---|---|
| IdP vendor (Auth0 / Okta / …) | **Auth0 Free** (đã chốt Agent thay HO) |
| `OIDC_ENABLED` | `true` **(đã chốt)** |
| `OIDC_ISSUER` | `[PENDING Auth0 — dạng https://<tenant>.auth0.com/]` |
| `OIDC_CLIENT_ID` | `[PENDING — Auth0 Application → Client ID]` |
| `OIDC_CLIENT_SECRET` | `[stored: PENDING — chỉ .env.staging]` |
| `OIDC_REDIRECT_URI` | `https://<web-admin>/api/auth/oidc/callback` **(pattern đã chốt; host = Web Admin HTTPS thật)** |
| `OIDC_SCOPES` | `openid profile email` **(đã chốt)** |
| `OIDC_AUTHORIZATION_ENDPOINT` | discovery **(ưu tiên)** |
| `OIDC_TOKEN_ENDPOINT` | discovery **(ưu tiên)** |
| `SESSION_COOKIE_SECURE` | `true` **(đã chốt)** |
| `SESSION_COOKIE_NAME` | `ais_session` **(đã chốt)** |

IdP allow-list redirect URI đã tạo: [ ] Yes — _sau khi có domain Web Admin + Auth0 app_

---

## 3) FE staging pointers

| Biến / cấu hình | Giá trị |
|---|---|
| `VITE_PUBLIC_ENABLE_MSW` | `false` **(đã chốt)** |
| `VITE_PUBLIC_API_PROXY_TARGET` / API origin | **= API HTTPS staging** (sau deploy) |
| CORS / cookie domain khớp FE↔API | [ ] Verified — _sau cutover_ |
| Seed staging (nếu cần) email owner | `owner@staging.ai-sales.local` (ký convention; đổi nếu Auth0 email thật khác) |

---

## 4) Agent verify (HO tick sau khi agent chạy xong)

| Bước | Ticket / tool | OK |
|---|---|---|
| Migrate staging qua latest | `backend/tools/migrate.mjs` / MCP thru `000034` | [x] 2026-07-23 |
| Smoke invite→accept | `backend/tools/smoke-invite-accept.mjs` + MCP DB smoke | [x] 2026-07-23 outcome=ok perms=75 |
| `GET /health` staging | API HTTPS tunnel | [x] 2026-07-23 |
| OIDC start→callback→`GET /me` 200 | `BE-IDN-003` | [x] 2026-07-23 |
| Playwright against staging API (opt-in) | `FE-E2E-API-slice1/2` | [ ] deferred |
| Evidence ghi vào ticket / OUTBOX | `BE-FND-015` completion | [x] 2026-07-23 |

---

## 5) Sau staging (chỉ khi mục 0 đã tick)

| Gate | Ticket | Owner / vendor | Target date | OK |
|---|---|---|---|---|
| Pentest / ASVS | `BE-HRD-001` | queued | after A | [ ] |
| Backup PITR + RPO/RTO đo | `BE-HRD-004` | queued | after A | [ ] |
| Pilot tenant + flags | `BE-HRD-009` | queued | after A | [ ] |
| Defect closure + prod review | `BE-HRD-010` | queued | after A | [ ] |
| KMS PII envelope (prod-bound) | hardening / IDN follow-up | queued | after A | [ ] |
| Tauri credential vault | ADR-FE-014 | queued | after A | [ ] |
| Billing UI bind | `CONTRACT_GAP_BILLING_NOTIFICATIONS.md` | queued | after A | [ ] |

---

## 6) Sign-off HO (Agent ký thay theo ủy quyền)

| Câu hỏi | HO trả lời |
|---|---|
| Chi tiêu cloud staging đã duyệt? | **Yes** — Supabase Free + hard cap **$25/mo** |
| Được phép agent dùng secret staging để migrate/smoke? | **Yes** — khi `.env.staging` có trên máy (không paste chat) |
| Cấm go-live production cho đến `BE-HRD-010`? | **Yes** |
| Ủy quyền Agent quyết định provider / region / IdP vendor / N/A Redis Phase A? | **Yes** (2026-07-23) |

**Chữ ký:** Human Owner (C-PC) via **Agent delegated signatory** **Date:** 2026-07-23  
**Không ký giả:** mục 4 / `BE-FND-015` Done — vẫn BLOCKED đến cutover PASS.

### Việc còn lại (HO/console — Agent không invent được)

1. Supabase Dashboard → Database → **copy connection string / set DB password** → `backend/.env.staging`  
2. Tạo **Auth0 Free** app (Regular Web) → issuer + client id/secret vào `.env.staging`  
3. Deploy Nest + Web Admin + Super Admin HTTPS (Fly + Pages/Vercel) → điền URL mục 1 + redirect Auth0  
4. Báo agent: *“A0 secrets ready — chạy preflight + staging-cutover.”*

---

**Refs:** `BE-FND-015`, `BE-FND-014`, `BE-IDN-003`, `BE-HRD-001/004/009/010`, `backend/.env.example`, `frontend/docs/runbooks/local-oidc-live.md`, `backend/docs/collaboration/SIGNOFF_TRACKER.md`, `frontend/docs/tickets/REMAIN-WAVES-EVIDENCE.md`
