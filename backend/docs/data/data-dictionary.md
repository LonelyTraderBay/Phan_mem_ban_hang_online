# Data Dictionary — Table Classification Index

Completes BE-P0-004 ("ERD/data dictionary/RLS classification for P1–P2", tracked in
[`../p0/P0_CHECKLIST.md`](../p0/P0_CHECKLIST.md)) by turning the class rules in
[`table-classification-seed.md`](table-classification-seed.md) into a full per-table checklist.
Field-level detail and diagrams live in [`ERD.md`](ERD.md); RLS policy templates in
[`rls-intent-catalog.md`](rls-intent-catalog.md); full validation prose is the blueprint §6–§7.

**Enterprise freeze W4 (2026-07-22):** `Needs confirmation` count = **0**. Classes below are
authoritative for AI coding agents — do not re-open without ADR.

## How to use this during implementation

- Before writing a table's migration, find its row here, confirm the class, then apply the rule
  from `table-classification-seed.md` / `rls-intent-catalog.md`.
- Flip `RLS/migration status` to `Done` only after the migration exists **and**
  `tenant isolation test suite` (blueprint §6.6) passes for that table with the `app_runtime` role.
- **Do not** introduce new `Needs confirmation` rows during feature work — resolve class first.
- Money/tax: [`../business/HO_DEFAULTS_v1.md`](../business/HO_DEFAULTS_v1.md).

## Foundation / P1 infrastructure (migrations landed)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `audit_events` | TENANT_OWNED | **Done** (`000002`) | Walking-skeleton audit; converge with blueprint `audit_logs` via later expand/contract — see rls-intent-catalog |
| `outbox_events` | TENANT_OWNED | **Done** (`000002` + worker policy `000004`) | Transactional outbox |
| `idempotency_records` | TENANT_OWNED | **Done** (`000003`) | PK includes `tenant_id` |
| `inbox_events` | TENANT_OWNED | **Done** (`000004`) | Dedupe `(consumer_name, event_id)` |

## Identity / Tenant (blueprint §7.5)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `tenants` | **TENANT_ROOT** | **Done** (`000005`) | RLS on `id = app.tenant_id`. See identity-migration-design.md |
| `users` | GLOBAL | **Done** (`000005`) | Global identity, no `tenant_id` (§7.5.2) |
| `user_credentials` | GLOBAL | **Done** (`000005`) | Keyed by `user_id`, not tenant |
| `tenant_memberships` | TENANT_OWNED | **Done** (`000005`) | Unique `(tenant_id, user_id)` |
| `roles` | **HYBRID** | **Done** (`000005`) | System `tenant_id NULL` + tenant custom; see rls-intent-catalog §C |
| `permissions` | GLOBAL | **Done** (`000005`) | Seeded from permission_matrix.csv (75 keys) |
| `role_permissions` | **HYBRID** | **Done** (`000005`) | Same hybrid policy as `roles` via `role_id` |
| `membership_roles` | TENANT_OWNED | **Done** (`000005`) | Must stay tenant-consistent with the membership |
| `user_sessions` | TENANT_OWNED (nullable tenant) | **Done** (`000005`) | Definitive RLS in identity-migration-design.md |
| `refresh_tokens` | TENANT_OWNED (nullable tenant) | **Done** (`000005`) | Denormalized user_id + tenant_id; mirror session policy |
| `devices` | GLOBAL | **Done** (`000005`) | Belongs to `user_id`, not a tenant |
| `invitations` | TENANT_OWNED | **Done** (`000005`) | Unique active invite per `(tenant_id, email)` |
| `mfa_factors` | GLOBAL | **Done** (`000005`) | Belongs to `user_id` |
| `recovery_codes` | GLOBAL | **Done** (`000005`) | Belongs to `user_id` |
| `support_access_grants` | TENANT_OWNED | **Done** (`000005`) | Break-glass grant scoped to one tenant |

## Customer / CDP (blueprint §7.6)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `customers` | TENANT_OWNED | **Done** (`000011`) | PII ciphertext (`*_encrypted` BYTEA) + blind index (`*_blind_index`); RLS on `tenant_id` |
| `customer_identities` | TENANT_OWNED | **Done** (`000011`) | Unique `(tenant_id, provider, channel_account_id, external_id)` when scoped |
| `customer_addresses` | TENANT_OWNED | **Done** (`000011`) | Snapshot copied into order at confirm, not referenced live |
| `customer_tags` | TENANT_OWNED | **Done** (`000011`) | Unique tag name per tenant |
| `customer_tag_links` | TENANT_OWNED | **Done** (`000011`) | |
| `customer_consents` | TENANT_OWNED | **Done** (`000011`) | |
| `customer_notes` | TENANT_OWNED | **Done** (`000011`) | |
| `customer_merge_history` | TENANT_OWNED | **Done** (`000011`) | |

## Catalog (blueprint §7.7)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `categories` | TENANT_OWNED | **Done** (`000012`) | Self-ref `parent_id`; slug uniqueness scope still an open product decision |
| `products` | TENANT_OWNED | **Done** (`000012`) | No inventory quantity here |
| `product_variants` | TENANT_OWNED | **Done** (`000012`) | `cost_minor` field-level protected (§5.5); `price_minor` = tax-**inclusive** đồng per HO_DEFAULTS_v1 |
| `product_media` | TENANT_OWNED | **Done** (`000012`) | |
| `price_history` | TENANT_OWNED [ledger] | **Done** (`000012`) | Append-only; SELECT/INSERT only, no UPDATE/DELETE grant |
| `import_jobs` | TENANT_OWNED | **Done** (`000014`) | Owned by BE-IMP-001…005 |
| `import_job_rows` | TENANT_OWNED | **Done** (`000014`) | Staging rows; FORCE RLS |

## Inventory (blueprint §7.8)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `warehouses` | TENANT_OWNED | Not started | |
| `inventory_balances` | TENANT_OWNED | Not started | Unique `(tenant_id, warehouse_id, variant_id)`; composite FK both directions |
| `inventory_movements` | TENANT_OWNED [ledger] | Not started | Append-only |
| `inventory_reservations` | TENANT_OWNED | Not started | |
| `inventory_reservation_items` | TENANT_OWNED | Not started | |
| `inventory_adjustments` | TENANT_OWNED | Not started | |

## Knowledge / AI (blueprint §7.9)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `knowledge_sources` | TENANT_OWNED | Not started | |
| `knowledge_source_versions` | TENANT_OWNED | Not started | Only one published version effective at a time (unless scoped otherwise) |
| `knowledge_chunks` | TENANT_OWNED | Not started | Retrieval query MUST filter tenant + published version (§4.3.7) |
| `prompt_versions` | TENANT_OWNED | Not started | Technical default (not HO business decision): consistent with sibling AI tables + per-tenant `ai.configure`/`ai.activate`. Platform-wide-only prompts → override via ADR. |
| `ai_logs` | TENANT_OWNED | Not started | |
| `ai_tool_calls` | TENANT_OWNED | Not started | |
| `ai_evaluation_sets` | GLOBAL | Not started | Platform-owned eval harness (blueprint §13.13) — not tenant data |
| `ai_evaluation_cases` | GLOBAL | Not started | Child of `ai_evaluation_sets`; no `tenant_id` |
| `ai_evaluation_runs` | GLOBAL | Not started | Child of `ai_evaluation_sets`; no `tenant_id` |
| `ai_evaluation_results` | GLOBAL | Not started | Child of `ai_evaluation_sets`; no `tenant_id` |
| `ai_blocked_outputs` | TENANT_OWNED | Not started | Per-tenant incident record |

## Channel / Conversation (blueprint §7.10)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `channel_accounts` | TENANT_OWNED | Not started | |
| `channel_credentials` | TENANT_OWNED | Not started | Never expose via normal repository/DTO |
| `webhook_events` | TENANT_OWNED | Not started | Dedupe `(provider, channel_account_id, external_event_id)` |
| `conversations` | TENANT_OWNED | Not started | 5 independent state dimensions — see ERD.md §6 |
| `messages` | TENANT_OWNED | Not started | |
| `message_attachments` | TENANT_OWNED | Not started | |
| `conversation_assignments` | TENANT_OWNED [ledger-like history] | Not started | Current assignee denormalized on `conversations`; this table is the audit source |
| `conversation_notes` | TENANT_OWNED | Not started | |
| `outbound_messages` | TENANT_OWNED | Not started | |
| `outbound_delivery_attempts` | TENANT_OWNED | Not started | |

## Order / Payment / Fulfillment (blueprint §7.11)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `orders` | TENANT_OWNED | Not started | Unique `order_code` per tenant; HO_DEFAULTS: `tax_rate_bps=1000`, `prices_tax_inclusive=true` |
| `order_items` | TENANT_OWNED | Not started | Immutable snapshot after confirm; unit prices tax-inclusive |
| `order_status_history` | TENANT_OWNED [ledger] | Not started | |
| `payments` | TENANT_OWNED | Not started | |
| `payment_reconciliations` | TENANT_OWNED | Not started | |
| `shipments` | TENANT_OWNED | Not started | |
| `shipment_items` | TENANT_OWNED | Not started | |
| `shipping_labels` | TENANT_OWNED | Not started | |
| `returns` | TENANT_OWNED | Not started | |
| `return_items` | TENANT_OWNED | Not started | |
| `refunds` | TENANT_OWNED | Not started | |

## Analytics / Billing / Ops (blueprint §7.12)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `event_logs` | TENANT_OWNED | Not started | Projection, not a source of truth — doesn't replace outbox |
| `daily_tenant_metrics` | TENANT_OWNED | Not started | Fact table |
| `daily_channel_metrics` | TENANT_OWNED | Not started | Fact table |
| `daily_sales_agent_metrics` | TENANT_OWNED | Not started | Fact table |
| `daily_product_metrics` | TENANT_OWNED | Not started | Fact table |
| `conversation_conversion_facts` | TENANT_OWNED | Not started | Fact table |
| `order_profit_facts` | TENANT_OWNED | Not started | Fact table |
| `ai_quality_facts` | TENANT_OWNED | Not started | Fact table |
| `plans` | GLOBAL | Not started | Seed ids: `plan_free` \| `plan_pro` \| `plan_business` (HO_DEFAULTS_v1) |
| `subscriptions` | TENANT_OWNED | Not started | Over-limit: soft_warn → hard_block, no auto-upgrade (HO_DEFAULTS) |
| `usage_meters` | TENANT_OWNED | Not started | |
| `feature_flags` | GLOBAL | Not started | |
| `feature_flag_overrides` | TENANT_OVERRIDE | Not started | Global key + `tenant_id` |
| `system_alerts` | GLOBAL | Not started | Platform SRE alert; `ops.*` only — never tenant role |
| `support_tickets` | TENANT_OWNED | Not started | |
| `reprocess_requests` | GLOBAL | Not started | Ops API (`ops.reprocess`); optional nullable `target_tenant_id` filter column (not RLS ownership) |
| `job_runs` | SYSTEM_INTERNAL | Not started | Not exposed through user APIs (§6.1) |
| `audit_logs` | TENANT_OWNED (nullable tenant) [ledger] | Not started | Domain ledger (§7.12.5); converge with skeleton `audit_events` via expand/contract |

## Summary counts (W4 freeze baseline — update when migrations land)

| Class | Table count | RLS done |
|---|---:|---:|
| GLOBAL | 14 | 7 (identity GLOBAL tables in `000005`) |
| TENANT_OWNED (incl. ledgers) | 68 | 21 — 4 foundation + memberships/invites/grants/membership_roles (`000005`) + 8 Customer/CDP (`000011`) + 5 Catalog (`000012`) |
| TENANT_OWNED (nullable tenant) | 3 (`user_sessions`, `refresh_tokens`, `audit_logs`) | 2 (`user_sessions`, `refresh_tokens` in `000005`) |
| HYBRID | 2 (`roles`, `role_permissions`) | 2 (`000005`) |
| TENANT_OVERRIDE | 1 | 0 |
| TENANT_ROOT | 1 (`tenants`) | 1 (`000005`) |
| SYSTEM_INTERNAL | 1 (`job_runs`) | 0 |
| **Needs confirmation** | **0** | — |
| **Total indexed** | **90** | **see rows** |

Coverage inventory: [`../enterprise-freeze/inventory/data_dictionary_coverage.csv`](../enterprise-freeze/inventory/data_dictionary_coverage.csv)  
RLS templates: [`rls-intent-catalog.md`](rls-intent-catalog.md)

All prior blocking rows are resolved — `BE-IDN-001` is unblocked on classification. Fold `TENANT_ROOT` / `HYBRID` into blueprint §6.1 when that section is next edited.
