-- Fix accept_invitation: RETURNS TABLE columns (tenant_id, …) shadowed table columns (PG 17).
CREATE OR REPLACE FUNCTION app.accept_invitation(
  p_token_hash TEXT,
  p_password_hash TEXT,
  p_now TIMESTAMPTZ
) RETURNS TABLE (
  outcome TEXT,
  tenant_id UUID,
  user_id UUID,
  membership_id UUID,
  email TEXT,
  display_name TEXT,
  role_ids UUID[],
  permissions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_inv app.invitations%ROWTYPE;
  v_membership_id UUID;
  v_user_id UUID;
  v_display TEXT;
  v_membership app.tenant_memberships%ROWTYPE;
  v_perms TEXT[];
BEGIN
  SELECT * INTO v_inv
  FROM app.invitations
  WHERE token_hash = p_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    outcome := 'INVITATION_TOKEN_INVALID';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_inv.status = 'accepted' THEN
    outcome := 'INVITE_ALREADY_ACCEPTED';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_inv.status <> 'pending' THEN
    outcome := 'INVITATION_TOKEN_INVALID';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < p_now THEN
    outcome := 'INVITATION_EXPIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  v_membership_id := NULLIF(v_inv.metadata->>'membership_id', '')::uuid;
  v_user_id := NULLIF(v_inv.metadata->>'user_id', '')::uuid;
  v_display := NULLIF(v_inv.metadata->>'display_name', '');

  IF v_membership_id IS NOT NULL THEN
    SELECT * INTO v_membership
    FROM app.tenant_memberships tm
    WHERE tm.id = v_membership_id AND tm.tenant_id = v_inv.tenant_id;
  END IF;

  IF v_membership.id IS NULL THEN
    SELECT u.id INTO v_user_id
    FROM app.users u
    WHERE u.primary_email = v_inv.email
      AND u.anonymized_at IS NULL
    LIMIT 1;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      INSERT INTO app.users (id, primary_email, status, locale)
      VALUES (v_user_id, v_inv.email, 'pending', 'vi-VN');
    END IF;

    SELECT * INTO v_membership
    FROM app.tenant_memberships tm
    WHERE tm.tenant_id = v_inv.tenant_id AND tm.user_id = v_user_id
    LIMIT 1;

    IF v_membership.id IS NULL THEN
      v_membership_id := gen_random_uuid();
      INSERT INTO app.tenant_memberships (
        id, tenant_id, user_id, status, display_name, invited_by, activated_at
      ) VALUES (
        v_membership_id,
        v_inv.tenant_id,
        v_user_id,
        'active',
        coalesce(v_display, split_part(v_inv.email::text, '@', 1)),
        v_inv.invited_by,
        p_now
      )
      RETURNING * INTO v_membership;

      INSERT INTO app.membership_roles (id, tenant_id, membership_id, role_id)
      SELECT gen_random_uuid(), v_inv.tenant_id, v_membership.id, r
      FROM unnest(v_inv.role_ids) AS r
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  UPDATE app.tenant_memberships tm
  SET status = 'active',
      activated_at = coalesce(tm.activated_at, p_now),
      version = tm.version + 1,
      updated_at = p_now
  WHERE tm.id = v_membership.id
  RETURNING * INTO v_membership;

  UPDATE app.users u
  SET status = CASE WHEN u.status = 'pending' THEN 'active' ELSE u.status END,
      email_verified_at = coalesce(u.email_verified_at, p_now),
      updated_at = p_now
  WHERE u.id = v_membership.user_id;

  IF p_password_hash IS NOT NULL AND length(btrim(p_password_hash)) > 0 THEN
    INSERT INTO app.user_credentials (
      user_id, credential_type, password_hash, password_updated_at
    ) VALUES (
      v_membership.user_id, 'password', p_password_hash, p_now
    )
    ON CONFLICT (user_id, credential_type) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        password_updated_at = EXCLUDED.password_updated_at,
        updated_at = p_now;
  END IF;

  UPDATE app.invitations inv
  SET status = 'accepted', accepted_at = p_now, updated_at = p_now
  WHERE inv.id = v_inv.id;

  UPDATE app.tenants t
  SET permission_version = t.permission_version + 1, updated_at = p_now
  WHERE t.id = v_inv.tenant_id;

  SELECT coalesce(array_agg(DISTINCT rp.permission_key ORDER BY rp.permission_key), '{}')
    INTO v_perms
  FROM app.membership_roles mr
  JOIN app.role_permissions rp ON rp.role_id = mr.role_id
  WHERE mr.membership_id = v_membership.id
    AND mr.tenant_id = v_inv.tenant_id;

  outcome := 'ok';
  tenant_id := v_inv.tenant_id;
  user_id := v_membership.user_id;
  membership_id := v_membership.id;
  email := v_inv.email::text;
  display_name := v_membership.display_name;
  role_ids := v_inv.role_ids;
  permissions := v_perms;
  RETURN NEXT;
END;
$$;
