# Review package Task P1.1
BASE: pre-P1.1 working tree (docs before this task)
HEAD: working tree after P1.1
Commits: none

## Stat
 backend/docs/data/ERD.md                | 14 ++++++++++++++
 backend/docs/data/data-dictionary.md    | 23 +++++++++++++++++------
 backend/docs/data/rls-intent-catalog.md | 12 ++++++++++++
 3 files changed, 43 insertions(+), 6 deletions(-)

## Diff

diff --git a/backend/docs/data/ERD.md b/backend/docs/data/ERD.md
index 294cdf1..0430042 100644
--- a/backend/docs/data/ERD.md
+++ b/backend/docs/data/ERD.md
@@ -122,10 +122,12 @@ erDiagram
 ```
 
 Notes: `TENANT_MEMBERSHIPS` unique `(tenant_id, user_id)`. `MEMBERSHIP_ROLES` tenant-consistent ΓÇö
 never assign a custom role from tenant A to a membership in tenant B. Full field list: ┬º7.5.1ΓÇô7.5.7.
 
+**Also migrated (not drawn):** `oidc_login_states` (`000006`), `password_reset_tokens`, `mfa_challenges` (`000009`) ΓÇö see [`data-dictionary.md`](data-dictionary.md) + rls-intent-catalog ┬ºH.
+
 ## 2. Customer / CDP (blueprint ┬º7.6)
 
 ```mermaid
 erDiagram
   CUSTOMERS ||--o{ CUSTOMER_IDENTITIES : "has"
@@ -244,10 +246,12 @@ erDiagram
 
 Notes: `PRODUCTS` does not carry inventory quantity ΓÇö that lives entirely in the Inventory context
 below, linked only by `variant_id`. Import confirm requires job version/checksum match to prevent
 a changed file/mapping being applied silently after preview (┬º7.7.6).
 
+**Also migrated (not drawn):** `media_upload_intents` (`000028`) ΓÇö pre-signed upload intent before `product_media` attach.
+
 ## 4. Inventory (blueprint ┬º7.8)
 
 ```mermaid
 erDiagram
   WAREHOUSES ||--o{ INVENTORY_BALANCES : "holds"
@@ -304,10 +308,12 @@ erDiagram
 Notes: `available_to_sell = max(0, on_hand - reserved - blocked - damaged - safety_stock)` ΓÇö a
 derived value, not a stored column (┬º7.8.2, invariant ┬º4.3.4: never negative after commit).
 Unique `(tenant_id, warehouse_id, variant_id)` on `inventory_balances`. Reservation items change
 `reserved` only, never `on_hand` directly (┬º7.8.5).
 
+**Also migrated (not drawn):** `inventory_reconciliation_jobs` (`000029`) ΓÇö durable reconciliation job body for multi-instance GET.
+
 ## 5. Knowledge / AI (blueprint ┬º7.9)
 
 ```mermaid
 erDiagram
   KNOWLEDGE_SOURCES ||--o{ KNOWLEDGE_SOURCE_VERSIONS : "has versions"
@@ -361,10 +367,12 @@ erDiagram
 ```
 
 Notes: retrieval MUST filter tenant + published version only (┬º7.9.2, invariant ┬º4.3.7). Active
 `prompt_versions` row is immutable ΓÇö editing creates a new version, never an in-place update.
 
+**Also migrated (not drawn):** `ai_suggestions`, `tenant_ai_controls` (`000024`) ΓÇö copilot lifecycle + per-tenant AI switch/budget.
+
 ## 6. Channel / Conversation (blueprint ┬º7.10)
 
 ```mermaid
 erDiagram
   CHANNEL_ACCOUNTS ||--o{ CHANNEL_CREDENTIALS : "secures"
@@ -424,10 +432,12 @@ erDiagram
 Notes: `conversations` deliberately splits state across 5 independent dimensions rather than one
 status enum (┬º7.10.4) ΓÇö do not collapse these into a single "conversation status" field anywhere
 in FE or reporting. Webhook dedupe falls back to payload-hash + time bucket only when the provider
 gives no event ID (┬º7.10.3).
 
+**Also migrated (not drawn):** `channel_oauth_states` (`000017`, durable consume `000030`) ΓÇö OAuth PKCE state per channel account.
+
 ## 7. Order / Payment / Fulfillment (blueprint ┬º7.11)
 
 ```mermaid
 erDiagram
   ORDERS ||--o{ ORDER_ITEMS : "contains"
@@ -501,10 +511,12 @@ erDiagram
 Notes: a confirmed order's items are an immutable price/cost snapshot (invariant ┬º4.3.5) ΓÇö later
 catalog changes never rewrite order history. Amendments after confirm go through an explicit P1
 amendment flow, not a direct `order_items` update (┬º7.11.1). Prices are tax-**inclusive** at 10%
 VAT unless an ADR supersedes [`HO_DEFAULTS_v1`](../business/HO_DEFAULTS_v1.md).
 
+**Also migrated (not drawn):** `payment_attempts` (`000020`) ΓÇö provider attempt log linked to `payments`.
+
 ## 8. Analytics / Billing / Ops (blueprint ┬º7.12)
 
 ```mermaid
 erDiagram
   PLANS ||--o{ SUBSCRIPTIONS : "subscribed to"
@@ -538,10 +550,12 @@ erDiagram
 Notes: `event_logs` is an immutable projection, not a replacement for the outbox (┬º7.12.1). Billing
 enforcement never blocks critical recovery/support flows (┬º4.2). `audit_logs` never contains raw
 secrets or full sensitive PII ΓÇö only redacted before/after (┬º7.12.5). Over-limit: soft_warn ΓåÆ
 hard_block (HO_DEFAULTS). Skeleton `audit_events` Γåö domain `audit_logs` convergence: see ┬º0.
 
+**Also migrated (not drawn):** `projection_watermarks`, `report_exports` (`000022`; export idempotency index `000024`) ΓÇö worker cursors + async report export jobs.
+
 ## Source-of-truth matrix (copied from blueprint ┬º7.13 ΓÇö do not fork, edit there)
 
 | Dß╗» liß╗çu | Source of truth | Derived/cache |
 |---|---|---|
 | Current stock | `inventory_balances` reconciled against ledger | cache/search |
diff --git a/backend/docs/data/data-dictionary.md b/backend/docs/data/data-dictionary.md
index c04eac1..793b5cb 100644
--- a/backend/docs/data/data-dictionary.md
+++ b/backend/docs/data/data-dictionary.md
@@ -44,10 +44,13 @@ authoritative for AI coding agents ΓÇö do not re-open without ADR.
 | `devices` | GLOBAL | **Done** (`000005`) | Belongs to `user_id`, not a tenant |
 | `invitations` | TENANT_OWNED | **Done** (`000005`) | Unique active invite per `(tenant_id, email)` |
 | `mfa_factors` | GLOBAL | **Done** (`000005`) | Belongs to `user_id` |
 | `recovery_codes` | GLOBAL | **Done** (`000005`) | Belongs to `user_id` |
 | `support_access_grants` | TENANT_OWNED | **Done** (`000005`) | Break-glass grant scoped to one tenant |
+| `oidc_login_states` | SYSTEM_INTERNAL / ephemeral | **Done** (`000006`) | Pre-auth PKCE state; no `tenant_id`; SECURITY DEFINER consume only ΓÇö see rls-intent-catalog ┬ºH |
+| `password_reset_tokens` | GLOBAL (user-scoped) | **Done** (`000009`) | Hash-only; keyed by `user_id`; no RLS ΓÇö SECURITY DEFINER helpers (BE-IDN-007) |
+| `mfa_challenges` | GLOBAL (user-scoped) | **Done** (`000009`) | Ephemeral step-up/login challenge; keyed by `user_id`; SECURITY DEFINER (BE-IDN-008) |
 
 ## Customer / CDP (blueprint ┬º7.6)
 
 | Table | Class | RLS/migration status | Notes |
 |---|---|---|---|
@@ -66,10 +69,11 @@ authoritative for AI coding agents ΓÇö do not re-open without ADR.
 |---|---|---|---|
 | `categories` | TENANT_OWNED | **Done** (`000012`) | Self-ref `parent_id`; slug uniqueness scope still an open product decision |
 | `products` | TENANT_OWNED | **Done** (`000012`) | No inventory quantity here |
 | `product_variants` | TENANT_OWNED | **Done** (`000012`) | `cost_minor` field-level protected (┬º5.5); `price_minor` = tax-**inclusive** ─æß╗ông per HO_DEFAULTS_v1 |
 | `product_media` | TENANT_OWNED | **Done** (`000012`) | |
+| `media_upload_intents` | TENANT_OWNED | **Done** (`000028`) | Pre-signed upload intent; durable across instances (BE-CAT-004); `product_media` is the attached object |
 | `price_history` | TENANT_OWNED [ledger] | **Done** (`000012`) | Append-only; SELECT/INSERT only, no UPDATE/DELETE grant |
 | `import_jobs` | TENANT_OWNED | **Done** (`000014`) | Owned by BE-IMP-001ΓÇª005 |
 | `import_job_rows` | TENANT_OWNED | **Done** (`000014`) | Staging rows; FORCE RLS |
 
 ## Inventory (blueprint ┬º7.8)
@@ -80,10 +84,11 @@ authoritative for AI coding agents ΓÇö do not re-open without ADR.
 | `inventory_balances` | TENANT_OWNED | **Done** (`000015`) | Unique `(tenant_id, warehouse_id, variant_id)`; composite FK both directions |
 | `inventory_movements` | TENANT_OWNED [ledger] | **Done** (`000015`) | Append-only |
 | `inventory_reservations` | TENANT_OWNED | **Done** (`000015`) | |
 | `inventory_reservation_items` | TENANT_OWNED | **Done** (`000015`) | |
 | `inventory_adjustments` | TENANT_OWNED | **Done** (`000015`) | |
+| `inventory_reconciliation_jobs` | TENANT_OWNED | **Done** (`000029`) | Durable job body for GET-by-id across instances (BE-INV-007); HTTP idempotency stays on `idempotency_records` |
 
 ## Knowledge / AI (blueprint ┬º7.9)
 
 | Table | Class | RLS/migration status | Notes |
 |---|---|---|---|
@@ -96,17 +101,20 @@ authoritative for AI coding agents ΓÇö do not re-open without ADR.
 | `ai_evaluation_sets` | GLOBAL | Done (`000021`) | Platform-owned eval harness (blueprint ┬º13.13) ΓÇö not tenant data |
 | `ai_evaluation_cases` | GLOBAL | Done (`000021`) | Child of `ai_evaluation_sets`; no `tenant_id` |
 | `ai_evaluation_runs` | GLOBAL | Done (`000021`) | Child of `ai_evaluation_sets`; no `tenant_id` |
 | `ai_evaluation_results` | GLOBAL | Done (`000021`) | Child of `ai_evaluation_sets`; no `tenant_id` |
 | `ai_blocked_outputs` | TENANT_OWNED | Done (`000021`) | Per-tenant incident record |
+| `ai_suggestions` | TENANT_OWNED | **Done** (`000024`) | Copilot/semi-auto/autopilot suggestion lifecycle per conversation |
+| `tenant_ai_controls` | TENANT_OWNED | **Done** (`000024`) | One row per tenant ΓÇö switch + token budget (used by ops health snapshot `000027`) |
 
 ## Channel / Conversation (blueprint ┬º7.10)
 
 | Table | Class | RLS/migration status | Notes |
 |---|---|---|---|
 | `channel_accounts` | TENANT_OWNED | **Done** (`000017`) | |
 | `channel_credentials` | TENANT_OWNED | **Done** (`000017`) | Never expose via normal repository/DTO |
+| `channel_oauth_states` | TENANT_OWNED | **Done** (`000017`) | OAuth PKCE/state token; unique `state_token`; consumed by callback (`000030`) |
 | `webhook_events` | TENANT_OWNED | **Done** (`000017`) | Dedupe `(provider, channel_account_id, external_event_id)` |
 | `conversations` | TENANT_OWNED | **Done** (`000018`) | 5 independent state dimensions ΓÇö see ERD.md ┬º6 |
 | `messages` | TENANT_OWNED | **Done** (`000018`) | |
 | `message_attachments` | TENANT_OWNED | **Done** (`000018`) | |
 | `conversation_assignments` | TENANT_OWNED [ledger-like history] | **Done** (`000018`) | Current assignee denormalized on `conversations`; this table is the audit source |
@@ -120,10 +128,11 @@ authoritative for AI coding agents ΓÇö do not re-open without ADR.
 |---|---|---|---|
 | `orders` | TENANT_OWNED | **Done** (`000019`) | Unique `order_code` per tenant; HO_DEFAULTS: `tax_rate_bps=1000`, `prices_tax_inclusive=true` |
 | `order_items` | TENANT_OWNED | **Done** (`000019`) | Immutable snapshot after confirm; unit prices tax-inclusive |
 | `order_status_history` | TENANT_OWNED [ledger] | **Done** (`000019`) | |
 | `payments` | TENANT_OWNED | **Done** (`000020`) | |
+| `payment_attempts` | TENANT_OWNED | **Done** (`000020`) | Provider attempt log per `payment_id`; dedupe `(tenant_id, provider_event_id)` when set |
 | `payment_reconciliations` | TENANT_OWNED | **Done** (`000020`) | |
 | `shipments` | TENANT_OWNED | **Done** (`000020`) | |
 | `shipment_items` | TENANT_OWNED | **Done** (`000020`) | |
 | `shipping_labels` | TENANT_OWNED | Not started | |
 | `returns` | TENANT_OWNED | **Done** (`000020`) | |
@@ -133,10 +142,12 @@ authoritative for AI coding agents ΓÇö do not re-open without ADR.
 ## Analytics / Billing / Ops (blueprint ┬º7.12)
 
 | Table | Class | RLS/migration status | Notes |
 |---|---|---|---|
 | `event_logs` | TENANT_OWNED | **Done** (`000022`) | Projection, not a source of truth ΓÇö doesn't replace outbox |
+| `projection_watermarks` | TENANT_OWNED | **Done** (`000022`) | PK `(tenant_id, projection_name)` ΓÇö worker cursor for analytics projections |
+| `report_exports` | TENANT_OWNED | **Done** (`000022` + idempotency index `000024`) | Async export jobs; optional `idempotency_key` per tenant |
 | `daily_tenant_metrics` | TENANT_OWNED | **Done** (`000022`) | Fact table |
 | `daily_channel_metrics` | TENANT_OWNED | **Done** (`000022`) | Fact table |
 | `daily_sales_agent_metrics` | TENANT_OWNED | **Done** (`000022`) | Fact table |
 | `daily_product_metrics` | TENANT_OWNED | **Done** (`000022`) | Fact table |
 | `conversation_conversion_facts` | TENANT_OWNED | **Done** (`000022`) | Fact table |
@@ -155,19 +166,19 @@ authoritative for AI coding agents ΓÇö do not re-open without ADR.
 
 ## Summary counts (W4 freeze baseline ΓÇö update when migrations land)
 
 | Class | Table count | RLS done |
 |---|---:|---:|
-| GLOBAL | 14 | 7 (identity GLOBAL tables in `000005`) |
-| TENANT_OWNED (incl. ledgers) | 68 | 21 ΓÇö 4 foundation + memberships/invites/grants/membership_roles (`000005`) + 8 Customer/CDP (`000011`) + 5 Catalog (`000012`) |
-| TENANT_OWNED (nullable tenant) | 3 (`user_sessions`, `refresh_tokens`, `audit_logs`) | 2 (`user_sessions`, `refresh_tokens` in `000005`) |
+| GLOBAL | 16 | 16 ΓÇö incl. `password_reset_tokens`, `mfa_challenges` (`000009`) |
+| TENANT_OWNED (incl. ledgers) | 76 | 74 ΓÇö Not started: `shipping_labels`, `support_tickets` |
+| TENANT_OWNED (nullable tenant) | 3 (`user_sessions`, `refresh_tokens`, `audit_logs`) | 2 ΓÇö `audit_logs` Not started |
 | HYBRID | 2 (`roles`, `role_permissions`) | 2 (`000005`) |
-| TENANT_OVERRIDE | 1 | 0 |
+| TENANT_OVERRIDE | 1 | 1 (`000023`) |
 | TENANT_ROOT | 1 (`tenants`) | 1 (`000005`) |
-| SYSTEM_INTERNAL | 1 (`job_runs`) | 0 |
+| SYSTEM_INTERNAL | 2 (`job_runs`, `oidc_login_states`) | 1 ΓÇö `oidc_login_states` Done (`000006`); `job_runs` Not started |
 | **Needs confirmation** | **0** | ΓÇö |
-| **Total indexed** | **90** | **see rows** |
+| **Total indexed** | **101** | **97 Done** / 4 Not started |
 
 Coverage inventory: [`../enterprise-freeze/inventory/data_dictionary_coverage.csv`](../enterprise-freeze/inventory/data_dictionary_coverage.csv)  
 RLS templates: [`rls-intent-catalog.md`](rls-intent-catalog.md)
 
 All prior blocking rows are resolved ΓÇö `BE-IDN-001` is unblocked on classification. Fold `TENANT_ROOT` / `HYBRID` into blueprint ┬º6.1 when that section is next edited.
diff --git a/backend/docs/data/rls-intent-catalog.md b/backend/docs/data/rls-intent-catalog.md
index da2b6d0..350889a 100644
--- a/backend/docs/data/rls-intent-catalog.md
+++ b/backend/docs/data/rls-intent-catalog.md
@@ -83,10 +83,22 @@ Tables marked `[ledger]` in the dictionary: no hard DELETE; corrections via comp
 | `product_variants.unit_price_minor` | Tax-**inclusive** ─æß╗ông |
 | `orders.tax_rate_bps` | const **1000** (10%) unless ADR supersedes |
 | `orders.prices_tax_inclusive` | **true** |
 | `plans.id` | `plan_free` \| `plan_pro` \| `plan_business` |
 
+### H. Ephemeral pre-auth / user-scoped GLOBAL (no tenant RLS)
+
+Tables without `tenant_id` that are **not** platform catalogs ΓÇö access via SECURITY DEFINER helpers only:
+
+| Table | Class | Migration | RLS |
+|-------|-------|-----------|-----|
+| `oidc_login_states` | SYSTEM_INTERNAL / ephemeral | `000006` | No RLS; runtime insert/consume via `oidc_save_login_state` / callback helpers |
+| `password_reset_tokens` | GLOBAL (user-scoped) | `000009` | No RLS; hash-only; keyed by `user_id` |
+| `mfa_challenges` | GLOBAL (user-scoped) | `000009` | No RLS; keyed by `user_id`; consumed on verify |
+
+Do **not** apply template A/E blindly ΓÇö see migration SECURITY DEFINER functions.
+
 ## Foundation tables already migrated (P1)
 
 | Table | Class | Migration | RLS |
 |-------|-------|-----------|-----|
 | `audit_events` | TENANT_OWNED | `000002` | Done (skeleton; domain `audit_logs` is the full ledger name in ┬º7) |

## HO-STAGING-CHECKLIST (may be untracked)

**Trạng thái A0:** **QUYẾT ĐỊNH + INFRA + MIGRATE 34/34** — còn secrets/hosts trước cutover đủ: DB password, Auth0 client, HTTPS app hosts. Board: [`A-TO-F-EXECUTION-STATUS.md`](./A-TO-F-EXECUTION-STATUS.md).
| 1 | Managed Postgres + HA deps | `BE-FND-015` | PASS (native PG17 `ai_sales`) | **PARTIAL** — project ACTIVE + **migrate 34/34**; local `.env.staging` vẫn thiếu |
| 4a | Migrate latest | `migrate.mjs` | **PASS** — no pending (thru `000034`) | **PASS** — thru `000034` on `lrcsbrmqlyvkxxspbezi` |
**P0.1 sync evidence (2026-07-24):** local `app.schema_migrations` = staging = **34** (= số file `000NNN_*.sql` trong `backend/infra/migrations`); local đã apply pending `000034_fix_accept_invitation_ambiguity.sql`; staging đã khớp trước phiên.
**HA baseline:** Managed Postgres Supabase = đạt baseline DB cho bậc A. Redis/object store không bắt buộc để mở migrate/smoke Phase A.
| Migrate staging qua latest | `backend/tools/migrate.mjs` / MCP thru `000034` | [x] 2026-07-23 |
| Được phép agent dùng secret staging để migrate/smoke? | **Yes** — khi `.env.staging` có trên máy (không paste chat) |
