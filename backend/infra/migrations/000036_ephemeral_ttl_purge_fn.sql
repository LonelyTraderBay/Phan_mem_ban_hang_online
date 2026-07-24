-- 000036_ephemeral_ttl_purge_fn.sql
-- Ephemeral TTL purge (plan P2.2). Apply after 000035.
--
-- Semantics:
-- | oidc_login_states      | expires_at < now() OR (consumed_at IS NOT NULL AND consumed_at < now() - 7d)
-- | media_upload_intents   | expires_at < now() AND (bytes_received = false OR created_at < now() - 7d)
-- | password_reset_tokens  | expires_at < now() OR (consumed_at IS NOT NULL AND consumed_at < now() - 7d)
-- | mfa_challenges         | expires_at < now() OR (consumed_at IS NOT NULL AND consumed_at < now() - 7d)
-- | idempotency_records    | expires_at < now()

CREATE OR REPLACE FUNCTION app.purge_ephemeral_rows()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_oidc INT;
  v_media INT;
  v_password_reset INT;
  v_mfa INT;
  v_idempotency INT;
BEGIN
  DELETE FROM app.oidc_login_states
  WHERE expires_at < now()
     OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '7 days');
  GET DIAGNOSTICS v_oidc = ROW_COUNT;

  DELETE FROM app.media_upload_intents
  WHERE expires_at < now()
    AND (bytes_received = false OR created_at < now() - interval '7 days');
  GET DIAGNOSTICS v_media = ROW_COUNT;

  DELETE FROM app.password_reset_tokens
  WHERE expires_at < now()
     OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '7 days');
  GET DIAGNOSTICS v_password_reset = ROW_COUNT;

  DELETE FROM app.mfa_challenges
  WHERE expires_at < now()
     OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '7 days');
  GET DIAGNOSTICS v_mfa = ROW_COUNT;

  DELETE FROM app.idempotency_records
  WHERE expires_at < now();
  GET DIAGNOSTICS v_idempotency = ROW_COUNT;

  RETURN jsonb_build_object(
    'oidc_login_states', v_oidc,
    'media_upload_intents', v_media,
    'password_reset_tokens', v_password_reset,
    'mfa_challenges', v_mfa,
    'idempotency_records', v_idempotency
  );
END;
$$;

REVOKE ALL ON FUNCTION app.purge_ephemeral_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_ephemeral_rows() TO app_worker;
