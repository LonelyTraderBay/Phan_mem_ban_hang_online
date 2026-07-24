# Task P3.1 — Deny-default + SECURITY DEFINER only path for auth ephemeral

**Phase:** P3 — Harden RLS / grants auth ephemeral  
**Plan:** `backend/docs/superpowers/plans/2026-07-24-db-schema-completion.md`

**Tables:** `app.oidc_login_states`, `app.password_reset_tokens`, `app.mfa_challenges`

## Goal

Direct table DML/SELECT by `app_runtime` must not succeed without going through existing SECURITY DEFINER functions (from `000006` / `000009` / later OIDC fixes). Prefer deny-default RLS + revoke table privileges from `app_runtime` where functions already cover the path.

## Files

- Create: `backend/infra/migrations/000037_harden_auth_ephemeral_rls.sql`

## Required migration behavior

1. For each of the three tables:
   - `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
   - `ALTER TABLE … FORCE ROW LEVEL SECURITY`
2. Create a deny-all policy for `app_runtime` **OR** revoke SELECT/INSERT/UPDATE/DELETE on these tables from `app_runtime` while keeping EXECUTE on the existing helper functions.
   - Prefer **REVOKE table privileges from app_runtime** + ENABLE/FORCE RLS with no permissive policy for app_runtime (deny default), if and only if all app paths use SECURITY DEFINER functions.
3. Keep `GRANT` / access for migrator / table owner as needed.
4. `app_worker`: only grant what purge needs — purge is SECURITY DEFINER `purge_ephemeral_rows` so worker may not need direct table grants; do not widen grants casually.
5. Do **not** break: `oidc_save_login_state`, `oidc_consume_login_state`, password reset request/consume, MFA challenge create/consume helpers.

## Verification

- [ ] Local `pnpm migrate` applies `000037`.
- [ ] Integration test file: `backend/packages/database/src/auth-ephemeral-rls.integration.test.ts`
  - Skip without `DATABASE_URL`
  - As runtime-equivalent: if you only have `app_schema_owner` locally, document that and instead assert: after REVOKE, connecting as a role that only has EXECUTE still works via `SELECT app.oidc_save_login_state(...)` / consume — **OR** use `SET ROLE app_runtime` if that role exists locally.
  - Assert direct `SELECT count(*) FROM app.oidc_login_states` as `app_runtime` fails or returns permission denied / 0 under FORCE RLS without policy.
- [ ] Smoke: if local has seed OIDC helpers, call save+consume once successfully after migration.
- [ ] Staging: report PENDING for controller MCP (do not use ais_staging_api migrate).
- [ ] Do NOT git commit. No secrets in report.

**Done khi:** migration local applied; direct access hardened; SECURITY DEFINER path still works in test/smoke.

## Controller resolutions

- Next migration: **000037**
- Do not edit `000006`/`000009` immutably; only new file.
- If local lacks `app_runtime` role, create it in the migration with NOLOGIN or use existing from `000001_bootstrap_roles.sql` — check that file first.
- Work from: `C:/Users/C-PC/Documents/Phan_mem_ban_hang_online/backend`
