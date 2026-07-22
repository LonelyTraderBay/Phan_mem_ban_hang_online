# Data Dictionary — Table Classification Index

Completes BE-P0-004 ("ERD/data dictionary/RLS classification for P1–P2", tracked in
[`../p0/P0_CHECKLIST.md`](../p0/P0_CHECKLIST.md)) by turning the class rules in
[`table-classification-seed.md`](table-classification-seed.md) into a full per-table checklist.
Field-level detail and diagrams live in [`ERD.md`](ERD.md); full validation prose is the blueprint
§6–§7. This file answers one question per table: **which class is it, and is RLS/migration done?**

## How to use this during implementation

- Before writing a table's migration, find its row here, confirm the class, then apply the rule
  from `table-classification-seed.md` (RLS + composite FK for `TENANT_OWNED`, restricted DB role
  for `SYSTEM_INTERNAL`, etc. — blueprint §6.1–§6.5).
- Flip `RLS/migration status` to `Done` only after the migration exists **and**
  `tenant isolation test suite` (blueprint §6.6) passes for that table with the `app_runtime` role.
- Rows marked **Needs confirmation** are cases the blueprint groups under a module without stating
  the class explicitly — do not guess; resolve via ADR or a one-line clarification commit to the
  blueprint before that table's migration ships. Release gate (§6.6) fails on missing RLS for any
  `TENANT_OWNED` table regardless of what this index says, so treat "Needs confirmation" as blocking.

## Identity / Tenant (blueprint §7.5)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `tenants` | **TENANT_ROOT** (resolved — new 5th class, see note below) | Not started | Not `TENANT_OWNED`: a row here doesn't have a `tenant_id` foreign key, it **is** the tenant. RLS row-filtering (`tenant_id = current_setting(...)`) doesn't apply. Access control is a plain permission check (`tenant.read`/`tenant.update`) plus "the actor's `membership.tenant_id` equals this row's `id`" in the application layer — not a `USING`/`WITH CHECK` policy. `ENABLE ROW LEVEL SECURITY` still applies (defense in depth) with a policy of `USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)`, i.e. the *inverse* comparison of every other table's policy (`id`, not `tenant_id`). |
| `users` | GLOBAL | Not started | Global identity, no `tenant_id` (§7.5.2) |
| `user_credentials` | GLOBAL | Not started | Keyed by `user_id`, not tenant |
| `tenant_memberships` | TENANT_OWNED | Not started | Unique `(tenant_id, user_id)` |
| `roles` | **Resolved — hybrid, see note** | Not started | Blueprint §7.5.5 already answers this ("system role có `tenant_id NULL`, custom role có tenant") — this row was flagged before that cross-reference was made explicit here. RLS policy: `USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid)` — a system template row (`tenant_id NULL`) is visible to every tenant read-only; only a tenant's own custom rows (`tenant_id = <theirs>`) are visible/writable beyond that. `WITH CHECK` must still require `tenant_id = current_setting(...)` (a tenant can never insert/update a `tenant_id NULL` row — that's a platform-only seed operation via `app_migrator`, never `app_runtime`). |
| `permissions` | GLOBAL | Not started | Immutable key catalog |
| `role_permissions` | Follows `roles` | Not started | Same hybrid policy as `roles`, joined through `role_id` |
| `membership_roles` | TENANT_OWNED | Not started | Must stay tenant-consistent with the membership |
| `user_sessions` | **Resolved — TENANT_OWNED (nullable `tenant_id`)** | Not started | Sessions may exist before tenant selection (post-password / MFA challenge / pre-`switch-tenant`). `tenant_id` is nullable. RLS (definitive): `ENABLE`+`FORCE ROW LEVEL SECURITY`. Policy for `app_runtime`/`app_worker`: `USING (user_id = nullif(current_setting('app.actor_id', true), '')::uuid AND (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid))` with the same predicate on `WITH CHECK`. Rows are never visible across users. A tenant-bound session (`tenant_id` set) is invisible under a different `app.tenant_id`. Pre-tenant rows (`tenant_id IS NULL`) remain visible to the owning actor so login/MFA/switch-tenant can bind them. Platform ops listing all sessions uses `app_migrator` / break-glass support grant paths — not this policy. See `docs/data/identity-migration-design.md`. |
| `refresh_tokens` | Follows `user_sessions` | Not started | Same actor+nullable-tenant visibility via `session_id` join (or denormalized `user_id`/`tenant_id` mirroring the parent session). |
| `devices` | GLOBAL | Not started | Belongs to `user_id`, not a tenant |
| `invitations` | TENANT_OWNED | Not started | Unique active invite per `(tenant_id, email)` |
| `mfa_factors` | GLOBAL | Not started | Belongs to `user_id` |
| `recovery_codes` | GLOBAL | Not started | Belongs to `user_id` |
| `support_access_grants` | TENANT_OWNED | Not started | Break-glass grant scoped to one tenant |

## Customer / CDP (blueprint §7.6)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `customers` | TENANT_OWNED | Not started | |
| `customer_identities` | TENANT_OWNED | Not started | Unique `(tenant_id, provider, channel_account_id, external_id)` when scoped |
| `customer_addresses` | TENANT_OWNED | Not started | Snapshot copied into order at confirm, not referenced live |
| `customer_tags` | TENANT_OWNED | Not started | Unique tag name per tenant |
| `customer_tag_links` | TENANT_OWNED | Not started | |
| `customer_consents` | TENANT_OWNED | Not started | |
| `customer_notes` | TENANT_OWNED | Not started | |
| `customer_merge_history` | TENANT_OWNED | Not started | |

## Catalog (blueprint §7.7)

| Table | Class | RLS/migration status | Notes |
|---|---|---|---|
| `categories` | TENANT_OWNED | Not started | |
| `products` | TENANT_OWNED | Not started | No inventory quantity here |
| `product_variants` | TENANT_OWNED | Not started | `cost_minor` is field-level protected (§5.5) even though row is tenant-owned |
| `product_media` | TENANT_OWNED | Not started | |
| `price_history` | TENANT_OWNED [ledger] | Not started | Append-only |
| `import_jobs` | TENANT_OWNED | Not started | |
| `import_job_rows` | TENANT_OWNED | Not started | |

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
| `prompt_versions` | **Resolved: TENANT_OWNED** | Not started | Blueprint doesn't state this explicitly, so this is a technical default (not a business decision) chosen for consistency with every sibling AI table (`knowledge_sources`, `ai_logs`, `ai_tool_calls` are all `TENANT_OWNED`) and because `ai.configure`/`ai.activate` are per-tenant permissions in `permission_matrix.csv` — a tenant activating "their" prompt version only makes sense if the row is theirs. If v1 product scope turns out to be "every tenant gets the same platform-authored prompt, no customization," this degrades gracefully (one row per tenant, all identical content) rather than requiring a schema migration later. If Human Owner wants true platform-wide-only prompts in v1, override via ADR — flagging this choice in `docs/collaboration/SIGNOFF_TRACKER.md` for awareness, not blocking on it. |
| `ai_logs` | TENANT_OWNED | Not started | |
| `ai_tool_calls` | TENANT_OWNED | Not started | |
| `ai_evaluation_sets` | **Resolved: GLOBAL** | Not started | Platform-owned eval harness gating model/prompt releases across all tenants (blueprint §13.13) — not tenant data. |
| `ai_evaluation_cases` | Follows `ai_evaluation_sets` | Not started | |
| `ai_evaluation_runs` | Follows `ai_evaluation_sets` | Not started | |
| `ai_evaluation_results` | Follows `ai_evaluation_sets` | Not started | |
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
| `orders` | TENANT_OWNED | Not started | Unique `order_code` per tenant |
| `order_items` | TENANT_OWNED | Not started | Immutable snapshot after confirm |
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
| `plans` | GLOBAL | Not started | Versioned limits/features |
| `subscriptions` | TENANT_OWNED | Not started | |
| `usage_meters` | TENANT_OWNED | Not started | |
| `feature_flags` | GLOBAL | Not started | |
| `feature_flag_overrides` | TENANT_OVERRIDE | Not started | Global key + `tenant_id` |
| `system_alerts` | **Resolved: GLOBAL** | Not started | SRE-facing platform alert, not tenant business data — visible only via `ops.*` permissions, which are `Platform-only via separate role` per `permission_matrix.csv`, never a tenant role. |
| `support_tickets` | TENANT_OWNED | Not started | |
| `reprocess_requests` | **Resolved: GLOBAL, with optional nullable `target_tenant_id` filter column** | Not started | Reclassified from the seed file's "likely SYSTEM_INTERNAL" guess: `ops.reprocess` **is** exposed through a real API (`permission_matrix.csv` row 58, Super Admin only) — blueprint §6.1 defines `SYSTEM_INTERNAL` as specifically *not* exposed through user APIs, so that class is wrong here even for a platform-only user. Use `GLOBAL` (actor is platform ops, not tenant-scoped) with a plain nullable `target_tenant_id` column (not RLS-enforced — the row isn't owned by that tenant, it's an ops record that happens to reference one) for requests that reprocess one tenant's data. |
| `job_runs` | SYSTEM_INTERNAL | Not started | Not exposed through user APIs (§6.1) |
| `audit_logs` | TENANT_OWNED (nullable tenant) [ledger] | Not started | "`tenant_id` nullable for global action" (§7.12.5) |

## Summary counts (fill in as migrations land)

| Class | Table count | RLS done |
|---|---:|---:|
| GLOBAL | 11 (+3 resolved: `ai_evaluation_sets` group, `system_alerts`, `reprocess_requests`) | 0 |
| TENANT_OWNED | ~56 (+1 resolved: `prompt_versions`) | 0 |
| TENANT_OVERRIDE | 1 | 0 |
| TENANT_ROOT (new 5th class) | 1 (`tenants`, resolved) | 0 |
| SYSTEM_INTERNAL | 1 (+ migration history, outbox lease per seed file) | 0 |
| Needs confirmation | 0 — all 6 resolved 2026-07-21, see notes column per row above | — |

All 6 previously-blocking rows are resolved as of this pass — `BE-IDN-001` (the first P2 ticket,
which needed `tenants`/`roles`) is unblocked on this front. `tenants`' new `TENANT_ROOT` class and
`roles`' hybrid policy should be folded into blueprint §6.1's class table and §7.5.5 respectively
the next time that section is touched, so this file stops being the only place they're written down.

Update these counts whenever a migration ships — this table is the single place leadership/QA can
check "how much of P1's data layer is actually RLS-safe" without reading every migration file.
