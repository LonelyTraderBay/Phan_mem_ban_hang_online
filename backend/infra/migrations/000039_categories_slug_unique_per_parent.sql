-- 000039_categories_slug_unique_per_parent.sql
-- P4.1 HO decision (2026-07-24): Option A — unique slug per (tenant_id, parent_id).
-- Root categories (parent_id IS NULL) use a separate partial unique on (tenant_id, slug)
-- because PostgreSQL UNIQUE treats NULLs as distinct.
-- Apply after 000038_audit_logs_expand.sql.

-- Non-root: unique among siblings under the same parent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_tenant_parent_slug
  ON app.categories (tenant_id, parent_id, slug)
  WHERE parent_id IS NOT NULL;

-- Root: unique among root-level categories in the tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_tenant_root_slug
  ON app.categories (tenant_id, slug)
  WHERE parent_id IS NULL;
