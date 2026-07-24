-- Fix oidc_establish_session*: RETURNS TABLE columns (user_id, tenant_id, …)
-- shadowed table columns on PostgreSQL 17 (same class of bug as 000031).
CREATE OR REPLACE FUNCTION app.oidc_establish_session(
  p_provider TEXT,
  p_subject TEXT,
  p_email TEXT,
  p_email_verified BOOLEAN,
  p_display_name TEXT,
  p_tenant_hint TEXT,
  p_user_id UUID,
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
  tenant_currency CHAR(3),
  tenant_timezone TEXT,
  mfa_required BOOLEAN,
  permissions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_membership_id UUID;
  v_display_name TEXT;
  v_locale TEXT;
  v_tenant_name TEXT;
  v_currency CHAR(3);
  v_timezone TEXT;
  v_mfa_required BOOLEAN;
  v_perms TEXT[];
BEGIN
  SELECT uc.user_id INTO v_user_id
  FROM app.user_credentials uc
  WHERE uc.credential_type = 'oidc'
    AND uc.provider = p_provider
    AND uc.provider_subject = p_subject
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT u.id INTO v_user_id
    FROM app.users u
    WHERE u.primary_email = lower(p_email)
      AND u.anonymized_at IS NULL
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    v_user_id := p_user_id;
    INSERT INTO app.users (
      id, primary_email, email_verified_at, status, locale, last_login_at
    ) VALUES (
      v_user_id,
      lower(p_email),
      CASE WHEN p_email_verified THEN now() ELSE NULL END,
      'active',
      'vi-VN',
      now()
    );
  ELSE
    UPDATE app.users
    SET last_login_at = now(),
        email_verified_at = CASE
          WHEN p_email_verified THEN COALESCE(email_verified_at, now())
          ELSE email_verified_at
        END,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO app.user_credentials (
    user_id, credential_type, provider, provider_subject
  ) VALUES (
    v_user_id, 'oidc', p_provider, p_subject
  )
  ON CONFLICT (user_id, credential_type) DO UPDATE
  SET provider = EXCLUDED.provider,
      provider_subject = EXCLUDED.provider_subject,
      updated_at = now();

  SELECT EXISTS (
    SELECT 1 FROM app.mfa_factors f
    WHERE f.user_id = v_user_id
      AND f.verified_at IS NOT NULL
      AND f.disabled_at IS NULL
  ) INTO v_mfa_required;

  IF p_tenant_hint IS NOT NULL AND length(btrim(p_tenant_hint)) > 0 THEN
    SELECT tm.id, tm.tenant_id, COALESCE(tm.display_name, p_display_name, split_part(p_email, '@', 1)),
           u.locale, t.name, t.currency, t.timezone
      INTO v_membership_id, v_tenant_id, v_display_name, v_locale, v_tenant_name, v_currency, v_timezone
    FROM app.tenant_memberships tm
    JOIN app.tenants t ON t.id = tm.tenant_id
    JOIN app.users u ON u.id = tm.user_id
    WHERE tm.user_id = v_user_id
      AND tm.status = 'active'
      AND t.status = 'active'
      AND lower(t.code::text) = lower(p_tenant_hint)
    LIMIT 1;
  END IF;

  IF v_membership_id IS NULL THEN
    SELECT tm.id, tm.tenant_id, COALESCE(tm.display_name, p_display_name, split_part(p_email, '@', 1)),
           u.locale, t.name, t.currency, t.timezone
      INTO v_membership_id, v_tenant_id, v_display_name, v_locale, v_tenant_name, v_currency, v_timezone
    FROM app.tenant_memberships tm
    JOIN app.tenants t ON t.id = tm.tenant_id
    JOIN app.users u ON u.id = tm.user_id
    WHERE tm.user_id = v_user_id
      AND tm.status = 'active'
      AND t.status = 'active'
    ORDER BY tm.activated_at NULLS LAST, tm.created_at
    LIMIT 1;
  END IF;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'OIDC_NO_MEMBERSHIP' USING ERRCODE = 'P0001';
  END IF;

  IF v_mfa_required THEN
    user_id := v_user_id;
    tenant_id := v_tenant_id;
    membership_id := v_membership_id;
    session_id := NULL;
    device_id := NULL;
    session_version := NULL;
    session_expires_at := NULL;
    display_name := v_display_name;
    user_locale := v_locale;
    tenant_name := v_tenant_name;
    tenant_currency := v_currency;
    tenant_timezone := v_timezone;
    mfa_required := TRUE;
    permissions := ARRAY[]::TEXT[];
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO app.devices (
    id, user_id, platform, label, trusted, trust_status, last_seen_at
  ) VALUES (
    p_device_id, v_user_id, 'web', 'Web Admin', false, 'pending', now()
  );

  INSERT INTO app.user_sessions (
    id, user_id, tenant_id, membership_id, device_id,
    absolute_expiry, revoked, auth_methods
  ) VALUES (
    p_session_id, v_user_id, v_tenant_id, v_membership_id, p_device_id,
    p_absolute_expiry, false, ARRAY['oidc']::TEXT[]
  );

  INSERT INTO app.refresh_tokens (
    id, session_id, user_id, tenant_id, token_hash, family_id, expires_at
  ) VALUES (
    p_refresh_id, p_session_id, v_user_id, v_tenant_id, p_refresh_token_hash, p_family_id, p_refresh_expires
  );

  INSERT INTO app.audit_events (
    id, tenant_id, action, actor_id, correlation_id, payload
  ) VALUES (
    p_audit_id, v_tenant_id, 'auth.oidc.login', v_user_id, COALESCE(p_correlation_id, ''),
    jsonb_build_object('provider', p_provider, 'outcome', 'success')
  );

  SELECT COALESCE(array_agg(DISTINCT rp.permission_key ORDER BY rp.permission_key), ARRAY[]::TEXT[])
    INTO v_perms
  FROM app.membership_roles mr
  JOIN app.role_permissions rp ON rp.role_id = mr.role_id
  WHERE mr.membership_id = v_membership_id
    AND mr.tenant_id = v_tenant_id;

  user_id := v_user_id;
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
  mfa_required := FALSE;
  permissions := v_perms;
  RETURN NEXT;
END;
$$;

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

  INSERT INTO app.devices (
    id, user_id, platform, label, trusted, trust_status, last_seen_at
  ) VALUES (
    p_device_id, p_user_id, 'web', 'Web Admin', false, 'pending', now()
  );

  INSERT INTO app.user_sessions (
    id, user_id, tenant_id, membership_id, device_id,
    absolute_expiry, revoked, auth_methods
  ) VALUES (
    p_session_id, p_user_id, v_tenant_id, v_membership_id, p_device_id,
    p_absolute_expiry, false, ARRAY['oidc','mfa']::TEXT[]
  );

  INSERT INTO app.refresh_tokens (
    id, session_id, user_id, tenant_id, token_hash, family_id, expires_at
  ) VALUES (
    p_refresh_id, p_session_id, p_user_id, v_tenant_id, p_refresh_token_hash, p_family_id, p_refresh_expires
  );

  INSERT INTO app.audit_events (
    id, tenant_id, action, actor_id, correlation_id, payload
  ) VALUES (
    p_audit_id, v_tenant_id, 'auth.oidc.login', p_user_id, COALESCE(p_correlation_id, ''),
    jsonb_build_object('outcome', 'success', 'mfa', true)
  );

  SELECT COALESCE(array_agg(DISTINCT rp.permission_key ORDER BY rp.permission_key), ARRAY[]::TEXT[])
    INTO v_permissions
  FROM app.membership_roles mr
  JOIN app.role_permissions rp ON rp.role_id = mr.role_id
  WHERE mr.membership_id = v_membership_id
    AND mr.tenant_id = v_tenant_id;

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
