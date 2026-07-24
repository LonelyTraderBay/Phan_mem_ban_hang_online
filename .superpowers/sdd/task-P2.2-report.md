# Task P2.2 Report — Ephemeral TTL purge function + worker tick

**Date:** 2026-07-24  
**Working directory:** `backend/`  
**Commits:** none (per brief)

## Objective

Add `app.purge_ephemeral_rows()` SECURITY DEFINER function (migration 000036), wire worker to invoke it on a 5-minute wall-clock interval, and prove via integration test that expired `oidc_login_states` rows are deleted.

## Files created / modified

| File | Action |
|------|--------|
| `backend/infra/migrations/000036_ephemeral_ttl_purge_fn.sql` | **Created** — `app.purge_ephemeral_rows()` with per-table TTL semantics; `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO app_worker` |
| `backend/packages/database/src/ephemeral-purge.ts` | **Created** — `purgeEphemeralRows(db)` Kysely wrapper |
| `backend/packages/database/src/ephemeral-purge.integration.test.ts` | **Created** — integration test (skipped without `DATABASE_URL`) |
| `backend/packages/database/src/index.ts` | **Modified** — re-export `purgeEphemeralRows` / `EphemeralPurgeCounts` |
| `backend/apps/worker/src/main.ts` | **Modified** — call purge every 5 min wall clock after outbox tick; log `{ counts }` at info |

**Skipped (YAGNI per brief):** `backend/apps/scheduler/src/main.ts` BullMQ scheduler — worker self-interval suffices.

## Purge semantics (binding)

| Table | Delete when |
|-------|-------------|
| `oidc_login_states` | `expires_at < now()` OR (`consumed_at IS NOT NULL` AND `consumed_at < now() - 7d`) |
| `media_upload_intents` | `expires_at < now()` AND (`bytes_received = false` OR `created_at < now() - 7d`) |
| `password_reset_tokens` | `expires_at < now()` OR (`consumed_at IS NOT NULL` AND `consumed_at < now() - 7d`) |
| `mfa_challenges` | `expires_at < now()` OR (`consumed_at IS NOT NULL` AND `consumed_at < now() - 7d`) |
| `idempotency_records` | `expires_at < now()` |

Function returns jsonb: `{"oidc_login_states":N,"media_upload_intents":N,...}`.

## Local

| Step | Result |
|------|--------|
| TDD integration test written | **PASS** — `ephemeral-purge.integration.test.ts` |
| `pnpm migrate` (000036) | **PASS** — `Applying 000036_ephemeral_ttl_purge_fn.sql... ok` |
| Focused vitest | **PASS** — 1/1 (`deletes expired oidc_login_states and keeps active rows`) |
| `pnpm typecheck` | **PASS** |

## Staging

| Step | Result |
|------|--------|
| Apply 000036 via `ais_staging_api` / `.env.staging` migrate | **Not attempted** — same owner-capability constraint as P2.1 (API role cannot own DDL) |
| Controller action | Apply `000036_ephemeral_ttl_purge_fn.sql` via **Supabase MCP** `apply_migration` (postgres owner), same path used for thru 000034 |

## Worker behavior

- Outbox poll unchanged: every 2s (`POLL_INTERVAL_MS`).
- Ephemeral purge: first tick + every 5 minutes (`PURGE_INTERVAL_MS`) when `DATABASE_URL` is set.
- Logs `ephemeral_purged` with `{ counts }` object only — no row payloads.
- Errors logged as `ephemeral_purge_failed` without crashing the worker loop.

## Failures / blockers

- None locally.
- Staging DDL deferred to controller MCP (documented above).

## Self-review

- [x] Migration matches brief (SECURITY DEFINER, `search_path`, jsonb counts, grants)
- [x] Local migrate 000036 applied
- [x] Integration test proves expired OIDC state deleted; active row retained
- [x] Worker invokes function without crashing when DB set
- [x] No BullMQ scheduler added (YAGNI)
- [x] No DATABASE_URL / passwords in this report
- [x] No git commit

## Status

**DONE** (local). Staging apply **PENDING** controller MCP.
