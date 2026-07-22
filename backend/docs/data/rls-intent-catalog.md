# RLS Intent Catalog (W4 freeze)

**Purpose:** One place AI agents read before writing migrations/policies.  
**Canonical table list:** [`data-dictionary.md`](data-dictionary.md)  
**Status:** Frozen 2026-07-22 — 0 `Needs confirmation` rows in the dictionary.

## Session GUCs (runtime)

| Setting | Set by | Meaning |
|---------|--------|---------|
| `app.tenant_id` | `withTenantTransaction` | Current tenant UUID string, or empty |
| `app.actor_id` | auth middleware / worker | Current user/service actor UUID |

## Policy templates

### A. Standard TENANT_OWNED

```sql
ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;
USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
```

### B. TENANT_ROOT (`tenants`)

```sql
USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
```

Application still enforces `tenant.read` / `tenant.update`.

### C. HYBRID (`roles`, `role_permissions`)

```sql
-- READ
USING (
  tenant_id IS NULL
  OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
)
-- WRITE (app_runtime): never create/update system templates
WITH CHECK (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
)
```

System template seeds (`tenant_id NULL`) only via `app_migrator`.

### D. Nullable tenant + actor (`user_sessions`, `refresh_tokens`)

See definitive text in `data-dictionary.md` / `identity-migration-design.md`:

```sql
USING (
  user_id = nullif(current_setting('app.actor_id', true), '')::uuid
  AND (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
)
```

### E. GLOBAL catalogs

No tenant column. Prefer deny-all for `app_runtime` except explicit read grants; writes via migrator/seed only (`permissions`, `plans`, …).

### F. SYSTEM_INTERNAL / worker cross-tenant poll

Example: outbox publisher policy for worker role (see `000004_inbox_and_worker_publisher.sql`) — never grant this to tenant API role.

### G. Platform GLOBAL ops rows (`system_alerts`, `reprocess_requests`)

No tenant RLS ownership. Authorization is `ops.*` permission only. Optional `target_tenant_id` is a filter column, not RLS.

## Ledger / append-only

Tables marked `[ledger]` in the dictionary: no hard DELETE; corrections via compensating rows. RLS still TENANT_OWNED (or nullable-tenant for `audit_logs`).

## Money / tax columns (HO_DEFAULTS_v1)

| Table | Rule |
|-------|------|
| `product_variants.unit_price_minor` | Tax-**inclusive** đồng |
| `orders.tax_rate_bps` | const **1000** (10%) unless ADR supersedes |
| `orders.prices_tax_inclusive` | **true** |
| `plans.id` | `plan_free` \| `plan_pro` \| `plan_business` |

## Foundation tables already migrated (P1)

| Table | Class | Migration | RLS |
|-------|-------|-----------|-----|
| `audit_events` | TENANT_OWNED | `000002` | Done (skeleton; domain `audit_logs` is the full ledger name in §7) |
| `outbox_events` | TENANT_OWNED | `000002` | Done (+ worker publisher policy in `000004`) |
| `idempotency_records` | TENANT_OWNED | `000003` | Done |
| `inbox_events` | TENANT_OWNED | `000004` | Done |

`audit_events` (skeleton) and `audit_logs` (blueprint §7.12.5) must converge in a later expand/contract migration — do not invent a third name.
