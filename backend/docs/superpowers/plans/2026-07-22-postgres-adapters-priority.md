# Postgres adapters — thứ tự ưu tiên

**Date:** 2026-07-22  
**Branch:** `cursor/postgres-adapters-identity-platform` (wave 6 — Identity platform)  
**Pattern:** RLS + `withTenantTransaction`; identity invite/accept/ops list dùng SECURITY DEFINER (000026)

## Ưu tiên

1. **Customer** — CDP nền; schema `000011`/`000013`
2. **Catalog** — FK cho inventory/order; schema `000012`
3. **Inventory** — phụ thuộc variants; schema `000015`
4. **Import** — schema `000014` (under catalog module)
5. **Order** — schema `000019`
6. **Payment** — schema `000020` (payments/refunds/attempts)
7. **Fulfillment / Returns** — schema `000020` (shipments/returns)
8. **Channel** — schema `000017`
9. **Conversation** — schema `000018`
10. **Knowledge** — schema `000016`
11. **AI orchestration** — schema `000021` + migration `000024` (suggestions/controls/eval tenant_id)
12. **Analytics** — schema `000022` (+ `uq_report_exports_tenant_idempotency` in `000024`)
13. **Billing** — schema `000023` + migration `000025` (usage/reprocess idempotency + feature_flags seed)
14. **Operations** — schema `000023`/`000024` (HYBRID: flags/alerts/reprocess/AI disable persisted)

## Quy tắc

- Wire `app.module.ts`: khi `DATABASE_URL` → Postgres repo; không có URL → giữ InMemory (hoặc không register domain — hiện tại chỉ Health).
- PII customer: stub envelope `v0:` + BYTEA + blind SHA-256 (KMS thật = follow-up).
- Idempotency: `app.idempotency_records` hoặc map trong adapter với ghi chú migrate sang store chuẩn.
- Tests: unit với mock optional; integration skip nếu không có `DATABASE_URL`.

## Exit

- [x] **Customer (CUS)** — `PostgresCustomerRepository` + PII stub + merge/outbox
- [x] **Catalog (CAT)** — `PostgresCatalogRepository` (+ Media on same class)
- [x] **Inventory (INV)** — `PostgresInventoryRepository`
- [x] **Import (IMP)** — `PostgresImportRepository` (apply port vẫn dùng catalog Postgres)
- [x] **Order (ORD)** — `PostgresOrderRepository` + status history
- [x] **Payment (PAY)** — `PostgresPaymentRepository` + refunds + provider attempts dedupe
- [x] **Fulfillment / Returns (FUL/RET)** — `PostgresFulfillmentRepository` (shipments + returns)
- [x] **Channel (CHN)** — `PostgresChannelRepository` (accounts/OAuth/webhooks/outbound)
- [x] **Conversation (CON)** — `PostgresConversationRepository` (inbox/messages/assignments/notes)
- [x] **Knowledge (KNW)** — `PostgresKnowledgeRepository` (sources/versions/chunks/published search)
- [x] **AI orchestration (AI)** — `PostgresAiOrchestrationRepository` + migration `000024_ai_suggestions_and_controls.sql`
- [x] **Analytics (DAT)** — `PostgresAnalyticsRepository` (events/watermarks/metrics/exports + idempotency index)
- [x] **Billing (BIL)** — `PostgresBillingRepository` + migration `000025` (meter/reprocess idempotency indexes + feature_flags seed)
- [x] **Operations (OPS)** — `PostgresOperationsRepository` HYBRID (flags/alerts/reprocess/disableAi persisted)
- [x] **Members / Roles** — `PostgresMembersRolesRepository` + `000026` invite/accept DEFINER
- [x] **Support grants** — `PostgresSupportGrantStore` (+ `support_grant_get` DEFINER)
- [x] **Audit list/export** — `PostgresAuditLogStore` (sync export from `audit_events`)
- [x] **Ops listTenants** — `app.ops_list_tenants()` DEFINER (permission enforced in app)
- [x] Wire `app.module.ts` when `DATABASE_URL`
- [x] Typecheck + focused smoke tests (`describe.skip` integration without DB)

## Gaps (v1)

- **Ops HYBRID:** `getTenantHealth` / `getAiHealth` synthetic stubs; desktop / hardening stay stub (application layer)
- Knowledge / AI: process-local idempotency Maps (migrate `app.idempotency_records`)
- Ops reprocess: process-local Map + DB `idempotency_key` via `trackReprocessIdempotency`
- AI: `tenant_ai_controls` stores full switch/budget JSON in `metadata`; column fields are denormalized
- AI eval runs: GLOBAL table + `tenant_id` column (no RLS) — filter in adapter
- Channel: OAuth tenant lookup + webhook dedupe (null-tenant) process-local Maps; idempotency Maps
- Conversation: SSE + customer stub + idempotency process-local Maps (no SSE/customer_identities tables)
- Idempotency adapter: process-local Map — migrate sang `app.idempotency_records`
- Media upload intents: process-local Map (chưa có bảng upload)
- Reconciliation jobs: process-local Map (chưa có bảng job)
- Payment reconciliations table unused (no repository method)
- Import object storage (`file_key` / `error_report_key`) left nullable
- InventoryRestockPort vẫn no-op; `completeReturn` truyền `orderItemId` vào `variantId` (cần lookup order_item→variant)
