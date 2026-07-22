---
doc_type: backend_workplan
project: AI Sales Operating System / AI Sales Manager
language: vi-VN
split_from: Enterprise_Grade_AI_Sales_OS_Implementation_Blueprint(1).md
version: 1.0
created_date: 2026-06-25
owner_team: Backend / AI / DevOps / Security
purpose: >
  Tài liệu giao việc cho đội Backend để phát triển song song với đội Frontend.
  Backend chịu trách nhiệm Cloud SaaS Backend, database, API contract, integration,
  AI service, queue, audit, security, observability và vận hành hạ tầng.
---

# BACKEND WORKPLAN — AI SALES OPERATING SYSTEM

## 0. Mục tiêu của file này

File này tách riêng phần Backend từ blueprint tổng thể để đội Backend có thể làm độc lập nhưng vẫn khớp với đội Frontend thông qua API contract, realtime contract, shared types và acceptance criteria.

Backend không chỉ là REST API. Trong dự án này, Backend là **nguồn sự thật duy nhất** cho dữ liệu và nghiệp vụ:

```text
Cloud SaaS Backend
+ API Gateway
+ Database / Migration / Multi-tenant
+ Webhook / Queue / Worker
+ AI Service / RAG / Guardrail / AI Logs
+ Product / Inventory / Order / Conversation
+ RBAC / Audit / Security / Privacy
+ Analytics / Reporting / Billing
+ Observability / Backup / Runbook
```

---

# 1. Ranh giới trách nhiệm Backend

## 1.1 Backend chịu trách nhiệm

| Nhóm | Backend owner |
|---|---|
| Source of truth | Tenant, user, customer, product, inventory, conversation, AI log, order, payment, shipping, billing |
| API Gateway | Auth middleware, request context, rate limit, routing, OpenAPI |
| Auth/Tenant/RBAC | Login, session, refresh token, 2FA admin, roles, permissions, device revoke |
| Audit/Security | Audit append-only, tenant isolation, PII protection, secret management, security test |
| Database | ERD, migration, index, transaction, lock, backup/restore |
| Channel integration | Facebook OAuth/webhook/message/comment, adapter pattern, idempotency |
| Queue/Worker | Webhook processing, outbound message, AI job, retry, dead letter |
| Conversation backend | Message, conversation state, assignment, SLA, realtime events |
| Product/Inventory | Product, SKU, import Excel, inventory movement, reservation |
| Knowledge/Policy | FAQ/policy approval, published knowledge, RAG chunk metadata |
| AI Service | Tool calling, context builder, prompt version, QC agent, eval, AI log |
| Order Core | Order draft, order confirm/cancel, reservation conversion, payment/shipping basic |
| Analytics | Event tracking, daily metrics, dashboard read models |
| Operations | Monitoring, alerting, runbook, feature flags, super-admin support API |
| Billing | Plan, subscription, usage meter, feature limits |

## 1.2 Backend không chịu trách nhiệm chính

| Không thuộc Backend chính | Ghi chú |
|---|---|
| UI layout / component visual | Frontend owner |
| Web Admin screens | Frontend owner, Backend cung cấp API |
| Windows installer / auto-update UI | Frontend/Desktop owner, Backend có thể hỗ trợ update metadata nếu cần |
| Desktop notification UI | Frontend/Desktop owner |
| Printing preview UI | Frontend/Desktop owner; Backend có thể render data/HTML/PDF nếu thống nhất |
| Design system | Frontend owner |
| Copywriting chi tiết trên màn hình | Product/Frontend owner |

---

# 2. Nguyên tắc bắt buộc

1. **Không tin tenant_id từ client cho security decision.** Tenant context lấy từ access token/session server-side.
2. **Mọi bảng nghiệp vụ phải có `tenant_id`.**
3. **Không hard delete giao dịch.** Dùng soft delete/status/history.
4. **AI không được direct-write database quan trọng.** AI gọi tool/service có policy enforcement.
5. **Webhook/create order/send message/payment callback phải có idempotency.**
6. **Không log token, password, secret, full PII không cần thiết.**
7. **Order + inventory reservation phải transaction-safe.**
8. **Audit log bắt buộc cho hành động nhạy cảm.**
9. **Prompt/model production phải có version, eval và rollback.**
10. **Production deploy qua CI/CD, có migration/rollback/backup.**

---

# 3. Kiến trúc Backend đề xuất

## 3.1 Container/backend services

```text
apps/
├── api-gateway/
├── worker/
└── super-admin-api/        # có thể nằm chung gateway giai đoạn MVP

services/
├── auth-service/
├── tenant-service/
├── channel-service/
├── conversation-service/
├── product-service/
├── inventory-service/
├── order-service/
├── ai-service/
├── analytics-service/
├── billing-service/
├── rule-engine/
└── audit-service/

packages/
├── shared-types/
├── api-contracts/
├── logger/
├── config/
├── auth-context/
├── errors/
└── test-utils/

infra/
├── docker/
├── terraform/
├── monitoring/
├── migrations/
└── runbooks/
```

## 3.2 Stack khuyến nghị

| Thành phần | Khuyến nghị |
|---|---|
| Backend core | NestJS/Node.js hoặc FastAPI nếu team Python mạnh |
| AI Service | Python FastAPI, tách khỏi Order/Inventory |
| Database | PostgreSQL |
| Vector | pgvector cho MVP |
| Queue | Redis/BullMQ hoặc RabbitMQ |
| Cache | Redis |
| Object storage | S3-compatible |
| Logging | Structured JSON logs |
| Observability | OpenTelemetry + Sentry/Grafana/Prometheus |
| CI/CD | GitHub Actions/GitLab CI |
| Infra MVP | Docker + VM/managed DB; scale sau mới Kubernetes |

## 3.3 Service boundary

| Service | Trách nhiệm | Không nên làm |
|---|---|---|
| API Gateway | Auth middleware, tenant context, routing, rate limit, request validation | Business logic phức tạp |
| Auth/Tenant | Login, refresh, session, 2FA, device, role, permission, tenant lifecycle | Order/conversation logic |
| Channel | OAuth, token vault, webhook verification, normalize event, send message queue | Inventory/order calculation |
| Conversation | Conversation, message, assignment, SLA, customer card read composition | Inventory transaction |
| Product/Inventory | Product, SKU, price, cost, stock, movement, reservation | Chat UI/prompt |
| Knowledge | Policy/FAQ lifecycle, chunking metadata, published-only retrieval | Send message trực tiếp |
| AI | Intent, context builder, RAG, tool calls, QC, eval, AI logs | Bypass service để ghi DB |
| Rule Engine | Business policy, approval, permission for AI/action | UI rendering |
| Order | Order, order item, payment status, shipping status, return state | Webhook parsing |
| Analytics | Events, read models, daily metrics, dashboard facts | Source-of-truth transaction |
| Billing | Plan, subscription, usage limits | Product/order logic |
| Audit | Append-only audit log API | Mutate nghiệp vụ |
| Worker | Async jobs, retry, DLQ, scheduled tasks | UI logic |

---

# 4. Database scope

## 4.1 Identity/Tenant

| Bảng | Ghi chú Backend |
|---|---|
| `tenants` | shop/tenant, status, plan, timezone, currency |
| `users` | user thuộc tenant |
| `roles` | role system/custom |
| `permissions` | permission catalog |
| `role_permissions` | mapping role-permission |
| `user_roles` | mapping user-role |
| `user_sessions` | refresh token hash, expiry, revoked |
| `devices` | Windows/web device, version, revoke |

## 4.2 Customer/CDP

| Bảng | Ghi chú Backend |
|---|---|
| `customers` | PII encrypted/hash, hot_score, risk_score |
| `customer_identities` | map Facebook/Zalo/TikTok/web identities |
| `customer_addresses` | address encrypted |
| `customer_tags` | tag catalog |
| `customer_tag_links` | many-to-many |
| `customer_consents` | consent for remarketing/support |
| `customer_notes` | internal notes |

## 4.3 Channel/Conversation

| Bảng | Ghi chú Backend |
|---|---|
| `channel_accounts` | Page/OA/shop connected |
| `oauth_tokens` | encrypted token ref, no raw token in logs |
| `webhook_events` | raw event, idempotency, status, retry |
| `conversations` | state, assigned_to, lead_score, SLA |
| `messages` | normalized message/comment |
| `message_attachments` | files/media |
| `conversation_assignments` | assignment history |
| `conversation_notes` | internal notes |
| `outbound_messages` | queue trạng thái gửi tin |

## 4.4 Product/Inventory

| Bảng | Ghi chú Backend |
|---|---|
| `products` | product master |
| `product_variants` | SKU/variant, price, cost |
| `categories` | category tree |
| `product_media` | media refs |
| `warehouses` | warehouse |
| `inventory_balances` | on_hand/reserved/safety_stock |
| `inventory_movements` | inventory ledger |
| `inventory_reservations` | active/released/expired/converted |
| `price_history` | price/cost history |
| `import_jobs` | Excel/CSV import lifecycle |

## 4.5 Knowledge/AI

| Bảng | Ghi chú Backend |
|---|---|
| `knowledge_sources` | FAQ/policy/feedback status |
| `knowledge_chunks` | embeddings + metadata |
| `prompt_versions` | prompt/model config versioning |
| `ai_logs` | prompt version, sources, output, QC |
| `ai_tool_calls` | tool input/output/status/latency |
| `ai_evaluation_sets` | eval set |
| `ai_evaluation_cases` | eval case |
| `ai_evaluation_runs` | eval result |
| `ai_blocked_outputs` | rule block history |

## 4.6 Order/Payment/Shipping/Return

| Bảng | Ghi chú Backend |
|---|---|
| `orders` | order code, customer, conversation, totals, statuses |
| `order_items` | locked unit_price/cost_price |
| `order_status_history` | status history |
| `payments` | COD/bank/cash/manual payment |
| `payment_reconciliations` | P1/P2 |
| `shipments` | carrier/tracking/status/COD |
| `shipping_labels` | printed labels |
| `returns` | return lifecycle |
| `return_items` | return details |

## 4.7 Analytics/Billing/Ops

| Bảng | Ghi chú Backend |
|---|---|
| `event_logs` | product/business events |
| `daily_tenant_metrics` | dashboard read model |
| `daily_channel_metrics` | channel metrics |
| `daily_sales_agent_metrics` | sale SLA/performance |
| `daily_product_metrics` | product performance |
| `conversation_conversion_facts` | conversion facts |
| `order_profit_facts` | gross profit facts |
| `ai_quality_facts` | AI quality |
| `ai_usage_meters` | token/cost |
| `plans` | plan config |
| `subscriptions` | subscription status |
| `usage_meters` | usage/limit |
| `feature_flags` | rollout |
| `system_alerts` | ops alerts |
| `support_tickets` | support |
| `audit_logs` | append-only audit |

---

# 5. API contract bắt buộc

## 5.1 Chuẩn chung

- REST/JSON cho core API.
- WebSocket hoặc SSE cho realtime inbox/notification.
- OpenAPI là nguồn contract chính.
- Error format thống nhất.
- Cursor pagination cho list lớn.
- Idempotency-Key cho create/update critical.
- Version API khi breaking change.
- `request_id` và `correlation_id` trong response/log.
- Permission check server-side.

## 5.2 Error format

```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSION",
    "message": "Bạn không có quyền thực hiện thao tác này.",
    "details": {
      "required_permission": "order.cancel"
    },
    "request_id": "req_abc123"
  }
}
```

## 5.3 Pagination format

```http
GET /conversations?cursor=abc&limit=50&status=open
```

```json
{
  "data": [],
  "page_info": {
    "next_cursor": "def",
    "has_more": true
  }
}
```

## 5.4 API nhóm Auth/Tenant

```http
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/password/forgot
POST /auth/password/reset
GET  /me
GET  /tenants/current
PATCH /tenants/current
GET  /users
POST /users/invite
PATCH /users/{user_id}
GET  /roles
POST /roles
PATCH /roles/{role_id}
GET  /permissions
GET  /devices
DELETE /devices/{device_id}/revoke
GET  /audit-logs
```

## 5.5 API nhóm Product/Inventory/Knowledge

```http
GET    /products
POST   /products
GET    /products/{product_id}
PATCH  /products/{product_id}
POST   /products/import
GET    /products/import/{job_id}
GET    /variants
GET    /inventory/balances
POST   /inventory/adjustments
POST   /inventory/reservations
POST   /inventory/reservations/{reservation_id}/release
GET    /knowledge/sources
POST   /knowledge/sources
PATCH  /knowledge/sources/{source_id}
POST   /knowledge/sources/{source_id}/publish
POST   /knowledge/sources/{source_id}/archive
```

## 5.6 API nhóm Channel/Conversation

```http
GET    /channels/accounts
POST   /channels/facebook/connect
POST   /channels/facebook/webhook
GET    /channels/{channel_account_id}/health

GET    /conversations
GET    /conversations/{conversation_id}
PATCH  /conversations/{conversation_id}
POST   /conversations/{conversation_id}/assign
POST   /conversations/{conversation_id}/notes
POST   /conversations/{conversation_id}/messages
POST   /conversations/{conversation_id}/human-takeover
GET    /conversations/{conversation_id}/ai-suggestions
POST   /conversations/{conversation_id}/ai-suggestions/{suggestion_id}/send
```

## 5.7 API nhóm AI

```http
POST /ai/suggestions
POST /ai/evaluate-response
POST /ai/test-message
GET  /ai/logs
GET  /ai/logs/{ai_log_id}
GET  /ai/blocked-outputs
POST /ai/prompt-versions
POST /ai/prompt-versions/{prompt_version_id}/run-evaluation
POST /ai/prompt-versions/{prompt_version_id}/activate
```

## 5.8 API nhóm Order/Payment/Shipping

```http
GET    /orders
POST   /orders
GET    /orders/{order_id}
PATCH  /orders/{order_id}
POST   /orders/{order_id}/confirm
POST   /orders/{order_id}/cancel
POST   /orders/{order_id}/payments
POST   /orders/{order_id}/shipments
POST   /orders/{order_id}/print-packing-slip
GET    /orders/{order_id}/history
```

## 5.9 API nhóm Analytics/Billing/Ops

```http
GET /dashboard/today
GET /reports/revenue
GET /reports/gross-profit
GET /reports/sla
GET /reports/ai-quality

GET  /billing/plan
GET  /billing/usage
POST /billing/subscription/manual-update

GET  /super-admin/tenants
GET  /super-admin/tenants/{tenant_id}/health
POST /super-admin/tenants/{tenant_id}/feature-flags
POST /super-admin/tenants/{tenant_id}/disable-ai
GET  /super-admin/system-alerts
```

---

# 6. Realtime / event contract

## 6.1 WebSocket/SSE events cho Frontend

```text
conversation.message_received
conversation.updated
conversation.assigned
conversation.sla_breached
ai.suggestion_ready
ai.approval_required
ai.response_blocked
order.created
order.updated
inventory.updated
channel.health_changed
system.notification
```

## 6.2 Internal domain events

```text
webhook.event_received
webhook.event_processed
conversation.message_received
conversation.reply_sent
conversation.hot_lead_detected
ai.suggestion_created
ai.response_blocked
order.draft_created
order.confirmed
order.cancelled
inventory.reserved
inventory.reservation_expired
payment.marked_paid
shipment.created
customer.updated
channel.token_expired
```

## 6.3 Event envelope

```json
{
  "event_id": "evt_123",
  "event_type": "order.confirmed",
  "tenant_id": "tnt_001",
  "occurred_at": "2026-06-25T10:00:00Z",
  "correlation_id": "corr_abc",
  "actor": {
    "type": "user",
    "id": "usr_123"
  },
  "data": {
    "order_id": "ord_123"
  },
  "schema_version": 1
}
```

---

# 7. Work breakdown theo epic

## E00 — Foundation / DevOps / Skeleton

### Backend tasks

- Tạo monorepo structure.
- Tạo API Gateway skeleton.
- Health check endpoint.
- Global error handler.
- OpenAPI setup.
- Request ID/correlation ID.
- Logger package structured JSON.
- Config package.
- Docker local stack: API + PostgreSQL + Redis.
- Migration tool.
- CI pipeline: lint, type check, unit test, build.
- Secret scan/dependency scan.
- Deploy staging.
- Sentry/OpenTelemetry baseline.

### Output

- Staging URL.
- OpenAPI skeleton.
- Docker local chạy được.
- Migration chạy được.
- Logger dùng chung.

### Acceptance criteria

- Developer clone repo và chạy local được.
- PR không pass lint/test/build thì không merge.
- Có request_id/correlation_id trong logs.
- Health endpoint báo DB/Redis status.
- Không có secret trong repo.

---

## E01 — Tenant / Auth / RBAC / Audit / Device

### Backend tasks

- Tenant model + status lifecycle.
- User model.
- Login/refresh/logout.
- Refresh token rotation.
- Password reset.
- 2FA cho Owner/Admin.
- Role/permission seed.
- User invite.
- Device session.
- Device revoke API.
- Audit service append-only.
- Middleware permission check.
- Tenant isolation tests.

### Output

- Auth endpoints.
- Current tenant/user API.
- RBAC API.
- Audit API.
- Device API.

### Acceptance criteria

- User không truy cập được tenant khác.
- Sale không thấy cost/profit nếu thiếu permission.
- Change role/invite/deactivate có audit.
- Refresh token cũ bị vô hiệu sau rotation.
- Device revoke làm app logout.

---

## E02 — Product / SKU / Import

### Backend tasks

- Category CRUD.
- Product CRUD.
- Variant/SKU CRUD.
- Price/cost fields with permission control.
- Media reference API.
- Import Excel/CSV job.
- Column detection/mapping.
- Validation engine.
- Import preview.
- Import report.
- Duplicate SKU handling.
- Price history audit.

### Output

- Product/SKU APIs.
- Import job APIs.
- Import report format.
- Permission tests.

### Acceptance criteria

- Import có preview lỗi trước khi ghi DB.
- SKU unique theo tenant.
- Sale không đọc cost nếu không có quyền.
- Sửa giá/cost có audit.
- Import lỗi không ghi dữ liệu nửa chừng.

---

## E03 — Inventory / Reservation / Policy / Knowledge

### Backend tasks

- Warehouse CRUD.
- Inventory balance model.
- Inventory movement ledger.
- Inventory adjustment API.
- Reservation create/release/expire/convert.
- Transaction + row lock for reservation.
- Scheduled job release expired reservation.
- Policy/FAQ CRUD.
- Knowledge status: draft/approved/published/archived.
- Published-only retrieval.
- Knowledge chunk metadata.
- Initial RAG ingestion pipeline.

### Output

- Inventory APIs.
- Reservation API.
- Policy/Knowledge API.
- RAG-ready knowledge store.

### Acceptance criteria

- Available = on_hand - reserved - blocked/damaged nếu có.
- Không reserved vượt available.
- 2 người tạo đơn cùng lúc không làm tồn âm.
- Hủy đơn release reservation.
- Knowledge chưa published không được AI dùng.
- Adjustment có reason + audit.

---

## E04 — Channel Integration / Webhook Platform

### Backend tasks

- Channel adapter interface.
- Facebook OAuth connect fanpage.
- Token encryption/vault integration.
- Webhook verification.
- Raw event storage.
- Idempotency key generation.
- Dedupe unique index.
- Normalize message/comment.
- Queue processing.
- Outbound message queue.
- Provider send message.
- Retry/backoff/DLQ.
- Channel health check.
- Token revoked/missing permission detection.

### Output

- Facebook channel connect.
- Webhook endpoint.
- Inbound normalized events.
- Outbound send queue.
- Health Center API.

### Acceptance criteria

- Webhook trùng không tạo trùng message/order.
- Fake webhook bị reject.
- Event lỗi vào retry/DLQ.
- Token lỗi hiển thị qua health API.
- Send message có status queued/sent/failed/blocked.
- Raw payload được lưu nhưng bảo vệ PII.

---

## E05 — Conversation / Smart Inbox backend

### Backend tasks

- Conversation model/state machine.
- Message model + attachments.
- Customer identity mapping.
- Conversation list filters: status, assignee, channel, SLA, lead_score.
- Conversation detail API.
- Reply API.
- Assignment API.
- Internal notes.
- SLA calculation.
- Lead score v1.
- Realtime events.
- Human takeover API.

### Output

- Conversation APIs.
- Realtime event delivery.
- Assignment/SLA support.

### Acceptance criteria

- Webhook → conversation/message → realtime UI event.
- Reply từ Frontend tạo outbound message.
- Filter hot lead/SLA/assignee hoạt động.
- Human takeover chuyển AI mode.
- Tenant isolation pass.

---

## E06 — AI Copilot / RAG / Tool Calling / QC

### Backend/AI tasks

- Intent classifier v1.
- Context builder.
- Tool registry.
- Product/inventory/policy/customer/order tools.
- RAG retrieval với tenant filter.
- Sales Agent prompt v1.
- QC Agent v1.
- Rule engine AI-R001…AI-R010.
- AI suggestion API.
- AI logs.
- AI tool call logs.
- AI blocked outputs.
- Prompt versioning.
- Evaluation set P0.
- Evaluation runner.
- Feature flag AI mode: off/copilot/semi-auto/autopilot.

### Output

- AI suggestion flow.
- AI log viewer API.
- Eval report.
- Blocked output API.

### Acceptance criteria

- AI không báo giá/tồn nếu chưa gọi tool.
- AI không dùng unpublished knowledge.
- AI không tự discount ngoài rule.
- Refund/khiếu nại nghiêm trọng chuyển người thật.
- Prompt injection P0 blocked.
- Mọi suggestion có prompt version/tool/source/QC log.
- Có emergency disable AI per tenant.

---

## E07 — Order from Chat / Payment / Shipping

### Backend tasks

- Order draft API.
- Order item with locked price/cost.
- Order calculation.
- Order status state machine.
- Reservation create/convert/release integration.
- Customer phone/address validation.
- Confirm/cancel order.
- Manual payment: COD, bank transfer, cash.
- Shipping manual carrier/tracking.
- Packing slip data endpoint.
- Duplicate order detection.
- Order history/audit.
- Warehouse task event.

### Output

- Order APIs.
- Payment/shipping basic APIs.
- Packing slip data.
- Dedup warning.

### Acceptance criteria

- Tạo order draft từ conversation.
- Confirm order convert reservation.
- Cancel order release reservation.
- Giá/cost locked tại order item.
- Không tạo trùng đơn từ idempotency key.
- Dashboard/event log update sau order.
- Sửa/hủy order có audit.

---

## E08 — Analytics / Dashboard / Reporting

### Backend tasks

- Event tracking framework.
- Business event emitters.
- Daily tenant metrics.
- Channel metrics.
- Sales agent metrics.
- Product metrics.
- Conversation conversion facts.
- Order profit facts.
- AI quality facts.
- Dashboard read API.
- Reconciliation query order vs metrics.

### Output

- `/dashboard/today`
- reporting APIs.
- metric jobs/materialized views.

### Acceptance criteria

- Dashboard load nhanh với dữ liệu pilot.
- Revenue/order count đối chiếu được với order list.
- Gross profit dùng cost locked.
- Có filter ngày/kênh/sale/sản phẩm.
- Sale không xem profit nếu thiếu quyền.

---

## E09 — Windows Backend Support

### Backend tasks

- Device registration.
- Device revoke.
- App version check API nếu cần.
- Notification event stream.
- Secure session policy.
- Offline draft validation endpoints.
- Print data endpoints.
- Crash/app telemetry ingest nếu không dùng Sentry trực tiếp.

### Output

- Device/session APIs.
- Notification events.
- Print/order payload.
- App telemetry endpoint optional.

### Acceptance criteria

- Windows client logout khi device revoke.
- Không cần token nền tảng trên Windows.
- Offline draft phải server-validate lại inventory/price.
- App version/crash có thể theo dõi.

---

## E10 — Super Admin / Billing / Operations

### Backend tasks

- Tenant list/health APIs.
- Channel health per tenant.
- AI usage/cost metrics.
- Feature flags.
- Disable AI emergency.
- Reprocess webhook/import event.
- Support access reason + audit.
- Plan/subscription/usage meter.
- Manual billing flow MVP.

### Output

- Super admin APIs.
- Billing usage APIs.
- Ops actions with audit.

### Acceptance criteria

- Support không truy cập tenant nếu không có reason/audit.
- Có thể tắt AI cho tenant.
- Có thể xem webhook/channel/AI health.
- Usage meter theo plan hoạt động.

---

## E11 — Security / Privacy / Compliance

### Backend tasks

- Password hashing strong.
- Refresh token rotation.
- Rate limiting.
- Input validation.
- PII encryption/hash.
- Secret manager.
- Object storage signed URL.
- Audit append-only.
- Tenant isolation automated test.
- IDOR tests.
- Webhook signature tests.
- Dependency scan.
- Secret scan.
- Backup/restore drill.
- Privacy export/delete APIs P1 nếu cần.

### Output

- Security baseline.
- Security test suite.
- Backup/restore runbook.

### Acceptance criteria

- Không log secret/PII nhạy cảm.
- Tenant isolation pass.
- Backup restore pass trước production.
- Critical/high security issue không còn trước release.

---

# 8. Sprint plan Backend

| Sprint | Backend deliverable | Frontend unblock |
|---|---|---|
| Sprint 0 | Architecture, ERD v1, OpenAPI skeleton, permission matrix | Frontend làm wireframe/mock theo contract |
| Sprint 1 | Repo, CI, staging, API gateway, auth skeleton | Login/app shell dùng mock/real auth |
| Sprint 2 | Tenant/Auth/RBAC/Audit/Device | User/role/settings UI |
| Sprint 3 | Product/SKU/import APIs | Product list/import wizard |
| Sprint 4 | Inventory/reservation/policy/knowledge APIs | Inventory/Policy/Knowledge screens; AI panel mock tools |
| Sprint 5 | Facebook OAuth/webhook/outbound/health | Channel connect/health UI; inbox starts receiving data |
| Sprint 6 | Conversation/message/assignment/SLA/realtime | Smart Inbox end-to-end |
| Sprint 7 | AI suggestion/RAG/QC/logs | AI Copilot panel |
| Sprint 8 | Order draft/confirm/cancel/payment/shipping/packing slip | Order panel/packing slip |
| Sprint 9 | Dashboard metrics/read models | Dashboard |
| Sprint 10 | Device/app notification/print support | Windows beta |
| Sprint 11 | Pilot bugfix, monitoring, super admin, runbooks | Pilot stabilization |
| Sprint 12 | Billing/manual billing, release gates, backup restore | Commercial MVP |

---

# 9. Contract với Frontend để làm song song

## 9.1 Mỗi feature Backend phải giao cho Frontend

- OpenAPI endpoint.
- Request/response schema.
- Enum/status list.
- Permission required.
- Error codes.
- Empty/loading/error cases.
- Realtime events nếu có.
- Mock JSON fixtures.
- Idempotency requirement.
- Feature flag key nếu có.
- QA test cases.

## 9.2 Contract freeze theo sprint

- Đầu sprint: Backend + Frontend thống nhất API contract.
- Giữa sprint: Frontend dùng mock/MSW hoặc generated client.
- Cuối sprint: Contract test chạy against staging.
- Breaking change chỉ merge khi đã update shared types + frontend mocks + release note.

## 9.3 Shared package

```text
packages/shared-types/
├── auth.ts
├── tenant.ts
├── permissions.ts
├── product.ts
├── inventory.ts
├── channel.ts
├── conversation.ts
├── ai.ts
├── order.ts
├── dashboard.ts
├── errors.ts
└── realtime-events.ts
```

## 9.4 Status enum phải dùng chung

```ts
type ConversationStatus =
  | "new"
  | "open"
  | "assigned"
  | "waiting_customer"
  | "waiting_staff"
  | "order_draft"
  | "order_confirmed"
  | "resolved"
  | "archived"
  | "escalated";

type OutboundMessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "blocked"
  | "cancelled";

type OrderStatus =
  | "draft"
  | "pending_customer_confirm"
  | "confirmed"
  | "awaiting_payment"
  | "awaiting_packaging"
  | "packed"
  | "shipped"
  | "delivered"
  | "completed"
  | "return_requested"
  | "returned"
  | "refunded"
  | "cancelled"
  | "expired";
```

---

# 10. Backend Definition of Done

Một task Backend chỉ được xem là xong khi:

- Có migration/index nếu đổi DB.
- Có API schema trong OpenAPI.
- Có validation request.
- Có permission check.
- Có tenant isolation.
- Có audit nếu action nhạy cảm.
- Có structured log với request_id/correlation_id.
- Có unit/integration test.
- Có error code rõ.
- Có mock/fixture cho Frontend.
- Có monitoring metric nếu là flow quan trọng.
- Có rollback/migration note nếu ảnh hưởng production.
- QA có acceptance criteria để test.

---

# 11. Rủi ro Backend cần ưu tiên chặn

| Risk | Mức độ | Cách chặn |
|---|---|---|
| AI báo sai giá/tồn | Critical | Tool calling, published knowledge, QC, eval |
| Webhook trùng tạo trùng message/order | High | Idempotency + unique index + replay tests |
| Tenant data leak | Critical | Server-side tenant context + IDOR tests |
| Inventory âm | High | Transaction + lock + reservation |
| Token nền tảng leak | Critical | Secret manager, encrypted vault, no token logs/client |
| Dashboard sai số | High | Read model reconcile với source order |
| Không restore được backup | Critical | Backup + restore drill |
| Windows client tự làm nghiệp vụ offline sai | High | Offline draft phải server-validate lại |

---

# 12. Checklist bàn giao cho Frontend theo module

## Auth/RBAC

- [ ] `/auth/login`, `/auth/refresh`, `/auth/logout`
- [ ] `/me`
- [ ] `/users`, `/roles`, `/permissions`
- [ ] Permission matrix
- [ ] Error code: invalid login, 2FA required, permission denied
- [ ] Device revoke event

## Product/Inventory

- [ ] Product list/detail schema
- [ ] Import upload/preview/confirm schema
- [ ] Inventory balance schema
- [ ] Adjustment schema
- [ ] Permission: cost/profit hidden for sale

## Channel/Inbox

- [ ] Channel account schema
- [ ] Health status schema
- [ ] Conversation list/detail schema
- [ ] Message/reply schema
- [ ] WebSocket events
- [ ] SLA/lead_score fields

## AI

- [ ] Suggestion schema
- [ ] Tool source schema
- [ ] QC/blocked reason schema
- [ ] AI mode/feature flag schema
- [ ] AI log schema

## Order/Dashboard

- [x] Order draft/confirm/cancel schema (`000019`, P7 in-memory)
- [x] Reservation error code (wired via inventory port)
- [x] Payment/shipping schema (`000020`, P7 in-memory)
- [x] Packing slip payload (job stub, `packing_slip.print`)
- [ ] Dashboard metric schema
- [ ] Report filter schema

---

# 13. Kết luận cho Backend team

Backend team nên triển khai theo thứ tự:

```text
Foundation
→ Tenant/Auth/RBAC/Audit
→ Product/SKU/Inventory/Knowledge
→ Channel/Webhook
→ Conversation
→ AI Copilot
→ Order/Reservation
→ Dashboard/Analytics
→ Windows support
→ Super Admin/Billing/Ops
→ Pilot hardening
```

Điểm quan trọng nhất: **Backend phải giữ nguồn sự thật và contract ổn định để Frontend làm song song bằng mock, rồi thay mock bằng API staging khi sẵn sàng.**
