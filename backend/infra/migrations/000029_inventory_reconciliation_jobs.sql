-- Inventory reconciliation jobs (BE-INV-007 durable multi-instance).
-- Apply after 000028_media_upload_intents.sql
-- Design: docs/data/data-dictionary.md (Inventory) + TENANT_OWNED template A.
-- Job body (status + discrepancies) persisted for GET by job_id across instances.
-- HTTP Idempotency-Key remains on app.idempotency_records via IdempotencyStore.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.inventory_reconciliation_jobs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  warehouse_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  discrepancies JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_reconciliation_jobs_warehouse_fk
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES app.warehouses (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reconciliation_jobs_id_tenant
  ON app.inventory_reconciliation_jobs (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_reconciliation_jobs_tenant_wh
  ON app.inventory_reconciliation_jobs (tenant_id, warehouse_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A)
-- ---------------------------------------------------------------------------

ALTER TABLE app.inventory_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inventory_reconciliation_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_reconciliation_jobs_isolation ON app.inventory_reconciliation_jobs;
CREATE POLICY inventory_reconciliation_jobs_isolation ON app.inventory_reconciliation_jobs
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT ON app.inventory_reconciliation_jobs TO app_runtime, app_worker;
