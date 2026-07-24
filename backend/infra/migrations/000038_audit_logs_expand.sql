-- 000038_audit_logs_expand.sql
-- P5.1: expand audit_events → audit_logs (backfill + dual-write window).
-- Apply after 000037_harden_auth_ephemeral_rls.sql.
-- Contract (drop audit_events) is P5.2 — keep writing both tables during expand.

CREATE TABLE IF NOT EXISTS app.audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NULL,
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

-- Backfill skeleton rows (idempotent via primary key).
INSERT INTO app.audit_logs (id, tenant_id, action, actor_id, correlation_id, payload, created_at)
SELECT id, tenant_id, action, actor_id, correlation_id, payload, created_at
FROM app.audit_events
ON CONFLICT (id) DO NOTHING;

-- Nullable-tenant ledger RLS: platform actions may use tenant_id NULL.
ALTER TABLE app.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_tenant_isolation ON app.audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON app.audit_logs
  FOR ALL TO app_runtime, app_worker
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

-- Ledger: append-only for runtime roles (no UPDATE/DELETE).
GRANT SELECT, INSERT ON app.audit_logs TO app_runtime, app_worker;
