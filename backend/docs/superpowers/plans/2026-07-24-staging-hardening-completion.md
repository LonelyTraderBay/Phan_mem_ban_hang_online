# Staging Hardening Completion — Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.  
> **Date:** 2026-07-24  
> **Prerequisite:** A→F readiness Done; Fly API+OIDC interim PASS (`HARDENING-H2/H4`).

**Goal:** Đưa staging từ “API Fly + IdP tạm” sang “ba URL HTTPS lâu dài” (API + Web Admin + Super Admin), smoke OIDC→UI, cập nhật evidence — **không** production go-live.

**Architecture:** FE deploy hai origin riêng (ADR-FE-004) trên Vercel; rewrite `/api` → `https://ai-sales-api-staging.fly.dev`. IdP giữ Fly staging-oidc cho đến khi HO tạo Auth0 Free. Prod chỉ khi HO nói *authorize production go-live*.

**Tech Stack:** Vite monorepo (`frontend/`), Vercel CLI, Fly secrets, Nest OIDC BFF, Supabase staging.

## Global Constraints

- Cap cloud **$25/tháng**; không tự nâng Supabase Pro / vendor pentest.
- Secrets chỉ `.env.staging` / Fly / Vercel / GH Environment — không chat/git.
- Không bind Billing/notifications UI khi [`CONTRACT_GAP_BILLING_NOTIFICATIONS.md`](../../../frontend/docs/collaboration/CONTRACT_GAP_BILLING_NOTIFICATIONS.md) còn OPEN.
- Không H9 prod trừ lệnh HO rõ.

---

## Task W1 — FE staging build + runtime-config

**Files:**
- `frontend/apps/web-admin/public/runtime-config.staging.json` (new, deploy-time copy)
- `frontend/apps/super-admin/public/runtime-config.staging.json` (new)
- Optional script: `frontend/tooling/scripts/apply-staging-runtime-config.mjs`

- [x] Create staging runtime-config: `environment=staging`, `oidcClientId=web-admin-staging` / `super-admin-staging`, keep relative `apiBaseUrl` (`/api`, `/ops-api`) so Vercel rewrites apply.
- [x] `pnpm install` + `pnpm contracts:sync` in `frontend/`.
- [x] Build both apps with `VITE_PUBLIC_ENABLE_MSW=false`.
- [x] Confirm `dist/` exists for both apps.

**Verify:** Both builds exit 0; no MSW worker required in staging build.

---

## Task W2 — Vercel deploy (HTTPS)

**Files:** existing `vercel.json` in each app; runbook [`HARDENING-H3-FE-DEPLOY.md`](../../../frontend/docs/runbooks/HARDENING-H3-FE-DEPLOY.md)

- [x] Deploy Web Admin HTTPS (Fly static nginx — Vercel skipped: no token).
- [x] Deploy Super Admin HTTPS (Fly static).
- [x] Smoke: both origins 200; BFF `/api/auth/oidc/start` 302.

**Verify:** Two distinct HTTPS origins; API health reachable via Web Admin rewrite if rewrite maps correctly (note: vercel.json rewrites `/api/:path*` → Fly `/api/v1/:path*` — browser `/api/me` → Fly `/api/v1/me`).

**Blocked-HO:** If no Vercel token, document in `HARDENING-H3-EVIDENCE.md` and stop W2/W3 deploy steps; continue W4 board honesty.

---

## Task W3 — OIDC redirect + Fly secrets + smoke

**Files:** gitignored `.env.staging`; Fly app `ai-sales-api-staging`

- [x] Set `OIDC_REDIRECT_URI=https://ai-sales-web-admin-staging.fly.dev/api/auth/oidc/callback`.
- [x] Fly secrets updated.
- [x] Probe via Web Admin BFF → `/me` 200 (perms=75).

**Verify:** Login from Web Admin HTTPS lands session; `/me` 200.

---

## Task W4 — Board + OUTBOX + evidence

**Files:**
- `backend/docs/release/A-TO-F-EXECUTION-STATUS.md`
- `backend/docs/release/HARDENING-H3-EVIDENCE.md`
- `backend/docs/collaboration/OUTBOX.md`

- [x] Mark H3 PASS with Fly URLs.
- [x] Append OUTBOX entry (no secrets).
- [x] Refresh HO one-liners (Auth0 / optional PITR / prod gate).

---

## Task W5 — Production gate (no-op unless commanded)

- [x] Confirm H9 **Not started** (no authorize production go-live this wave).

---

## Out of scope this wave

- Auth0 Free console (HO) — keep Fly OIDC interim until then.
- Vendor pentest / Supabase Pro PITR — keep waivers.
- Billing UI bind / Tauri native vault.
- Production cutover.
