# Task P3.1 Report — Harden RLS on auth ephemeral tables (000037)

**Date:** 2026-07-24  
**Working directory:** `backend/`  
**Commits:** none (per brief)

## Objective

Deny direct `app_runtime` / `app_worker` table access on `oidc_login_states`, `password_reset_tokens`, and `mfa_challenges`; keep SECURITY DEFINER helper paths intact.

## Migration created

- **File:** `backend/infra/migrations/000037_harden_auth_ephemeral_rls.sql`
- **Per table:** `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- **Revoked from `app_runtime`, `app_worker`:**
  - `oidc_login_states`: SELECT, INSERT, UPDATE, DELETE
  - `password_reset_tokens`: SELECT, INSERT, UPDATE
  - `mfa_challenges`: SELECT, INSERT, UPDATE
- **Unchanged:** EXECUTE grants on `oidc_save_login_state`, `oidc_consume_login_state`, password/MFA helpers, `purge_ephemeral_rows`
- **No permissive RLS policies** for runtime roles (deny-default via FORCE RLS + REVOKE)

## Integration test

- **File:** `backend/packages/database/src/auth-ephemeral-rls.integration.test.ts`
- Skips without `DATABASE_URL`
- Uses `SET LOCAL ROLE app_runtime` / `app_worker` from migrator connection (`app_schema_owner` superuser locally)
- Asserts direct `SELECT` → `42501` permission denied
- Asserts OIDC save+consume and worker purge via SECURITY DEFINER still succeed

## Local verification

| Step | Result |
|------|--------|
| `pnpm migrate` (000037) | **PASS** |
| `schema_migrations` count | **37** |
| RLS flags on 3 tables | **PASS** — `relrowsecurity=true`, `relforcerowsecurity=true` |
| Runtime table grants after 000037 | **0** rows for `app_runtime`/`app_worker` |
| `auth-ephemeral-rls.integration.test.ts` | **PASS** (2 tests) |
| `ephemeral-purge.integration.test.ts` regression | **PASS** (1 test) |

## Staging

| Step | Result |
|------|--------|
| Controller MCP apply | **PENDING** (per brief; do not use `ais_staging_api` migrate) |

## Conflicts / blockers

None. App code already routes through SECURITY DEFINER functions (`postgres-oidc.ts`, `postgres-password-mfa.ts`); no direct table DML in modules.

## Self-review

- [x] New migration only (did not edit 000006/000009)
- [x] Local applied + tests green
- [x] Worker purge path preserved (no direct table grants needed)
- [x] No secrets in this report
- [x] No git commit

## Status

**DONE** locally; staging **PENDING** controller apply.
