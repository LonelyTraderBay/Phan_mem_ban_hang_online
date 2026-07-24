# Task P5.1 Report — Expand audit_events → audit_logs (000038)

**Date:** 2026-07-24  
**Working directory:** `backend/`  
**Commits:** none (per brief)

## Objective

Create domain `audit_logs` table, backfill from skeleton `audit_events`, enable nullable-tenant ledger RLS, and dual-write on append while switching reads to `audit_logs`. Keep `audit_events` writes during expand window (contract in P5.2).

## Migration created

- **File:** `backend/infra/migrations/000038_audit_logs_expand.sql`
- **Table:** `app.audit_logs` with nullable `tenant_id`, `resource_*` / `integrity_hash` columns (null for now)
- **Indexes:** `uq_audit_logs_id_tenant` (partial), `idx_audit_logs_tenant_created` (partial)
- **Backfill:** `INSERT … SELECT` from `audit_events` with `ON CONFLICT (id) DO NOTHING`
- **RLS:** nullable-tenant policy — `tenant_id IS NULL OR tenant_id = app.tenant_id`
- **Grants:** `SELECT, INSERT` only for `app_runtime`, `app_worker` (ledger append-only)

## Store changes

- **File:** `backend/modules/audit/src/infrastructure/persistence/postgres-audit-log-store.ts`
- **append:** inserts into both `audit_events` and `audit_logs` in one transaction (same id/fields)
- **list / createExport:** read from `audit_logs` only

## Types

- **File:** `backend/packages/database/src/index.ts` — added `AuditLogsTable` + `app.audit_logs` on `Database`

## Docs

- `backend/docs/data/data-dictionary.md` — `audit_logs` Done (`000038`); `audit_events` note dual-write expand
- `backend/docs/data/rls-intent-catalog.md` — expand status for both tables

## Tests

- **File:** `backend/modules/audit/src/infrastructure/persistence/postgres-audit-log-store.test.ts`
- Integration (requires `DATABASE_URL`): append → list returns entry; row count = 1 in both tables
- Existing constructor + list tests unchanged

## Local verification

| Step | Result |
|------|--------|
| `pnpm migrate` (000038) | **PASS** |
| `schema_migrations` count | **38** |
| RLS on `audit_logs` | **PASS** — `relrowsecurity=true`, `relforcerowsecurity=true` |
| Runtime grants | **PASS** — SELECT + INSERT only (no UPDATE/DELETE) |
| Backfill row parity | **PASS** — `audit_events` 14 = `audit_logs` 14 |
| `pnpm exec vitest run modules/audit` | **PASS** (19 tests, 6 files) |
| `pnpm typecheck` | **PASS** |

## Staging

| Step | Result |
|------|--------|
| Controller MCP apply | **PENDING** (per brief) |

## Conflicts / blockers

None.

## Self-review

- [x] Expand only — `audit_events` not dropped/renamed
- [x] Dual-write append; reads from `audit_logs`
- [x] Local migrate 000038 applied
- [x] Tests + typecheck green
- [x] Dictionary + RLS catalog updated
- [x] No secrets in this report
- [x] No git commit

## Status

**DONE** locally; staging **PENDING** controller apply.
