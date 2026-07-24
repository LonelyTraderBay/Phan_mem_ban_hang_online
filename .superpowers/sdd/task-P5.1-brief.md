# Task P5.1 — Expand: tạo `audit_logs` + backfill + dual-write

**Phase:** P5 — Expand/contract audit_events → audit_logs  
**Plan:** `backend/docs/superpowers/plans/2026-07-24-db-schema-completion.md`

**Do NOT invent a third audit table name.** Only `audit_logs` + keep writing `audit_events` during expand window.

## Files

- Create: `backend/infra/migrations/000038_audit_logs_expand.sql`
- Modify: `backend/modules/audit/src/infrastructure/persistence/postgres-audit-log-store.ts`
- Modify: `backend/packages/database/src/index.ts` — add `audit_logs` table types if Kysely typed inserts used; raw sql is OK if matching store style
- Modify: `backend/docs/data/data-dictionary.md` — set `audit_logs` Done (`000038`); note dual-write with `audit_events`
- Modify: `backend/docs/data/rls-intent-catalog.md` — note expand status
- Test: extend `backend/modules/audit/src/infrastructure/persistence/postgres-audit-log-store.test.ts`

## Migration requirements (`000038`)

```sql
CREATE TABLE IF NOT EXISTS app.audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NULL,  -- nullable-tenant class
  action TEXT NOT NULL,
  actor_id UUID NULL,
  correlation_id TEXT NOT NULL DEFAULT '',
  resource_type TEXT NULL,
  resource_id UUID NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrity_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_id_tenant
  ON app.audit_logs (id, tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON app.audit_logs (tenant_id, created_at DESC, id DESC)
  WHERE tenant_id IS NOT NULL;

-- Backfill from skeleton
INSERT INTO app.audit_logs (id, tenant_id, action, actor_id, correlation_id, payload, created_at)
SELECT id, tenant_id, action, actor_id, correlation_id, payload, created_at
FROM app.audit_events
ON CONFLICT (id) DO NOTHING;

-- RLS: nullable-tenant — for app_runtime FOR ALL:
--   USING (
--     tenant_id IS NULL OR
--     tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
--   )
-- Match pattern used for user_sessions if present; otherwise TENANT_OWNED-like when tenant_id set.
ALTER TABLE app.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_logs FORCE ROW LEVEL SECURITY;
-- CREATE POLICY ... (ledger: SELECT + INSERT only grants)

GRANT SELECT, INSERT ON app.audit_logs TO app_runtime, app_worker;
-- NO UPDATE/DELETE to app_runtime
```

Also grant SELECT to app_worker if needed. Copy RLS style from `audit_events` in `000002` and extend for nullable tenant_id.

## Store dual-write / read

In `PostgresAuditLogStore`:
- **append:** insert into BOTH `audit_events` and `audit_logs` in the same transaction (same id/fields; resource_* / integrity_hash null for now). Keep redaction as today.
- **list / createExport reads:** read from `audit_logs` only (after backfill, data present).

## Tests

- Integration (DATABASE_URL): append → list returns entry; row exists in both tables (query counts).
- Existing unit/constructor tests still pass.
- `pnpm exec vitest run modules/audit` (or path to store tests) + `pnpm typecheck` if TS changed.

## Docs

- Dictionary: `audit_logs` Done (`000038`); `audit_events` still Done skeleton with note “dual-write expand; contract in P5.2”.

## Constraints

- Do NOT git commit.
- Do NOT apply staging (controller MCP later).
- Do NOT drop/rename `audit_events` in this task (that is P5.2).
- No secrets in report.

**Done khi:** local migrate 000038; dual-write append; reads from audit_logs; tests green; dictionary updated.

Work from: `C:/Users/C-PC/Documents/Phan_mem_ban_hang_online/backend`
