-- Media upload intents (BE-CAT-004 durable multi-instance).
-- Apply after 000027_ops_ai_health_snapshot.sql
-- Design: docs/tickets/BE-CAT-004.md + TENANT_OWNED template A (rls-intent-catalog.md).
-- Ephemeral pre-signed upload intents; product_media remains the durable attached object.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.media_upload_intents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  filename TEXT NOT NULL CHECK (char_length(btrim(filename)) > 0),
  content_type TEXT NOT NULL CHECK (char_length(btrim(content_type)) > 0),
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  object_key TEXT NOT NULL CHECK (char_length(btrim(object_key)) > 0),
  upload_url TEXT NOT NULL CHECK (char_length(btrim(upload_url)) > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  bytes_received BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_media_upload_intents_id_tenant
  ON app.media_upload_intents (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_media_upload_intents_tenant_expires
  ON app.media_upload_intents (tenant_id, expires_at);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A)
-- ---------------------------------------------------------------------------

ALTER TABLE app.media_upload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.media_upload_intents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS media_upload_intents_isolation ON app.media_upload_intents;
CREATE POLICY media_upload_intents_isolation ON app.media_upload_intents
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.media_upload_intents TO app_runtime, app_worker;
