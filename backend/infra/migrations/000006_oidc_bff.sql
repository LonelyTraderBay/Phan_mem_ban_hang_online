-- OIDC BFF login state + SECURITY DEFINER helpers (BE-IDN-003).
-- Apply after 000005_identity_schema.sql.
-- Functions must be owned by a BYPASSRLS / superuser migrator (FORCE RLS on identity tables).

CREATE TABLE IF NOT EXISTS app.oidc_login_states (
  state_hash TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL CHECK (return_to ~ '^/'),
  tenant_hint TEXT NULL,
  correlation_id TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oidc_login_states_expires
  ON app.oidc_login_states (expires_at)
  WHERE consumed_at IS NULL;

-- Ephemeral pre-auth table: no tenant RLS; runtime may insert/consume via SECURITY DEFINER only.
REVOKE ALL ON TABLE app.oidc_login_states FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.oidc_login_states TO app_runtime, app_worker;

CREATE OR REPLACE FUNCTION app.oidc_save_login_state(
  p_state_hash TEXT,
  p_nonce_hash TEXT,
  p_code_verifier TEXT,
  p_return_to TEXT,
  p_tenant_hint TEXT,
  p_correlation_id TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  INSERT INTO app.oidc_login_states (
    state_hash, nonce_hash, code_verifier, return_to, tenant_hint, correlation_id, expires_at
  ) VALUES (
    p_state_hash, p_nonce_hash, p_code_verifier, p_return_to, p_tenant_hint, p_correlation_id, p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.oidc_consume_login_state(p_state_hash TEXT)
RETURNS TABLE (
  nonce_hash TEXT,
  code_verifier TEXT,
  return_to TEXT,
  tenant_hint TEXT,
  correlation_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE app.oidc_login_states s
  SET consumed_at = now()
  WHERE s.state_hash = p_state_hash
    AND s.consumed_at IS NULL
    AND s.expires_at > now()
  RETURNING s.nonce_hash, s.code_verifier, s.return_to, s.tenant_hint, s.correlation_id;
END;
$$;

-- Establish user/session/refresh after successful IdP exchange. Returns bootstrap-ish row.
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
    AND rt.expires_at > now()
    AND s.revoked = false
    AND s.absolute_expiry > now()
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION app.oidc_save_login_state(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.oidc_consume_login_state(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.oidc_establish_session(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.oidc_resolve_session_by_refresh_hash(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.oidc_save_login_state(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.oidc_consume_login_state(TEXT) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.oidc_establish_session(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.oidc_resolve_session_by_refresh_hash(TEXT) TO app_runtime, app_worker;
