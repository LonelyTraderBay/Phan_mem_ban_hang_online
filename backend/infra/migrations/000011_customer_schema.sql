-- Customer/CDP schema + RLS (BE-CUS-001).
-- Apply after 000010_switch_tenant.sql
-- Design: docs/data/data-dictionary.md (Customer/CDP) + docs/data/rls-intent-catalog.md
--         + docs/data/ERD.md §2 + blueprint §7.6 + §12.4 (PII crypto).
--
-- PII columns (phone/email/address) store ciphertext only (BYTEA). Envelope encryption via KMS
-- and the keyed-HMAC blind index computation are application concerns owned by BE-CUS-002+; this
-- migration only shapes the ciphertext + blind-index columns so no later ALTER is needed for them.
-- Unique identity matching is never placed directly on an encrypted/blind-index column — it lives
-- on `customer_identities` per blueprint §7.6.1/§7.6.2.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.customers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  display_name TEXT NULL,
  phone_encrypted BYTEA NULL,
  phone_blind_index TEXT NULL,
  email_encrypted BYTEA NULL,
  email_blind_index TEXT NULL,
  -- Lifecycle enum intentionally not frozen yet (no CHECK) — see BE-CUS-001 completion notes.
  status TEXT NOT NULL DEFAULT 'active',
  hot_score NUMERIC NULL,
  risk_score NUMERIC NULL,
  source TEXT NULL,
  last_interaction_at TIMESTAMPTZ NULL,
  merged_into_customer_id UUID NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT customers_not_self_merged_chk CHECK (merged_into_customer_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_id_tenant
  ON app.customers (id, tenant_id);

-- Self-referencing composite FK added after the unique index it targets exists.
ALTER TABLE app.customers
  DROP CONSTRAINT IF EXISTS customers_merged_into_fk;
ALTER TABLE app.customers
  ADD CONSTRAINT customers_merged_into_fk
  FOREIGN KEY (merged_into_customer_id, tenant_id)
  REFERENCES app.customers (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_status
  ON app.customers (tenant_id, status);

-- Not unique — blind index is a search aid; identity uniqueness lives on customer_identities.
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone_blind
  ON app.customers (tenant_id, phone_blind_index)
  WHERE phone_blind_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_email_blind
  ON app.customers (tenant_id, email_blind_index)
  WHERE email_blind_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_merged_into
  ON app.customers (merged_into_customer_id)
  WHERE merged_into_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.customer_tags (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tags_id_tenant
  ON app.customer_tags (id, tenant_id);

-- Tag name unique tenant-scoped (blueprint §7.6.4).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tags_tenant_name
  ON app.customer_tags (tenant_id, name);

CREATE TABLE IF NOT EXISTS app.customer_identities (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  identity_type TEXT NOT NULL CHECK (char_length(btrim(identity_type)) > 0),
  provider TEXT NULL,
  channel_account_id TEXT NULL,
  external_id TEXT NULL,
  normalized_value_hash TEXT NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT customer_identities_customer_fk
    FOREIGN KEY (customer_id, tenant_id)
    REFERENCES app.customers (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_identities_tenant_customer
  ON app.customer_identities (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_identities_tenant_hash
  ON app.customer_identities (tenant_id, normalized_value_hash);

-- Unique only when the external identity carries a full account scope (blueprint §7.6.2:
-- "unique theo (tenant_id, provider, channel_account_id, external_id) khi external identity
-- có scope account").
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_identities_tenant_provider_account_external
  ON app.customer_identities (tenant_id, provider, channel_account_id, external_id)
  WHERE provider IS NOT NULL AND channel_account_id IS NOT NULL AND external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.customer_addresses (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  receiver_name_encrypted BYTEA NULL,
  phone_encrypted BYTEA NULL,
  address_line_encrypted BYTEA NULL,
  province_code TEXT NULL,
  district_code TEXT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT customer_addresses_customer_fk
    FOREIGN KEY (customer_id, tenant_id)
    REFERENCES app.customers (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant_customer
  ON app.customer_addresses (tenant_id, customer_id);

-- At most one default address per customer.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_addresses_customer_default
  ON app.customer_addresses (customer_id)
  WHERE is_default;

CREATE TABLE IF NOT EXISTS app.customer_tag_links (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  CONSTRAINT customer_tag_links_customer_fk
    FOREIGN KEY (customer_id, tenant_id)
    REFERENCES app.customers (id, tenant_id),
  CONSTRAINT customer_tag_links_tag_fk
    FOREIGN KEY (tag_id, tenant_id)
    REFERENCES app.customer_tags (id, tenant_id),
  CONSTRAINT customer_tag_links_unique UNIQUE (tenant_id, customer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_tag_links_tenant_tag
  ON app.customer_tag_links (tenant_id, tag_id);

CREATE TABLE IF NOT EXISTS app.customer_consents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  purpose TEXT NOT NULL CHECK (char_length(btrim(purpose)) > 0),
  lawful_basis TEXT NOT NULL CHECK (char_length(btrim(lawful_basis)) > 0),
  source TEXT NULL,
  granted_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  effective_at TIMESTAMPTZ NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT customer_consents_customer_fk
    FOREIGN KEY (customer_id, tenant_id)
    REFERENCES app.customers (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_consents_tenant_customer
  ON app.customer_consents (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS app.customer_notes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) > 0),
  classification TEXT NOT NULL DEFAULT 'internal',
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT customer_notes_customer_fk
    FOREIGN KEY (customer_id, tenant_id)
    REFERENCES app.customers (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_tenant_customer
  ON app.customer_notes (tenant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.customer_merge_history (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  source_customer_id UUID NOT NULL,
  target_customer_id UUID NOT NULL,
  field_resolution JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID NOT NULL,
  reason TEXT NULL,
  correlation_id TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT customer_merge_history_source_fk
    FOREIGN KEY (source_customer_id, tenant_id)
    REFERENCES app.customers (id, tenant_id),
  CONSTRAINT customer_merge_history_target_fk
    FOREIGN KEY (target_customer_id, tenant_id)
    REFERENCES app.customers (id, tenant_id),
  CONSTRAINT customer_merge_history_not_self_chk CHECK (source_customer_id <> target_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_merge_history_tenant_source
  ON app.customer_merge_history (tenant_id, source_customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_merge_history_tenant_target
  ON app.customer_merge_history (tenant_id, target_customer_id);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A, docs/data/rls-intent-catalog.md)
-- ---------------------------------------------------------------------------

ALTER TABLE app.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_isolation ON app.customers;
CREATE POLICY customers_isolation ON app.customers
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_tags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_tags_isolation ON app.customer_tags;
CREATE POLICY customer_tags_isolation ON app.customer_tags
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_identities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_identities_isolation ON app.customer_identities;
CREATE POLICY customer_identities_isolation ON app.customer_identities
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_addresses_isolation ON app.customer_addresses;
CREATE POLICY customer_addresses_isolation ON app.customer_addresses
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.customer_tag_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_tag_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_tag_links_isolation ON app.customer_tag_links;
CREATE POLICY customer_tag_links_isolation ON app.customer_tag_links
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.customer_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_consents_isolation ON app.customer_consents;
CREATE POLICY customer_consents_isolation ON app.customer_consents
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_notes_isolation ON app.customer_notes;
CREATE POLICY customer_notes_isolation ON app.customer_notes
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.customer_merge_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_merge_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_merge_history_isolation ON app.customer_merge_history;
CREATE POLICY customer_merge_history_isolation ON app.customer_merge_history
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.customers TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.customer_tags TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.customer_identities TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.customer_addresses TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.customer_tag_links TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.customer_consents TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.customer_notes TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.customer_merge_history TO app_runtime, app_worker;
