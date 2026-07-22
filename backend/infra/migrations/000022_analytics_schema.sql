-- Analytics schema + RLS (BE-DAT-001…010).
-- Apply after 000021_ai_orchestration_schema.sql

CREATE TABLE IF NOT EXISTS app.event_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  event_type TEXT NOT NULL CHECK (char_length(btrim(event_type)) > 0),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_event_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_logs_id_tenant
  ON app.event_logs (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_event_logs_tenant_occurred
  ON app.event_logs (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_logs_tenant_type
  ON app.event_logs (tenant_id, event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS app.projection_watermarks (
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  projection_name TEXT NOT NULL,
  last_event_id UUID NULL,
  last_occurred_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, projection_name)
);

CREATE TABLE IF NOT EXISTS app.daily_tenant_metrics (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  orders_count INT NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
  revenue_minor BIGINT NOT NULL DEFAULT 0,
  gross_profit_minor BIGINT NOT NULL DEFAULT 0,
  conversations_count INT NOT NULL DEFAULT 0 CHECK (conversations_count >= 0),
  sla_breach_count INT NOT NULL DEFAULT 0 CHECK (sla_breach_count >= 0),
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (char_length(currency) = 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_tenant_metrics_tenant_date
  ON app.daily_tenant_metrics (tenant_id, metric_date);

CREATE TABLE IF NOT EXISTS app.daily_channel_metrics (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  channel_account_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  messages_in INT NOT NULL DEFAULT 0 CHECK (messages_in >= 0),
  messages_out INT NOT NULL DEFAULT 0 CHECK (messages_out >= 0),
  orders_count INT NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
  revenue_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_channel_metrics_key
  ON app.daily_channel_metrics (tenant_id, channel_account_id, metric_date);

CREATE TABLE IF NOT EXISTS app.daily_sales_agent_metrics (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  agent_user_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  conversations_handled INT NOT NULL DEFAULT 0 CHECK (conversations_handled >= 0),
  orders_count INT NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
  revenue_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_sales_agent_metrics_key
  ON app.daily_sales_agent_metrics (tenant_id, agent_user_id, metric_date);

CREATE TABLE IF NOT EXISTS app.daily_product_metrics (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  units_sold NUMERIC(18, 4) NOT NULL DEFAULT 0,
  revenue_minor BIGINT NOT NULL DEFAULT 0,
  gross_profit_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_product_metrics_key
  ON app.daily_product_metrics (tenant_id, variant_id, metric_date);

CREATE TABLE IF NOT EXISTS app.conversation_conversion_facts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  fact_date DATE NOT NULL,
  converted BOOLEAN NOT NULL DEFAULT false,
  order_id UUID NULL,
  sla_breached BOOLEAN NOT NULL DEFAULT false,
  first_response_ms INT NULL CHECK (first_response_ms IS NULL OR first_response_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_conversion_facts_key
  ON app.conversation_conversion_facts (tenant_id, conversation_id, fact_date);

CREATE TABLE IF NOT EXISTS app.order_profit_facts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  fact_date DATE NOT NULL,
  revenue_minor BIGINT NOT NULL DEFAULT 0,
  cost_minor BIGINT NOT NULL DEFAULT 0,
  gross_profit_minor BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (char_length(currency) = 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_profit_facts_key
  ON app.order_profit_facts (tenant_id, order_id, fact_date);

CREATE TABLE IF NOT EXISTS app.report_exports (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('revenue', 'gross_profit', 'sla', 'ai_quality')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  from_at TIMESTAMPTZ NULL,
  to_at TIMESTAMPTZ NULL,
  download_url TEXT NULL,
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_report_exports_id_tenant
  ON app.report_exports (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_report_exports_tenant_status
  ON app.report_exports (tenant_id, status, created_at DESC);

-- RLS (tenant-owned tables)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'event_logs',
    'projection_watermarks',
    'daily_tenant_metrics',
    'daily_channel_metrics',
    'daily_sales_agent_metrics',
    'daily_product_metrics',
    'conversation_conversion_facts',
    'order_profit_facts',
    'report_exports'
  ]
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

GRANT SELECT, INSERT, UPDATE ON app.event_logs TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.projection_watermarks TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.daily_tenant_metrics TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.daily_channel_metrics TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.daily_sales_agent_metrics TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.daily_product_metrics TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.conversation_conversion_facts TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.order_profit_facts TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.report_exports TO app_runtime, app_worker;
