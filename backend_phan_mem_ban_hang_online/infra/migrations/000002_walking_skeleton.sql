-- Walking skeleton tables for BE-FND-016 golden path (audit + outbox trace).
-- Apply after 000001_bootstrap_roles.sql

CREATE TABLE IF NOT EXISTS app.audit_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID NOT NULL,
  correlation_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.outbox_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created
  ON app.audit_events (tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant_unpublished
  ON app.outbox_events (tenant_id, created_at ASC)
  WHERE published_at IS NULL;

ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_tenant_isolation ON app.audit_events;
CREATE POLICY audit_events_tenant_isolation ON app.audit_events
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS outbox_events_tenant_isolation ON app.outbox_events;
CREATE POLICY outbox_events_tenant_isolation ON app.outbox_events
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON app.audit_events TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.outbox_events TO app_runtime, app_worker;
