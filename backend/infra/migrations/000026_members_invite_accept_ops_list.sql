-- Members invite/accept SECURITY DEFINER + co-tenant user read + ops list tenants.
-- Completes identity platform persistence deferred from BE-IDN-010/011/014.

-- ---------------------------------------------------------------------------
-- Users: allow SELECT of co-members under current tenant GUC (listMembers join).
-- INSERT/UPDATE remain self-only; cross-user writes stay in DEFINER helpers.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_self_read ON app.users;
CREATE POLICY users_self_read ON app.users
  FOR SELECT TO app_runtime, app_worker
  USING (
    id = nullif(current_setting('app.actor_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM app.tenant_memberships tm
      WHERE tm.user_id = app.users.id
        AND tm.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );

-- ---------------------------------------------------------------------------
-- Invite member (creates user + membership + invitation + roles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.invite_member(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_email TEXT,
  p_display_name TEXT,
  p_role_ids UUID[],
  p_invitation_id UUID,
  p_membership_id UUID,
  p_user_id UUID,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS TABLE (
  out_membership_id UUID,
  out_user_id UUID,
  out_email TEXT,
  out_display_name TEXT,
  out_status TEXT,
  out_role_ids UUID[],
  out_version BIGINT,
  out_created_at TIMESTAMPTZ,
  out_updated_at TIMESTAMPTZ,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_email CITEXT := lower(btrim(p_email));
  v_user_id UUID;
  v_role UUID;
  v_membership app.tenant_memberships%ROWTYPE;
BEGIN
  IF v_email IS NULL OR length(v_email::text) = 0 THEN
    error_code := 'VALIDATION_FAILED';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_role_ids IS NULL OR coalesce(array_length(p_role_ids, 1), 0) = 0 THEN
    error_code := 'VALIDATION_FAILED';
    RETURN NEXT;
    RETURN;
  END IF;

  FOREACH v_role IN ARRAY p_role_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM app.roles r
      WHERE r.id = v_role
        AND r.tenant_id = p_tenant_id
        AND coalesce(r.metadata->>'archived', 'false') <> 'true'
    ) THEN
      error_code := 'VALIDATION_FAILED';
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM app.invitations i
    WHERE i.tenant_id = p_tenant_id
      AND i.email = v_email
      AND i.status = 'pending'
  ) THEN
    error_code := 'CONFLICT';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT u.id INTO v_user_id
  FROM app.users u
  WHERE u.primary_email = v_email
    AND u.anonymized_at IS NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := p_user_id;
    INSERT INTO app.users (id, primary_email, status, locale)
    VALUES (v_user_id, v_email, 'pending', 'vi-VN');
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = v_user_id
      AND tm.status <> 'revoked'
  ) THEN
    error_code := 'CONFLICT';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO app.tenant_memberships (
    id, tenant_id, user_id, status, display_name, invited_by, created_by, updated_by
  ) VALUES (
    p_membership_id, p_tenant_id, v_user_id, 'invited', p_display_name,
    p_actor_user_id, p_actor_user_id, p_actor_user_id
  )
  RETURNING * INTO v_membership;

  FOREACH v_role IN ARRAY p_role_ids LOOP
    INSERT INTO app.membership_roles (id, tenant_id, membership_id, role_id, created_by)
    VALUES (gen_random_uuid(), p_tenant_id, p_membership_id, v_role, p_actor_user_id);
  END LOOP;

  INSERT INTO app.invitations (
    id, tenant_id, email, token_hash, status, role_ids, invited_by, expires_at, metadata
  ) VALUES (
    p_invitation_id,
    p_tenant_id,
    v_email,
    p_token_hash,
    'pending',
    p_role_ids,
    p_actor_user_id,
    p_expires_at,
    jsonb_build_object(
      'membership_id', p_membership_id,
      'user_id', v_user_id,
      'display_name', p_display_name
    )
  );

  UPDATE app.tenants
  SET permission_version = permission_version + 1, updated_at = now()
  WHERE id = p_tenant_id;

  out_membership_id := v_membership.id;
  out_user_id := v_membership.user_id;
  out_email := v_email::text;
  out_display_name := v_membership.display_name;
  out_status := v_membership.status;
  out_role_ids := p_role_ids;
  out_version := v_membership.version;
  out_created_at := v_membership.created_at;
  out_updated_at := v_membership.updated_at;
  error_code := NULL;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- Accept invitation by token hash (works for invite_member + provision invites)
-- ---------------------------------------------------------------------------
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

  IF v_inv.status = 'revoked' THEN
    outcome := 'INVITE_REVOKED';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_inv.status = 'expired' OR v_inv.expires_at <= p_now THEN
    UPDATE app.invitations SET status = 'expired', updated_at = p_now WHERE id = v_inv.id;
    outcome := 'INVITE_EXPIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_inv.status <> 'pending' THEN
    outcome := 'INVITATION_TOKEN_INVALID';
    RETURN NEXT;
    RETURN;
  END IF;

  v_membership_id := NULLIF(v_inv.metadata->>'membership_id', '')::uuid;
  v_user_id := NULLIF(v_inv.metadata->>'user_id', '')::uuid;
  v_display := NULLIF(v_inv.metadata->>'display_name', '');

  IF v_membership_id IS NOT NULL THEN
    SELECT * INTO v_membership
    FROM app.tenant_memberships
    WHERE id = v_membership_id AND tenant_id = v_inv.tenant_id;
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
    FROM app.tenant_memberships
    WHERE tenant_id = v_inv.tenant_id AND user_id = v_user_id
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

  UPDATE app.tenant_memberships
  SET status = 'active',
      activated_at = coalesce(activated_at, p_now),
      version = version + 1,
      updated_at = p_now
  WHERE id = v_membership.id
  RETURNING * INTO v_membership;

  UPDATE app.users
  SET status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
      email_verified_at = coalesce(email_verified_at, p_now),
      updated_at = p_now
  WHERE id = v_membership.user_id;

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

  UPDATE app.invitations
  SET status = 'accepted', accepted_at = p_now, updated_at = p_now
  WHERE id = v_inv.id;

  UPDATE app.tenants
  SET permission_version = permission_version + 1, updated_at = p_now
  WHERE id = v_inv.tenant_id;

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

-- ---------------------------------------------------------------------------
-- Platform ops: list tenants (caller must enforce ops.tenant.read in app layer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ops_list_tenants()
RETURNS TABLE (
  id UUID,
  name TEXT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT t.id, t.name, t.status
  FROM app.tenants t
  ORDER BY t.created_at DESC
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION app.invite_member(
  UUID, UUID, TEXT, TEXT, UUID[], UUID, UUID, UUID, TEXT, TIMESTAMPTZ
) TO app_runtime, app_worker;

GRANT EXECUTE ON FUNCTION app.accept_invitation(TEXT, TEXT, TIMESTAMPTZ)
  TO app_runtime, app_worker;

CREATE OR REPLACE FUNCTION app.support_grant_get(p_id UUID)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  grantee_user_id UUID,
  reason TEXT,
  ticket_ref TEXT,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  approved_by UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT
    g.id, g.tenant_id, g.grantee_user_id, g.reason, g.ticket_ref, g.scope,
    g.expires_at, g.revoked_at, g.created_at, g.approved_by
  FROM app.support_access_grants g
  WHERE g.id = p_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION app.ops_list_tenants() TO app_runtime, app_worker;
GRANT EXECUTE ON FUNCTION app.support_grant_get(UUID) TO app_runtime, app_worker;
