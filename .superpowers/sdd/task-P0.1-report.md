# Task P0.1 Report — Sync migrate local ↔ staging

**Date:** 2026-07-24  
**Working directory:** `backend/`  
**Commits:** none (per Human Owner rule)

## Objective

Align local Postgres and Supabase staging so applied migration count matches the number of migration files in `backend/infra/migrations/` before further schema work.

## Actions performed

### Step 1 — Local migrate

- Loaded environment variables from `backend/.env.local` (PowerShell `Get-Content` + `Set-Item env:`), without logging values.
- Ran `pnpm migrate` (`node tools/migrate.mjs`).

**First run result:** Applied `000034_fix_accept_invitation_ambiguity.sql` (1 migration).  
**Second run (verify):** `No pending migrations.`

### Step 2 — Local count

- Queried `SELECT count(*) FROM app.schema_migrations` against local DB (connection from `.env.local`, not printed).
- Counted migration files: `Get-ChildItem infra/migrations/000*.sql`.

### Step 3 — Staging count

- Loaded `backend/.env.staging` (no secrets printed).
- Queried `app.schema_migrations` count on staging Supabase project (project ref visible in existing checklist docs only; no connection string in this report).

### Step 4 — Evidence

- Added one evidence line to `backend/docs/release/HO-STAGING-CHECKLIST.md` (before audit “Kết luận” paragraph).

## Migration counts

| Target | Applied count | Expected (file count) | Match |
|--------|---------------|------------------------|-------|
| Local `app.schema_migrations` | **34** | **34** | Yes |
| Staging `app.schema_migrations` | **34** | **34** | Yes |
| Repo files `infra/migrations/000*.sql` | — | **34** | — |

**Latest version (both environments):** `000034_fix_accept_invitation_ambiguity.sql` (staging already at 34 before this session; local reached 34 during Step 1).

## Evidence file edited

- `backend/docs/release/HO-STAGING-CHECKLIST.md` — line: **P0.1 sync evidence (2026-07-24)** stating local = staging = 34.

## Failures / blockers

None.

## Self-review

- [x] Local pending migrations cleared (`No pending migrations.`).
- [x] Counts equal across local, staging, and repo files (34).
- [x] No DATABASE_URL, passwords, or full connection strings in this report.
- [x] No git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" created.

## Status

**DONE**
