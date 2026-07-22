-- Switch tenant binds session.tenant_id (BE-IDN-009).
-- Apply after 000009_password_reset_mfa_challenges.sql.

CREATE OR REPLACE FUNCTION app.session_switch_tenant(
  p_token_hash TEXT,
  p_target_tenant_id UUID,
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
  v_membership app.tenant_memberships%ROWTYPE;
  v_tenant app.tenants%ROWTYPE;
  v_user app.users%ROWTYPE;
  v_display_name TEXT;
  v_permissions TEXT[];
BEGIN
  SELECT * INTO v_rt
  FROM app.refresh_tokens
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_rt.revoked_at IS NOT NULL
     OR v_rt.used_at IS NOT NULL
     OR v_rt.expires_at <= now() THEN
    outcome := 'unauthorized';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_session
  FROM app.user_sessions
  WHERE id = v_rt.session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.revoked OR v_session.absolute_expiry <= now() THEN
    outcome := 'unauthorized';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_user FROM app.users WHERE id = v_session.user_id;
  IF NOT FOUND OR v_user.anonymized_at IS NOT NULL OR v_user.status <> 'active' THEN
    outcome := 'unauthorized';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_tenant FROM app.tenants WHERE id = p_target_tenant_id;
  IF NOT FOUND THEN
    outcome := 'tenant_context_invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_tenant.status <> 'active' THEN
    outcome := 'tenant_inactive';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_membership
  FROM app.tenant_memberships
  WHERE tenant_id = p_target_tenant_id
    AND user_id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    outcome := 'tenant_context_invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_membership.status <> 'active' THEN
    outcome := 'membership_inactive';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE app.user_sessions
  SET tenant_id = v_tenant.id,
      membership_id = v_membership.id,
      version = version + 1,
      last_seen_at = now()
  WHERE id = v_session.id
  RETURNING * INTO v_session;

  UPDATE app.refresh_tokens
  SET tenant_id = v_tenant.id
  WHERE family_id = v_rt.family_id
    AND revoked_at IS NULL;

  SELECT COALESCE(array_agg(DISTINCT rp.permission_key ORDER BY rp.permission_key), ARRAY[]::TEXT[])
    INTO v_permissions
  FROM app.membership_roles mr
  JOIN app.role_permissions rp ON rp.role_id = mr.role_id AND rp.tenant_id = mr.tenant_id
  WHERE mr.membership_id = v_membership.id;

  v_display_name := COALESCE(v_membership.display_name, split_part(v_user.primary_email::text, '@', 1));

  INSERT INTO app.audit_events (id, tenant_id, action, actor_id, correlation_id, payload)
  VALUES (
    p_audit_id,
    v_tenant.id,
    'auth.tenant.switch',
    v_session.user_id,
    COALESCE(p_correlation_id, ''),
    jsonb_build_object(
      'session_id', v_session.id,
      'from_tenant_id', v_rt.tenant_id,
      'to_tenant_id', v_tenant.id
    )
  );

  outcome := 'ok';
  user_id := v_session.user_id;
  tenant_id := v_tenant.id;
  membership_id := v_membership.id;
  session_id := v_session.id;
  device_id := v_session.device_id;
  session_version := v_session.version;
  session_expires_at := v_session.absolute_expiry;
  display_name := v_display_name;
  user_locale := v_user.locale;
  tenant_name := v_tenant.name;
  tenant_currency := v_tenant.currency;
  tenant_timezone := v_tenant.timezone;
  device_trusted := COALESCE((SELECT d.trusted FROM app.devices d WHERE d.id = v_session.device_id), false);
  permissions := v_permissions;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION app.session_switch_tenant(TEXT, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.session_switch_tenant(TEXT, UUID, UUID, TEXT) TO app_runtime, app_worker;
