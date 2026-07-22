-- Knowledge schema + RLS (BE-KNW-001).
-- Apply after 000015_inventory_schema.sql
-- Design: docs/data/data-dictionary.md (Knowledge) + docs/data/rls-intent-catalog.md
--         + blueprint §7.9 + §10.5.
--
-- `knowledge_source_versions` is an immutable content revision per source; lifecycle
-- draft → in_review → approved → published → archived.
-- `knowledge_chunks` are tenant-scoped retrieval units; queries MUST filter tenant +
-- published/effective version (blueprint §7.9.2 / §4.3.7).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.knowledge_sources (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('url', 'upload', 'manual')),
  uri TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_sources_id_tenant
  ON app.knowledge_sources (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_tenant_name
  ON app.knowledge_sources (tenant_id, name);

CREATE TABLE IF NOT EXISTS app.knowledge_source_versions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  source_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  body_markdown TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'archived')),
  content_checksum TEXT NULL,
  effective_from TIMESTAMPTZ NULL,
  effective_to TIMESTAMPTZ NULL,
  approved_by UUID NULL,
  published_by UUID NULL,
  ingestion_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ingestion_status IN ('pending', 'queued', 'running', 'completed', 'failed')),
  chunk_count INT NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  ingestion_error TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT knowledge_source_versions_source_fk
    FOREIGN KEY (source_id, tenant_id)
    REFERENCES app.knowledge_sources (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_source_versions_id_tenant
  ON app.knowledge_source_versions (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_source_versions_tenant_source
  ON app.knowledge_source_versions (tenant_id, source_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_source_versions_tenant_status
  ON app.knowledge_source_versions (tenant_id, status);

-- One published version effective per source at a time (blueprint §7.9.1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_source_versions_tenant_source_published
  ON app.knowledge_source_versions (tenant_id, source_id)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS app.knowledge_chunks (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  source_id UUID NOT NULL,
  version_id UUID NOT NULL,
  chunk_index INT NOT NULL CHECK (chunk_index >= 0),
  content_text TEXT NOT NULL CHECK (char_length(btrim(content_text)) > 0),
  content_checksum TEXT NOT NULL CHECK (char_length(btrim(content_checksum)) > 0),
  embedding_model TEXT NULL,
  embedding_version TEXT NULL,
  embedding_stub JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_count INT NULL CHECK (token_count IS NULL OR token_count >= 0),
  language TEXT NULL,
  effective_from TIMESTAMPTZ NULL,
  effective_to TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT knowledge_chunks_version_fk
    FOREIGN KEY (version_id, tenant_id)
    REFERENCES app.knowledge_source_versions (id, tenant_id),
  CONSTRAINT knowledge_chunks_source_fk
    FOREIGN KEY (source_id, tenant_id)
    REFERENCES app.knowledge_sources (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_chunks_id_tenant
  ON app.knowledge_chunks (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_chunks_version_index
  ON app.knowledge_chunks (version_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_version
  ON app.knowledge_chunks (tenant_id, version_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_source
  ON app.knowledge_chunks (tenant_id, source_id);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A, docs/data/rls-intent-catalog.md)
-- ---------------------------------------------------------------------------

ALTER TABLE app.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.knowledge_sources FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_sources_isolation ON app.knowledge_sources;
CREATE POLICY knowledge_sources_isolation ON app.knowledge_sources
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.knowledge_source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.knowledge_source_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_source_versions_isolation ON app.knowledge_source_versions;
CREATE POLICY knowledge_source_versions_isolation ON app.knowledge_source_versions
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.knowledge_chunks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_chunks_isolation ON app.knowledge_chunks;
CREATE POLICY knowledge_chunks_isolation ON app.knowledge_chunks
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.knowledge_sources TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.knowledge_source_versions TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.knowledge_chunks TO app_runtime, app_worker;
