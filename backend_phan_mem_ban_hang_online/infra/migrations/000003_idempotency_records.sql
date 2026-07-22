-- Idempotency records (BE-FND-009). Apply after 000002_walking_skeleton.sql.

CREATE TABLE IF NOT EXISTS app.idempotency_records (
  tenant_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  operation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed_retryable', 'failed_final')),
  resource_id TEXT,
  response_status INT,
  response_body_redacted JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, actor_id, operation_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires
  ON app.idempotency_records (expires_at)
  WHERE status IN ('completed', 'failed_final', 'failed_retryable');

ALTER TABLE app.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_records_tenant_isolation ON app.idempotency_records;
CREATE POLICY idempotency_records_tenant_isolation ON app.idempotency_records
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON app.idempotency_records TO app_runtime, app_worker;
