-- Channel durable OAuth tenant resolve + null-tenant webhook dedupe (P4).
-- Tables already exist in 000017; this adds SECURITY DEFINER helpers so
-- consume/lookup work without process-local Maps or a known tenant GUC.
-- Apply after 000017_channel_schema.sql (and after 000029 if present).

-- ---------------------------------------------------------------------------
-- Resolve tenant for OAuth callback (state_token is globally unique).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.channel_resolve_oauth_tenant(p_state_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF p_state_token IS NULL OR char_length(btrim(p_state_token)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT s.tenant_id INTO v_tenant_id
  FROM app.channel_oauth_states s
  WHERE s.state_token = p_state_token
    AND s.consumed_at IS NULL
    AND s.expires_at > now()
  LIMIT 1;

  RETURN v_tenant_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Consume OAuth state by state_token + code_verifier_hash (atomic).
-- Returns consumed row or empty set when invalid/expired/already used.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.channel_consume_oauth_state(
  p_state_token TEXT,
  p_code_verifier_hash TEXT
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  provider TEXT,
  state_token TEXT,
  code_verifier_hash TEXT,
  redirect_return_path TEXT,
  channel_account_id UUID,
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF p_state_token IS NULL OR char_length(btrim(p_state_token)) = 0 THEN
    RETURN;
  END IF;
  IF p_code_verifier_hash IS NULL OR char_length(btrim(p_code_verifier_hash)) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE app.channel_oauth_states s
  SET consumed_at = now()
  WHERE s.state_token = p_state_token
    AND s.consumed_at IS NULL
    AND s.expires_at > now()
    AND s.code_verifier_hash = p_code_verifier_hash
  RETURNING
    s.id,
    s.tenant_id,
    s.provider,
    s.state_token,
    s.code_verifier_hash,
    s.redirect_return_path,
    s.channel_account_id,
    s.expires_at,
    s.consumed_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ensure webhook dedupe unique index exists (idempotent; also in 000017).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_dedupe
  ON app.webhook_events (
    provider,
    COALESCE(channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    external_event_id
  );

-- ---------------------------------------------------------------------------
-- Insert webhook event with dedupe (supports null tenant_id).
-- On unique conflict, returns existing row with out_duplicate = true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.channel_insert_webhook_event(
  p_id UUID,
  p_tenant_id UUID,
  p_channel_account_id UUID,
  p_provider TEXT,
  p_external_event_id TEXT,
  p_event_type TEXT,
  p_signature_valid BOOLEAN,
  p_payload_digest TEXT,
  p_payload_redacted JSONB
)
RETURNS TABLE (
  out_id UUID,
  out_tenant_id UUID,
  out_channel_account_id UUID,
  out_provider TEXT,
  out_external_event_id TEXT,
  out_event_type TEXT,
  out_signature_valid BOOLEAN,
  out_payload_digest TEXT,
  out_payload_redacted JSONB,
  out_status TEXT,
  out_attempt_count INT,
  out_next_retry_at TIMESTAMPTZ,
  out_error TEXT,
  out_normalized_entity_id UUID,
  out_received_at TIMESTAMPTZ,
  out_processed_at TIMESTAMPTZ,
  out_duplicate BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_row app.webhook_events%ROWTYPE;
BEGIN
  IF p_provider IS NULL OR char_length(btrim(p_provider)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: provider required';
  END IF;
  IF p_external_event_id IS NULL OR char_length(btrim(p_external_event_id)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: external_event_id required';
  END IF;
  IF p_payload_digest IS NULL OR char_length(btrim(p_payload_digest)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: payload_digest required';
  END IF;

  BEGIN
    INSERT INTO app.webhook_events (
      id, tenant_id, channel_account_id, provider, external_event_id, event_type,
      signature_valid, payload_digest, payload_redacted, status, attempt_count
    ) VALUES (
      p_id,
      p_tenant_id,
      p_channel_account_id,
      p_provider,
      p_external_event_id,
      p_event_type,
      coalesce(p_signature_valid, false),
      p_payload_digest,
      coalesce(p_payload_redacted, '{}'::jsonb),
      'received',
      0
    )
    RETURNING * INTO v_row;

    out_id := v_row.id;
    out_tenant_id := v_row.tenant_id;
    out_channel_account_id := v_row.channel_account_id;
    out_provider := v_row.provider;
    out_external_event_id := v_row.external_event_id;
    out_event_type := v_row.event_type;
    out_signature_valid := v_row.signature_valid;
    out_payload_digest := v_row.payload_digest;
    out_payload_redacted := v_row.payload_redacted;
    out_status := v_row.status;
    out_attempt_count := v_row.attempt_count;
    out_next_retry_at := v_row.next_retry_at;
    out_error := v_row.error;
    out_normalized_entity_id := v_row.normalized_entity_id;
    out_received_at := v_row.received_at;
    out_processed_at := v_row.processed_at;
    out_duplicate := false;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT w.* INTO v_row
      FROM app.webhook_events w
      WHERE w.provider = p_provider
        AND coalesce(w.channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(p_channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND w.external_event_id = p_external_event_id
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE;
      END IF;

      out_id := v_row.id;
      out_tenant_id := v_row.tenant_id;
      out_channel_account_id := v_row.channel_account_id;
      out_provider := v_row.provider;
      out_external_event_id := v_row.external_event_id;
      out_event_type := v_row.event_type;
      out_signature_valid := v_row.signature_valid;
      out_payload_digest := v_row.payload_digest;
      out_payload_redacted := v_row.payload_redacted;
      out_status := v_row.status;
      out_attempt_count := v_row.attempt_count;
      out_next_retry_at := v_row.next_retry_at;
      out_error := v_row.error;
      out_normalized_entity_id := v_row.normalized_entity_id;
      out_received_at := v_row.received_at;
      out_processed_at := v_row.processed_at;
      out_duplicate := true;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Find webhook by provider/account/external_event_id (null-tenant safe).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.channel_find_webhook_by_dedupe(
  p_provider TEXT,
  p_channel_account_id UUID,
  p_external_event_id TEXT
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  channel_account_id UUID,
  provider TEXT,
  external_event_id TEXT,
  event_type TEXT,
  signature_valid BOOLEAN,
  payload_digest TEXT,
  payload_redacted JSONB,
  status TEXT,
  attempt_count INT,
  next_retry_at TIMESTAMPTZ,
  error TEXT,
  normalized_entity_id UUID,
  received_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT
    w.id,
    w.tenant_id,
    w.channel_account_id,
    w.provider,
    w.external_event_id,
    w.event_type,
    w.signature_valid,
    w.payload_digest,
    w.payload_redacted,
    w.status,
    w.attempt_count,
    w.next_retry_at,
    w.error,
    w.normalized_entity_id,
    w.received_at,
    w.processed_at
  FROM app.webhook_events w
  WHERE w.provider = p_provider
    AND coalesce(w.channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND w.external_event_id = p_external_event_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app.channel_resolve_oauth_tenant(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.channel_consume_oauth_state(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.channel_insert_webhook_event(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.channel_find_webhook_by_dedupe(TEXT, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.channel_resolve_oauth_tenant(TEXT)
  TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.channel_consume_oauth_state(TEXT, TEXT)
  TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.channel_insert_webhook_event(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB
) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.channel_find_webhook_by_dedupe(TEXT, UUID, TEXT)
  TO app_runtime, app_worker;
