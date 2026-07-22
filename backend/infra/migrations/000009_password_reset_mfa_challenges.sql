-- Password reset tokens + MFA challenges (BE-IDN-007 / BE-IDN-008).
-- Apply after 000008_session_device_revoke.sql.

CREATE TABLE IF NOT EXISTS app.password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app.users (id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_tokens_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON app.password_reset_tokens (user_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS app.mfa_challenges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app.users (id),
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'step_up')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user
  ON app.mfa_challenges (user_id, expires_at)
  WHERE consumed_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON app.password_reset_tokens TO app_runtime, app_worker;
GRANT SELECT, INSERT, UPDATE ON app.mfa_challenges TO app_runtime, app_worker;

-- Enumeration-safe: returns empty when no password credential; never reveals existence via error.
CREATE OR REPLACE FUNCTION app.password_reset_request(
  p_email TEXT,
  p_token_id UUID,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS TABLE (issued BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT u.id INTO v_user_id
  FROM app.users u
  JOIN app.user_credentials c ON c.user_id = u.id AND c.credential_type = 'password'
  WHERE u.primary_email = lower(p_email)
    AND u.anonymized_at IS NULL
    AND u.status = 'active'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    issued := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Invalidate prior unused tokens for this user
  UPDATE app.password_reset_tokens
  SET consumed_at = now()
  WHERE user_id = v_user_id AND consumed_at IS NULL;

  INSERT INTO app.password_reset_tokens (id, user_id, token_hash, expires_at)
  VALUES (p_token_id, v_user_id, p_token_hash, p_expires_at);

  issued := true;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.password_reset_consume(
  p_token_hash TEXT,
  p_password_hash TEXT,
  p_audit_id UUID
) RETURNS TABLE (outcome TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_row app.password_reset_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM app.password_reset_tokens
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    outcome := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.consumed_at IS NOT NULL OR v_row.expires_at <= now() THEN
    outcome := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE app.password_reset_tokens
  SET consumed_at = now()
  WHERE id = v_row.id;

  UPDATE app.user_credentials
  SET password_hash = p_password_hash,
      password_updated_at = now(),
      failed_count = 0,
      locked_until = NULL,
      updated_at = now()
  WHERE user_id = v_row.user_id
    AND credential_type = 'password';

  -- Revoke all sessions for the user after password change
  UPDATE app.user_sessions
  SET revoked = true, revoked_at = now()
  WHERE user_id = v_row.user_id AND revoked = false;

  UPDATE app.refresh_tokens
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE user_id = v_row.user_id AND revoked_at IS NULL;

  INSERT INTO app.audit_events (id, tenant_id, action, actor_id, correlation_id, payload)
  VALUES (
    p_audit_id,
    '00000000-0000-7000-8000-000000000000'::uuid,
    'auth.password.reset',
    v_row.user_id,
    '',
    jsonb_build_object('user_id', v_row.user_id)
  );

  outcome := 'ok';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.mfa_challenge_create(
  p_id UUID,
  p_user_id UUID,
  p_purpose TEXT,
  p_expires_at TIMESTAMPTZ,
  p_metadata JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  INSERT INTO app.mfa_challenges (id, user_id, purpose, expires_at, metadata)
  VALUES (p_id, p_user_id, p_purpose, p_expires_at, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION app.mfa_challenge_consume(
  p_challenge_id UUID
) RETURNS TABLE (
  outcome TEXT,
  user_id UUID,
  purpose TEXT,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_row app.mfa_challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM app.mfa_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.consumed_at IS NOT NULL OR v_row.expires_at <= now() THEN
    outcome := 'invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE app.mfa_challenges SET consumed_at = now() WHERE id = v_row.id;
  outcome := 'ok';
  user_id := v_row.user_id;
  purpose := v_row.purpose;
  metadata := v_row.metadata;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.mfa_challenge_peek(
  p_challenge_id UUID
) RETURNS TABLE (
  id UUID,
  user_id UUID,
  purpose TEXT,
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.user_id, c.purpose, c.expires_at, c.consumed_at, c.metadata
  FROM app.mfa_challenges c
  WHERE c.id = p_challenge_id;
END;
$$;

-- Secrets stored as UTF-8 of base64url secret (envelope encryption = later hardening).
CREATE OR REPLACE FUNCTION app.mfa_list_verified_totp_secrets(
  p_user_id UUID
) RETURNS TABLE (secret TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT convert_from(f.secret_encrypted, 'UTF8')
  FROM app.mfa_factors f
  WHERE f.user_id = p_user_id
    AND f.factor_type = 'totp'
    AND f.verified_at IS NOT NULL
    AND f.disabled_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.mfa_consume_recovery_code(
  p_user_id UUID,
  p_code_hash TEXT
) RETURNS TABLE (ok BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM app.recovery_codes
  WHERE user_id = p_user_id
    AND code_hash = p_code_hash
    AND used_at IS NULL
  FOR UPDATE;

  IF v_id IS NULL THEN
    ok := false;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE app.recovery_codes SET used_at = now() WHERE id = v_id;
  ok := true;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.mfa_enroll_totp(
  p_factor_id UUID,
  p_user_id UUID,
  p_secret TEXT,
  p_label TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  INSERT INTO app.mfa_factors (id, user_id, factor_type, secret_encrypted, label, verified_at)
  VALUES (p_factor_id, p_user_id, 'totp', convert_to(p_secret, 'UTF8'), p_label, now());
END;
$$;

CREATE OR REPLACE FUNCTION app.mfa_replace_recovery_codes(
  p_user_id UUID,
  p_hashes JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  UPDATE app.recovery_codes SET used_at = now()
  WHERE user_id = p_user_id AND used_at IS NULL;

  FOR v_hash IN SELECT jsonb_array_elements_text(p_hashes)
  LOOP
    INSERT INTO app.recovery_codes (id, user_id, code_hash)
    VALUES (gen_random_uuid(), p_user_id, v_hash);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.session_mark_recent_auth(
  p_session_id UUID,
  p_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  UPDATE app.user_sessions
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_mfa_at', p_at),
      last_seen_at = p_at
  WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.session_get_recent_auth(
  p_session_id UUID
) RETURNS TABLE (recent_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT NULLIF(s.metadata->>'last_mfa_at', '')::timestamptz
  FROM app.user_sessions s
  WHERE s.id = p_session_id;
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

-- Ephemeral tables: runtime access via SECURITY DEFINER preferred; revoke broad PUBLIC.
REVOKE ALL ON TABLE app.password_reset_tokens FROM PUBLIC;
REVOKE ALL ON TABLE app.mfa_challenges FROM PUBLIC;

REVOKE ALL ON FUNCTION app.password_reset_request(TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.password_reset_consume(TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mfa_challenge_create(UUID, UUID, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mfa_challenge_consume(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mfa_challenge_peek(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mfa_list_verified_totp_secrets(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mfa_consume_recovery_code(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mfa_enroll_totp(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mfa_replace_recovery_codes(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.session_mark_recent_auth(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.session_get_recent_auth(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.oidc_establish_session_after_mfa(UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.password_reset_request(TEXT, UUID, TEXT, TIMESTAMPTZ) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.password_reset_consume(TEXT, TEXT, UUID) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.mfa_challenge_create(UUID, UUID, TEXT, TIMESTAMPTZ, JSONB) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.mfa_challenge_consume(UUID) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.mfa_challenge_peek(UUID) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.mfa_list_verified_totp_secrets(UUID) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.mfa_consume_recovery_code(UUID, TEXT) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.mfa_enroll_totp(UUID, UUID, TEXT, TEXT) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.mfa_replace_recovery_codes(UUID, JSONB) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.session_mark_recent_auth(UUID, TIMESTAMPTZ) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.session_get_recent_auth(UUID) TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.oidc_establish_session_after_mfa(UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) TO app_runtime, app_worker;
