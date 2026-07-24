-- 000041_job_runs.sql
-- P7: job_runs SYSTEM_INTERNAL — worker observability; not exposed via user APIs.
-- Apply after 000040_shipping_labels.sql.

CREATE TABLE IF NOT EXISTS app.job_runs (
  id UUID PRIMARY KEY,
  job_name TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  error_redacted TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
  ON app.job_runs (job_name, started_at DESC);

-- Deny-by-default for API runtime; worker writes only.
ALTER TABLE app.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.job_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_runs_worker_all ON app.job_runs;
CREATE POLICY job_runs_worker_all ON app.job_runs
  FOR ALL TO app_worker
  USING (true)
  WITH CHECK (true);

-- No policy for app_runtime → no access under FORCE RLS.
REVOKE ALL ON app.job_runs FROM app_runtime;
GRANT INSERT, UPDATE, SELECT ON app.job_runs TO app_worker;
