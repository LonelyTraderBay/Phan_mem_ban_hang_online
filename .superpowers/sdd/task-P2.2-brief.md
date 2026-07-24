# Task P2.2 — Purge function + worker tick

**Phase:** P2 — TTL cleanup  
**Plan:** `backend/docs/superpowers/plans/2026-07-24-db-schema-completion.md`

## Semantics (binding)

| Table | Delete when |
|-------|-------------|
| `oidc_login_states` | `expires_at < now()` OR (`consumed_at IS NOT NULL` AND `consumed_at < now() - interval '7 days'`) |
| `media_upload_intents` | `expires_at < now()` AND (`bytes_received = false` OR `created_at < now() - interval '7 days'`) |
| `password_reset_tokens` | `expires_at < now()` OR (`consumed_at IS NOT NULL` AND `consumed_at < now() - interval '7 days'`) |
| `mfa_challenges` | `expires_at < now()` OR (`consumed_at IS NOT NULL` AND `consumed_at < now() - interval '7 days'`) |
| `idempotency_records` | `expires_at < now()` |

## Files

- Create: `backend/infra/migrations/000036_ephemeral_ttl_purge_fn.sql`
  - `CREATE OR REPLACE FUNCTION app.purge_ephemeral_rows() RETURNS jsonb` SECURITY DEFINER, `SET search_path = app, pg_temp`
  - Function deletes per table with the rules above; returns jsonb like `{"oidc_login_states":N,...}` of deleted row counts
  - `REVOKE ALL ON FUNCTION app.purge_ephemeral_rows() FROM PUBLIC`
  - `GRANT EXECUTE ON FUNCTION app.purge_ephemeral_rows() TO app_worker` (and `app_runtime` only if needed for tests — prefer worker-only)
- Modify: `backend/apps/worker/src/main.ts` — after outbox tick (or every ~5th tick / every 5 minutes wall clock), call `select app.purge_ephemeral_rows()` via Kysely/sql when `DATABASE_URL` set; log counts at info; never log row payloads
- Create test: `backend/apps/worker/src/ephemeral-purge.test.ts` OR `backend/packages/database/src/ephemeral-purge.integration.test.ts`
  - Prefer integration test skipped without `DATABASE_URL`
  - Insert expired oidc_login_states row (minimal columns from `000006`) → call purge → assert deleted
- Optional: `backend/apps/scheduler/src/main.ts` — **YAGNI skip** if worker self-times purge every 5 minutes; only add BullMQ scheduler if worker already requires Redis for other work. Prefer worker wall-clock interval without Redis dependency.

## Steps

- [ ] Write failing integration test (RED) that expects purge to remove expired oidc state.
- [ ] Migration 000036 + local `pnpm migrate`.
- [ ] Implement worker call.
- [ ] GREEN: focused vitest pass.
- [ ] Staging DDL: do **not** use `ais_staging_api` `pnpm migrate` for this — report that controller must apply via Supabase MCP (same as P2.1). Still create the SQL file locally and apply local.
- [ ] Do NOT git commit.
- [ ] Do NOT print secrets.

**Done khi:** local migrate 000036; test proves purge deletes expired row; worker invokes function without crashing when DB set.

## Controller resolutions

- Staging apply of 000036 will be done by controller via MCP after local green (API role cannot own DDL).
- Next number: **000036**.
- Work from: `C:/Users/C-PC/Documents/Phan_mem_ban_hang_online/backend`
