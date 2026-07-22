-- Logout / session / device revoke (BE-IDN-006).
-- Apply after 000007_refresh_rotation.sql.
-- Emits outbox com.aisales.identity.session-revoked.v1 for SSE close / poll hooks.

CREATE OR REPLACE FUNCTION app.identity_revoke_current_session(
  p_presented_hash TEXT,
  p_audit_id UUID,
  p_outbox_id UUID,
  p_correlation_id TEXT,
  p_reason TEXT
) RETURNS TABLE (
  outcome TEXT,
  session_id UUID,
  user_id UUID,
  tenant_id UUID,
  device_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_rt app.refresh_tokens%ROWTYPE;
  v_session app.user_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_rt
  FROM app.refresh_tokens
  WHERE token_hash = p_presented_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    outcome := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_session
  FROM app.user_sessions
  WHERE id = v_rt.session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    outcome := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_session.revoked THEN
    outcome := 'already_revoked';
    session_id := v_session.id;
    user_id := v_session.user_id;
    tenant_id := v_session.tenant_id;
    device_id := v_session.device_id;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE app.refresh_tokens
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE family_id = v_rt.family_id
    AND revoked_at IS NULL;

  UPDATE app.user_sessions
  SET revoked = true,
      revoked_at = now()
  WHERE id = v_session.id;

  INSERT INTO app.audit_events (id, tenant_id, action, actor_id, correlation_id, payload)
  VALUES (
    p_audit_id,
    COALESCE(v_session.tenant_id, '00000000-0000-7000-8000-000000000000'::uuid),
    'auth.logout',
    v_session.user_id,
    COALESCE(p_correlation_id, ''),
    jsonb_build_object('session_id', v_session.id, 'reason', p_reason)
  );

  IF v_session.tenant_id IS NOT NULL THEN
    INSERT INTO app.outbox_events (
      id, tenant_id, event_type, aggregate_type, aggregate_id, payload, correlation_id
    ) VALUES (
      p_outbox_id,
      v_session.tenant_id,
      'com.aisales.identity.session-revoked.v1',
      'session',
      v_session.id,
      jsonb_build_object(
        'session_id', v_session.id,
        'user_id', v_session.user_id,
        'device_id', v_session.device_id,
        'reason', p_reason,
        'close_sse', true
      ),
      COALESCE(p_correlation_id, '')
    );
  END IF;

  outcome := 'revoked';
  session_id := v_session.id;
  user_id := v_session.user_id;
  tenant_id := v_session.tenant_id;
  device_id := v_session.device_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.identity_revoke_session_by_id(
  p_actor_user_id UUID,
  p_session_id UUID,
  p_audit_id UUID,
  p_outbox_id UUID,
  p_correlation_id TEXT
) RETURNS TABLE (outcome TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_session app.user_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM app.user_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.user_id <> p_actor_user_id THEN
    outcome := 'not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_session.revoked THEN
    outcome := 'already_revoked';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE app.refresh_tokens
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE session_id = v_session.id
    AND revoked_at IS NULL;

  UPDATE app.user_sessions
  SET revoked = true,
      revoked_at = now()
  WHERE id = v_session.id;

  INSERT INTO app.audit_events (id, tenant_id, action, actor_id, correlation_id, payload)
  VALUES (
    p_audit_id,
    COALESCE(v_session.tenant_id, '00000000-0000-7000-8000-000000000000'::uuid),
    'auth.session.revoke',
    p_actor_user_id,
    COALESCE(p_correlation_id, ''),
    jsonb_build_object('session_id', v_session.id)
  );

  IF v_session.tenant_id IS NOT NULL THEN
    INSERT INTO app.outbox_events (
      id, tenant_id, event_type, aggregate_type, aggregate_id, payload, correlation_id
    ) VALUES (
      p_outbox_id,
      v_session.tenant_id,
      'com.aisales.identity.session-revoked.v1',
      'session',
      v_session.id,
      jsonb_build_object(
        'session_id', v_session.id,
        'user_id', v_session.user_id,
        'device_id', v_session.device_id,
        'reason', 'session_revoke',
        'close_sse', true
      ),
      COALESCE(p_correlation_id, '')
    );
  END IF;

  outcome := 'revoked';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.identity_revoke_device(
  p_actor_user_id UUID,
  p_device_id UUID,
  p_audit_id UUID,
  p_correlation_id TEXT
) RETURNS TABLE (outcome TEXT, sessions_revoked INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_device app.devices%ROWTYPE;
  v_session RECORD;
  v_count INT := 0;
  v_outbox_id UUID;
BEGIN
  SELECT * INTO v_device
  FROM app.devices
  WHERE id = p_device_id
  FOR UPDATE;

  IF NOT FOUND OR v_device.user_id <> p_actor_user_id THEN
    outcome := 'not_found';
    sessions_revoked := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_device.revoked_at IS NOT NULL THEN
    outcome := 'already_revoked';
    sessions_revoked := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE app.devices
  SET revoked_at = now(),
      trust_status = 'revoked',
      updated_at = now()
  WHERE id = v_device.id;

  FOR v_session IN
    SELECT * FROM app.user_sessions
    WHERE device_id = v_device.id AND revoked = false
    FOR UPDATE
  LOOP
    UPDATE app.refresh_tokens
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE session_id = v_session.id AND revoked_at IS NULL;

    UPDATE app.user_sessions
    SET revoked = true, revoked_at = now()
    WHERE id = v_session.id;

    v_count := v_count + 1;

    IF v_session.tenant_id IS NOT NULL THEN
      v_outbox_id := gen_random_uuid();
      INSERT INTO app.outbox_events (
        id, tenant_id, event_type, aggregate_type, aggregate_id, payload, correlation_id
      ) VALUES (
        v_outbox_id,
        v_session.tenant_id,
        'com.aisales.identity.session-revoked.v1',
        'session',
        v_session.id,
        jsonb_build_object(
          'session_id', v_session.id,
          'user_id', v_session.user_id,
          'device_id', v_device.id,
          'reason', 'device_revoke',
          'close_sse', true
        ),
        COALESCE(p_correlation_id, '')
      );
    END IF;
  END LOOP;

  INSERT INTO app.audit_events (id, tenant_id, action, actor_id, correlation_id, payload)
  VALUES (
    p_audit_id,
    '00000000-0000-7000-8000-000000000000'::uuid,
    'auth.device.revoke',
    p_actor_user_id,
    COALESCE(p_correlation_id, ''),
    jsonb_build_object('device_id', v_device.id, 'sessions_revoked', v_count)
  );

  outcome := 'revoked';
  sessions_revoked := v_count;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.identity_list_devices(p_actor_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  platform TEXT,
  label TEXT,
  trusted BOOLEAN,
  trust_status TEXT,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT d.id, d.user_id, d.platform, d.label, d.trusted, d.trust_status,
         d.created_at, d.last_seen_at, d.revoked_at
  FROM app.devices d
  WHERE d.user_id = p_actor_user_id
  ORDER BY d.created_at DESC;
$$;

REVOKE ALL ON FUNCTION app.identity_revoke_current_session(TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.identity_revoke_session_by_id(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.identity_revoke_device(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.identity_list_devices(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.identity_revoke_current_session(TEXT, UUID, UUID, TEXT, TEXT) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.identity_revoke_session_by_id(UUID, UUID, UUID, UUID, TEXT) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.identity_revoke_device(UUID, UUID, UUID, TEXT) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.identity_list_devices(UUID) TO app_runtime, app_worker;
