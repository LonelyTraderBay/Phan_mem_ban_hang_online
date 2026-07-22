-- Catalog schema + RLS (BE-CAT-001).
-- Apply after 000011_customer_schema.sql
-- Design: docs/data/data-dictionary.md (Catalog) + docs/data/rls-intent-catalog.md
--         + docs/data/ERD.md §3 + blueprint §7.7 + HO_DEFAULTS_v1 (tax-inclusive money).
--
-- Money fields (`price_minor`, `cost_minor`, `price_history.*_minor`) are integer minor-unit
-- bigint columns per HO_DEFAULTS_v1 (VND, tax-inclusive) — never floating point.
-- `import_jobs` / `import_job_rows` are listed under Catalog in the data dictionary but are
-- deliberately NOT created here — that schema is owned by BE-IMP-001 (Import upload/job/staging
-- schema, see docs/tickets/BE-IMP-001.md) to avoid two tickets racing to create the same tables.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.categories (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  parent_id UUID NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  slug TEXT NOT NULL CHECK (char_length(btrim(slug)) > 0),
  path TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  -- Lifecycle enum intentionally not frozen yet (no CHECK) — see BE-CAT-001 completion notes.
  status TEXT NOT NULL DEFAULT 'active',
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Blocks the trivial 1-hop cycle; deeper cycle prevention is an application-layer concern
  -- (BE-CAT-002+) since it needs the full ancestor path, not a single CHECK.
  CONSTRAINT categories_parent_not_self_chk CHECK (parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_id_tenant
  ON app.categories (id, tenant_id);

-- Self-referencing composite FK added after the unique index it targets exists.
ALTER TABLE app.categories
  DROP CONSTRAINT IF EXISTS categories_parent_fk;
ALTER TABLE app.categories
  ADD CONSTRAINT categories_parent_fk
  FOREIGN KEY (parent_id, tenant_id)
  REFERENCES app.categories (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_categories_tenant_parent
  ON app.categories (tenant_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_categories_tenant_status
  ON app.categories (tenant_id, status);

-- Slug uniqueness scope (per-parent vs tenant-wide) is an open product decision per blueprint
-- §7.7.1 ("unique slug trong cùng parent hoặc toàn tenant theo product decision") — lookup index
-- only, no UNIQUE constraint until that decision is made (see BE-CAT-001 completion notes).
CREATE INDEX IF NOT EXISTS idx_categories_tenant_parent_slug
  ON app.categories (tenant_id, parent_id, slug);

CREATE TABLE IF NOT EXISTS app.products (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  category_id UUID NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  description TEXT NULL,
  brand TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  tax_class TEXT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT products_category_fk
    FOREIGN KEY (category_id, tenant_id)
    REFERENCES app.categories (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_id_tenant
  ON app.products (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_products_tenant_category
  ON app.products (tenant_id, category_id);

CREATE INDEX IF NOT EXISTS idx_products_tenant_status
  ON app.products (tenant_id, status);

CREATE TABLE IF NOT EXISTS app.product_variants (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  -- Tax-inclusive VND minor units per HO_DEFAULTS_v1; field-level cost protected by
  -- catalog.cost.read / catalog.cost.write (permission_matrix.csv) at the application layer.
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  cost_minor BIGINT NOT NULL CHECK (cost_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  weight_grams INT NOT NULL DEFAULT 0 CHECK (weight_grams >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT product_variants_product_fk
    FOREIGN KEY (product_id, tenant_id)
    REFERENCES app.products (id, tenant_id),
  -- Canonical uppercase/trim per ERD.md §3 ("canonical uppercase/trim, unique active per tenant").
  CONSTRAINT product_variants_sku_canonical_chk
    CHECK (sku = upper(btrim(sku)) AND char_length(btrim(sku)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_id_tenant
  ON app.product_variants (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_product
  ON app.product_variants (tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_status
  ON app.product_variants (tenant_id, status);

-- SKU unique among active variants per tenant only — an archived/inactive SKU may be reused.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_tenant_sku_active
  ON app.product_variants (tenant_id, sku)
  WHERE status = 'active';

-- Barcode uniqueness is business-conditional (blueprint §7.7.3: "optional, unique tenant nếu
-- business yêu cầu") — lookup index only, no UNIQUE until that decision is made.
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_barcode
  ON app.product_variants (tenant_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.product_media (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  object_key TEXT NOT NULL CHECK (char_length(btrim(object_key)) > 0),
  media_type TEXT NOT NULL CHECK (char_length(btrim(media_type)) > 0),
  checksum TEXT NULL,
  size_bytes BIGINT NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  scan_status TEXT NOT NULL DEFAULT 'pending',
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT product_media_variant_fk
    FOREIGN KEY (variant_id, tenant_id)
    REFERENCES app.product_variants (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_product_media_tenant_variant
  ON app.product_media (tenant_id, variant_id, sort_order);

-- Ledger — append-only (blueprint §7.2 / §7.7.5): no updated_at/version, no UPDATE/DELETE grant.
CREATE TABLE IF NOT EXISTS app.price_history (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  old_price_minor BIGINT NULL CHECK (old_price_minor IS NULL OR old_price_minor >= 0),
  new_price_minor BIGINT NULL CHECK (new_price_minor IS NULL OR new_price_minor >= 0),
  old_cost_minor BIGINT NULL CHECK (old_cost_minor IS NULL OR old_cost_minor >= 0),
  new_cost_minor BIGINT NULL CHECK (new_cost_minor IS NULL OR new_cost_minor >= 0),
  reason TEXT NULL,
  source TEXT NULL,
  actor_id UUID NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT price_history_variant_fk
    FOREIGN KEY (variant_id, tenant_id)
    REFERENCES app.product_variants (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_price_history_tenant_variant
  ON app.price_history (tenant_id, variant_id, effective_at DESC);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A, docs/data/rls-intent-catalog.md)
-- ---------------------------------------------------------------------------

ALTER TABLE app.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_isolation ON app.categories;
CREATE POLICY categories_isolation ON app.categories
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_isolation ON app.products;
CREATE POLICY products_isolation ON app.products
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_variants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_variants_isolation ON app.product_variants;
CREATE POLICY product_variants_isolation ON app.product_variants
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_media FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_media_isolation ON app.product_media;
CREATE POLICY product_media_isolation ON app.product_media
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.price_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_history_isolation ON app.price_history;
CREATE POLICY price_history_isolation ON app.price_history
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.categories TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.products TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.product_variants TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.product_media TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.price_history TO app_runtime, app_worker;
