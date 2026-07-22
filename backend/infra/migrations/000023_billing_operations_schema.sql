-- Billing + Operations schema + RLS (BE-BIL-001…003, BE-OPS-001…005).
-- Apply after 000022_analytics_schema.sql
-- Plans cite HO_DEFAULTS_v1 — seed only, not commercial quote.

CREATE TABLE IF NOT EXISTS app.plans (
  id TEXT PRIMARY KEY CHECK (id IN ('plan_free', 'plan_pro', 'plan_business')),
  name TEXT NOT NULL,
  monthly_price_minor BIGINT NOT NULL DEFAULT 0 CHECK (monthly_price_minor >= 0),
  seats_limit INT NOT NULL CHECK (seats_limit > 0),
  orders_per_month INT NOT NULL CHECK (orders_per_month > 0),
  ai_suggestions_per_day INT NOT NULL CHECK (ai_suggestions_per_day > 0),
  channel_accounts_limit INT NOT NULL CHECK (channel_accounts_limit > 0),
  feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app.plans (id, name, monthly_price_minor, seats_limit, orders_per_month, ai_suggestions_per_day, channel_accounts_limit, feature_flags)
VALUES
  ('plan_free', 'Free', 0, 2, 50, 20, 1, '{"feature.web_admin": true, "feature.ai_copilot": "limited", "feature.desktop_client": false, "feature.ops_support_access": false}'::jsonb),
  ('plan_pro', 'Pro', 499000, 10, 2000, 500, 5, '{"feature.web_admin": true, "feature.ai_copilot": true, "feature.desktop_client": true, "feature.ops_support_access": false}'::jsonb),
  ('plan_business', 'Business', 1999000, 50, 20000, 5000, 20, '{"feature.web_admin": true, "feature.ai_copilot": true, "feature.desktop_client": true, "feature.ops_support_access": true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  plan_id TEXT NOT NULL REFERENCES app.plans (id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'cancelled')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  seats_used INT NOT NULL DEFAULT 1 CHECK (seats_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_tenant_active
  ON app.subscriptions (tenant_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS app.usage_meters (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  meter_key TEXT NOT NULL CHECK (meter_key IN ('orders_created', 'ai_suggestions', 'channel_accounts')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_meters_tenant_meter_period
  ON app.usage_meters (tenant_id, meter_key, period_start);

CREATE TABLE IF NOT EXISTS app.feature_flags (
  flag_key TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  default_enabled BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.feature_flag_overrides (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  flag_key TEXT NOT NULL REFERENCES app.feature_flags (flag_key),
  enabled BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  reason TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_flag_overrides_tenant_key
  ON app.feature_flag_overrides (tenant_id, flag_key);

CREATE TABLE IF NOT EXISTS app.system_alerts (
  id UUID PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_tenant_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_status_created
  ON app.system_alerts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS app.reprocess_requests (
  id UUID PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('webhook', 'outbound', 'import', 'ai_eval')),
  target_id UUID NOT NULL,
  target_tenant_id UUID NULL,
  reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  idempotency_key TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_reprocess_requests_status
  ON app.reprocess_requests (status, created_at DESC);

-- RLS tenant-owned
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['subscriptions', 'usage_meters']
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON app.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON app.%I FOR ALL TO app_runtime, app_worker
       USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
       WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- TENANT_OVERRIDE
ALTER TABLE app.feature_flag_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feature_flag_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_flag_overrides_isolation ON app.feature_flag_overrides;
CREATE POLICY feature_flag_overrides_isolation ON app.feature_flag_overrides
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- GLOBAL catalogs: deny runtime writes; read via SECURITY DEFINER or seed
ALTER TABLE app.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read ON app.plans;
CREATE POLICY plans_read ON app.plans
  FOR SELECT TO app_runtime, app_worker
  USING (true);

ALTER TABLE app.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feature_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_flags_read ON app.feature_flags;
CREATE POLICY feature_flags_read ON app.feature_flags
  FOR SELECT TO app_runtime, app_worker
  USING (true);

-- Platform GLOBAL ops: no tenant RLS; ops permission enforced in application layer
ALTER TABLE app.system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.system_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_alerts_ops ON app.system_alerts;
CREATE POLICY system_alerts_ops ON app.system_alerts
  FOR ALL TO app_runtime, app_worker
  USING (true)
  WITH CHECK (true);

ALTER TABLE app.reprocess_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reprocess_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reprocess_requests_ops ON app.reprocess_requests;
CREATE POLICY reprocess_requests_ops ON app.reprocess_requests
  FOR ALL TO app_runtime, app_worker
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON app.plans TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.subscriptions TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.usage_meters TO app_runtime, app_worker;
GRANT SELECT ON app.feature_flags TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.feature_flag_overrides TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.system_alerts TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.reprocess_requests TO app_runtime, app_worker;
