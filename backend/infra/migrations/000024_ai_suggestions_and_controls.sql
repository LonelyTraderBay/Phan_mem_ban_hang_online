-- AI suggestions + tenant AI controls + analytics idempotency (BE-AI / BE-DAT).
-- Apply after 000023_billing_operations_schema.sql
-- Mirror RLS style from 000021_ai_orchestration_schema.sql (TENANT_OWNED template A).

-- ---------------------------------------------------------------------------
-- app.ai_suggestions (TENANT_OWNED FORCE RLS)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.ai_suggestions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  conversation_id UUID NOT NULL,
  message_id UUID NULL,
  mode TEXT NOT NULL CHECK (mode IN ('copilot', 'semi_auto', 'autopilot')),
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'generating', 'pending_review', 'approved', 'sent', 'blocked', 'failed'
  )),
  output_redacted TEXT NULL,
  prompt_version_id UUID NULL,
  model_provider TEXT NULL,
  model_name TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_suggestions_id_tenant
  ON app.ai_suggestions (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_tenant_conversation
  ON app.ai_suggestions (tenant_id, conversation_id);

ALTER TABLE app.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_suggestions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_suggestions_isolation ON app.ai_suggestions;
CREATE POLICY ai_suggestions_isolation ON app.ai_suggestions
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON app.ai_suggestions TO app_runtime, app_worker;

-- ---------------------------------------------------------------------------
-- app.tenant_ai_controls (TENANT_OWNED FORCE RLS — one row per tenant)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.tenant_ai_controls (
  tenant_id UUID PRIMARY KEY REFERENCES app.tenants (id),
  switch_enabled BOOLEAN NOT NULL DEFAULT true,
  switch_reason TEXT NULL,
  budget_tokens_remaining BIGINT NOT NULL DEFAULT 1000000,
  budget_period TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE app.tenant_ai_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenant_ai_controls FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_ai_controls_isolation ON app.tenant_ai_controls;
CREATE POLICY tenant_ai_controls_isolation ON app.tenant_ai_controls
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON app.tenant_ai_controls TO app_runtime, app_worker;

-- ---------------------------------------------------------------------------
-- Eval runs: optional tenant_id for adapter filtering (GLOBAL — no RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE app.ai_evaluation_runs
  ADD COLUMN IF NOT EXISTS tenant_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_ai_evaluation_runs_tenant
  ON app.ai_evaluation_runs (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Report export idempotency (analytics)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_report_exports_tenant_idempotency
  ON app.report_exports (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
