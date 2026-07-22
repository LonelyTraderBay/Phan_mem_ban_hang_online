-- Channel schema + RLS (BE-CHN-002).
-- Apply after 000016_knowledge_schema.sql
-- Design: docs/data/data-dictionary.md (Channel) + blueprint §7.10 + §10.6–10.7.
--
-- `channel_credentials` stores vault refs only — never raw provider tokens in API/DTO.
-- `webhook_events` is append-oriented ingress ledger with dedupe per provider/account/event.
-- `outbound_messages` + `outbound_delivery_attempts` model send lifecycle (§10.7).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.channel_accounts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  provider TEXT NOT NULL CHECK (char_length(btrim(provider)) > 0),
  external_account_id TEXT NOT NULL CHECK (char_length(btrim(external_account_id)) > 0),
  display_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'connecting'
    CHECK (status IN ('connecting', 'active', 'degraded', 'disconnected', 'revoked')),
  health TEXT NULL CHECK (health IS NULL OR health IN ('ok', 'warn', 'error')),
  granted_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  credential_id UUID NULL,
  token_expires_at TIMESTAMPTZ NULL,
  last_sync_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_accounts_id_tenant
  ON app.channel_accounts (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_accounts_tenant_provider_external
  ON app.channel_accounts (tenant_id, provider, external_account_id);

CREATE INDEX IF NOT EXISTS idx_channel_accounts_tenant_status
  ON app.channel_accounts (tenant_id, status);

CREATE TABLE IF NOT EXISTS app.channel_credentials (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  channel_account_id UUID NOT NULL,
  vault_ref TEXT NOT NULL CHECK (char_length(btrim(vault_ref)) > 0),
  key_version TEXT NULL,
  encrypted_envelope JSONB NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT channel_credentials_account_fk
    FOREIGN KEY (channel_account_id, tenant_id)
    REFERENCES app.channel_accounts (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_credentials_id_tenant
  ON app.channel_credentials (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_channel_credentials_tenant_account
  ON app.channel_credentials (tenant_id, channel_account_id);

ALTER TABLE app.channel_accounts
  DROP CONSTRAINT IF EXISTS channel_accounts_credential_fk;

ALTER TABLE app.channel_accounts
  ADD CONSTRAINT channel_accounts_credential_fk
    FOREIGN KEY (credential_id, tenant_id)
    REFERENCES app.channel_credentials (id, tenant_id);

CREATE TABLE IF NOT EXISTS app.channel_oauth_states (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.tenants (id),
  provider TEXT NOT NULL CHECK (char_length(btrim(provider)) > 0),
  state_token TEXT NOT NULL CHECK (char_length(btrim(state_token)) > 0),
  code_verifier_hash TEXT NULL,
  redirect_return_path TEXT NULL,
  channel_account_id UUID NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT channel_oauth_states_account_fk
    FOREIGN KEY (channel_account_id, tenant_id)
    REFERENCES app.channel_accounts (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_oauth_states_state_token
  ON app.channel_oauth_states (state_token);

CREATE INDEX IF NOT EXISTS idx_channel_oauth_states_tenant_provider
  ON app.channel_oauth_states (tenant_id, provider, expires_at);

CREATE TABLE IF NOT EXISTS app.webhook_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NULL REFERENCES app.tenants (id),
  channel_account_id UUID NULL,
  provider TEXT NOT NULL CHECK (char_length(btrim(provider)) > 0),
  external_event_id TEXT NOT NULL CHECK (char_length(btrim(external_event_id)) > 0),
  event_type TEXT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  payload_digest TEXT NOT NULL CHECK (char_length(btrim(payload_digest)) > 0),
  payload_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers_allowlist JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'normalized', 'failed', 'reprocessed', 'dead_letter')),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  normalized_entity_id UUID NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT webhook_events_account_fk
    FOREIGN KEY (channel_account_id, tenant_id)
    REFERENCES app.channel_accounts (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_id_tenant
  ON app.webhook_events (id, tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_dedupe
  ON app.webhook_events (
    provider,
    COALESCE(channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    external_event_id
  );

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant_status_received
  ON app.webhook_events (tenant_id, status, received_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.outbound_messages (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  channel_account_id UUID NOT NULL,
  client_message_id TEXT NULL,
  idempotency_key TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'blocked', 'failed', 'cancelled')),
  content_type TEXT NOT NULL DEFAULT 'text',
  content_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id TEXT NULL,
  blocked_reason TEXT NULL,
  scheduled_at TIMESTAMPTZ NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT outbound_messages_account_fk
    FOREIGN KEY (channel_account_id, tenant_id)
    REFERENCES app.channel_accounts (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_messages_id_tenant
  ON app.outbound_messages (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_messages_tenant_idempotency
  ON app.outbound_messages (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_messages_tenant_status_scheduled
  ON app.outbound_messages (tenant_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS app.outbound_delivery_attempts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  outbound_message_id UUID NOT NULL,
  attempt_number INT NOT NULL CHECK (attempt_number >= 1),
  provider_request_id TEXT NULL,
  response_class TEXT NULL,
  latency_ms INT NULL CHECK (latency_ms IS NULL OR latency_ms >= 0),
  retry_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT outbound_delivery_attempts_message_fk
    FOREIGN KEY (outbound_message_id, tenant_id)
    REFERENCES app.outbound_messages (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_outbound_delivery_attempts_tenant_message
  ON app.outbound_delivery_attempts (tenant_id, outbound_message_id, attempt_number);

-- ---------------------------------------------------------------------------
-- RLS (TENANT_OWNED — template A, docs/data/rls-intent-catalog.md)
-- ---------------------------------------------------------------------------

ALTER TABLE app.channel_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.channel_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_accounts_isolation ON app.channel_accounts;
CREATE POLICY channel_accounts_isolation ON app.channel_accounts
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.channel_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.channel_credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_credentials_isolation ON app.channel_credentials;
CREATE POLICY channel_credentials_isolation ON app.channel_credentials
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.channel_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.channel_oauth_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_oauth_states_isolation ON app.channel_oauth_states;
CREATE POLICY channel_oauth_states_isolation ON app.channel_oauth_states
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_events_isolation ON app.webhook_events;
CREATE POLICY webhook_events_isolation ON app.webhook_events
  FOR ALL TO app_runtime, app_worker
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE app.outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbound_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbound_messages_isolation ON app.outbound_messages;
CREATE POLICY outbound_messages_isolation ON app.outbound_messages
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app.outbound_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbound_delivery_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbound_delivery_attempts_isolation ON app.outbound_delivery_attempts;
CREATE POLICY outbound_delivery_attempts_isolation ON app.outbound_delivery_attempts
  FOR ALL TO app_runtime, app_worker
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.channel_accounts TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.channel_credentials TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.channel_oauth_states TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.webhook_events TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.outbound_messages TO app_runtime, app_worker;
GRANT SELECT, INSERT ON app.outbound_delivery_attempts TO app_runtime, app_worker;
