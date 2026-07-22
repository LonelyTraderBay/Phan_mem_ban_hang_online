-- BE-CUS-003: tenant-scoped unique identity for email/phone/external attach/dedupe.
-- Expand-only: unique index on (tenant_id, identity_type, normalized_value_hash).

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_identities_tenant_type_hash
  ON app.customer_identities (tenant_id, identity_type, normalized_value_hash);
