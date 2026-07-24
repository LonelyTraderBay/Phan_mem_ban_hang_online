# Task P2.1 — Indexes hỗ trợ delete theo `expires_at` (nếu thiếu)

**Phase:** P2 — TTL cleanup bảng ephemeral  
**Plan:** `backend/docs/superpowers/plans/2026-07-24-db-schema-completion.md`

**Files:**
- Create: `backend/infra/migrations/000035_ephemeral_ttl_indexes.sql`

## Known existing indexes (do NOT duplicate)

| Table | Already has |
|-------|-------------|
| `oidc_login_states` | `idx_oidc_login_states_expires` ON `(expires_at) WHERE consumed_at IS NULL` (`000006`) |
| `media_upload_intents` | `idx_media_upload_intents_tenant_expires` ON `(tenant_id, expires_at)` (`000028`) |
| `idempotency_records` | `idx_idempotency_records_expires` ON `(expires_at)` (`000003`) |
| `password_reset_tokens` | `idx_password_reset_tokens_user` ON `(user_id, expires_at) WHERE consumed_at IS NULL` (`000009`) |
| `mfa_challenges` | `idx_mfa_challenges_user` ON `(user_id, expires_at) WHERE consumed_at IS NULL` (`000009`) |

## Required new indexes (purge-oriented)

Purge jobs will delete by `expires_at < now()` (and optionally consumed age) **without** always filtering `user_id`/`tenant_id`. Add only:

```sql
-- 000035_ephemeral_ttl_indexes.sql
-- Ephemeral TTL purge support (plan P2.1). Apply after 000034.

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
  ON app.password_reset_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires
  ON app.mfa_challenges (expires_at);

CREATE INDEX IF NOT EXISTS idx_media_upload_intents_expires
  ON app.media_upload_intents (expires_at);

-- oidc + idempotency: already covered — do not recreate.
```

## Steps

- [ ] Create migration file exactly as above (header comment + IF NOT EXISTS only).
- [ ] From `backend/`, load `.env.local` and run `pnpm migrate`. Expected: Applying `000035_...` ok.
- [ ] Verify indexes exist via SQL query on `pg_indexes` (do not print DATABASE_URL).
- [ ] Do NOT migrate staging in this task (plan: staging after local green for code tasks; for this migration-only task, **also** apply to staging with `.env.staging` after local succeeds — both envs stay in sync per P0 goal).
- [ ] Do NOT git commit.

**Done khi:** migration applied local + staging; new indexes present; no duplicate oidc/idempotency indexes created.

## Controller resolutions

- Next migration number is **000035** (repo currently at 000034).
- Immutable: do not edit old migration files.
- No secrets in report.
- Work from: `C:/Users/C-PC/Documents/Phan_mem_ban_hang_online/backend`
