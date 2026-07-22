# Table Classification Seed

Use this file to evolve the P0 ERD and data dictionary. Every table must be classified before implementation.

> **Canonical per-table index**: [`data-dictionary.md`](data-dictionary.md) · diagrams: [`ERD.md`](ERD.md) ·
> RLS policy patterns: [`rls-intent-catalog.md`](rls-intent-catalog.md)  
> This file defines **class rules only**. Updated 2026-07-22 (enterprise doc-freeze W4).

| Class | Rule | Examples |
|---|---|---|
| **GLOBAL** | No `tenant_id`; system-owned catalog. RLS may still be enabled deny-default for non-migrator roles. | `permissions`, `plans`, `feature_flags`, `ai_evaluation_sets`, `system_alerts` |
| **TENANT_OWNED** | `tenant_id UUID NOT NULL`, RLS + FORCE, tenant-scoped indexes, composite tenant FKs where related. | `products`, `customers`, `orders`, `conversations`, `outbox_events` |
| **TENANT_OWNED (nullable tenant)** | `tenant_id` nullable; RLS combines actor + optional tenant (see catalog). | `user_sessions`, `audit_logs` (global actions) |
| **TENANT_OVERRIDE** | Global key + optional per-tenant override row. | `feature_flag_overrides` |
| **TENANT_ROOT** | Row **is** the tenant (`tenants.id`). RLS: `id = app.tenant_id` (not `tenant_id` column). | `tenants` |
| **HYBRID** | Mix of system templates (`tenant_id NULL`) and tenant custom rows. Read: templates OR own tenant; write: own tenant only via `app_runtime`. | `roles`, `role_permissions` |
| **SYSTEM_INTERNAL** | Not exposed through tenant user APIs; migrator/worker roles. | schema migrations, worker leases |

## Implementation gate

- No `TENANT_OWNED` / nullable-tenant / HYBRID / TENANT_ROOT table ships without documented RLS intent and isolation tests (blueprint §6.6).
- **Needs confirmation** is forbidden in the freeze index — resolve class before migration work.
- Money/tax fields on orders/variants follow [`../business/HO_DEFAULTS_v1.md`](../business/HO_DEFAULTS_v1.md) (VAT 10% inclusive).
