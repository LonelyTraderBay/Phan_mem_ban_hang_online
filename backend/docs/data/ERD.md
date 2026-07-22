# ERD — Entity Relationship Diagrams (P1–P2 baseline)

Source of truth for field-level rules, constraints, and validation remains
`backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` §6–§7. This file renders
that prose into diagrams + a queryable index (see [`data-dictionary.md`](data-dictionary.md)) so a
developer can see relationships at a glance instead of parsing paragraphs. **If this file and the
blueprint ever disagree, the blueprint wins — fix this file, don't fix the blueprint from here.**

**Enterprise freeze W4 (2026-07-22):** table classes + RLS intent are frozen in
[`data-dictionary.md`](data-dictionary.md) + [`rls-intent-catalog.md`](rls-intent-catalog.md)
(`Needs confirmation` = 0). Money/tax: [`../business/HO_DEFAULTS_v1.md`](../business/HO_DEFAULTS_v1.md).

Every table also carries the standard audit columns from blueprint §7.2
(`id, tenant_id, version, created_at, created_by, updated_at, updated_by, deleted_at?, metadata`)
unless noted `[ledger]` (append-only, no `updated_at`/`version` update after insert per §7.2) or
`[GLOBAL]` (no `tenant_id`, per §6.1). Diagrams omit these common columns for readability — full
column lists live in the blueprint sections cited under each diagram.

## How to keep this file honest

- Never add a field here that isn't in the cited blueprint section — if you need a new field,
  change the blueprint first (it's the contract), then mirror the diagram.
- When a module's real migration diverges from the blueprint (schema evolves during
  implementation), update **both** this file and the blueprint section in the same PR, or flag the
  drift in `contract-gap-board.md` if the two owners disagree on which is correct.

## 0. Foundation / P1 infrastructure (already migrated)

Not drawn as a full ERD — classes + RLS status live in the dictionary:

| Table | Class | Migration |
|-------|-------|-----------|
| `audit_events` | TENANT_OWNED | `000002` |
| `outbox_events` | TENANT_OWNED | `000002` + worker policy `000004` |
| `idempotency_records` | TENANT_OWNED | `000003` |
| `inbox_events` | TENANT_OWNED | `000004` |

Identity tables (§1) shipped in **`000005_identity_schema.sql`** (BE-IDN-001) — see data-dictionary RLS status **Done**.

`audit_events` (skeleton) must converge with domain `audit_logs` (§7.12.5) via expand/contract — see
[`rls-intent-catalog.md`](rls-intent-catalog.md).

---

## 1. Identity / Tenant (blueprint §7.5)

```mermaid
erDiagram
  TENANTS ||--o{ TENANT_MEMBERSHIPS : "has"
  USERS ||--o{ TENANT_MEMBERSHIPS : "belongs to"
  USERS ||--o{ USER_CREDENTIALS : "authenticates via"
  USERS ||--o{ USER_SESSIONS : "opens"
  USER_SESSIONS ||--o{ REFRESH_TOKENS : "issues"
  USER_SESSIONS }o--|| DEVICES : "on"
  TENANT_MEMBERSHIPS ||--o{ MEMBERSHIP_ROLES : "granted"
  MEMBERSHIP_ROLES }o--|| ROLES : "role"
  ROLES ||--o{ ROLE_PERMISSIONS : "grants"
  ROLE_PERMISSIONS }o--|| PERMISSIONS : "permission"
  TENANTS ||--o{ INVITATIONS : "sends"
  USERS ||--o{ MFA_FACTORS : "enrolls"
  USERS ||--o{ RECOVERY_CODES : "has"
  TENANTS ||--o{ SUPPORT_ACCESS_GRANTS : "grants break-glass"

  TENANTS {
    uuid id PK
    citext code UK "unique global slug"
    text name
    text status "provisioning|active|suspended|closed"
    text timezone "IANA"
    char3 currency
    bigint permission_version "incr on role/membership change"
    text data_region
  }
  USERS {
    uuid id PK "global identity"
    text primary_email UK "canonical lowercase, partial unique"
    text status "pending|active|locked|disabled|deleted"
    timestamptz anonymized_at
  }
  USER_CREDENTIALS {
    uuid user_id FK
    text credential_type "password|oidc"
    text password_hash
    int failed_count
    timestamptz locked_until
  }
  TENANT_MEMBERSHIPS {
    uuid tenant_id FK
    uuid user_id FK
    text status "invited|active|suspended|revoked"
    text display_name
    uuid default_warehouse_id
  }
  ROLES {
    uuid id PK
    uuid tenant_id "NULL for system template role"
    text name
  }
  PERMISSIONS {
    text key PK "GLOBAL, resource.action format"
  }
  USER_SESSIONS {
    uuid id PK
    uuid user_id FK
    uuid tenant_id FK
    uuid device_id FK
    timestamptz absolute_expiry
    boolean revoked
  }
  REFRESH_TOKENS {
    uuid id PK
    text token_hash
    uuid family_id
    uuid parent_id
    timestamptz reuse_detected_at
  }
  DEVICES {
    uuid id PK
    text platform
    text trust_status
  }
```

Notes: `TENANT_MEMBERSHIPS` unique `(tenant_id, user_id)`. `MEMBERSHIP_ROLES` tenant-consistent —
never assign a custom role from tenant A to a membership in tenant B. Full field list: §7.5.1–7.5.7.

## 2. Customer / CDP (blueprint §7.6)

```mermaid
erDiagram
  CUSTOMERS ||--o{ CUSTOMER_IDENTITIES : "has"
  CUSTOMERS ||--o{ CUSTOMER_ADDRESSES : "has"
  CUSTOMERS ||--o{ CUSTOMER_TAG_LINKS : "tagged"
  CUSTOMER_TAGS ||--o{ CUSTOMER_TAG_LINKS : "applied via"
  CUSTOMERS ||--o{ CUSTOMER_CONSENTS : "grants"
  CUSTOMERS ||--o{ CUSTOMER_NOTES : "has"
  CUSTOMERS ||--o{ CUSTOMER_MERGE_HISTORY : "merged (source or target)"

  CUSTOMERS {
    uuid id PK
    text display_name
    bytea phone_encrypted
    bytea email_encrypted
    text status
    numeric hot_score
    numeric risk_score
    uuid merged_into_customer_id "nullable, self-ref"
  }
  CUSTOMER_IDENTITIES {
    uuid customer_id FK
    text identity_type
    text provider
    text channel_account_id
    text external_id
    text normalized_value_hash "blind index"
    boolean is_primary
  }
  CUSTOMER_ADDRESSES {
    uuid customer_id FK
    bytea receiver_name_encrypted
    bytea phone_encrypted
    text province_code
    text district_code
    boolean is_default
  }
  CUSTOMER_TAGS { text name UK "unique tenant-scoped" }
  CUSTOMER_CONSENTS {
    uuid customer_id FK
    text purpose
    text lawful_basis
    timestamptz granted_at
    timestamptz revoked_at
  }
  CUSTOMER_MERGE_HISTORY {
    uuid source_customer_id FK
    uuid target_customer_id FK
    jsonb field_resolution
    text reason
  }
```

Notes: unique identity is never on the encrypted field directly — always via
`customer_identities` + provider rules (§7.6.2). Address snapshot must be copied into the order at
confirm time (§7.6.3) — orders do not reference `customer_addresses` live after confirmation.

## 3. Catalog (blueprint §7.7)

```mermaid
erDiagram
  CATEGORIES ||--o{ CATEGORIES : "parent of"
  CATEGORIES ||--o{ PRODUCTS : "classifies"
  PRODUCTS ||--o{ PRODUCT_VARIANTS : "has"
  PRODUCT_VARIANTS ||--o{ PRODUCT_MEDIA : "shown via"
  PRODUCT_VARIANTS ||--o{ PRICE_HISTORY : "tracked by"
  IMPORT_JOBS ||--o{ IMPORT_JOB_ROWS : "contains"

  CATEGORIES {
    uuid id PK
    uuid parent_id FK "self-ref, no cycles"
    text slug
    text path
  }
  PRODUCTS {
    uuid id PK
    uuid category_id FK
    text status "draft|active|archived"
    jsonb attributes
  }
  PRODUCT_VARIANTS {
    uuid id PK
    uuid product_id FK
    text sku UK "canonical uppercase/trim, unique active per tenant"
    text barcode
    bigint price_minor "gte 0"
    bigint cost_minor "gte 0, field-level protected"
    char3 currency
    text status "active|inactive|archived"
  }
  PRODUCT_MEDIA {
    uuid variant_id FK
    text object_key
    text media_type
    text scan_status
  }
  PRICE_HISTORY {
    uuid variant_id FK "ledger, append-only"
    bigint old_price_minor
    bigint new_price_minor
    bigint old_cost_minor
    bigint new_cost_minor
    text reason
  }
  IMPORT_JOBS {
    uuid id PK
    text status "uploaded->analyzing->preview_ready->confirmed->applying->completed|failed|cancelled"
    text file_checksum
  }
  IMPORT_JOB_ROWS {
    uuid import_job_id FK
    int row_number
    jsonb validation_errors
  }
```

Notes: `PRODUCTS` does not carry inventory quantity — that lives entirely in the Inventory context
below, linked only by `variant_id`. Import confirm requires job version/checksum match to prevent
a changed file/mapping being applied silently after preview (§7.7.6).

## 4. Inventory (blueprint §7.8)

```mermaid
erDiagram
  WAREHOUSES ||--o{ INVENTORY_BALANCES : "holds"
  INVENTORY_BALANCES }o--|| PRODUCT_VARIANTS : "for variant (cross-context FK)"
  WAREHOUSES ||--o{ INVENTORY_MOVEMENTS : "logs"
  INVENTORY_RESERVATIONS ||--o{ INVENTORY_RESERVATION_ITEMS : "reserves"
  INVENTORY_ADJUSTMENTS ||--o{ INVENTORY_MOVEMENTS : "produces"

  WAREHOUSES {
    uuid id PK
    text code UK "unique tenant"
    boolean allow_fulfillment
  }
  INVENTORY_BALANCES {
    uuid warehouse_id FK "composite FK (tenant_id, warehouse_id)"
    uuid variant_id FK "composite FK (tenant_id, variant_id)"
    numeric on_hand "gte 0"
    numeric reserved "gte 0"
    numeric blocked "gte 0"
    numeric damaged "gte 0"
    numeric safety_stock "gte 0"
    int version "optimistic concurrency"
  }
  INVENTORY_MOVEMENTS {
    text movement_type "receive|adjust_in|adjust_out|sale|cancel_restore|return_in|transfer_out|transfer_in|damage|repair|block|unblock"
    numeric quantity_delta "signed, ledger"
    numeric before_on_hand
    numeric after_on_hand
    text reference_type
    uuid reference_id
  }
  INVENTORY_RESERVATIONS {
    uuid id PK
    text owner_type "order|conversation|manual"
    uuid owner_id
    text status
    timestamptz expires_at
    timestamptz converted_at
    timestamptz released_at
  }
  INVENTORY_RESERVATION_ITEMS {
    uuid reservation_id FK
    uuid warehouse_id
    uuid variant_id
    numeric quantity
  }
  INVENTORY_ADJUSTMENTS {
    text reason_code
    text evidence_file
    uuid approved_by
  }
```

Notes: `available_to_sell = max(0, on_hand - reserved - blocked - damaged - safety_stock)` — a
derived value, not a stored column (§7.8.2, invariant §4.3.4: never negative after commit).
Unique `(tenant_id, warehouse_id, variant_id)` on `inventory_balances`. Reservation items change
`reserved` only, never `on_hand` directly (§7.8.5).

## 5. Knowledge / AI (blueprint §7.9)

```mermaid
erDiagram
  KNOWLEDGE_SOURCES ||--o{ KNOWLEDGE_SOURCE_VERSIONS : "has versions"
  KNOWLEDGE_SOURCE_VERSIONS ||--o{ KNOWLEDGE_CHUNKS : "chunked into"
  PROMPT_VERSIONS ||--o{ AI_LOGS : "used by"
  AI_LOGS ||--o{ AI_TOOL_CALLS : "invokes"
  AI_EVALUATION_SETS ||--o{ AI_EVALUATION_CASES : "contains"
  AI_EVALUATION_SETS ||--o{ AI_EVALUATION_RUNS : "run against"
  AI_EVALUATION_RUNS ||--o{ AI_EVALUATION_RESULTS : "produces"

  KNOWLEDGE_SOURCES { uuid id PK }
  KNOWLEDGE_SOURCE_VERSIONS {
    uuid source_id FK
    text lifecycle "draft|in_review|approved|published|archived"
    timestamptz effective_from
    timestamptz effective_to
    text checksum
  }
  KNOWLEDGE_CHUNKS {
    uuid source_version_id FK
    int chunk_index
    vector embedding
    text embedding_model
    int token_count
  }
  PROMPT_VERSIONS {
    text name
    text semver
    text status "draft|evaluating|approved|active|retired"
    text checksum "active version is immutable"
  }
  AI_LOGS {
    uuid conversation_id
    uuid prompt_version_id FK
    text model
    int token_usage
    numeric cost
    text final_disposition
  }
  AI_TOOL_CALLS {
    text tool_name
    text risk_class
    text policy_decision
    uuid approval_id
    text idempotency_key
  }
  AI_EVALUATION_SETS { text risk_tier }
  AI_EVALUATION_CASES { jsonb expected_assertions }
  AI_EVALUATION_RUNS { text pass_fail }
  AI_EVALUATION_RESULTS { numeric score }
```

Notes: retrieval MUST filter tenant + published version only (§7.9.2, invariant §4.3.7). Active
`prompt_versions` row is immutable — editing creates a new version, never an in-place update.

## 6. Channel / Conversation (blueprint §7.10)

```mermaid
erDiagram
  CHANNEL_ACCOUNTS ||--o{ CHANNEL_CREDENTIALS : "secures"
  CHANNEL_ACCOUNTS ||--o{ WEBHOOK_EVENTS : "receives"
  CHANNEL_ACCOUNTS ||--o{ CONVERSATIONS : "hosts"
  CONVERSATIONS ||--o{ MESSAGES : "contains"
  MESSAGES ||--o{ MESSAGE_ATTACHMENTS : "has"
  CONVERSATIONS ||--o{ CONVERSATION_ASSIGNMENTS : "assigned via"
  CONVERSATIONS ||--o{ CONVERSATION_NOTES : "annotated by"
  CONVERSATIONS ||--o{ OUTBOUND_MESSAGES : "sends"
  OUTBOUND_MESSAGES ||--o{ OUTBOUND_DELIVERY_ATTEMPTS : "attempts"

  CHANNEL_ACCOUNTS {
    text provider
    text external_account_id
    text status
    text health_state
  }
  WEBHOOK_EVENTS {
    text provider
    text external_event_id UK "dedupe (provider, channel_account_id, external_event_id)"
    boolean signature_valid
    text processing_status
    int attempt_count
  }
  CONVERSATIONS {
    text lifecycle_status "new|open|resolved|archived"
    text waiting_on "none|customer|staff"
    text sales_stage "none|qualified|order_draft|order_confirmed"
    text escalation_status "normal|escalated"
    text ai_mode "off|copilot|semi_auto|autopilot|human_takeover"
    uuid customer_id
    timestamptz sla_due_at
  }
  MESSAGES {
    text direction "inbound|outbound|internal"
    text external_message_id UK
    text content_type
    boolean ai_generated
  }
  MESSAGE_ATTACHMENTS {
    text object_key
    text malware_scan_state
  }
  CONVERSATION_ASSIGNMENTS { uuid assignee_id "history, append-only" }
  OUTBOUND_MESSAGES {
    text client_idempotency_key
    text status
    text blocked_reason
  }
  OUTBOUND_DELIVERY_ATTEMPTS {
    int attempt_number
    text provider_request_id
  }
```

Notes: `conversations` deliberately splits state across 5 independent dimensions rather than one
status enum (§7.10.4) — do not collapse these into a single "conversation status" field anywhere
in FE or reporting. Webhook dedupe falls back to payload-hash + time bucket only when the provider
gives no event ID (§7.10.3).

## 7. Order / Payment / Fulfillment (blueprint §7.11)

```mermaid
erDiagram
  ORDERS ||--o{ ORDER_ITEMS : "contains"
  ORDERS ||--o{ ORDER_STATUS_HISTORY : "tracked by"
  ORDERS ||--o{ PAYMENTS : "paid via"
  PAYMENTS ||--o{ PAYMENT_RECONCILIATIONS : "reconciled by"
  ORDERS ||--o{ SHIPMENTS : "fulfilled by"
  SHIPMENTS ||--o{ SHIPMENT_ITEMS : "contains"
  SHIPMENTS ||--o{ SHIPPING_LABELS : "labeled by"
  ORDERS ||--o{ RETURNS : "returned via"
  RETURNS ||--o{ RETURN_ITEMS : "contains"
  RETURNS ||--o{ REFUNDS : "refunded via"

  ORDERS {
    uuid id PK
    text order_code UK "unique tenant, immutable, display"
    text order_status
    text payment_status
    text fulfillment_status
    text return_status
    char3 currency
    int tax_rate_bps "HO default 1000 = 10%"
    boolean prices_tax_inclusive "HO default true"
    bigint grand_total
    bigint locked_cost_total
    uuid reservation_id "FK inventory_reservations"
    text idempotency_key
  }
  ORDER_ITEMS {
    uuid order_id FK
    uuid variant_id "snapshot, immutable after confirm"
    text sku_snapshot
    bigint unit_price_minor_snapshot
    bigint unit_cost_minor_snapshot
    numeric quantity
  }
  ORDER_STATUS_HISTORY {
    text dimension_changed "ledger"
    text old_state
    text new_state
    text reason
  }
  PAYMENTS {
    text method
    bigint amount_minor
    text status
    text provider_event_id UK "idempotency"
  }
  PAYMENT_RECONCILIATIONS {
    bigint expected_amount
    bigint actual_amount
    text match_state
  }
  SHIPMENTS {
    text carrier
    text tracking_number
    text status
    bigint cod_amount
  }
  SHIPMENT_ITEMS { numeric quantity "not exceeding unfulfilled quantity" }
  SHIPPING_LABELS { text object_key }
  RETURNS { text reason }
  RETURN_ITEMS { numeric quantity }
  REFUNDS {
    bigint amount_minor
    text provider_reference
    text idempotency_key
  }
```

Notes: a confirmed order's items are an immutable price/cost snapshot (invariant §4.3.5) — later
catalog changes never rewrite order history. Amendments after confirm go through an explicit P1
amendment flow, not a direct `order_items` update (§7.11.1). Prices are tax-**inclusive** at 10%
VAT unless an ADR supersedes [`HO_DEFAULTS_v1`](../business/HO_DEFAULTS_v1.md).

## 8. Analytics / Billing / Ops (blueprint §7.12)

```mermaid
erDiagram
  PLANS ||--o{ SUBSCRIPTIONS : "subscribed to"
  SUBSCRIPTIONS ||--o{ USAGE_METERS : "meters"
  FEATURE_FLAGS ||--o{ FEATURE_FLAG_OVERRIDES : "overridden per tenant"

  EVENT_LOGS { text event_type }
  PLANS { text id UK "plan_free|plan_pro|plan_business"
    text name "GLOBAL, versioned" }
  SUBSCRIPTIONS { text status
    text period }
  USAGE_METERS {
    text metric
    numeric consumed
    numeric limit_value
  }
  FEATURE_FLAGS { text key UK "GLOBAL" }
  FEATURE_FLAG_OVERRIDES { boolean enabled }
  SYSTEM_ALERTS { text severity }
  SUPPORT_TICKETS { text status }
  AUDIT_LOGS {
    text actor_type
    text action
    text resource_type
    text resource_id
    text result
    text integrity_hash "ledger, append-only"
  }
```

Notes: `event_logs` is an immutable projection, not a replacement for the outbox (§7.12.1). Billing
enforcement never blocks critical recovery/support flows (§4.2). `audit_logs` never contains raw
secrets or full sensitive PII — only redacted before/after (§7.12.5). Over-limit: soft_warn →
hard_block (HO_DEFAULTS). Skeleton `audit_events` ↔ domain `audit_logs` convergence: see §0.

## Source-of-truth matrix (copied from blueprint §7.13 — do not fork, edit there)

| Dữ liệu | Source of truth | Derived/cache |
|---|---|---|
| Current stock | `inventory_balances` reconciled against ledger | cache/search |
| Stock history | `inventory_movements` | report fact |
| Order total | `orders` + `order_items` snapshot | dashboard fact |
| Current conversation state | `conversations` | inbox cache |
| Message content/delivery | `messages`, `outbound_messages` | search index |
| Permission | membership/role/permission tables | Redis permission cache |
| AI decision trace | `ai_logs`, `ai_tool_calls`, policy decision | dashboard fact |
| Revenue/profit report | facts reconciled with order/payment source | materialized views |
