-- Refresh family rotation + reuse revoke (BE-IDN-005).
-- Apply after 000006_oidc_bff.sql.

CREATE OR REPLACE FUNCTION app.refresh_rotate_family(
  p_presented_hash TEXT,
  p_new_refresh_id UUID,
  p_new_token_hash TEXT,
  p_new_expires TIMESTAMPTZ,
  p_audit_id UUID,
  p_correlation_id TEXT
) RETURNS TABLE (
  outcome TEXT,
  user_id UUID,
  tenant_id UUID,
  membership_id UUID,
  session_id UUID,
  device_id UUID,
  session_version BIGINT,
  session_expires_at TIMESTAMPTZ,
  display_name TEXT,
  user_locale TEXT,
  tenant_name TEXT,
  tenant_currency CHAR(3),
  tenant_timezone TEXT,
  device_trusted BOOLEAN,
  permissions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_rt app.refresh_tokens%ROWTYPE;
  v_session app.user_sessions%ROWTYPE;
  v_display_name TEXT;
  v_locale TEXT;
  v_tenant_name TEXT;
  v_currency CHAR(3);
  v_timezone TEXT;
  v_trusted BOOLEAN;
  v_perms TEXT[];
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

  IF NOT FOUND
     OR v_session.revoked = true
     OR v_session.absolute_expiry <= now()
     OR v_rt.revoked_at IS NOT NULL
     OR v_rt.expires_at <= now()
  THEN
    outcome := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Already used → fail-closed family revoke (reuse / concurrent loser after winner).
  IF v_rt.used_at IS NOT NULL THEN
    UPDATE app.refresh_tokens
    SET revoked_at = COALESCE(revoked_at, now()),
        reuse_detected_at = COALESCE(reuse_detected_at, now())
    WHERE family_id = v_rt.family_id
      AND revoked_at IS NULL;

    UPDATE app.user_sessions
    SET revoked = true,
        revoked_at = COALESCE(revoked_at, now())
    WHERE id = v_rt.session_id
      AND revoked = false;

    INSERT INTO app.audit_events (
      id, tenant_id, action, actor_id, correlation_id, payload
    ) VALUES (
      p_audit_id,
      COALESCE(v_rt.tenant_id, v_session.tenant_id),
      'auth.refresh.reuse',
      v_rt.user_id,
      COALESCE(p_correlation_id, ''),
      jsonb_build_object('family_id', v_rt.family_id, 'outcome', 'revoked')
    );

    outcome := 'reused';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE app.refresh_tokens
  SET used_at = now()
  WHERE id = v_rt.id;

  INSERT INTO app.refresh_tokens (
    id, session_id, user_id, tenant_id, token_hash, family_id, parent_id, expires_at
  ) VALUES (
    p_new_refresh_id,
    v_rt.session_id,
    v_rt.user_id,
    v_rt.tenant_id,
    p_new_token_hash,
    v_rt.family_id,
    v_rt.id,
    p_new_expires
  );

  UPDATE app.user_sessions
  SET last_seen_at = now(),
      version = version + 1
  WHERE id = v_rt.session_id
  RETURNING * INTO v_session;

  SELECT COALESCE(tm.display_name, split_part(u.primary_email::text, '@', 1)),
         u.locale,
         t.name,
         t.currency,
         t.timezone,
         COALESCE(d.trusted, false)
    INTO v_display_name, v_locale, v_tenant_name, v_currency, v_timezone, v_trusted
  FROM app.users u
  JOIN app.tenants t ON t.id = v_session.tenant_id
  LEFT JOIN app.tenant_memberships tm ON tm.id = v_session.membership_id
  LEFT JOIN app.devices d ON d.id = v_session.device_id
  WHERE u.id = v_session.user_id;

  SELECT COALESCE(array_agg(DISTINCT rp.permission_key ORDER BY rp.permission_key), ARRAY[]::TEXT[])
    INTO v_perms
  FROM app.membership_roles mr
  JOIN app.role_permissions rp ON rp.role_id = mr.role_id
  WHERE mr.membership_id = v_session.membership_id
    AND mr.tenant_id = v_session.tenant_id;

  INSERT INTO app.audit_events (
    id, tenant_id, action, actor_id, correlation_id, payload
  ) VALUES (
    p_audit_id,
    v_session.tenant_id,
    'auth.refresh.rotate',
    v_session.user_id,
    COALESCE(p_correlation_id, ''),
    jsonb_build_object('family_id', v_rt.family_id, 'session_id', v_session.id)
  );

  outcome := 'rotated';
  user_id := v_session.user_id;
  tenant_id := v_session.tenant_id;
  membership_id := v_session.membership_id;
  session_id := v_session.id;
  device_id := v_session.device_id;
  session_version := v_session.version;
  session_expires_at := v_session.absolute_expiry;
  display_name := v_display_name;
  user_locale := v_locale;
  tenant_name := v_tenant_name;
  tenant_currency := v_currency;
  tenant_timezone := v_timezone;
  device_trusted := v_trusted;
  permissions := v_perms;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION app.refresh_rotate_family(TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_rotate_family(TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) TO app_runtime, app_worker;

-- Current refresh only: used (rotated-away) parents must not resolve /me.
CREATE OR REPLACE FUNCTION app.oidc_resolve_session_by_refresh_hash(p_token_hash TEXT)
RETURNS TABLE (
  user_id UUID,
  tenant_id UUID,
  membership_id UUID,
  session_id UUID,
  device_id UUID,
  session_version BIGINT,
  session_expires_at TIMESTAMPTZ,
  display_name TEXT,
  user_locale TEXT,
  tenant_name TEXT,
  tenant_currency CHAR(3),
  tenant_timezone TEXT,
  device_trusted BOOLEAN,
  permissions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.user_id,
    s.tenant_id,
    s.membership_id,
    s.id,
    s.device_id,
    s.version,
    s.absolute_expiry,
    COALESCE(tm.display_name, split_part(u.primary_email::text, '@', 1)),
    u.locale,
    t.name,
    t.currency,
    t.timezone,
    COALESCE(d.trusted, false),
    COALESCE((
      SELECT array_agg(DISTINCT rp.permission_key ORDER BY rp.permission_key)
      FROM app.membership_roles mr
      JOIN app.role_permissions rp ON rp.role_id = mr.role_id
      WHERE mr.membership_id = s.membership_id AND mr.tenant_id = s.tenant_id
    ), ARRAY[]::TEXT[])
  FROM app.refresh_tokens rt
  JOIN app.user_sessions s ON s.id = rt.session_id
  JOIN app.users u ON u.id = s.user_id
  JOIN app.tenants t ON t.id = s.tenant_id
  LEFT JOIN app.tenant_memberships tm ON tm.id = s.membership_id
  LEFT JOIN app.devices d ON d.id = s.device_id
  WHERE rt.token_hash = p_token_hash
    AND rt.revoked_at IS NULL
    AND rt.used_at IS NULL
    AND rt.expires_at > now()
    AND s.revoked = false
    AND s.absolute_expiry > now()
  LIMIT 1;
END;
$$;
