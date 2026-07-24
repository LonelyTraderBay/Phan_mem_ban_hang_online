# A1 — Fill staging secrets (HO console guide)

**Purpose:** Human Owner fills `backend/.env.staging` so agents can run preflight, migrate, and
staging cutover. **Never paste secret values into chat, git, or tickets.**

**Output file:** `backend/.env.staging` (gitignored — copy from [`.env.staging.example`](../../.env.staging.example))

**Staging Supabase project (already provisioned):**

| Field | Value |
|---|---|
| Project name | `ai-sales-staging` |
| Project ref | `lrcsbrmqlyvkxxspbezi` |
| Region | `ap-southeast-1` |
| Project URL | `https://lrcsbrmqlyvkxxspbezi.supabase.co` |
| DB host | `db.lrcsbrmqlyvkxxspbezi.supabase.co` |
| Port | `5432` |
| Database | `postgres` |

---

## Part 1 — Supabase database password + `DATABASE_URL`

1. Open [Supabase Dashboard](https://supabase.com/dashboard).
2. Select organization → project **`ai-sales-staging`** (ref `lrcsbrmqlyvkxxspbezi`).
3. **Project Settings** (gear, bottom of left nav) → **Database**.
4. Under **Connection string**, choose **URI** (not Session pooler for migrate tooling unless you intentionally switch).
5. Copy the template. Replace `[YOUR-PASSWORD]` with the database password:
   - If unknown: same page → **Reset database password** → save password in a password manager (not chat).
6. Ensure host is `db.lrcsbrmqlyvkxxspbezi.supabase.co` and database name is `postgres`.
7. For this repo’s migrate scripts, use the **direct** connection (port `5432`), not localhost.

**Write to `.env.staging`:**

```env
DATABASE_URL=postgres://postgres:<PASSWORD>@db.lrcsbrmqlyvkxxspbezi.supabase.co:5432/postgres
```

> Use the exact user/password from the Supabase URI. Do not commit this file.

**Optional (later):** Supabase Storage / service role for import-media — **N/A Phase A** per
[`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md).

---

## Part 2 — Auth0 Free (Regular Web Application)

IdP vendor locked for staging: **Auth0 Free** ([`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md) §2).

### 2a) Tenant

1. Sign in at [Auth0](https://auth0.com/).
2. Create or select a **Free** tenant (note the domain, e.g. `your-tenant.us.auth0.com`).

### 2b) Application (Web Admin)

1. **Applications** → **Applications** → **Create Application**.
2. Name: e.g. `AI Sales Web Admin (staging)`.
3. Type: **Regular Web Applications** (not SPA, not M2M).
4. **Settings** tab:
   - **Allowed Callback URLs:** `https://<web-admin-staging-host>/api/auth/oidc/callback`
     - Use real HTTPS host after FE deploy, or a placeholder you will update before cutover.
   - **Allowed Logout URLs:** `https://<web-admin-staging-host>/login`
   - **Allowed Web Origins:** `https://<web-admin-staging-host>`
5. Save Changes.
6. Copy **Domain**, **Client ID**, **Client Secret** (secret: “Show” once — store in password manager).

### 2c) Map to env vars

| `.env.staging` key | Auth0 source |
|---|---|
| `OIDC_ENABLED` | literal `true` |
| `OIDC_ISSUER` | `https://<your-tenant>.<region>.auth0.com/` (trailing slash OK) |
| `OIDC_CLIENT_ID` | Application → Client ID |
| `OIDC_CLIENT_SECRET` | Application → Client Secret |
| `OIDC_REDIRECT_URI` | Must match Allowed Callback URL exactly |
| `OIDC_SCOPES` | `openid profile email` |
| `SESSION_COOKIE_SECURE` | `true` |
| `SESSION_COOKIE_NAME` | `ais_session` |

Leave `OIDC_AUTHORIZATION_ENDPOINT` / `OIDC_TOKEN_ENDPOINT` **blank** to use OIDC discovery.

**Super Admin (ADR-FE-004):** separate origin — may need a second Auth0 app later; Web Admin app is enough for Phase A Web Admin OIDC smoke.

---

## Part 3 — Assemble `backend/.env.staging`

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\backend
Copy-Item .env.staging.example .env.staging
notepad .env.staging   # or your editor — never commit
```

Fill at minimum:

| Key | Phase A value |
|---|---|
| `NODE_ENV` | `production` |
| `SERVICE_NAME` | `api` |
| `PORT` | `3000` |
| `LOG_LEVEL` | `info` |
| `DATABASE_URL` | Part 1 |
| `OIDC_*` + session keys | Part 2 |
| `JWT_ENABLED` | `false` |
| `WALKING_SKELETON_ENABLED` | `false` |
| `REDIS_URL` | omit or leave empty — **N/A Phase A** |

Comment-only placeholders (for runbooks, not read by API):

```env
# STAGING_API_BASE_URL=https://ai-sales-api-staging.fly.dev
# STAGING_WEB_ADMIN_URL=https://app.<staging-domain>
# STAGING_SUPER_ADMIN_URL=https://ops.<staging-domain>
```

---

## Part 4 — Verify locally (no secrets printed)

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online\backend
node tools/preflight-staging-env.mjs
```

Exit **0** → tell the agent: *“A1 secrets ready — run preflight + staging-cutover.”*

Exit **1** → fix placeholders (`REPLACE_`, localhost, `127.0.0.1:9090`) before deploy.

---

## Security reminders

- `.env.staging` is in [`.gitignore`](../../.gitignore) — verify `git status` never stages it.
- Fly: `Get-Content .env.staging | fly secrets import` ([`staging-fly-deploy.md`](./staging-fly-deploy.md)).
- Rotate Auth0 client secret and DB password if ever exposed.

## Next steps

1. [`staging-fly-deploy.md`](./staging-fly-deploy.md) — deploy API to Fly.
2. [`../../../frontend/docs/runbooks/staging-fe-deploy.md`](../../../frontend/docs/runbooks/staging-fe-deploy.md) — deploy FE hosts.
3. [`staging-cutover.md`](./staging-cutover.md) — migrate + smoke + OIDC.

## Gaps

- **Web Admin HTTPS hostname** must exist before final `OIDC_REDIRECT_URI` / Auth0 callback list.
- **Super Admin Auth0 app** not required for first Web Admin OIDC smoke.
- **Connection pooling** (Supabase pooler vs direct) not benchmarked — direct `5432` is the A1 default for `migrate.mjs`.
