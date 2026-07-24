-- 000040_shipping_labels.sql
-- P6: shipping_labels TENANT_OWNED (carrier label object keys).
-- Apply after 000039_categories_slug_unique_per_parent.sql.
-- No HTTP API in this wave (contract-first).

CREATE TABLE IF NOT EXISTS app.shipping_labels (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  shipment_id UUID NOT NULL,
  object_key TEXT NOT NULL CHECK (char_length(btrim(object_key)) > 0),
  format TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shipping_labels_shipment_fk
    FOREIGN KEY (shipment_id, tenant_id)
    REFERENCES app.shipments (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipping_labels_id_tenant
  ON app.shipping_labels (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_shipping_labels_tenant_shipment
  ON app.shipping_labels (tenant_id, shipment_id);

ALTER TABLE app.shipping_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.shipping_labels FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipping_labels_isolation ON app.shipping_labels;
CREATE POLICY shipping_labels_isolation ON app.shipping_labels
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Append-oriented label store: SELECT/INSERT only (no UPDATE/DELETE for runtime).
GRANT SELECT, INSERT ON app.shipping_labels TO app_runtime, app_worker;
