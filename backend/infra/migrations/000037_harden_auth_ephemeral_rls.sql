-- 000037_harden_auth_ephemeral_rls.sql
-- P3.1: deny-default RLS + revoke direct table access for auth ephemeral tables.
-- Apply after 000036_ephemeral_ttl_purge_fn.sql.
--
-- Runtime/worker access only via existing SECURITY DEFINER helpers (000006/000009/000036).

ALTER TABLE app.oidc_login_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.oidc_login_states FORCE ROW LEVEL SECURITY;

ALTER TABLE app.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.password_reset_tokens FORCE ROW LEVEL SECURITY;

ALTER TABLE app.mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mfa_challenges FORCE ROW LEVEL SECURITY;

-- Deny direct DML/SELECT for runtime roles; helpers retain EXECUTE grants from prior migrations.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE app.oidc_login_states FROM app_runtime, app_worker;
REVOKE SELECT, INSERT, UPDATE ON TABLE app.password_reset_tokens FROM app_runtime, app_worker;
REVOKE SELECT, INSERT, UPDATE ON TABLE app.mfa_challenges FROM app_runtime, app_worker;
