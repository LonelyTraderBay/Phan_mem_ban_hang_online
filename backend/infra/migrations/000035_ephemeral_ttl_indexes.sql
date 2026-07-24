-- 000035_ephemeral_ttl_indexes.sql
-- Ephemeral TTL purge support (plan P2.1). Apply after 000034.

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
  ON app.password_reset_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires
  ON app.mfa_challenges (expires_at);

CREATE INDEX IF NOT EXISTS idx_media_upload_intents_expires
  ON app.media_upload_intents (expires_at);

-- oidc + idempotency: already covered — do not recreate.