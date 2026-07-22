-- Order schema + RLS (BE-ORD-001).
-- Apply after 000018_conversation_schema.sql
-- Design: docs/data/data-dictionary.md (Order) + docs/data/ERD.md §7 + HO_DEFAULTS_v1 (tax_rate_bps=1000, prices_tax_inclusive=true).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  order_code TEXT NOT NULL CHECK (char_length(btrim(order_code)) > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reserved', 'confirmed', 'cancelled', 'expired')),
  customer_id UUID NOT NULL,
  conversation_id UUID NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  subtotal_minor BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  shipping_minor BIGINT NOT NULL DEFAULT 0 CHECK (shipping_minor >= 0),
  fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  grand_total_minor BIGINT NOT NULL DEFAULT 0 CHECK (grand_total_minor >= 0),
  tax_rate_bps INT NOT NULL DEFAULT 1000 CHECK (tax_rate_bps = 1000),
  prices_tax_inclusive BOOLEAN NOT NULL DEFAULT true CHECK (prices_tax_inclusive = true),
  quote_version TEXT NOT NULL DEFAULT 'v1',
  reservation_id UUID NULL,
  duplicate_fingerprint TEXT NULL,
  shipping_address_id UUID NULL,
  notes TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT orders_customer_fk
    FOREIGN KEY (customer_id, tenant_id)
    REFERENCES app.customers (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_id_tenant
  ON app.orders (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_code
  ON app.orders (tenant_id, order_code);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_updated
  ON app.orders (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_fingerprint
  ON app.orders (tenant_id, duplicate_fingerprint, created_at DESC)
  WHERE duplicate_fingerprint IS NOT NULL AND status IN ('draft', 'reserved', 'confirmed');

CREATE TABLE IF NOT EXISTS app.order_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  sku_snapshot TEXT NULL,
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  unit_cost_minor BIGINT NULL CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
  quantity NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
  line_subtotal_minor BIGINT NOT NULL DEFAULT 0 CHECK (line_subtotal_minor >= 0),
  line_discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (line_discount_minor >= 0),
  line_tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (line_tax_minor >= 0),
  line_total_minor BIGINT NOT NULL DEFAULT 0 CHECK (line_total_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT order_items_order_fk
    FOREIGN KEY (order_id, tenant_id)
    REFERENCES app.orders (id, tenant_id),
  CONSTRAINT order_items_variant_fk
    FOREIGN KEY (variant_id, tenant_id)
    REFERENCES app.product_variants (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_items_id_tenant
  ON app.order_items (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_order_items_tenant_order
  ON app.order_items (tenant_id, order_id);

-- Append-only status history (ledger).
CREATE TABLE IF NOT EXISTS app.order_status_history (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  status_from TEXT NULL,
  status_to TEXT NOT NULL,
  reason TEXT NULL,
  actor_id UUID NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT order_status_history_order_fk
    FOREIGN KEY (order_id, tenant_id)
    REFERENCES app.orders (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_status_history_id_tenant
  ON app.order_status_history (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_order_status_history_tenant_order
  ON app.order_status_history (tenant_id, order_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A)
-- ---------------------------------------------------------------------------

ALTER TABLE app.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_isolation ON app.orders;
CREATE POLICY orders_isolation ON app.orders
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_items_isolation ON app.order_items;
CREATE POLICY order_items_isolation ON app.order_items
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_status_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_status_history_isolation ON app.order_status_history;
CREATE POLICY order_status_history_isolation ON app.order_status_history
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.orders TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.order_items TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.order_status_history TO app_runtime, app_worker;
