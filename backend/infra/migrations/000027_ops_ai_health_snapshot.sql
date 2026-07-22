-- Platform Ops AI health aggregation (SECURITY DEFINER).
-- Application must enforce ops.ai_health.read before calling.

CREATE OR REPLACE FUNCTION app.ops_ai_health_snapshot()
RETURNS TABLE (
  provider_latency_p95_ms DOUBLE PRECISION,
  blocked_output_rate DOUBLE PRECISION,
  budget_exceeded_tenants BIGINT,
  sample_logs BIGINT,
  sample_blocked BIGINT,
  ai_disabled_tenants BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  WITH windowed_logs AS (
    SELECT latency_ms
    FROM app.ai_logs
    WHERE created_at >= now() - interval '24 hours'
  ),
  windowed_blocked AS (
    SELECT 1
    FROM app.ai_blocked_outputs
    WHERE created_at >= now() - interval '24 hours'
  ),
  counts AS (
    SELECT
      (SELECT count(*)::bigint FROM windowed_logs) AS logs_n,
      (SELECT count(*)::bigint FROM windowed_blocked) AS blocked_n
  )
  SELECT
    coalesce(
      (
        SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
        FROM windowed_logs
      ),
      0
    )::double precision AS provider_latency_p95_ms,
    CASE
      WHEN (SELECT logs_n + blocked_n FROM counts) = 0 THEN 0::double precision
      ELSE (SELECT blocked_n::double precision / (logs_n + blocked_n) FROM counts)
    END AS blocked_output_rate,
    (
      SELECT count(*)::bigint
      FROM app.tenant_ai_controls c
      WHERE c.budget_tokens_remaining <= 0
    ) AS budget_exceeded_tenants,
    (SELECT logs_n FROM counts) AS sample_logs,
    (SELECT blocked_n FROM counts) AS sample_blocked,
    (
      SELECT count(*)::bigint
      FROM app.tenant_ai_controls c
      WHERE c.switch_enabled = false
         OR coalesce((c.metadata->'switch'->>'disabled')::boolean, false) = true
    ) AS ai_disabled_tenants;
$$;

GRANT EXECUTE ON FUNCTION app.ops_ai_health_snapshot() TO app_runtime, app_worker;
