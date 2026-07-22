# Postgres adapters — thứ tự ưu tiên

**Date:** 2026-07-22  
**Branch:** `cursor/postgres-adapters-fulfillment-returns` (wave 3)  
**Pattern:** RLS + `withTenantTransaction` (không SECURITY DEFINER)

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
10. (sau) Knowledge / AI / Analytics / Billing / Ops …

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
- [x] Wire `app.module.ts` when `DATABASE_URL`
- [x] Typecheck + focused smoke tests (`describe.skip` integration without DB)

## Gaps (v1)

- Knowledge / AI / Analytics / Billing / Ops vẫn InMemory
- Channel: OAuth tenant lookup + webhook dedupe (null-tenant) process-local Maps; idempotency Maps
- Conversation: SSE + customer stub + idempotency process-local Maps (no SSE/customer_identities tables)
- Idempotency adapter: process-local Map — migrate sang `app.idempotency_records`
- Media upload intents: process-local Map (chưa có bảng upload)
- Reconciliation jobs: process-local Map (chưa có bảng job)
- Payment reconciliations table unused (no repository method)
- Import object storage (`file_key` / `error_report_key`) left nullable
- InventoryRestockPort vẫn no-op; `completeReturn` truyền `orderItemId` vào `variantId` (cần lookup order_item→variant)
