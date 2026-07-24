-- Restore oidc_establish_session_after_mfa body from 000009 with PG17 variable_conflict fix.
CREATE OR REPLACE FUNCTION app.oidc_establish_session_after_mfa(
  p_user_id UUID,
  p_tenant_hint TEXT,
  p_display_name TEXT,
  p_session_id UUID,
  p_refresh_id UUID,
  p_device_id UUID,
  p_refresh_token_hash TEXT,
  p_family_id UUID,
  p_absolute_expiry TIMESTAMPTZ,
  p_refresh_expires TIMESTAMPTZ,
  p_correlation_id TEXT,
  p_audit_id UUID
) RETURNS TABLE (
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
  tenant_currency TEXT,
  tenant_timezone TEXT,
  permissions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_membership_id UUID;
  v_tenant_id UUID;
  v_display_name TEXT;
  v_locale TEXT;
  v_tenant_name TEXT;
  v_currency TEXT;
  v_timezone TEXT;
  v_permissions TEXT[];
BEGIN
  IF p_tenant_hint IS NOT NULL AND length(btrim(p_tenant_hint)) > 0 THEN
    SELECT tm.id, tm.tenant_id, COALESCE(tm.display_name, p_display_name, split_part(u.primary_email, '@', 1)),
           u.locale, t.name, t.currency, t.timezone
      INTO v_membership_id, v_tenant_id, v_display_name, v_locale, v_tenant_name, v_currency, v_timezone
    FROM app.tenant_memberships tm
    JOIN app.tenants t ON t.id = tm.tenant_id
    JOIN app.users u ON u.id = tm.user_id
    WHERE tm.user_id = p_user_id
      AND tm.status = 'active'
      AND t.status = 'active'
      AND lower(t.code::text) = lower(p_tenant_hint)
    LIMIT 1;
  END IF;

  IF v_membership_id IS NULL THEN
    SELECT tm.id, tm.tenant_id, COALESCE(tm.display_name, p_display_name, split_part(u.primary_email, '@', 1)),
           u.locale, t.name, t.currency, t.timezone
      INTO v_membership_id, v_tenant_id, v_display_name, v_locale, v_tenant_name, v_currency, v_timezone
    FROM app.tenant_memberships tm
    JOIN app.tenants t ON t.id = tm.tenant_id
    JOIN app.users u ON u.id = tm.user_id
    WHERE tm.user_id = p_user_id
      AND tm.status = 'active'
      AND t.status = 'active'
    ORDER BY tm.activated_at NULLS LAST, tm.created_at
    LIMIT 1;
  END IF;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'OIDC_NO_MEMBERSHIP' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
    INTO v_permissions
  FROM app.membership_roles mr
  JOIN app.role_permissions rp ON rp.role_id = mr.role_id AND rp.tenant_id = mr.tenant_id
  JOIN app.permissions p ON p.key = rp.permission_key
  WHERE mr.membership_id = v_membership_id;

  INSERT INTO app.devices (
    id, user_id, platform, label, trusted, trust_status, last_seen_at
  ) VALUES (
    p_device_id, p_user_id, 'web', 'Web Admin', false, 'pending', now()
  );

  INSERT INTO app.user_sessions (
    id, user_id, tenant_id, membership_id, device_id,
    absolute_expiry, revoked, auth_methods, metadata
  ) VALUES (
    p_session_id, p_user_id, v_tenant_id, v_membership_id, p_device_id,
    p_absolute_expiry, false, ARRAY['oidc','mfa']::TEXT[],
    jsonb_build_object('last_mfa_at', now())
  );

  INSERT INTO app.refresh_tokens (
    id, session_id, user_id, tenant_id, token_hash, family_id, expires_at
  ) VALUES (
    p_refresh_id, p_session_id, p_user_id, v_tenant_id, p_refresh_token_hash, p_family_id, p_refresh_expires
  );

  INSERT INTO app.audit_events (
    id, tenant_id, action, actor_id, correlation_id, payload
  ) VALUES (
    p_audit_id, v_tenant_id, 'auth.mfa.verify', p_user_id, COALESCE(p_correlation_id, ''),
    jsonb_build_object('session_id', p_session_id, 'purpose', 'login')
  );

  user_id := p_user_id;
  tenant_id := v_tenant_id;
  membership_id := v_membership_id;
  session_id := p_session_id;
  device_id := p_device_id;
  session_version := 1;
  session_expires_at := p_absolute_expiry;
  display_name := v_display_name;
  user_locale := v_locale;
  tenant_name := v_tenant_name;
  tenant_currency := v_currency;
  tenant_timezone := v_timezone;
  permissions := v_permissions;
  RETURN NEXT;
END;
$$;
