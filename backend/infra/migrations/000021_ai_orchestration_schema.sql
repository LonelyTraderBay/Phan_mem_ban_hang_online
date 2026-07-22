-- AI orchestration schema + RLS (BE-AI-001…016).
-- Apply after 000020_payment_fulfillment_schema.sql
-- Design: docs/data/data-dictionary.md (Knowledge/AI) + blueprint §7.9.

CREATE TABLE IF NOT EXISTS app.prompt_versions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  content TEXT NOT NULL CHECK (char_length(btrim(content)) > 0),
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'evaluating', 'approved', 'active', 'retired')),
  model_provider TEXT NULL,
  model_name TEXT NULL,
  tool_registry_version TEXT NULL,
  retrieval_config_version TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_versions_id_tenant
  ON app.prompt_versions (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_tenant_status
  ON app.prompt_versions (tenant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_versions_tenant_active
  ON app.prompt_versions (tenant_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS app.ai_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  conversation_id UUID NULL,
  suggestion_id UUID NULL,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt_version_id UUID NULL,
  model_provider TEXT NULL,
  model_name TEXT NULL,
  tokens_used INT NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  latency_ms INT NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  correlation_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_logs_id_tenant
  ON app.ai_logs (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_ai_logs_tenant_created
  ON app.ai_logs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.ai_tool_calls (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  suggestion_id UUID NULL,
  tool_name TEXT NOT NULL,
  risk_class TEXT NOT NULL CHECK (risk_class IN ('R0', 'R1', 'R2', 'R3', 'R4', 'R5')),
  status TEXT NOT NULL CHECK (status IN ('allowed', 'denied', 'failed')),
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_tool_calls_id_tenant
  ON app.ai_tool_calls (id, tenant_id);

CREATE TABLE IF NOT EXISTS app.ai_blocked_outputs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  suggestion_id UUID NULL,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  safe_fallback TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_blocked_outputs_id_tenant
  ON app.ai_blocked_outputs (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_ai_blocked_outputs_tenant_created
  ON app.ai_blocked_outputs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.ai_evaluation_sets (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('P0', 'P1', 'P2')),
  version INT NOT NULL DEFAULT 1,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS app.ai_evaluation_cases (
  id UUID PRIMARY KEY,
  set_id UUID NOT NULL REFERENCES app.ai_evaluation_sets (id),
  tier TEXT NOT NULL CHECK (tier IN ('P0', 'P1', 'P2')),
  input_text TEXT NOT NULL,
  expected_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.ai_evaluation_runs (
  id UUID PRIMARY KEY,
  set_id UUID NULL REFERENCES app.ai_evaluation_sets (id),
  prompt_version_id UUID NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  passed BOOLEAN NULL,
  critical_violations INT NOT NULL DEFAULT 0,
  total_cases INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS app.ai_evaluation_results (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES app.ai_evaluation_runs (id),
  case_id UUID NULL,
  score NUMERIC(5, 2) NULL,
  violations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.ai_quality_facts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  fact_date DATE NOT NULL,
  block_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  acceptance_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  escalation_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  avg_latency_ms INT NOT NULL DEFAULT 0,
  cost_tokens BIGINT NOT NULL DEFAULT 0,
  fallback_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_quality_facts_tenant_date
  ON app.ai_quality_facts (tenant_id, fact_date);

-- RLS (tenant-owned tables)
ALTER TABLE app.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.prompt_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prompt_versions_isolation ON app.prompt_versions;
CREATE POLICY prompt_versions_isolation ON app.prompt_versions
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_logs_isolation ON app.ai_logs;
CREATE POLICY ai_logs_isolation ON app.ai_logs
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.ai_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_tool_calls FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_tool_calls_isolation ON app.ai_tool_calls;
CREATE POLICY ai_tool_calls_isolation ON app.ai_tool_calls
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.ai_blocked_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_blocked_outputs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_blocked_outputs_isolation ON app.ai_blocked_outputs;
CREATE POLICY ai_blocked_outputs_isolation ON app.ai_blocked_outputs
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.ai_quality_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_quality_facts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_quality_facts_isolation ON app.ai_quality_facts;
CREATE POLICY ai_quality_facts_isolation ON app.ai_quality_facts
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON app.prompt_versions TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.ai_logs TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.ai_tool_calls TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.ai_blocked_outputs TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.ai_quality_facts TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.ai_evaluation_sets TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.ai_evaluation_cases TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.ai_evaluation_runs TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.ai_evaluation_results TO app_runtime, app_worker;
