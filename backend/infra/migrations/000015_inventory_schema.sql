-- Inventory schema + RLS (BE-INV-001).
-- Apply after 000014_import_schema.sql
-- Design: docs/data/data-dictionary.md (Inventory) + docs/data/rls-intent-catalog.md
--         + docs/data/ERD.md §4 + blueprint §7.8.
--
-- Quantity fields use NUMERIC(18,6) per blueprint §7.8.2 — never floating point.
-- `inventory_movements` is an append-only ledger: no UPDATE/DELETE grant for runtime roles.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.warehouses (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  code TEXT NOT NULL CHECK (char_length(btrim(code)) > 0),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  address TEXT NULL,
  timezone TEXT NULL,
  priority INT NOT NULL DEFAULT 0,
  allow_fulfillment BOOLEAN NOT NULL DEFAULT true,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_id_tenant
  ON app.warehouses (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_tenant_code
  ON app.warehouses (tenant_id, code);

CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_status
  ON app.warehouses (tenant_id, status);

CREATE TABLE IF NOT EXISTS app.inventory_balances (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  on_hand NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  blocked NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (blocked >= 0),
  damaged NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (damaged >= 0),
  safety_stock NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT inventory_balances_warehouse_fk
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES app.warehouses (id, tenant_id),
  CONSTRAINT inventory_balances_variant_fk
    FOREIGN KEY (variant_id, tenant_id)
    REFERENCES app.product_variants (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_balances_id_tenant
  ON app.inventory_balances (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_balances_tenant_wh_variant
  ON app.inventory_balances (tenant_id, warehouse_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_tenant_warehouse
  ON app.inventory_balances (tenant_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_tenant_variant
  ON app.inventory_balances (tenant_id, variant_id);

-- Ledger — append-only (blueprint §7.2 / §7.8.3): no updated_at/version, no UPDATE/DELETE grant.
CREATE TABLE IF NOT EXISTS app.inventory_movements (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  movement_type TEXT NOT NULL CHECK (char_length(btrim(movement_type)) > 0),
  quantity_delta NUMERIC(18, 6) NOT NULL,
  before_on_hand NUMERIC(18, 6) NOT NULL CHECK (before_on_hand >= 0),
  after_on_hand NUMERIC(18, 6) NOT NULL CHECK (after_on_hand >= 0),
  reference_type TEXT NULL,
  reference_id UUID NULL,
  reason TEXT NULL,
  reason_code TEXT NULL,
  actor_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NULL,
  adjustment_id UUID NULL,
  reservation_id UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT inventory_movements_warehouse_fk
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES app.warehouses (id, tenant_id),
  CONSTRAINT inventory_movements_variant_fk
    FOREIGN KEY (variant_id, tenant_id)
    REFERENCES app.product_variants (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant_wh_variant
  ON app.inventory_movements (tenant_id, warehouse_id, variant_id, occurred_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_movements_tenant_idempotency
  ON app.inventory_movements (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.inventory_reservations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('order', 'conversation', 'manual')),
  owner_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'expired', 'converted')),
  expires_at TIMESTAMPTZ NOT NULL,
  converted_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  release_reason TEXT NULL,
  idempotency_key TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservations_id_tenant
  ON app.inventory_reservations (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_tenant_status_expires
  ON app.inventory_reservations (tenant_id, status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservations_tenant_idempotency
  ON app.inventory_reservations (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.inventory_reservation_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  reservation_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  quantity NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active',
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT inventory_reservation_items_reservation_fk
    FOREIGN KEY (reservation_id, tenant_id)
    REFERENCES app.inventory_reservations (id, tenant_id),
  CONSTRAINT inventory_reservation_items_warehouse_fk
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES app.warehouses (id, tenant_id),
  CONSTRAINT inventory_reservation_items_variant_fk
    FOREIGN KEY (variant_id, tenant_id)
    REFERENCES app.product_variants (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservation_items_id_tenant
  ON app.inventory_reservation_items (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservation_items_res_wh_variant
  ON app.inventory_reservation_items (reservation_id, warehouse_id, variant_id);

CREATE TABLE IF NOT EXISTS app.inventory_adjustments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  quantity_delta NUMERIC(18, 6) NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) > 0),
  reason_code TEXT NULL,
  note TEXT NULL,
  evidence_file TEXT NULL,
  approved_by UUID NULL,
  actor_id UUID NOT NULL,
  idempotency_key TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT inventory_adjustments_warehouse_fk
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES app.warehouses (id, tenant_id),
  CONSTRAINT inventory_adjustments_variant_fk
    FOREIGN KEY (variant_id, tenant_id)
    REFERENCES app.product_variants (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_adjustments_id_tenant
  ON app.inventory_adjustments (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_adjustments_tenant_idempotency
  ON app.inventory_adjustments (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A, docs/data/rls-intent-catalog.md)
-- ---------------------------------------------------------------------------

ALTER TABLE app.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.warehouses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warehouses_isolation ON app.warehouses;
CREATE POLICY warehouses_isolation ON app.warehouses
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inventory_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_balances_isolation ON app.inventory_balances;
CREATE POLICY inventory_balances_isolation ON app.inventory_balances
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inventory_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_movements_isolation ON app.inventory_movements;
CREATE POLICY inventory_movements_isolation ON app.inventory_movements
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inventory_reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_reservations_isolation ON app.inventory_reservations;
CREATE POLICY inventory_reservations_isolation ON app.inventory_reservations
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.inventory_reservation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inventory_reservation_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_reservation_items_isolation ON app.inventory_reservation_items;
CREATE POLICY inventory_reservation_items_isolation ON app.inventory_reservation_items
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inventory_adjustments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_adjustments_isolation ON app.inventory_adjustments;
CREATE POLICY inventory_adjustments_isolation ON app.inventory_adjustments
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.warehouses TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.inventory_balances TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.inventory_movements TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.inventory_reservations TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.inventory_reservation_items TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.inventory_adjustments TO app_runtime, app_worker;
