-- Payment + fulfillment/returns schema + RLS (BE-PAY-001, BE-FUL-001, BE-RET-001).
-- Apply after 000019_order_schema.sql

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.payments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cod', 'transfer', 'card', 'ewallet', 'other')),
  provider TEXT NULL,
  provider_ref TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payments_order_fk
    FOREIGN KEY (order_id, tenant_id)
    REFERENCES app.orders (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_id_tenant
  ON app.payments (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_order
  ON app.payments (tenant_id, order_id);

CREATE TABLE IF NOT EXISTS app.payment_attempts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  attempt_no INT NOT NULL CHECK (attempt_no >= 1),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  provider_event_id TEXT NULL,
  idempotency_key TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_attempts_payment_fk
    FOREIGN KEY (payment_id, tenant_id)
    REFERENCES app.payments (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempts_id_tenant
  ON app.payment_attempts (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempts_tenant_provider_event
  ON app.payment_attempts (tenant_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.payment_reconciliations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  expected_amount_minor BIGINT NOT NULL,
  actual_amount_minor BIGINT NOT NULL,
  match_state TEXT NOT NULL CHECK (match_state IN ('matched', 'mismatch', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_reconciliations_payment_fk
    FOREIGN KEY (payment_id, tenant_id)
    REFERENCES app.payments (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_reconciliations_id_tenant
  ON app.payment_reconciliations (id, tenant_id);

CREATE TABLE IF NOT EXISTS app.refunds (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  provider_ref TEXT NULL,
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT refunds_payment_fk
    FOREIGN KEY (payment_id, tenant_id)
    REFERENCES app.payments (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_id_tenant
  ON app.refunds (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_tenant_idempotency
  ON app.refunds (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Fulfillment / returns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.shipments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'packed', 'shipped', 'delivered', 'cancelled')),
  carrier TEXT NULL,
  tracking_code TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT shipments_order_fk
    FOREIGN KEY (order_id, tenant_id)
    REFERENCES app.orders (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipments_id_tenant
  ON app.shipments (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_shipments_tenant_order
  ON app.shipments (tenant_id, order_id);

CREATE TABLE IF NOT EXISTS app.shipment_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  shipment_id UUID NOT NULL,
  order_item_id UUID NOT NULL,
  quantity NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT shipment_items_shipment_fk
    FOREIGN KEY (shipment_id, tenant_id)
    REFERENCES app.shipments (id, tenant_id),
  CONSTRAINT shipment_items_order_item_fk
    FOREIGN KEY (order_item_id, tenant_id)
    REFERENCES app.order_items (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_items_id_tenant
  ON app.shipment_items (id, tenant_id);

CREATE TABLE IF NOT EXISTS app.returns (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'received', 'completed', 'rejected')),
  reason TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT returns_order_fk
    FOREIGN KEY (order_id, tenant_id)
    REFERENCES app.orders (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_returns_id_tenant
  ON app.returns (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_returns_tenant_order
  ON app.returns (tenant_id, order_id);

CREATE TABLE IF NOT EXISTS app.return_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  return_id UUID NOT NULL,
  order_item_id UUID NOT NULL,
  quantity NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
  restocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT return_items_return_fk
    FOREIGN KEY (return_id, tenant_id)
    REFERENCES app.returns (id, tenant_id),
  CONSTRAINT return_items_order_item_fk
    FOREIGN KEY (order_item_id, tenant_id)
    REFERENCES app.order_items (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_return_items_id_tenant
  ON app.return_items (id, tenant_id);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A)
-- ---------------------------------------------------------------------------

ALTER TABLE app.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_isolation ON app.payments;
CREATE POLICY payments_isolation ON app.payments
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payment_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_attempts_isolation ON app.payment_attempts;
CREATE POLICY payment_attempts_isolation ON app.payment_attempts
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.payment_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payment_reconciliations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_reconciliations_isolation ON app.payment_reconciliations;
CREATE POLICY payment_reconciliations_isolation ON app.payment_reconciliations
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.refunds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refunds_isolation ON app.refunds;
CREATE POLICY refunds_isolation ON app.refunds
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.shipments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipments_isolation ON app.shipments;
CREATE POLICY shipments_isolation ON app.shipments
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.shipment_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipment_items_isolation ON app.shipment_items;
CREATE POLICY shipment_items_isolation ON app.shipment_items
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.returns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS returns_isolation ON app.returns;
CREATE POLICY returns_isolation ON app.returns
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.return_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS return_items_isolation ON app.return_items;
CREATE POLICY return_items_isolation ON app.return_items
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.payments TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.payment_attempts TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.payment_reconciliations TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.refunds TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.shipments TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.shipment_items TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.returns TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.return_items TO app_runtime, app_worker;
