-- Inbox + worker publisher policy (BE-FND-010/011). Apply after 000003.

CREATE TABLE IF NOT EXISTS app.inbox_events (
  consumer_name TEXT NOT NULL,
  event_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  payload_hash TEXT,
  error TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (consumer_name, event_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_events_tenant_status
  ON app.inbox_events (tenant_id, status, first_seen_at);

ALTER TABLE app.inbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inbox_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_events_tenant_isolation ON app.inbox_events;
CREATE POLICY inbox_events_tenant_isolation ON app.inbox_events
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Worker must poll unpublished outbox across tenants (FORCE RLS still applies).
DROP POLICY IF EXISTS outbox_events_worker_publisher ON app.outbox_events;
CREATE POLICY outbox_events_worker_publisher ON app.outbox_events
  FOR ALL
  TO app_worker
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS inbox_events_worker_access ON app.inbox_events;
CREATE POLICY inbox_events_worker_access ON app.inbox_events
  FOR ALL
  TO app_worker
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON app.inbox_events TO app_runtime, app_worker;
