-- BE-IMP-001: import job + staging rows (TENANT_OWNED, FORCE RLS).
-- Expand-only. Apply/confirm logic lands in BE-IMP-004; parser in BE-IMP-002.

CREATE TABLE IF NOT EXISTS app.import_jobs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'xlsx', 'api')),
  upload_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN (
      'uploaded', 'mapped', 'analyzing', 'preview_ready',
      'confirming', 'applied', 'failed', 'cancelled'
    )),
  file_key TEXT NULL,
  file_checksum TEXT NULL,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_checksum TEXT NULL,
  row_count BIGINT NULL CHECK (row_count IS NULL OR row_count >= 0),
  error_count BIGINT NULL CHECK (error_count IS NULL OR error_count >= 0),
  error_report_key TEXT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_import_jobs_id_tenant
  ON app.import_jobs (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_status
  ON app.import_jobs (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS app.import_job_rows (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  import_job_id UUID NOT NULL,
  row_number INT NOT NULL CHECK (row_number >= 1),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  canonical JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolution TEXT NULL,
  applied_entity_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  row_status TEXT NOT NULL DEFAULT 'staged'
    CHECK (row_status IN ('staged', 'valid', 'invalid', 'applied', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT import_job_rows_job_fk
    FOREIGN KEY (import_job_id, tenant_id)
    REFERENCES app.import_jobs (id, tenant_id),
  CONSTRAINT import_job_rows_unique_row UNIQUE (tenant_id, import_job_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_import_job_rows_tenant_job
  ON app.import_job_rows (tenant_id, import_job_id, row_number);

ALTER TABLE app.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.import_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_jobs_isolation ON app.import_jobs;
CREATE POLICY import_jobs_isolation ON app.import_jobs
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.import_job_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.import_job_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_job_rows_isolation ON app.import_job_rows;
CREATE POLICY import_job_rows_isolation ON app.import_job_rows
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON app.import_jobs TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.import_job_rows TO app_runtime, app_worker;
