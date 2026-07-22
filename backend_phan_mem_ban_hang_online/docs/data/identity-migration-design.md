# Identity schema migration design

**Ticket:** BE-IDN-001  
**Proposed file:** `infra/migrations/000005_identity_schema.sql`  
**Status:** Design only — do not apply until BE-IDN-001 implementation.

## Migration number

Existing migrations in `infra/migrations/`:

| File | Purpose |
|---|---|
| `000001_bootstrap_roles.sql` | DB roles |
| `000002_walking_skeleton.sql` | audit + outbox skeleton |
| `000003_idempotency_records.sql` | Idempotency (BE-FND-009 / P1) |
| `000004_inbox_and_worker_publisher.sql` | Inbox + worker publisher (BE-FND-010 / P1) |

Identity therefore ships as **`000005_identity_schema.sql`** (next free number after P1 foundation).

## Tables in scope (blueprint §7.5)

Create under schema `app` (same as walking skeleton):

| Table | Class | Notes |
|---|---|---|
| `tenants` | TENANT_ROOT | RLS on `id = app.tenant_id` |
| `users` | GLOBAL | No tenant_id |
| `user_credentials` | GLOBAL | Argon2id hash only; keyed by user_id |
| `tenant_memberships` | TENANT_OWNED | Unique `(tenant_id, user_id)` |
| `roles` | Hybrid | System template `tenant_id NULL`; custom tenant-scoped |
| `permissions` | GLOBAL | Seed from permission matrix |
| `role_permissions` | Follows roles | Unique `(role_id, permission_key)` |
| `membership_roles` | TENANT_OWNED | Tenant-consistent with membership |
| `user_sessions` | TENANT_OWNED nullable tenant | See RLS below |
| `refresh_tokens` | Follows sessions | Hash only; family/parent for reuse detection |
| `devices` | GLOBAL | Belongs to user_id |
| `invitations` | TENANT_OWNED | Token hash; unique active `(tenant_id, email)` |
| `mfa_factors` | GLOBAL | TOTP secret encrypted at rest |
| `recovery_codes` | GLOBAL | Hash only |
| `support_access_grants` | TENANT_OWNED | Break-glass |

## `user_sessions` nullable-tenant RLS (definitive)

Copied from `docs/data/data-dictionary.md` — implement exactly this policy in 000005:

```sql
ALTER TABLE app.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY user_sessions_actor_tenant_isolation ON app.user_sessions
  FOR ALL
  USING (
    user_id = nullif(current_setting('app.actor_id', true), '')::uuid
    AND (
      tenant_id IS NULL
      OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    user_id = nullif(current_setting('app.actor_id', true), '')::uuid
    AND (
      tenant_id IS NULL
      OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );
```

- Pre-tenant sessions (`tenant_id IS NULL`) are visible to the owning actor so MFA / switch-tenant can bind them.
- Tenant-bound sessions are invisible under a different `app.tenant_id`.
- Cross-user visibility is never allowed under `app_runtime`.

`refresh_tokens` either denormalize `user_id`/`tenant_id` with the same policy, or enforce via `session_id` join inside a SECURITY DEFINER helper used only by the identity module (prefer denormalize for RLS clarity).

## Hybrid `roles` RLS (restate)

```sql
-- USING: system templates + own tenant customs
USING (
  tenant_id IS NULL
  OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
)
-- WITH CHECK: tenants never write system templates
WITH CHECK (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
)
```

System template seed via `app_migrator` only.

## Indexes (minimum)

- `tenant_memberships (tenant_id, user_id)` unique
- `user_sessions (user_id, revoked, absolute_expiry)`
- `user_sessions (tenant_id, user_id)` where tenant_id IS NOT NULL
- `refresh_tokens (token_hash)` unique
- `refresh_tokens (family_id)`
- `invitations (tenant_id, email)` unique where status = pending
- `devices (user_id, revoked)`

## Seed data in same migration (or 000005b if size warrants)

- Immutable `permissions` rows from `permission_matrix.csv`
- System role templates (Owner, Admin, Staff, ReadOnly — names TBD in BE-IDN-002) with `tenant_id NULL`
- No demo tenants/users in this migration

## Expand/contract

- Additive only; no hard-delete of identity ledger tables later.
- Rollback = reverse migration that drops new tables only if empty / never shipped to shared envs; after first tenant provisioned, rollback is restore-from-backup.

## Verification when implementing BE-IDN-001

- Fresh migrate from empty DB applies 000001→000005 without error.
- RLS deny-default harness: actor A cannot read actor B sessions; tenant A cannot read tenant B sessions.
- Nullable-tenant case: session with `tenant_id NULL` readable when `app.actor_id` set and `app.tenant_id` empty or set.
- `pnpm verify` green.
