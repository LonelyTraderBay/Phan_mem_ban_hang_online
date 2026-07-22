-- Billing + Operations idempotency indexes + feature_flags seed.
-- Apply after 000024_ai_suggestions_and_controls.sql
-- Runtime has SELECT-only on app.feature_flags — seed here for FK on overrides.

-- ---------------------------------------------------------------------------
-- Unique partial indexes (idempotency)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_meters_tenant_idempotency
  ON app.usage_meters (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reprocess_requests_idempotency
  ON app.reprocess_requests (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Seed feature_flags (ON CONFLICT DO NOTHING)
-- Keys used by ops tests / common product toggles.
-- ---------------------------------------------------------------------------

INSERT INTO app.feature_flags (flag_key, description, default_enabled)
VALUES
  ('ai_suggestions', 'AI suggestion / copilot entitlements', false),
  ('channel_connect', 'Connect external sales channels', false),
  ('import_bulk', 'Bulk catalog / inventory import', false),
  ('analytics_export', 'Analytics report export', false),
  ('ai.autopilot', 'AI autopilot mode (operations tests)', false)
ON CONFLICT (flag_key) DO NOTHING;
