# Task P2.1 Report — Ephemeral TTL indexes (000035)

**Date:** 2026-07-24  
**Working directory:** `backend/`  
**Commits:** none (per brief)

## Objective

Add migration `000035_ephemeral_ttl_indexes.sql` with purge-oriented `expires_at` indexes (no duplicates for oidc/idempotency), apply local + staging, verify `pg_indexes`.

## Migration created

- **File:** `backend/infra/migrations/000035_ephemeral_ttl_indexes.sql`
- **Indexes added:** `idx_password_reset_tokens_expires`, `idx_mfa_challenges_expires`, `idx_media_upload_intents_expires` (all `CREATE INDEX IF NOT EXISTS` on `(expires_at)`)
- **Skipped (already present):** `oidc_login_states`, `idempotency_records` per brief

**Note:** Initial file written with UTF-8 BOM caused PostgreSQL `42601` on first local apply; file rewritten without BOM and re-applied successfully.

## Local

| Step | Result |
|------|--------|
| Load `.env.local`, `pnpm migrate` | **PASS** — `Applying 000035_ephemeral_ttl_indexes.sql... ok` |
| `app.schema_migrations` count | **35** |
| Repo `infra/migrations/000*.sql` count | **35** |
| `pg_indexes` verification | **PASS** — all five target index names present (3 new + 2 pre-existing) |

## Staging

| Step | Result |
|------|--------|
| Load `.env.staging`, `pnpm migrate` | **FAIL** — `42501 must be owner of table password_reset_tokens` |
| Root cause | `DATABASE_URL` role is `ais_staging_api`; target tables owned by `postgres` |
| `000035` in `schema_migrations` | **No** (rollback; no partial apply) |
| New indexes on staging | **None** |
| CI probe | Triggered `staging-preflight` run [30037104840](https://github.com/LonelyTraderBay/Phan_mem_ban_hang_online/actions/runs/30037104840) — `No pending migrations` (remote repo still at 000034; migration file not pushed) |

### Staging unblock (HO / next agent)

1. Apply `000035` using a **postgres owner** connection (A1 Part 1 direct `postgres://postgres@...:5432/postgres`), **or** Supabase MCP `apply_migration` (used for thru 000034 per checklist), **or** SQL editor with same SQL as migration file.
2. Optionally align `STAGING_DATABASE_URL` (GitHub) vs `.env.staging` (API runtime role) — DDL requires owner; API role can remain `ais_staging_api`.

## Failures / blockers

- Staging not synced to 000035 until owner-capable migrate path runs.

## Self-review

- [x] Migration matches brief (header, IF NOT EXISTS, no oidc/idempotency recreate)
- [x] Local green + indexes verified
- [ ] Staging apply — **blocked** (permissions)
- [x] No DATABASE_URL / passwords in this report
- [x] No git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"

## Status

**Partial:** local **DONE**; staging **PENDING** owner-capable migrate.