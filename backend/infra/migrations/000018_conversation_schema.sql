-- Conversation schema + RLS (BE-CON-001).
-- Apply after 000017_channel_schema.sql
-- Design: docs/data/data-dictionary.md (Conversation) + docs/data/ERD.md §6 + blueprint §7.10.4–7.10.7.
--
-- `conversations` stores 5 independent state dimensions — do not collapse to a single status enum.
-- `conversation_assignments` is append-only assignment history; current assignee denormalized on conversations.
-- `messages` unique external identity per tenant/channel_account/external_message_id.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.conversations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  channel_account_id UUID NULL,
  customer_id UUID NULL,
  external_thread_id TEXT NOT NULL CHECK (char_length(btrim(external_thread_id)) > 0),
  lifecycle_status TEXT NOT NULL DEFAULT 'new'
    CHECK (lifecycle_status IN ('new', 'open', 'resolved', 'archived')),
  waiting_on TEXT NOT NULL DEFAULT 'none'
    CHECK (waiting_on IN ('none', 'customer', 'staff')),
  sales_stage TEXT NOT NULL DEFAULT 'none'
    CHECK (sales_stage IN ('none', 'qualified', 'order_draft', 'order_confirmed')),
  escalation_status TEXT NOT NULL DEFAULT 'normal'
    CHECK (escalation_status IN ('normal', 'escalated')),
  ai_mode TEXT NOT NULL DEFAULT 'copilot'
    CHECK (ai_mode IN ('off', 'copilot', 'semi_auto', 'autopilot', 'human_takeover')),
  assignee_member_id UUID NULL,
  lead_score INT NULL CHECK (lead_score IS NULL OR (lead_score >= 0 AND lead_score <= 100)),
  lead_score_rule_version TEXT NULL,
  lead_score_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  sla_due_at TIMESTAMPTZ NULL,
  sla_breached_at TIMESTAMPTZ NULL,
  last_inbound_at TIMESTAMPTZ NULL,
  last_outbound_at TIMESTAMPTZ NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT conversations_channel_account_fk
    FOREIGN KEY (channel_account_id, tenant_id)
    REFERENCES app.channel_accounts (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_id_tenant
  ON app.conversations (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_tenant_channel_thread
  ON app.conversations (tenant_id, channel_account_id, external_thread_id)
  WHERE channel_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_lifecycle_updated
  ON app.conversations (tenant_id, lifecycle_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_assignee
  ON app.conversations (tenant_id, assignee_member_id, updated_at DESC)
  WHERE assignee_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_sla_due
  ON app.conversations (tenant_id, sla_due_at)
  WHERE sla_due_at IS NOT NULL AND sla_breached_at IS NULL;

CREATE TABLE IF NOT EXISTS app.messages (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  external_message_id TEXT NULL,
  sender_identity TEXT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  body_redacted TEXT NULL,
  reply_to_message_id UUID NULL,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  delivery_status TEXT NULL,
  sent_at TIMESTAMPTZ NULL,
  received_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT messages_conversation_fk
    FOREIGN KEY (conversation_id, tenant_id)
    REFERENCES app.conversations (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_id_tenant
  ON app.messages (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_tenant_external
  ON app.messages (tenant_id, conversation_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_tenant_conversation_created
  ON app.messages (tenant_id, conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.message_attachments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  message_id UUID NOT NULL,
  object_key TEXT NOT NULL CHECK (char_length(btrim(object_key)) > 0),
  provider_url_ref TEXT NULL,
  checksum TEXT NULL,
  mime_type TEXT NULL,
  size_bytes BIGINT NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  malware_scan_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (malware_scan_state IN ('pending', 'clean', 'infected', 'failed')),
  thumbnail_object_key TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT message_attachments_message_fk
    FOREIGN KEY (message_id, tenant_id)
    REFERENCES app.messages (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_attachments_id_tenant
  ON app.message_attachments (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_message_attachments_tenant_message
  ON app.message_attachments (tenant_id, message_id);

CREATE TABLE IF NOT EXISTS app.conversation_assignments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  assignee_member_id UUID NOT NULL,
  assigned_by UUID NULL,
  unassigned_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT conversation_assignments_conversation_fk
    FOREIGN KEY (conversation_id, tenant_id)
    REFERENCES app.conversations (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_assignments_tenant_conversation
  ON app.conversation_assignments (tenant_id, conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.conversation_notes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  author_member_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) > 0),
  classification TEXT NOT NULL DEFAULT 'internal'
    CHECK (classification IN ('internal', 'handoff', 'escalation')),
  visibility TEXT NOT NULL DEFAULT 'team'
    CHECK (visibility IN ('team', 'assignee', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT conversation_notes_conversation_fk
    FOREIGN KEY (conversation_id, tenant_id)
    REFERENCES app.conversations (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_tenant_conversation
  ON app.conversation_notes (tenant_id, conversation_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A, docs/data/rls-intent-catalog.md)
-- ---------------------------------------------------------------------------

ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_isolation ON app.conversations;
CREATE POLICY conversations_isolation ON app.conversations
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_isolation ON app.messages;
CREATE POLICY messages_isolation ON app.messages
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.message_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_attachments_isolation ON app.message_attachments;
CREATE POLICY message_attachments_isolation ON app.message_attachments
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.conversation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversation_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_assignments_isolation ON app.conversation_assignments;
CREATE POLICY conversation_assignments_isolation ON app.conversation_assignments
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.conversation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversation_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_notes_isolation ON app.conversation_notes;
CREATE POLICY conversation_notes_isolation ON app.conversation_notes
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.conversations TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.messages TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.message_attachments TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.conversation_assignments TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.conversation_notes TO app_runtime, app_worker;
