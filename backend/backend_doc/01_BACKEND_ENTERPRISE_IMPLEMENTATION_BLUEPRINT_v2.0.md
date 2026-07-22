---
doc_type: backend_enterprise_implementation_blueprint
project: AI Sales Operating System / AI Sales Manager
language: vi-VN
version: 2.0.0
status: implementation-ready-baseline
supersedes: 01_BACKEND_WORKPLAN_AI_Sales_OS v1.0
created_date: 2026-06-26
owner_team: Backend AI Agent (thực thi kỹ thuật) và Human Owner (quyết định rủi ro, go-live)
review_cycle: quarterly-or-on-major-architecture-change
normative_keywords: MUST / MUST NOT / SHOULD / SHOULD NOT / MAY
purpose: >
  Đặc tả triển khai Backend ở mức production Enterprise-Grade. Tài liệu này khóa
  các quyết định kiến trúc, quy tắc dữ liệu, API, event, transaction, security,
  AI governance, testing, CI/CD, observability, vận hành và trình tự thực hiện
  để Backend AI Agent triển khai nhất quán.
---

# BACKEND ENTERPRISE IMPLEMENTATION BLUEPRINT v2.0

## 0. Tuyên bố sử dụng tài liệu

Tài liệu này là **nguồn yêu cầu chuẩn** cho Backend của AI Sales Operating System. Nó thay thế cách hiểu “danh sách module + endpoint + backlog” bằng một hợp đồng triển khai có kiểm soát.

Các từ khóa được hiểu như sau:

- **MUST / MUST NOT**: bắt buộc để qua release gate.
- **SHOULD / SHOULD NOT**: mặc định phải tuân thủ; ngoại lệ thuần kỹ thuật được ghi lại bằng ADR do Backend AI Agent tự lập; ngoại lệ chạm invariant về tenant isolation/security/money cần Human Owner phê duyệt.
- **MAY**: tùy chọn, không được làm thay đổi contract đã freeze.

### 0.1 Đối tượng sử dụng

Đội xây dựng phần mềm này là AI agent, không phải con người. Tài liệu áp dụng cho:

- **Backend AI Agent** (AI coding agent, ví dụ Claude Code): tự thực hiện toàn bộ công việc kỹ thuật Backend — kiến trúc, domain/API/event, AI orchestration, hạ tầng/CI-CD vận hành thường nhật, và enforcement kỹ thuật của mọi security/tenant invariant đã đặc tả trong tài liệu này — theo ticket/contract.
- **Human Owner**: người duy nhất trong dự án; ra quyết định business/pháp lý/rủi ro không thể đảo ngược, chấp nhận rủi ro (risk acceptance) và ký go/no-go cho staging/production.
- **Frontend AI Agent**: đối tác AI coding agent vận hành repo `frontend/` (bao gồm phạm vi Desktop client); tiêu thụ OpenAPI, realtime contract và mock fixture do Backend AI Agent phát hành.

### 0.2 Kết quả bắt buộc của dự án Backend

Backend chỉ được xem là hoàn thiện khi đồng thời đạt:

1. Domain nghiệp vụ đúng invariant và state machine.
2. Không có đường truy cập chéo tenant ngoài luồng support được kiểm soát.
3. Các thao tác critical có idempotency, transaction, audit và reconciliation.
4. API và event contract có version, lint, test và backward compatibility.
5. AI không thể vượt quyền, tự ghi trực tiếp dữ liệu critical hoặc dùng nguồn chưa xuất bản.
6. Có SLO, telemetry, alert, backup, restore drill và incident runbook.
7. Build/release có SBOM, scan, artifact bất biến, migration an toàn và rollback.
8. Frontend AI Agent có thể generate client và chạy contract test từ artifact chính thức.

### 0.3 Phạm vi

**In scope:** Cloud SaaS Backend, PostgreSQL, Redis/queue, object storage, channel integration, conversation, product, inventory, knowledge/RAG, AI orchestration, order/payment/shipping cơ bản, analytics read model, billing/usage, audit, security, observability và operations.

**Out of scope v2.0:** UI layout; native printer driver; carrier/payment gateway chuyên sâu chưa được chọn; accounting/ERP full; data warehouse quy mô lớn; active-active multi-region. Các mục này có extension point nhưng không được giả định đã triển khai.

### 0.4 Nguyên tắc không được phá vỡ

1. Server xác lập tenant context; client không quyết định tenant cho authorization.
2. Mọi dữ liệu tenant-owned có `tenant_id`, composite constraint và RLS phù hợp.
3. AI là tác nhân không tin cậy; mọi tool call đi qua cùng authorization/policy như người dùng.
4. Order, inventory, payment, outbound message, webhook và import critical có idempotency.
5. Transactional outbox/inbox ngăn dual-write giữa database và queue/event bus.
6. Money không dùng floating point.
7. Không hard-delete ledger, order, payment, audit và event nghiệp vụ.
8. PII/secret không xuất hiện trong log, trace, metric label hoặc error message.
9. Không deploy migration phá hủy trong cùng release với code chưa tương thích ngược.
10. Không activate prompt/model production nếu chưa qua evaluation gate và có rollback.

---

# 1. Quyết định kiến trúc đã khóa

## 1.1 Kiến trúc mục tiêu

Giai đoạn MVP đến scale trung bình dùng **modular monolith có ranh giới domain rõ ràng**, kết hợp worker bất đồng bộ và AI service tách process/deployment.

```text
Internet / Web / Windows Client / Provider Webhooks
                    |
             CDN/WAF/Load Balancer
                    |
              +-----v------+          +----------------+
              | API        |--------->| PostgreSQL     |
              | NestJS     |          | source of truth|
              +-----+------+          +--------+-------+
                    |                          |
                    | enqueue/outbox           | PITR/backup
                    v                          |
              +-----+------+          +--------v-------+
              | Worker     |<-------->| Redis/BullMQ   |
              | NestJS     |          | cache/queue    |
              +-----+------+          +----------------+
                    |
                    | internal HTTP, mTLS/private network
                    v
              +-----+------+
              | AI Service |
              | FastAPI    |
              +-----+------+
                    |
                    +----> Model provider / embedding provider
                    +----> S3-compatible object storage

All deployables -> OpenTelemetry Collector -> logs/metrics/traces/alerts
```

### 1.1.1 Deployable units

| Unit | Trách nhiệm | Scale độc lập |
|---|---|---|
| `api` | REST API, auth, tenant context, synchronous commands/queries, SSE | Có |
| `worker` | BullMQ consumers, outbox publisher, webhook processor, outbound sender, analytics jobs | Có theo queue |
| `scheduler` | Cron leader, reservation expiry, metric aggregation, maintenance | Một active instance hoặc distributed lock |
| `ai-service` | RAG, model invocation, tool planning, QC/evaluation | Có theo AI load |
| `otel-collector` | Nhận/export telemetry | Có |

`api`, `worker` và `scheduler` dùng chung codebase/domain packages nhưng chạy process riêng. AI service không truy cập trực tiếp các bảng nghiệp vụ; nó gọi internal tool API được policy-enforced.

## 1.2 Stack chuẩn

| Layer | Quyết định |
|---|---|
| Runtime Backend | Node.js Active LTS, baseline Node.js 24; pin exact version trong repo |
| Core framework | NestJS 11.x + TypeScript strict + Fastify adapter |
| Package manager | pnpm workspace, lockfile bắt buộc |
| Data access | Kysely + `pg`; raw SQL chỉ trong repository/infrastructure layer |
| Migration | SQL migration bất biến qua `node-pg-migrate` hoặc wrapper nội bộ đã khóa; không auto-sync schema |
| Database | PostgreSQL 18, luôn chạy minor version đã vá mới nhất |
| Vector | pgvector; embedding version được lưu cùng chunk |
| Queue/cache | Redis 8 + BullMQ; queue abstraction không rò rỉ vào domain |
| AI service | Python 3.13 + FastAPI + Pydantic, dependency lock bắt buộc |
| HTTP contract | OpenAPI 3.1.1 + JSON Schema 2020-12 |
| Event contract | AsyncAPI 3.1.0; envelope tương thích CloudEvents 1.0.x |
| Realtime | Server-Sent Events (SSE) cho v1; client command vẫn qua REST |
| Object storage | S3-compatible, private bucket, signed URL ngắn hạn |
| Telemetry | OpenTelemetry qua OTLP; vendor backend có thể thay thế |
| IaC | OpenTofu/Terraform-compatible, version pin trong repo |
| Container | OCI image, non-root, read-only root filesystem khi khả thi |
| CI/CD | Build once, promote same immutable image digest |

### 1.2.1 Chính sách version

- Runtime/framework/database MUST dùng major đang được upstream hỗ trợ.
- Minor/patch được cập nhật theo lịch tối thiểu hàng tháng hoặc khẩn cấp theo CVE.
- Không dùng tag container `latest`.
- Dependency production phải pin qua lockfile; Renovate/Dependabot tạo PR, không auto-merge thay đổi major.
- Mọi thay đổi major cần compatibility test, load test tối thiểu và rollback plan.

## 1.3 Vì sao chưa dùng microservices toàn phần

Modular monolith được chọn vì Order và Inventory cần transaction mạnh; tách sớm làm phát sinh saga/distributed transaction, vận hành phức tạp và tăng bề mặt lỗi. Domain boundary vẫn được giữ để có thể tách sau.

Một module chỉ được tách service khi có ít nhất một trigger:

- Cần scale độc lập và có số liệu chứng minh bottleneck.
- Có team ownership/release cadence độc lập.
- Yêu cầu isolation dữ liệu hoặc compliance riêng.
- Có SLO khác biệt không thể đạt trong monolith.
- Chi phí coupling thấp hơn chi phí vận hành service mới.

Tách service bắt buộc có ADR, contract version, data ownership, migration plan, timeout/retry/circuit breaker, observability và failure-mode analysis.

## 1.4 ADR bắt buộc

Các ADR ban đầu đã được khóa trong blueprint; repo vẫn phải lưu bản rút gọn tại `docs/adr/`:

| ADR | Quyết định |
|---|---|
| ADR-001 | Modular monolith + worker + AI service |
| ADR-002 | Shared-schema multi-tenancy với PostgreSQL RLS defense-in-depth |
| ADR-003 | OpenAPI-first; generated client/types; không hand-maintain shared types trùng lặp |
| ADR-004 | BullMQ/Redis và transactional outbox/inbox |
| ADR-005 | SSE cho realtime v1, có resume bằng `Last-Event-ID` |
| ADR-006 | Money lưu minor unit integer, quantity dùng decimal |
| ADR-007 | UUIDv7, `timestamptz` UTC, tenant timezone cho trình bày/aggregation |
| ADR-008 | Access JWT ngắn hạn + opaque refresh token rotation/reuse detection |
| ADR-009 | AI zero-trust, tool-mediated, approval theo risk class |
| ADR-010 | Expand/contract database migration và build-once-promote |

---

# 2. Non-functional requirements và SLO

Các giá trị sau là baseline kỹ thuật cho production đầu tiên. Human Owner có thể thay đổi bằng NFR approval, nhưng Backend AI Agent không được triển khai mà không có con số mục tiêu.

## 2.1 Capacity baseline

| Chỉ số | Baseline phải load-test |
|---|---:|
| Active tenants | 2.000 |
| Tổng SKU | 5.000.000 |
| Tin nhắn trung bình/ngày | 500.000 |
| Webhook burst | 500 request/giây trong 5 phút |
| Order confirm burst | 100 lệnh/giây |
| Concurrent API users | 5.000 |
| Concurrent SSE connections | 20.000 |
| AI suggestion đồng thời | 200 |
| Raw webhook retention nóng | 30 ngày |
| Audit retention tối thiểu | 365 ngày hoặc theo policy pháp lý |

Nếu pilot nhỏ hơn, vẫn phải chứng minh kiến trúc đạt ít nhất 30% baseline và có kế hoạch scale ngang tới baseline.

## 2.2 Service-level objectives

| Journey | SLI | SLO tháng |
|---|---|---:|
| Core API availability | request hợp lệ không 5xx | 99,9% |
| Order confirm availability | confirm thành công khi precondition hợp lệ | 99,95% |
| API read latency | p95, không tính external provider | ≤ 300 ms |
| API write latency | p95, không tính AI/provider | ≤ 500 ms |
| Order confirm latency | p95 | ≤ 1.000 ms |
| Webhook acknowledgment | p95 | ≤ 1.000 ms |
| Webhook đến normalized message | p95 | ≤ 10 giây |
| Normalized message đến SSE | p95 | ≤ 2 giây |
| AI suggestion | p95 | ≤ 12 giây; timeout cứng 20 giây |
| Queue success | job thành công trước DLQ | ≥ 99,9% |
| Backup | RPO | ≤ 5 phút |
| Disaster recovery | RTO | ≤ 60 phút cho core API |

### 2.2.1 Error budget

- Mỗi SLO có dashboard và burn-rate alert.
- Khi tiêu thụ >50% error budget trong nửa chu kỳ, dừng release feature rủi ro cao và ưu tiên reliability.
- Planned maintenance chỉ được loại trừ nếu đã thông báo, phê duyệt và đo riêng.

## 2.3 Data correctness SLO

- Không chấp nhận inventory âm do race condition.
- 100% order confirmed có status history, audit và outbox event tương ứng.
- 100% payment callback có dedupe key và reconciliation state.
- Dashboard revenue/order count phải reconcile với source transaction trong sai số bằng 0 đối với dữ liệu đã đóng ngày; dữ liệu đang chạy có late-arrival policy rõ.
- 100% AI business mutation có tool log, actor, prompt/model version, policy decision và correlation ID.

---

# 3. Cấu trúc repository và quy tắc module

## 3.1 Monorepo chuẩn

```text
repo/
├── apps/
│   ├── api/
│   ├── worker/
│   ├── scheduler/
│   └── ai-service/
├── packages/
│   ├── contracts-http/          # OpenAPI source + generated artifacts
│   ├── contracts-events/        # AsyncAPI + JSON schemas
│   ├── domain-kernel/           # IDs, money, result, domain event abstractions
│   ├── auth-context/
│   ├── config/
│   ├── database/
│   ├── idempotency/
│   ├── outbox/
│   ├── observability/
│   ├── security/
│   └── test-utils/
├── modules/
│   ├── identity/
│   ├── tenant/
│   ├── customer/
│   ├── catalog/
│   ├── inventory/
│   ├── knowledge/
│   ├── channel/
│   ├── conversation/
│   ├── ai-orchestration/
│   ├── order/
│   ├── payment/
│   ├── fulfillment/
│   ├── analytics/
│   ├── billing/
│   ├── audit/
│   └── operations/
├── infra/
│   ├── migrations/
│   ├── docker/
│   ├── tofu/
│   ├── monitoring/
│   └── runbooks/
├── docs/
│   ├── adr/
│   ├── threat-model/
│   └── diagrams/
└── tools/
```

## 3.2 Cấu trúc mỗi module

```text
modules/<module>/src/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── services/
│   ├── events/
│   └── errors/
├── application/
│   ├── commands/
│   ├── queries/
│   ├── handlers/
│   ├── ports/
│   └── policies/
├── infrastructure/
│   ├── repositories/
│   ├── persistence/
│   ├── providers/
│   └── jobs/
├── presentation/
│   ├── http/
│   ├── events/
│   └── dto/
└── module.ts
```

### 3.2.1 Dependency rule

```text
presentation -> application -> domain
infrastructure -> application/domain ports

Domain MUST NOT import NestJS, database client, queue SDK, HTTP client hoặc provider SDK.
Module A MUST NOT đọc trực tiếp table của Module B ngoài read model được phê duyệt.
Cross-module command đi qua application port; cross-module event đi qua outbox.
```

Cấm:

- Controller chứa business calculation.
- Repository quyết định permission.
- Domain service gọi HTTP/provider SDK.
- AI service kết nối database nghiệp vụ.
- Import trực tiếp file nội bộ của module khác; chỉ dùng public module API.

## 3.3 Coding standard

- TypeScript `strict: true`; cấm implicit `any`.
- DTO input dùng schema validation từ contract; không dùng entity DB làm response.
- Date/time dùng type/helper tập trung; không tự parse tùy ý.
- Money dùng value object `Money`; cấm `number` cho amount.
- Mọi async external call có timeout và cancellation/abort signal.
- Error domain là typed error; không throw string.
- Không swallow exception; retry chỉ tại boundary có idempotency.
- Log message ổn định, dữ liệu biến đổi nằm trong structured fields.
- Lint cấm import vượt boundary, cấm `console.*`, cấm secret pattern.

## 3.4 Git và pull request

- Trunk-based hoặc nhánh ngắn; mỗi ticket một PR nhỏ.
- Protected branch; tối thiểu một reviewer, hai reviewer cho auth/security/payment/migration critical.
- Commit/PR tham chiếu ticket và ADR nếu có.
- PR không được merge nếu contract, migration, test, scan hoặc generated artifacts lệch.
- Không sửa migration đã chạy ở shared environment; tạo migration mới.

---

# 4. Domain map và ownership

## 4.1 Bounded contexts

| Module | Source of truth | Command chính | Event chính |
|---|---|---|---|
| Identity | user, credential, session, device | login, refresh, revoke | identity.session_revoked |
| Tenant | tenant, membership, role, permission | invite, change role, suspend | tenant.member_updated |
| Customer | customer, identity, consent, address | create/update/merge | customer.updated |
| Catalog | category, product, variant, price | create/update/import | catalog.variant_updated |
| Inventory | warehouse, balance, movement, reservation | adjust/reserve/release/convert | inventory.reserved |
| Knowledge | source, version, chunk, publish lifecycle | approve/publish/archive | knowledge.published |
| Channel | account, credential ref, webhook raw, outbound delivery | connect/verify/send | channel.message_normalized |
| Conversation | conversation, message, assignment, SLA | assign/reply/takeover | conversation.updated |
| AI orchestration | suggestion, prompt, tool call, eval, policy decision | suggest/evaluate/activate | ai.suggestion_ready |
| Order | order, item, calculation, status history | draft/confirm/cancel | order.confirmed |
| Payment | payment intent/record/reconciliation | record/confirm/refund | payment.marked_paid |
| Fulfillment | shipment, tracking, return | create/ship/deliver/return | shipment.updated |
| Analytics | event projection, daily facts/read models | rebuild/reconcile | analytics.projection_updated |
| Billing | plan, subscription, usage | meter/enforce/update | billing.limit_reached |
| Audit | immutable audit records | append/export | audit.recorded |
| Operations | feature flag, alert, support access | toggle/reprocess/disable | operations.action_executed |

## 4.2 Cross-domain dependency

- Catalog không phụ thuộc Inventory; Inventory tham chiếu `variant_id` qua contract/foreign key.
- Order gọi Inventory application port trong cùng transaction cho reserve/convert/release.
- Conversation có thể tạo Order draft qua Order application port, không ghi table order.
- AI chỉ gọi tool API; tool API gọi module application service.
- Analytics chỉ tiêu thụ domain events/read replicas; không trở thành source of truth.
- Audit append được ghi cùng transaction với hành động critical; export/index có thể bất đồng bộ.
- Billing enforcement chạy trước command tốn quota; usage emit sau commit qua outbox.

## 4.3 Invariant toàn hệ thống

1. Một tenant bị `suspended` không được tạo mutation mới ngoài billing/support recovery.
2. Một membership bị revoke làm vô hiệu toàn bộ session thuộc tenant đó.
3. SKU unique không phân biệt hoa/thường trong tenant.
4. `available_to_sell` không nhỏ hơn 0 sau commit.
5. Order item đã confirmed giữ snapshot giá/cost/tax/discount; thay đổi catalog sau đó không sửa lịch sử.
6. Message inbound/outbound có external identity/dedupe key khi provider cung cấp.
7. Knowledge chỉ được AI retrieval khi version `published` và còn hiệu lực.
8. AI không tự confirm/cancel/refund nếu risk policy yêu cầu human approval.
9. Mọi state transition critical có actor, timestamp, reason và history.
10. Mọi cross-tenant object reference bị từ chối như không tồn tại đối với actor thông thường.

---
# 5. Identity, tenant context, RBAC và support access

## 5.1 Mô hình identity chuẩn

`users` là identity global. Quan hệ user–tenant nằm trong `tenant_memberships`. Một user có thể thuộc nhiều tenant mà không tạo credential trùng lặp.

```text
users 1 --- n tenant_memberships n --- 1 tenants
                         |
                         n
                         |
                  membership_roles n --- 1 roles
                                             |
                                             n
                                      role_permissions n --- 1 permissions
```

### 5.1.1 User

- Email canonical hóa lowercase và unique global khi dùng password login.
- Số điện thoại không dùng làm primary identity nếu chưa có verification policy.
- Password hash nằm trong bảng credential riêng; không lưu plaintext/reversible encryption.
- User status: `pending`, `active`, `locked`, `disabled`, `deleted`.
- Xóa privacy là anonymize identity khi không còn retention obligation; không phá audit/order history.

### 5.1.2 Membership

- Status: `invited`, `active`, `suspended`, `revoked`.
- `tenant_id + user_id` unique.
- Membership chứa display name theo tenant, job title, manager, locale và default warehouse nếu cần.
- Permission hiệu lực = union role permissions - explicit deny (nếu project bật deny). V1 không dùng explicit deny để tránh khó giải thích; exception đi qua custom role.

## 5.2 Auth flow

### 5.2.1 Access token

- JWT ký bằng asymmetric key; `kid` để rotate key.
- TTL mặc định 10 phút.
- Claims tối thiểu: `iss`, `aud`, `sub`, `sid`, `tid`, `mid`, `iat`, `exp`, `jti`, `auth_time`, `amr`.
- Không nhét full permission list nếu có nguy cơ stale; token chứa `permission_version`, server/cache resolve permission và reject khi version thay đổi.
- Token không chứa PII không cần thiết.

### 5.2.2 Refresh token

- Opaque random tối thiểu 256 bit entropy.
- Chỉ lưu hash/HMAC ở server.
- Rotation mỗi lần refresh; token cũ bị đánh dấu consumed.
- Reuse detection: nếu token đã consumed xuất hiện lại, revoke toàn token family và tạo security event.
- Absolute lifetime mặc định 30 ngày; idle lifetime 7 ngày; có thể cấu hình theo tenant policy.
- Web dùng Secure + HttpOnly + SameSite cookie; không lưu refresh token trong `localStorage`.
- Desktop lưu trong OS secure credential store; không ghi file cấu hình/log.

### 5.2.3 MFA

- Owner/Admin MUST bật MFA trước khi production mutation nhạy cảm.
- V1 dùng TOTP và recovery code một lần; WebAuthn có thể thêm P1.
- Recovery code chỉ lưu hash; hiển thị một lần.
- Sensitive action có thể yêu cầu recent authentication/MFA step-up trong 10 phút.

### 5.2.4 Login protection

- Rate limit theo IP + normalized identity + device fingerprint nhẹ.
- Progressive delay; không tiết lộ email có tồn tại.
- Lockout không tạo DoS vĩnh viễn; dùng risk-based temporary lock.
- Password reset token single-use, hash-at-rest, TTL 15–30 phút.
- Session revoke phát event và đóng SSE của session bị revoke.

## 5.3 Request security context

Mọi request sau authentication tạo immutable context:

```ts
interface RequestContext {
  requestId: string;
  correlationId: string;
  actor: {
    type: 'user' | 'service' | 'ai' | 'system' | 'support';
    userId?: string;
    serviceId?: string;
  };
  tenantId: string;
  membershipId?: string;
  sessionId?: string;
  permissions: ReadonlySet<string>;
  permissionVersion: number;
  authMethods: readonly string[];
  ipHash?: string;
  userAgentHash?: string;
  locale: string;
  tenantTimezone: string;
}
```

- Controller không nhận `tenant_id` từ body/query để quyết định authorization.
- Super-admin/support endpoint nằm dưới audience/route/guard riêng.
- Internal service call dùng service identity và tenant delegation claim có scope, TTL ngắn và audit.

## 5.4 Permission naming

Format: `<resource>.<action>`; field-sensitive permission có hậu tố rõ.

```text
tenant.read, tenant.update
member.read, member.invite, member.update, member.revoke
role.read, role.manage
audit.read, audit.export
customer.read, customer.write, customer.merge, customer.pii.read
catalog.read, catalog.write, catalog.cost.read, catalog.cost.write
inventory.read, inventory.adjust, inventory.reserve, inventory.transfer
knowledge.read, knowledge.write, knowledge.approve, knowledge.publish
channel.read, channel.connect, channel.manage, channel.send
conversation.read, conversation.reply, conversation.assign, conversation.takeover
ai.use, ai.review, ai.configure, ai.activate, ai.disable
order.read, order.create, order.confirm, order.cancel, order.price.override
payment.read, payment.record, payment.refund
shipment.read, shipment.manage
report.read, report.profit.read, report.export
billing.read, billing.manage
ops.tenant.read, ops.tenant_health, ops.reprocess, ops.feature_flag, ops.alert.read, ops.ai_health.read, ops.channel_health.read, ops.audit.read
support.access
```

## 5.5 Field-level authorization

- `cost`, `gross_profit`, provider token metadata, AI system prompt và raw PII không được serialize rồi mới ẩn ở frontend.
- Query/DTO mapper phải nhận policy và chỉ select/serialize field được phép.
- Export có permission riêng, row limit, audit và signed URL expiry.
- List endpoint không được leak aggregate suy ra field cấm, ví dụ profit margin khi không có `report.profit.read`.

## 5.6 Support access

Support access là luồng break-glass riêng:

1. Support agent xác thực MFA.
2. Chọn tenant, ticket/reason, scope và thời hạn tối đa 30 phút.
3. Hệ thống tạo `support_access_grant` có approver nếu scope nhạy cảm.
4. Token support có audience riêng, read-only mặc định.
5. Banner/telemetry đánh dấu mọi request support.
6. Mọi read/mutation được audit; mutation yêu cầu elevated approval.
7. Hết hạn tự revoke; tenant owner có thể xem access history.

Không được dùng database superuser hoặc impersonation không audit để hỗ trợ khách hàng.

---

# 6. Multi-tenancy và PostgreSQL Row-Level Security

## 6.1 Phân loại bảng

| Class | Ví dụ | Quy tắc |
|---|---|---|
| `GLOBAL` | permission catalog, plan catalog, country/provider catalog | Không có tenant_id; chỉ role hệ thống ghi |
| `TENANT_OWNED` | products, customers, orders, conversations | `tenant_id NOT NULL`, RLS, composite FK |
| `TENANT_OVERRIDE` | feature flag override, plan override | global key + tenant_id |
| `SYSTEM_INTERNAL` | migration history, outbox lease | DB role giới hạn; không expose API |

Câu “mọi bảng có tenant_id” không áp dụng máy móc cho `GLOBAL`; mọi ngoại lệ phải ghi class trong data dictionary.

## 6.2 Database roles

| Role | Quyền |
|---|---|
| `app_schema_owner` | sở hữu schema/migration; không dùng runtime |
| `app_runtime` | CRUD qua RLS; `NOBYPASSRLS`; không sở hữu table |
| `app_worker` | như runtime, scope job; không bypass RLS |
| `app_readonly` | read qua RLS cho reporting hạn chế |
| `app_support` | policy support riêng; mặc định read-only |
| `app_migrator` | chạy migration qua CI/CD, credential ngắn hạn |

Runtime MUST NOT kết nối bằng table owner hoặc superuser.

## 6.3 Tenant transaction wrapper

Không dùng `SET app.tenant_id` ngoài transaction vì connection pool có thể tái sử dụng context. Mọi truy cập tenant-owned đi qua wrapper:

```ts
await database.withTenantTransaction(ctx, async (trx) => {
  await trx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
  await trx.execute(sql`select set_config('app.actor_id', ${actorId}, true)`);
  await handler(trx);
});
```

`true` tương đương local-to-transaction. Wrapper phải clear/rollback tự động khi exception.

## 6.4 RLS policy mẫu

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE POLICY products_tenant_isolation
ON products
FOR ALL
TO app_runtime, app_worker
USING (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
)
WITH CHECK (
  tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
);
```

- Tenant-owned table MUST `ENABLE` và `FORCE ROW LEVEL SECURITY`.
- Policy test phải chạy bằng runtime role, không chạy bằng owner.
- Missing tenant context mặc định deny.
- Background job không tin `tenant_id` tùy ý trong payload; lookup trusted record hoặc verify signed job envelope.

## 6.5 Composite foreign key chống cross-tenant reference

Mỗi tenant-owned table có unique `(tenant_id, id)`. Foreign key liên domain hoặc parent/child dùng cả tenant và ID:

```sql
UNIQUE (tenant_id, id),
FOREIGN KEY (tenant_id, product_id)
  REFERENCES products (tenant_id, id)
```

Nhờ vậy application bug không thể liên kết order của tenant A với product của tenant B.

## 6.6 Tenant isolation test suite

Mỗi module có test tự động:

1. Tạo tenant A/B và object có cùng business key.
2. Actor A list/get/update/delete object B.
3. Kiểm tra trả `404` hoặc empty theo policy, không leak existence.
4. Thử nested relation, filter, export, search, aggregate và file URL.
5. Thử queue job với tenant giả.
6. Thử raw SQL/repository method mới.
7. Chạy test bằng `app_runtime` có RLS.

Release gate fail nếu một tenant-owned table thiếu RLS policy, composite index hoặc isolation test.

---

# 7. Data architecture và schema contract

## 7.1 Kiểu dữ liệu chuẩn

| Loại | Quy tắc |
|---|---|
| Primary ID | UUIDv7, generate server/DB, không sequential integer public |
| Timestamp | `timestamptz`, lưu UTC; API RFC 3339 |
| Business date | `date` theo tenant timezone khi cần closing/aggregation |
| Money | `bigint` minor unit + `char(3)` currency |
| Quantity | `numeric(18,6)`, check `>= 0` theo context |
| Rate/percent | basis points integer hoặc `numeric(9,6)`, không float |
| Email/SKU canonical | `citext` hoặc normalized column có unique index |
| Status | `text` + CHECK constraint; không dùng PostgreSQL enum cho lifecycle thay đổi thường xuyên |
| Flexible metadata | `jsonb` chỉ cho extension; core query field phải là column |
| Secret | encrypted envelope/reference; không lưu cùng business DTO |
| Searchable PII | ciphertext + blind index/HMAC tách riêng |

## 7.2 Cột chuẩn

Tenant-owned mutable aggregate mặc định có:

```text
id uuid primary key
 tenant_id uuid not null
 version integer not null default 1
 created_at timestamptz not null
 created_by uuid/null
 updated_at timestamptz not null
 updated_by uuid/null
 deleted_at timestamptz/null       # chỉ khi domain cho soft delete
 metadata jsonb not null default '{}'
```

- `updated_at` không dùng làm optimistic lock; dùng `version`.
- Ledger/history/audit không có `updated_at` và không update sau insert trừ metadata vận hành được kiểm soát.
- `created_by` có thể là user/service/AI; khi cần đầy đủ dùng actor columns hoặc audit record.

## 7.3 Index convention

- Index đầu tiên của tenant-owned query thường bắt đầu bằng `tenant_id`.
- Unique business key luôn tenant-scoped, ví dụ `(tenant_id, lower(sku))`.
- Partial index cho active rows: `WHERE deleted_at IS NULL`.
- Cursor list index khớp filter + sort, ví dụ `(tenant_id, status, updated_at DESC, id DESC)`.
- Foreign key column phải có index.
- Không thêm index “phòng xa”; mỗi index có query/use case và được theo dõi usage.

## 7.4 Partition/retention threshold

Các bảng `webhook_events`, `messages`, `event_logs`, `audit_logs`, `ai_logs`, `outbox_events` được chuẩn bị partition theo tháng khi đạt một trong các ngưỡng:

- >100 triệu row;
- >200 GB;
- vacuum/index maintenance ảnh hưởng SLO;
- retention delete gây lock/bloat đáng kể.

Partition key là `occurred_at/created_at`; tenant vẫn nằm trong index và RLS. Không partition sớm nếu chưa có số liệu.

## 7.5 Identity/Tenant schema

### 7.5.1 `tenants`

| Field | Type | Rule |
|---|---|---|
| `id` | uuid | PK UUIDv7 |
| `code` | citext | unique global, immutable public slug |
| `name` | text | not blank |
| `status` | text | `provisioning,active,suspended,closed` |
| `timezone` | text | IANA timezone |
| `currency` | char(3) | ISO 4217-style code |
| `locale` | text | default locale |
| `plan_id` | uuid | FK global plans |
| `permission_version` | bigint | increment khi role/membership đổi |
| `data_region` | text | deployment/data residency marker |
| timestamps | timestamptz | create/update/suspend/close |

### 7.5.2 `users`

Global identity: `id`, `primary_email`, `email_verified_at`, `status`, `locale`, `last_login_at`, `anonymized_at`, timestamps. Unique partial index trên canonical email khi chưa anonymized.

### 7.5.3 `user_credentials`

`user_id`, `credential_type=password|oidc`, `password_hash`, `password_updated_at`, `failed_count`, `locked_until`, `provider`, `provider_subject`; credential secret không trả qua API.

### 7.5.4 `tenant_memberships`

`id`, `tenant_id`, `user_id`, `status`, `display_name`, `title`, `default_warehouse_id`, `invited_by`, `activated_at`, `revoked_at`, `version`; unique `(tenant_id,user_id)`.

### 7.5.5 `roles`, `permissions`, `role_permissions`, `membership_roles`

- `permissions` là `GLOBAL`, key immutable.
- `roles` có system template hoặc custom tenant role; system role có `tenant_id NULL`, custom role có tenant.
- `role_permissions` unique role+permission.
- `membership_roles` tenant-consistent; không gán custom role tenant A cho membership tenant B.

### 7.5.6 `user_sessions`, `refresh_tokens`, `devices`

- Session: user, membership/tenant, device, created/last_seen/absolute_expiry/revoked, auth methods, IP/UA hash.
- Refresh token: `token_hash`, family ID, parent ID, issued/used/revoked/expiry, reuse_detected_at.
- Device: platform, app version, push capability, trust status, last_seen, revoked.

### 7.5.7 `invitations`, `mfa_factors`, `recovery_codes`, `support_access_grants`

Mọi token/code chỉ lưu hash; invitation unique active theo tenant+email; support grant có reason, ticket, scope, approver và expiry.

## 7.6 Customer/CDP schema

### 7.6.1 `customers`

- `id`, `tenant_id`, `display_name`, encrypted phone/email fields, blind indexes, `status`, `hot_score`, `risk_score`, `source`, `last_interaction_at`, `merged_into_customer_id`, timestamps.
- Unique identity không đặt trực tiếp trên encrypted field; dùng `customer_identities` + provider rules.
- `hot_score/risk_score` có model/rule version và calculated_at nếu ảnh hưởng automation.

### 7.6.2 `customer_identities`

`tenant_id`, `customer_id`, `identity_type`, `provider`, `channel_account_id`, `external_id`, `normalized_value_hash`, `verified_at`, `is_primary`; unique theo `(tenant_id, provider, channel_account_id, external_id)` khi external identity có scope account.

### 7.6.3 `customer_addresses`

Encrypted receiver name/phone/address lines; normalized province/district codes; `is_default`; version. Address snapshot phải copy sang order khi confirm.

### 7.6.4 `customer_tags`, `customer_tag_links`, `customer_consents`, `customer_notes`

- Tag name unique tenant-scoped.
- Consent có purpose, lawful basis/source, granted/revoked/effective timestamps.
- Note internal có author và classification; không gửi model mặc định.

### 7.6.5 `customer_merge_history`

Lưu source/target, field resolution, actor, reason và correlation ID. Merge là command idempotent, không hard-delete source; source trỏ `merged_into_customer_id`.

## 7.7 Catalog schema

### 7.7.1 `categories`

`tenant_id`, `parent_id`, `name`, `slug`, `path`, `sort_order`, `status`; chống cycle; unique slug trong cùng parent hoặc toàn tenant theo product decision.

### 7.7.2 `products`

`tenant_id`, `name`, `description`, `category_id`, `brand`, `status=draft|active|archived`, `tax_class`, `attributes jsonb`, timestamps. Product không chứa inventory quantity.

### 7.7.3 `product_variants`

| Field | Rule |
|---|---|
| `sku` | canonical uppercase/trim; unique active theo tenant |
| `barcode` | optional, unique tenant nếu business yêu cầu |
| `name` | variant display name |
| `price_minor` | >=0 |
| `cost_minor` | >=0, field-level protected |
| `currency` | phải khớp tenant ở v1 |
| `weight_grams` | >=0 |
| `status` | active/inactive/archived |
| `attributes` | size/color... validated schema |

### 7.7.4 `product_media`

Chỉ lưu object key, media type, checksum, size, sort order, scan status. API trả signed URL; bucket private.

### 7.7.5 `price_history`

Append-only snapshot `old/new price_minor`, `old/new cost_minor`, actor, reason, source, effective time. Không expose cost nếu thiếu permission.

### 7.7.6 `import_jobs`, `import_job_rows`

- Job: file key/checksum, type, status, mapping, counts, requested/started/completed, error report key.
- Row: row number, canonical payload, validation errors, resolution, applied entity IDs.
- Import flow `uploaded -> analyzing -> preview_ready -> confirmed -> applying -> completed|failed|cancelled`.
- Confirm bắt buộc dùng job version/checksum để ngăn file/mapping thay đổi sau preview.

## 7.8 Inventory schema

### 7.8.1 `warehouses`

`tenant_id`, `code`, `name`, `status`, location/timezone, priority, allow_fulfillment`; code unique tenant.

### 7.8.2 `inventory_balances`

| Field | Type | Rule |
|---|---|---|
| `tenant_id` | uuid | scope |
| `warehouse_id` | uuid | composite FK |
| `variant_id` | uuid | composite FK |
| `on_hand` | numeric(18,6) | >=0 |
| `reserved` | numeric(18,6) | >=0 |
| `blocked` | numeric(18,6) | >=0 |
| `damaged` | numeric(18,6) | >=0 |
| `safety_stock` | numeric(18,6) | >=0 |
| `version` | int | optimistic/concurrency metadata |

Unique `(tenant_id, warehouse_id, variant_id)`.

```text
available_to_sell = max(0, on_hand - reserved - blocked - damaged - safety_stock)
```

V1 coi safety stock là phần không được bán. Nếu business muốn chỉ cảnh báo, phải đổi bằng ADR/domain rule version.

### 7.8.3 `inventory_movements`

Append-only ledger:

- `movement_type`: receive, adjust_in, adjust_out, sale, cancel_restore, return_in, transfer_out, transfer_in, damage, repair, block, unblock.
- `quantity_delta` signed, `before_on_hand`, `after_on_hand` để audit/reconcile.
- `reference_type/id`, reason code, actor, occurred_at.
- Unique idempotency reference khi command có thể retry.

### 7.8.4 `inventory_reservations`

Header: `id`, tenant, owner type/id (`order`, `conversation`, `manual`), status, expires_at, converted_at, released_at, release_reason, idempotency key, timestamps.

### 7.8.5 `inventory_reservation_items`

`reservation_id`, warehouse, variant, quantity, status; unique reservation+warehouse+variant. Reservation item không thay đổi `on_hand`, chỉ thay đổi `reserved`.

### 7.8.6 `inventory_adjustments`

Command record có reason code, note, evidence file, approval nếu vượt threshold; các movement được link về adjustment.

## 7.9 Knowledge và AI schema

### 7.9.1 `knowledge_sources`, `knowledge_source_versions`

- Source là logical document; version là immutable content revision.
- Lifecycle: draft, in_review, approved, published, archived.
- Publish lưu `effective_from`, `effective_to`, approver, checksum.
- Một source chỉ có một published version hiệu lực tại một thời điểm trừ khi business cho phép scope khác.

### 7.9.2 `knowledge_chunks`

`tenant_id`, source/version, chunk_index, text/ciphertext policy, embedding vector, embedding_model/version, token_count, language, metadata, content checksum, effective window. Retrieval index bắt buộc filter tenant + published version.

### 7.9.3 `prompt_versions`

`name`, semantic version, system/developer template, model policy, tool allowlist, parameters, status `draft|evaluating|approved|active|retired`, checksum, creator/approver/activation timestamps. Active version immutable; sửa tạo version mới.

### 7.9.4 `ai_logs`

`tenant_id`, conversation/message, request type, prompt version, model/provider, token usage/cost, latency, retrieval IDs, output redacted/encrypted policy, final disposition, QC status, error, correlation ID.

### 7.9.5 `ai_tool_calls`

Tool name/version, risk class, input redacted, input hash, output redacted, status, policy decision, approval ID, latency, idempotency key, related entity/event.

### 7.9.6 Evaluation tables

- `ai_evaluation_sets`: name, purpose, risk tier, version, frozen checksum.
- `ai_evaluation_cases`: input, context fixture, expected assertions, severity.
- `ai_evaluation_runs`: prompt/model version, aggregate metrics, pass/fail, environment.
- `ai_evaluation_results`: per-case score, violations, reviewer.
- `ai_blocked_outputs`: rule ID, severity, evidence hash, safe fallback.

## 7.10 Channel/Conversation schema

### 7.10.1 `channel_accounts`

Provider, external account/page ID, display name, status, granted scopes, credential reference, token expiry, health state, last sync/error. Unique provider+external account per tenant according to provider rules.

### 7.10.2 `channel_credentials`

Chỉ lưu encrypted envelope hoặc secret-manager reference, key version, expiry, revoked state. Không expose qua normal repository/DTO.

### 7.10.3 `webhook_events`

Raw immutable event: provider, channel account, external event ID, signature verification result, payload encrypted/redacted, headers allowlist, received_at, processing status, attempt count, next retry, error, normalized entity ID. Unique dedupe `(provider, channel_account_id, external_event_id)`; nếu provider không có ID, dùng canonical payload hash + time bucket theo adapter rule.

### 7.10.4 `conversations`

Tách nhiều chiều trạng thái:

- `lifecycle_status`: new/open/resolved/archived.
- `waiting_on`: none/customer/staff.
- `sales_stage`: none/qualified/order_draft/order_confirmed.
- `escalation_status`: normal/escalated.
- `ai_mode`: off/copilot/semi_auto/autopilot/human_takeover.
- assignee/team, customer, channel account, external thread ID, SLA due, lead/risk score + version, last message timestamps.

### 7.10.5 `messages`

Direction inbound/outbound/internal, provider/external ID, sender identity, content type, body redacted/encrypted policy, reply_to, sent/received time, delivery status, AI-generated flag, prompt/suggestion reference. Unique external message identity theo provider/account.

### 7.10.6 `message_attachments`

Object key, provider URL reference, checksum, MIME, size, malware scan state, thumbnail key, expiry. Không proxy file chưa scan vào internal user trừ policy sandbox.

### 7.10.7 `conversation_assignments`, `conversation_notes`

Append history của assignment; note internal có classification và visibility. Current assignee denormalized ở conversation nhưng history là source audit.

### 7.10.8 `outbound_messages`, `outbound_delivery_attempts`

- Outbound command có client/idempotency key, message payload snapshot, status, scheduled_at, provider ID, blocked reason.
- Attempt có attempt number, provider request ID, response class, latency, retry_at.

## 7.11 Order/Payment/Fulfillment schema

### 7.11.1 `orders`

| Group | Fields |
|---|---|
| Identity | id, tenant, immutable order_code, source, conversation/customer |
| Lifecycle | order_status, payment_status, fulfillment_status, return_status |
| Money | currency, subtotal, discount, tax, shipping, fee, grand_total, paid, refunded, locked_cost_total |
| Customer snapshot | name, phone/address encrypted snapshot |
| Inventory | reservation_id, warehouse strategy |
| Concurrency | version, idempotency key, duplicate fingerprint |
| Timestamps | placed/confirmed/cancelled/completed/created/updated |

`order_code` unique tenant; confirmed order không được chỉnh item trực tiếp, phải dùng explicit amendment flow P1.

### 7.11.2 `order_items`

Variant/product snapshot, SKU/name, quantity, unit_price_minor, unit_cost_minor, discount/tax allocation, line_total, currency, source quote/tool call. Price/cost snapshot immutable sau confirm.

### 7.11.3 `order_status_history`

Append-only: dimension changed, old/new state, command, actor, reason, correlation, occurred_at.

### 7.11.4 `payments`

Method, provider/reference, amount/currency, status, received_at, idempotency/provider event ID, evidence, recorded_by. Payment amount tổng không vượt quy tắc order trừ overpayment flow rõ.

### 7.11.5 `payment_reconciliations`

Provider/bank statement reference, expected/actual amount, match state, confidence, reviewer, difference reason.

### 7.11.6 `shipments`, `shipment_items`, `shipping_labels`

Carrier/service/tracking, status, address snapshot, COD amount, timestamps; shipment item quantity không vượt unfulfilled quantity; label private object key + checksum/version.

### 7.11.7 `returns`, `return_items`, `refunds`

Return lifecycle riêng, reason/evidence, received condition, restock decision. Refund record link payment/order/return, approval, amount, provider reference và idempotency.

## 7.12 Analytics/Billing/Ops schema

### 7.12.1 `event_logs`

Immutable normalized business event projection; không thay thế outbox. Có event time, ingestion time, tenant, type, schema version, dimensions, source event ID unique.

### 7.12.2 Fact/read model

`daily_tenant_metrics`, `daily_channel_metrics`, `daily_sales_agent_metrics`, `daily_product_metrics`, `conversation_conversion_facts`, `order_profit_facts`, `ai_quality_facts`. Mỗi row có metric version, watermark, source range và reconciliation status.

### 7.12.3 Billing

- `plans` global versioned limits/features.
- `subscriptions` tenant status, period, plan snapshot/reference.
- `usage_meters` tenant+metric+period, consumed, reserved, limit, source event watermark.
- Billing không chặn critical recovery/support flow; hành vi khi vượt limit được feature policy hóa.

### 7.12.4 Operations

`feature_flags`, `feature_flag_overrides`, `system_alerts`, `support_tickets`, `support_access_grants`, `reprocess_requests`, `job_runs`.

### 7.12.5 `audit_logs`

Append-only, tối thiểu:

```text
id, tenant_id nullable for global action, occurred_at,
actor_type, actor_id, membership_id, session_id,
action, resource_type, resource_id,
result, reason, request_id, correlation_id,
ip_hash, user_agent_hash,
before_redacted, after_redacted, metadata,
integrity_hash, previous_hash optional per partition
```

Audit payload không chứa secret/full sensitive PII. Export audit có checksum và signed manifest.

## 7.13 Source-of-truth matrix

| Dữ liệu | Source of truth | Derived/cache |
|---|---|---|
| Current stock | `inventory_balances` được đối chiếu ledger | cache/search |
| Stock history | `inventory_movements` | report fact |
| Order total | `orders` + `order_items` snapshot | dashboard fact |
| Current conversation state | `conversations` | inbox cache |
| Message content/delivery | `messages`, `outbound_messages` | search index |
| Permission | membership/role/permission tables | Redis permission cache |
| AI decision trace | `ai_logs`, `ai_tool_calls`, policy decision | dashboard fact |
| Revenue/profit report | facts được reconcile với order/payment source | materialized views |

---
# 8. HTTP API contract

## 8.1 Contract source of truth

- HTTP contract MUST được định nghĩa trong `contracts/openapi.yaml` trước hoặc cùng PR implementation.
- OpenAPI sinh ra TypeScript client, request/response types, mock schema và contract tests.
- Không hand-maintain `shared-types` song song với OpenAPI.
- DTO nội bộ có thể khác API DTO; mapper explicit.
- OpenAPI lint phải chặn operation thiếu `operationId`, error response, security, permission extension, idempotency declaration hoặc example.

Custom extensions chuẩn:

```yaml
x-permission: order.confirm
x-idempotency: required
x-audit-action: order.confirm
x-feature-flag: order.confirm.v1
x-slo-class: critical-write
x-data-classification: confidential
```

## 8.2 Base URL và media type

```text
Production: https://api.<domain>/api/v1
Staging:    https://api.staging.<domain>/api/v1
```

- JSON UTF-8.
- Success: `application/json`.
- Error: `application/problem+json` theo RFC 9457 và extension project.
- Upload dùng multipart hoặc pre-signed object storage flow; không nhét base64 file lớn trong JSON.
- API version trong path cho major breaking change. Minor additive change không đổi path.

## 8.3 Header chuẩn

| Header | Direction | Rule |
|---|---|---|
| `Authorization: Bearer` | request | access token |
| `X-Request-Id` | optional request/response | client có thể gửi UUID hợp lệ; server thay nếu không hợp lệ |
| `X-Correlation-Id` | request/response | nối business flow; server sinh nếu thiếu |
| `Idempotency-Key` | critical request | UUID/random 16–128 chars |
| `If-Match` | mutable resource | ETag/version precondition |
| `ETag` | response | resource version |
| `Traceparent` | request/response propagation | W3C trace context qua OTel |
| `Retry-After` | 429/503 | seconds hoặc HTTP date |
| `Deprecation` / `Sunset` | response | khi endpoint bị deprecate |

Không cho client gửi `X-Tenant-Id` để đổi tenant context trên normal API. Chọn tenant bằng login/session switch endpoint tạo token/session context mới.

## 8.4 Success response

Single resource:

```json
{
  "data": {
    "id": "0197...",
    "version": 3,
    "created_at": "2026-06-26T10:00:00Z",
    "updated_at": "2026-06-26T10:03:00Z"
  },
  "meta": {
    "request_id": "req_...",
    "correlation_id": "corr_..."
  }
}
```

Command accepted async:

```json
{
  "data": {
    "job_id": "0197...",
    "status": "queued",
    "status_url": "/api/v1/import-jobs/0197..."
  },
  "meta": {
    "request_id": "req_..."
  }
}
```

Delete/archive command trả `204` khi không cần body hoặc `200` với resource state mới nếu client cần đồng bộ.

## 8.5 Error contract

```json
{
  "type": "https://errors.example.com/inventory/insufficient",
  "title": "Không đủ tồn kho khả dụng",
  "status": 409,
  "code": "INVENTORY_INSUFFICIENT",
  "detail": "Không thể giữ đủ số lượng yêu cầu.",
  "instance": "/api/v1/inventory/reservations",
  "request_id": "req_abc123",
  "correlation_id": "corr_xyz",
  "errors": [
    {
      "field": "items[0].quantity",
      "code": "AVAILABLE_QUANTITY_EXCEEDED",
      "message": "Số lượng khả dụng là 2.",
      "meta": {
        "variant_id": "0197...",
        "available": "2.000000"
      }
    }
  ]
}
```

### 8.5.1 Mapping status

| HTTP | Dùng khi |
|---|---|
| 400 | JSON/parameter không parse được |
| 401 | chưa xác thực/token không hợp lệ |
| 403 | đã xác thực nhưng thiếu quyền; không dùng nếu leak object tenant khác |
| 404 | resource không tồn tại hoặc không visible trong tenant context |
| 409 | conflict state/idempotency/duplicate/inventory |
| 412 | `If-Match`/precondition thất bại |
| 422 | request hợp lệ cú pháp nhưng vi phạm validation nghiệp vụ theo field |
| 429 | rate/quota limit |
| 500 | lỗi không dự kiến; detail không leak internals |
| 502/503/504 | upstream/provider unavailable/timeout |

Error code là stable machine contract; message có thể localization. Không parse message để quyết định UI logic.

## 8.6 Pagination, filter và sort

- Cursor pagination mặc định cho list lớn.
- `limit` default 50, max 100; export dùng async job.
- Cursor chứa sort key + ID và được HMAC/sign hoặc opaque server-generated.
- Stable sort luôn có tie-breaker `id`.
- Filter chỉ dùng allowlist; không expose arbitrary SQL/operator.
- Full-text search có query length/rate limit và tenant filter bắt buộc.

```http
GET /api/v1/conversations?lifecycle_status=open&assignee_id=...&sort=-updated_at&limit=50&cursor=...
```

```json
{
  "data": [],
  "page_info": {
    "next_cursor": "opaque",
    "has_more": false
  },
  "meta": {
    "request_id": "req_..."
  }
}
```

## 8.7 Idempotency contract

### 8.7.1 Endpoint bắt buộc

- Create order/reservation/payment/shipment/return.
- Confirm/cancel order.
- Send outbound message.
- Import confirm/apply.
- Provider payment/webhook callbacks.
- Ops reprocess.
- AI tool mutation.

### 8.7.2 Semantics

Scope:

```text
(tenant_id, actor_or_client_id, operation_id, idempotency_key)
```

Store:

```text
request_hash, status(processing|completed|failed_retryable|failed_final),
resource_id, response_status, response_body_redacted, created_at, expires_at
```

Rules:

1. Key mới: insert `processing` bằng unique constraint trước business action.
2. Cùng key + cùng canonical request hash + completed: trả lại status/body/resource cũ.
3. Cùng key + request hash khác: `409 IDEMPOTENCY_KEY_REUSED`.
4. Key đang processing: `409 IDEMPOTENCY_IN_PROGRESS` hoặc chờ ngắn rồi replay kết quả; behavior cố định theo endpoint.
5. Business transaction và idempotency completion nằm cùng transaction nếu có thể.
6. Retryable infrastructure error không được ghi final success.
7. TTL default 24 giờ; order/payment/message critical giữ tối thiểu 7 ngày; provider event dedupe giữ theo retention nghiệp vụ.

## 8.8 Optimistic concurrency

Mutable aggregate trả `ETag: "v3"`. Update cần:

```http
PATCH /api/v1/products/{id}
If-Match: "v3"
```

Nếu version đã đổi: `412 RESOURCE_VERSION_MISMATCH`, trả current version nhưng không leak dữ liệu cấm. Critical transition không dùng generic PATCH mà dùng command endpoint với precondition state.

## 8.9 API endpoint catalog

### 8.9.1 Auth/Identity/Tenant

| Method | Path | Operation | Permission | Idempotency/notes |
|---|---|---|---|---|
| POST | `/auth/login` | login | public | rate limited; may return MFA challenge |
| POST | `/auth/mfa/verify` | verify challenge | public challenge | single-use challenge |
| POST | `/auth/refresh` | rotate refresh | session | rotation/reuse detection |
| POST | `/auth/logout` | revoke current session | session | idempotent |
| POST | `/auth/password/forgot` | request reset | public | enumeration-safe |
| POST | `/auth/password/reset` | reset password | reset token | single-use |
| GET | `/me` | current actor/context | authenticated | includes effective capabilities, not secrets |
| POST | `/auth/switch-tenant` | create context for membership | authenticated | verifies active membership |
| GET | `/tenants/current` | current tenant | tenant.read | |
| PATCH | `/tenants/current` | update tenant settings | tenant.update | If-Match + audit |
| GET | `/members` | list members | member.read | cursor |
| POST | `/members/invitations` | invite member | member.invite | Idempotency-Key |
| POST | `/members/invitations/{id}/resend` | resend | member.invite | rate limit |
| POST | `/members/{id}/activate` | activate | member.update | audit |
| POST | `/members/{id}/suspend` | suspend | member.update | revoke sessions for tenant |
| POST | `/members/{id}/revoke` | revoke | member.revoke | audit/idempotent |
| GET | `/roles` | list roles | role.read | |
| POST | `/roles` | create custom role | role.manage | Idempotency-Key |
| PATCH | `/roles/{id}` | update role | role.manage | If-Match; bump permission_version |
| DELETE | `/roles/{id}` | archive role | role.manage | blocked if protected role |
| GET | `/permissions` | permission catalog | role.read | |
| PUT | `/members/{id}/roles` | replace role assignments | role.manage | If-Match/audit |
| GET | `/sessions` | current user's sessions | authenticated | |
| DELETE | `/sessions/{id}` | revoke session | authenticated/self or member.update | idempotent |
| GET | `/devices` | list devices | authenticated | |
| DELETE | `/devices/{id}` | revoke device | authenticated | closes sessions/SSE |
| GET | `/audit-logs` | list audit | audit.read | filter + cursor |
| POST | `/audit-exports` | async export | audit.export | Idempotency-Key/audit |

### 8.9.2 Customer

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/customers` | customer.read | PII masked unless `customer.pii.read` |
| POST | `/customers` | customer.write | idempotency recommended |
| GET | `/customers/{id}` | customer.read | field-level response |
| PATCH | `/customers/{id}` | customer.write | If-Match |
| POST | `/customers/{id}/identities` | customer.write | duplicate conflict handling |
| POST | `/customers/{id}/addresses` | customer.write | encrypted fields |
| PATCH | `/customers/{id}/addresses/{address_id}` | customer.write | If-Match |
| POST | `/customers/{id}/tags` | customer.write | idempotent set-add |
| DELETE | `/customers/{id}/tags/{tag_id}` | customer.write | idempotent |
| POST | `/customers/{id}/notes` | customer.write | internal only |
| POST | `/customers/merge-preview` | customer.merge | returns conflicts, no mutation |
| POST | `/customers/merge` | customer.merge | Idempotency-Key + audit |
| POST | `/customers/{id}/privacy-export` | customer.pii.read | async/audit |
| POST | `/customers/{id}/anonymize` | restricted privacy permission | policy/retention checks |

### 8.9.3 Catalog/Product/Import

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/categories` | catalog.read | tree/list mode |
| POST | `/categories` | catalog.write | Idempotency-Key |
| PATCH | `/categories/{id}` | catalog.write | If-Match/cycle check |
| POST | `/categories/{id}/archive` | catalog.write | audit |
| GET | `/products` | catalog.read | cursor/search/filter |
| POST | `/products` | catalog.write | Idempotency-Key |
| GET | `/products/{id}` | catalog.read | cost conditional |
| PATCH | `/products/{id}` | catalog.write | If-Match |
| POST | `/products/{id}/archive` | catalog.write | explicit command |
| GET | `/variants` | catalog.read | filters incl. SKU |
| POST | `/products/{product_id}/variants` | catalog.write | Idempotency-Key |
| PATCH | `/variants/{id}` | catalog.write | If-Match; cost permission |
| POST | `/variants/{id}/archive` | catalog.write | |
| POST | `/media/uploads` | catalog.write | pre-signed upload intent |
| POST | `/products/{id}/media` | catalog.write | object checksum/scan status |
| POST | `/imports` | catalog.write | create job/file intent |
| POST | `/imports/{job_id}/analyze` | catalog.write | async/idempotent |
| GET | `/imports/{job_id}` | catalog.read | status/counts |
| GET | `/imports/{job_id}/preview` | catalog.read | paged validation rows |
| PUT | `/imports/{job_id}/mapping` | catalog.write | If-Match |
| POST | `/imports/{job_id}/confirm` | catalog.write | Idempotency-Key + preview checksum |
| GET | `/imports/{job_id}/errors` | catalog.read | signed report URL |
| POST | `/imports/{job_id}/cancel` | catalog.write | only allowed states |

### 8.9.4 Inventory

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/warehouses` | inventory.read | |
| POST | `/warehouses` | inventory.adjust | Idempotency-Key |
| PATCH | `/warehouses/{id}` | inventory.adjust | If-Match |
| GET | `/inventory/balances` | inventory.read | variant/warehouse filters |
| GET | `/inventory/movements` | inventory.read | ledger, cursor |
| POST | `/inventory/adjustments` | inventory.adjust | Idempotency-Key + reason/audit |
| GET | `/inventory/adjustments/{id}` | inventory.read | |
| POST | `/inventory/reservations` | inventory.reserve | Idempotency-Key, transactional |
| GET | `/inventory/reservations/{id}` | inventory.read | |
| POST | `/inventory/reservations/{id}/release` | inventory.reserve | Idempotency-Key, reason |
| POST | `/inventory/reservations/{id}/extend` | inventory.reserve | max TTL/policy |
| POST | `/inventory/reservations/{id}/convert` | internal/order.confirm | same DB transaction with order |
| POST | `/inventory/reconciliation-jobs` | inventory.adjust | async privileged |
| GET | `/inventory/reconciliation-jobs/{id}` | inventory.read | |

### 8.9.5 Knowledge

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/knowledge/sources` | knowledge.read | lifecycle filter |
| POST | `/knowledge/sources` | knowledge.write | Idempotency-Key |
| GET | `/knowledge/sources/{id}` | knowledge.read | versions |
| POST | `/knowledge/sources/{id}/versions` | knowledge.write | immutable version |
| PATCH | `/knowledge/versions/{id}` | knowledge.write | draft only, If-Match |
| POST | `/knowledge/versions/{id}/submit-review` | knowledge.write | state transition |
| POST | `/knowledge/versions/{id}/approve` | knowledge.approve | audit/separation of duties configurable |
| POST | `/knowledge/versions/{id}/publish` | knowledge.publish | Idempotency-Key; starts ingestion |
| POST | `/knowledge/versions/{id}/archive` | knowledge.publish | audit |
| GET | `/knowledge/versions/{id}/ingestion` | knowledge.read | chunk/embedding status |
| POST | `/knowledge/search-test` | knowledge.read | test retrieval, no production message |

### 8.9.6 Channel/Webhook

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/channels/accounts` | channel.read | |
| POST | `/channels/{provider}/connect` | channel.connect | returns OAuth URL/state |
| GET | `/channels/{provider}/oauth/callback` | OAuth state | server callback, no secret in browser log |
| POST | `/webhooks/{provider}` | provider signature | public ingress, fast ack |
| GET | `/channels/accounts/{id}` | channel.read | health/scopes, no token |
| POST | `/channels/accounts/{id}/refresh-health` | channel.manage | async/idempotent |
| POST | `/channels/accounts/{id}/disconnect` | channel.manage | revoke credential/audit |
| GET | `/webhook-events` | channel.manage | redacted diagnostic list |
| GET | `/webhook-events/{id}` | channel.manage | privileged redacted payload |
| POST | `/webhook-events/{id}/reprocess` | ops.reprocess | Idempotency-Key/audit |
| GET | `/outbound-messages/{id}` | channel.read | delivery state |
| POST | `/outbound-messages/{id}/retry` | channel.send | allowed final/retry state |

### 8.9.7 Conversation

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/conversations` | conversation.read | multidimensional filters |
| GET | `/conversations/{id}` | conversation.read | messages summary/customer card |
| GET | `/conversations/{id}/messages` | conversation.read | cursor older/newer |
| PATCH | `/conversations/{id}` | conversation.reply or assign by field | only non-critical metadata, If-Match |
| POST | `/conversations/{id}/assign` | conversation.assign | Idempotency-Key/history |
| POST | `/conversations/{id}/unassign` | conversation.assign | idempotent |
| POST | `/conversations/{id}/notes` | conversation.reply | internal note |
| POST | `/conversations/{id}/messages` | conversation.reply | Idempotency-Key, outbound queue |
| POST | `/conversations/{id}/resolve` | conversation.reply | state transition |
| POST | `/conversations/{id}/reopen` | conversation.reply | state transition |
| POST | `/conversations/{id}/escalate` | conversation.assign | reason/SLA |
| POST | `/conversations/{id}/human-takeover` | conversation.takeover | AI mode transition |
| POST | `/conversations/{id}/release-takeover` | conversation.takeover | policy checks |
| GET | `/conversations/{id}/ai-suggestions` | ai.use | |
| POST | `/conversations/{id}/ai-suggestions/{suggestion_id}/approve` | ai.review | audit |
| POST | `/conversations/{id}/ai-suggestions/{suggestion_id}/send` | conversation.reply | Idempotency-Key; revalidate stale tools |
| GET | `/realtime/stream` | authenticated | SSE, tenant/session scoped |

### 8.9.8 AI

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/ai/suggestions` | ai.use | async or bounded sync, no direct send |
| POST | `/ai/evaluate-response` | ai.review | QC test endpoint |
| POST | `/ai/test-message` | ai.configure | sandbox data only |
| GET | `/ai/logs` | ai.review | redacted |
| GET | `/ai/logs/{id}` | ai.review | field-level sensitive controls |
| GET | `/ai/blocked-outputs` | ai.review | |
| GET | `/ai/prompt-versions` | ai.configure | |
| POST | `/ai/prompt-versions` | ai.configure | immutable draft version |
| POST | `/ai/prompt-versions/{id}/run-evaluation` | ai.configure | Idempotency-Key/async |
| GET | `/ai/evaluation-runs/{id}` | ai.review | metrics/case failures |
| POST | `/ai/prompt-versions/{id}/approve` | ai.activate | separation of duties |
| POST | `/ai/prompt-versions/{id}/activate` | ai.activate | evaluation gate + audit |
| POST | `/ai/prompt-versions/{id}/rollback` | ai.activate | emergency rollback |
| POST | `/ai/disable` | ai.disable | tenant kill switch |
| POST | `/ai/enable` | ai.disable | only after health/policy checks |

### 8.9.9 Order/Payment/Fulfillment

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/orders` | order.read | cursor/filter |
| POST | `/orders` | order.create | Idempotency-Key, draft only |
| GET | `/orders/{id}` | order.read | field-level cost/profit |
| PATCH | `/orders/{id}` | order.create | draft non-critical fields only, If-Match |
| POST | `/orders/{id}/recalculate` | order.create | draft, returns quote/version |
| POST | `/orders/{id}/reserve` | inventory.reserve | Idempotency-Key |
| POST | `/orders/{id}/confirm` | order.confirm | Idempotency-Key, transaction critical |
| POST | `/orders/{id}/cancel` | order.cancel | Idempotency-Key, reason, release stock |
| POST | `/orders/{id}/expire` | system/internal | idempotent |
| GET | `/orders/{id}/history` | order.read | |
| POST | `/orders/{id}/payments` | payment.record | Idempotency-Key/audit |
| GET | `/orders/{id}/payments` | payment.read | |
| POST | `/payments/{id}/confirm` | payment.record | provider/manual precondition |
| POST | `/payments/{id}/refunds` | payment.refund | Idempotency-Key + approval |
| POST | `/orders/{id}/shipments` | shipment.manage | Idempotency-Key |
| PATCH | `/shipments/{id}` | shipment.manage | If-Match, metadata only |
| POST | `/shipments/{id}/mark-packed` | shipment.manage | transition |
| POST | `/shipments/{id}/mark-shipped` | shipment.manage | tracking required |
| POST | `/shipments/{id}/mark-delivered` | shipment.manage | transition |
| POST | `/orders/{id}/packing-slip-jobs` | shipment.manage | async render/print payload |
| POST | `/orders/{id}/returns` | shipment.manage | Idempotency-Key |
| POST | `/returns/{id}/approve` | shipment.manage | transition |
| POST | `/returns/{id}/receive` | shipment.manage | inventory disposition |
| POST | `/returns/{id}/complete` | shipment.manage | refund/restock effects |

### 8.9.10 Analytics/Billing/Ops

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/dashboard/today` | report.read | read model, freshness timestamp |
| GET | `/reports/revenue` | report.read | metric version |
| GET | `/reports/gross-profit` | report.profit.read | cost-protected |
| GET | `/reports/sla` | report.read | timezone/filter |
| GET | `/reports/ai-quality` | ai.review | |
| POST | `/report-exports` | report.export | async/audit |
| GET | `/billing/plan` | billing.read | |
| GET | `/billing/usage` | billing.read | period/limit |
| POST | `/billing/subscription/manual-update` | billing.manage | privileged/audit |
| GET | `/super-admin/tenants` | ops tenant list | separate audience |
| GET | `/super-admin/tenants/{id}/health` | ops.tenant_health | no full tenant data |
| POST | `/super-admin/tenants/{id}/support-access` | support.access | reason/TTL/approval |
| POST | `/super-admin/tenants/{id}/feature-flags/{key}` | ops.feature_flag | audit/expiry |
| POST | `/super-admin/tenants/{id}/disable-ai` | ai.disable | emergency action |
| GET | `/super-admin/system-alerts` | ops.tenant_health | |
| POST | `/super-admin/reprocess-requests` | ops.reprocess | Idempotency-Key |

## 8.10 Critical command examples

### 8.10.1 Create reservation

```json
{
  "owner": {"type": "order", "id": "0197..."},
  "expires_at": "2026-06-26T11:00:00Z",
  "allocation_strategy": "preferred_then_available",
  "items": [
    {
      "variant_id": "0197...",
      "quantity": "2.000000",
      "preferred_warehouse_id": "0197..."
    }
  ]
}
```

Response MUST trả từng allocation, `available_after`, reservation version và expiry.

### 8.10.2 Confirm order

```json
{
  "expected_order_version": 4,
  "quote_version": "qte_...",
  "reservation_id": "0197...",
  "customer_confirmation": {
    "source": "agent",
    "confirmed_at": "2026-06-26T10:10:00Z"
  }
}
```

Server revalidate tenant, permission, state, quote, address, price override, reservation ownership/expiry và totals trước commit.

### 8.10.3 Send message

```json
{
  "content": {
    "type": "text",
    "text": "Nội dung gửi"
  },
  "reply_to_message_id": "0197...",
  "ai_suggestion_id": "0197...",
  "expected_conversation_version": 8
}
```

Nếu suggestion phụ thuộc giá/tồn quá freshness window, server phải re-run tool/pre-send validation trước khi queue.

## 8.11 Deprecation và compatibility

- Additive optional field: backward compatible.
- Thêm enum value có thể phá client exhaustive switch; phải thông báo và generated client test.
- Đổi required/meaning/type/remove field: breaking, cần `/v2` hoặc parallel contract.
- Endpoint deprecated tối thiểu một release cycle đã thỏa thuận; trả `Deprecation`/`Sunset` và migration guide.
- Consumer-driven contract test cho Frontend/Desktop chạy trong CI staging.

---
# 9. Event, queue và realtime contract

## 9.1 Contract source

- Internal/realtime event schema nằm trong `contracts/asyncapi.yaml` và JSON Schema dùng chung với OpenAPI khi phù hợp.
- Event producer không được publish payload chưa có schema/version.
- Event schema được compatibility-check trong CI.
- Business event là fact đã xảy ra, tên ở past tense; command/job không giả làm event.

## 9.2 Event envelope

Envelope tương thích CloudEvents:

```json
{
  "specversion": "1.0",
  "id": "0197...",
  "source": "urn:ai-sales-os:order",
  "type": "com.aisales.order.confirmed.v1",
  "subject": "orders/0197...",
  "time": "2026-06-26T10:00:00Z",
  "datacontenttype": "application/json",
  "dataschema": "urn:schema:order.confirmed:1",
  "tenantid": "0197...",
  "correlationid": "corr_...",
  "causationid": "evt_or_cmd_...",
  "actor": {
    "type": "user",
    "id": "0197..."
  },
  "partitionkey": "order:0197...",
  "data": {
    "order_id": "0197...",
    "order_status": "confirmed",
    "grand_total_minor": 1200000,
    "currency": "VND"
  }
}
```

Rules:

- `id` globally unique UUIDv7.
- `type` có namespace và major schema version.
- `time` là business occurrence time; ingestion time lưu riêng ở consumer.
- `tenantid` bắt buộc với tenant event.
- `correlationid` nối toàn flow; `causationid` trỏ command/event trực tiếp gây ra.
- Payload không chứa secret; PII chỉ khi consumer contract cần và được classification approval.

## 9.3 Delivery semantics

- Default **at-least-once**.
- Không hứa exactly-once end-to-end.
- Consumer MUST idempotent bằng `event_id`/business unique key.
- Ordering chỉ bảo đảm theo `partitionkey` khi queue/consumer hỗ trợ; không giả định global ordering.
- Producer commit business state và outbox row cùng transaction.
- Consumer commit side effect và inbox/dedupe cùng transaction khi có thể.

## 9.4 Transactional outbox

### 9.4.1 Schema

```text
outbox_events:
  id, tenant_id, aggregate_type, aggregate_id,
  event_type, schema_version, payload,
  correlation_id, causation_id,
  occurred_at, available_at,
  status(pending,publishing,published,failed),
  attempt_count, locked_by, locked_until,
  published_at, last_error
```

### 9.4.2 Publisher algorithm

1. `SELECT ... FOR UPDATE SKIP LOCKED` batch pending rows có `available_at <= now()`.
2. Lease row bằng `locked_by/locked_until`.
3. Publish message với event ID cố định.
4. Mark published; nếu crash sau publish trước mark, message có thể lặp và consumer phải dedupe.
5. Exponential backoff + jitter; quá max attempt chuyển DLQ/alert, không xóa row.

Không publish trực tiếp từ request handler sau DB commit như cơ chế duy nhất.

## 9.5 Consumer inbox/dedupe

```text
inbox_events:
  consumer_name, event_id, first_seen_at,
  processed_at, status, payload_hash, error
UNIQUE (consumer_name, event_id)
```

Consumer flow:

1. Insert inbox `processing`; duplicate conflict thì ack/replay safe.
2. Validate schema/tenant/type/version.
3. Thực hiện side effect trong transaction.
4. Mark processed.
5. Retry chỉ lỗi transient; validation/business poison event vào quarantine/DLQ.

## 9.6 Queue topology

| Queue | Job | Concurrency/ordering |
|---|---|---|
| `webhook.process` | verify stored event, normalize | partition account/thread; high concurrency |
| `message.send` | provider outbound send | rate limit per account/provider |
| `ai.suggest` | generate suggestion | concurrency/cost limit per tenant |
| `knowledge.ingest` | parse/chunk/embed | idempotent by content checksum |
| `import.apply` | validate/apply rows | one active apply per tenant/job |
| `inventory.expire` | release expired reservations | idempotent, batched |
| `analytics.project` | update facts/read models | ordered by source aggregate where needed |
| `notification.emit` | SSE notification/replay store | per user/session fan-out |
| `maintenance.reconcile` | inventory/payment/metrics checks | scheduled, low priority |

Queue payload chỉ chứa IDs, trusted context reference và schema version; tránh full PII/content khi có thể.

## 9.7 Retry và DLQ policy

| Loại lỗi | Retry | Hành động |
|---|---|---|
| Network timeout/429/5xx provider | exponential backoff + jitter | tôn trọng `Retry-After`; circuit breaker |
| Authentication/token revoked | không retry mù | mark channel unhealthy, alert/action required |
| Validation/schema | không retry | quarantine/DLQ, engineering alert |
| Business precondition | không retry tự động | final failure + domain notification |
| Database deadlock/serialization | bounded retry 3 lần | random jitter, giữ idempotency |
| AI provider timeout | retry tối đa policy | fallback model hoặc human handoff |

Default backoff: 5s, 30s, 2m, 10m, 30m; provider adapter có thể override. Max attempt và retention phải được cấu hình/monitor.

DLQ reprocess:

- Chỉ qua ops API có permission/reason/audit.
- Reprocess dùng cùng event/job ID hoặc explicit replay ID và vẫn idempotent.
- Không sửa raw payload trực tiếp; nếu cần transform, tạo migration/recovery rule version.

## 9.8 Internal domain event catalog

| Event | Producer | Consumer chính | Payload tối thiểu |
|---|---|---|---|
| `tenant.activated.v1` | Tenant | Billing/Ops | tenant_id, plan_id |
| `tenant.suspended.v1` | Tenant | Auth/Channel/AI | reason, effective_at |
| `membership.changed.v1` | Tenant | Auth/Audit | membership_id, status, permission_version |
| `customer.updated.v1` | Customer | Conversation/Analytics | customer_id, changed_fields |
| `customer.merged.v1` | Customer | Conversation/Order/Analytics | source_id, target_id |
| `catalog.variant.updated.v1` | Catalog | Inventory/AI/Analytics | variant_id, version, changed_fields |
| `inventory.adjusted.v1` | Inventory | Analytics/Audit | warehouse, variant, delta, reason |
| `inventory.reserved.v1` | Inventory | Order/Realtime | reservation_id, allocations, expires_at |
| `inventory.reservation_released.v1` | Inventory | Order/Analytics | reservation_id, reason |
| `inventory.reservation_expired.v1` | Inventory | Order/Conversation | reservation_id, owner |
| `knowledge.published.v1` | Knowledge | AI/Ingestion | source_version_id, effective window |
| `knowledge.ingestion_completed.v1` | Knowledge | AI/Ops | version_id, chunk_count |
| `channel.account_connected.v1` | Channel | Ops | account_id, scopes |
| `channel.health_changed.v1` | Channel | Realtime/Ops | account_id, old/new health, reason |
| `webhook.received.v1` | Channel | Webhook worker | webhook_event_id |
| `message.inbound_normalized.v1` | Channel | Conversation | message identity/content reference |
| `message.outbound_queued.v1` | Conversation | Sender | outbound_message_id |
| `message.outbound_sent.v1` | Channel | Conversation/Analytics | message_id, provider_id |
| `message.outbound_failed.v1` | Channel | Conversation/Ops | message_id, error_class |
| `conversation.created.v1` | Conversation | Realtime/Analytics | conversation_id, customer/channel |
| `conversation.updated.v1` | Conversation | Realtime/Analytics | changed dimensions/version |
| `conversation.sla_breached.v1` | Conversation | Realtime/Ops | due_at, assignee |
| `ai.suggestion_created.v1` | AI | Conversation/Realtime | suggestion_id, disposition |
| `ai.output_blocked.v1` | AI | Realtime/Ops/Analytics | rule_id, severity |
| `order.draft_created.v1` | Order | Conversation/Analytics | order_id, source |
| `order.confirmed.v1` | Order | Analytics/Fulfillment/Billing | totals, customer, items refs |
| `order.cancelled.v1` | Order | Analytics/Conversation | order_id, reason |
| `payment.recorded.v1` | Payment | Order/Analytics | payment_id, amount/status |
| `payment.refunded.v1` | Payment | Order/Analytics | refund_id, amount |
| `shipment.created.v1` | Fulfillment | Realtime/Analytics | shipment_id, order_id |
| `shipment.status_changed.v1` | Fulfillment | Order/Conversation | old/new status |
| `return.completed.v1` | Fulfillment | Inventory/Payment/Analytics | return/refund/restock data |
| `billing.usage_recorded.v1` | Billing | Ops | metric, quantity, period |
| `audit.recorded.v1` | Audit | Audit index/export | audit_id, action, resource |

Không đưa toàn bộ order/message/customer payload vào mọi event. Consumer cần thêm dữ liệu phải gọi query/read model có auth service-to-service hoặc dùng event chuyên biệt được phê duyệt.

## 9.9 Realtime SSE contract

Endpoint:

```http
GET /api/v1/realtime/stream
Authorization: Bearer <access-token>
Accept: text/event-stream
Last-Event-ID: 0197...
```

Frame:

```text
id: 0197...
event: conversation.message_received
data: {"schema_version":1,"tenant_id":"...","resource_id":"...","resource_version":12,"occurred_at":"...","summary":{...}}
retry: 5000
```

Rules:

- Stream scope theo tenant + membership + permission.
- Access token hết hạn: server gửi auth-expiring event hoặc đóng connection; client refresh và reconnect.
- Replay buffer Redis tối thiểu 15 phút hoặc 10.000 event/user, tùy giới hạn nào đến trước.
- Nếu `Last-Event-ID` quá cũ, gửi `system.resync_required`; client refetch list/detail.
- Heartbeat comment mỗi 15–30 giây.
- Không gửi raw secret/full PII.
- Fan-out event phải filter permission trước khi đưa vào user stream.
- SSE không là source of truth; mất event phải recover bằng REST refetch/version.

## 9.10 Webhook ingress flow

```text
Provider request
 -> WAF/rate limit/body size
 -> signature verify trên raw bytes
 -> resolve channel account bằng trusted mapping
 -> dedupe insert webhook_events
 -> return 2xx nhanh
 -> enqueue webhook.process
 -> normalize provider event
 -> upsert identity/conversation/message idempotently
 -> outbox domain event
 -> SSE/analytics consumers
```

- Signature verify trước JSON mutation/parsing nếu provider yêu cầu raw body.
- Unknown account/signature invalid trả theo provider contract và ghi security metric, không log secret/payload đầy đủ.
- Endpoint không làm AI/order logic đồng bộ trước ACK.

---

# 10. State machines chuẩn

## 10.1 Quy tắc chung

Mỗi transition phải xác định:

```text
current state + command + permission + preconditions
=> next state + domain changes + audit + outbox events
```

Cấm update trực tiếp status từ generic repository/controller. State transition nằm trong aggregate/application handler và có test toàn bộ transition matrix.

## 10.2 Tenant lifecycle

| From | Command | To | Preconditions/side effects |
|---|---|---|---|
| none | provision | provisioning | create defaults, owner invite, plan |
| provisioning | activate | active | schema/default roles ready |
| active | suspend | suspended | block mutation, revoke/limit sessions, pause AI/channel sends |
| suspended | reactivate | active | billing/security checks |
| active/suspended | close | closed | retention/anonymization workflow; irreversible without recovery ADR |

## 10.3 Membership lifecycle

| From | Command | To | Rules |
|---|---|---|---|
| none | invite | invited | email/token hash, expiry |
| invited | accept | active | verified user, tenant active |
| active | suspend | suspended | revoke tenant sessions |
| suspended | reactivate | active | permission recalculated |
| invited/active/suspended | revoke | revoked | terminal for membership record; reinvite creates new lifecycle or explicit restore policy |

## 10.4 Import job lifecycle

| From | Command/Event | To | Rules |
|---|---|---|---|
| none | upload | uploaded | checksum stored |
| uploaded | analyze | analyzing | one worker lease |
| analyzing | success | preview_ready | row errors/mapping suggestion frozen |
| analyzing | failure | failed | diagnostic report |
| preview_ready | update mapping | preview_ready | increment version, rerun validation |
| preview_ready | confirm | confirmed | expected version/checksum |
| confirmed | worker start | applying | idempotency record |
| applying | all rows committed | completed | report and events |
| applying | fatal rollback | failed | no half-applied atomic mode; batch mode has explicit applied rows/recovery |
| uploaded/preview_ready/confirmed | cancel | cancelled | no mutation after applying unless cooperative cancellation policy |

V1 product import SHOULD dùng transaction toàn job khi quy mô cho phép; file lớn dùng chunked apply với staging tables và final atomic merge.

## 10.5 Knowledge lifecycle

| From | Command | To | Preconditions |
|---|---|---|---|
| none | create version | draft | source exists |
| draft | submit review | in_review | content validation pass |
| in_review | request changes | draft | reviewer reason |
| in_review | approve | approved | permission/separation policy |
| approved | publish | published | effective window, ingestion succeeds or publish enters pending? V1 requires ingestion ready before active retrieval |
| published | archive | archived | new queries stop retrieval; historical logs retain refs |
| draft/in_review/approved | archive | archived | no production retrieval |

## 10.6 Channel account health

Health is computed, not manually arbitrary:

```text
healthy | degraded | action_required | disconnected
```

Signals: token expiry, missing scopes, provider rate limit, webhook lag, send failure ratio, provider outage. `disconnect` is lifecycle action; `degraded` does not automatically erase credential.

## 10.7 Outbound message lifecycle

| From | Trigger | To | Notes |
|---|---|---|---|
| none | create/send command | queued | content/policy snapshot, idempotency |
| queued | worker lease | sending | lease timeout recovery |
| sending | provider accepted | sent | provider ID stored |
| sending | transient error | queued | next_attempt_at/backoff |
| sending/queued | policy violation | blocked | no automatic retry |
| sending/queued | permanent provider error | failed | final reason |
| queued | user cancel before send | cancelled | provider call not started |

Delivery/read status from provider có thể là dimension riêng, không ép vào send lifecycle nếu provider hỗ trợ.

## 10.8 Conversation state model

Conversation không dùng một enum trộn nhiều khái niệm.

### 10.8.1 Lifecycle

| From | Command/Event | To |
|---|---|---|
| none | first inbound | new |
| new | viewed/assigned/replied | open |
| open/new | resolve | resolved |
| resolved | inbound/reopen | open |
| resolved | archive after retention/manual | archived |
| archived | privileged reopen | open |

### 10.8.2 Waiting dimension

`none -> customer` sau staff/AI reply cần khách phản hồi; `none -> staff` sau inbound cần xử lý; reset/update theo message direction và workflow. SLA calculation dựa vào `waiting_on=staff` và schedule policy.

### 10.8.3 Sales stage

`none -> qualified -> order_draft -> order_confirmed`; có thể reset/cancel với reason. Sales stage không tự resolve conversation.

### 10.8.4 AI mode

| From | Command/Policy | To | Rule |
|---|---|---|---|
| off | enable copilot | copilot | tenant flag/prompt active |
| copilot | enable semi-auto | semi_auto | evaluation/risk gate |
| semi_auto | enable autopilot | autopilot | explicit tenant approval + channel policy |
| any active | human takeover | human_takeover | cancel pending auto-send where possible |
| human_takeover | release | prior/default mode | actor permission + no unresolved escalation |
| any | emergency disable | off | immediate kill switch |

### 10.8.5 Escalation

`normal -> escalated` khi complaint/refund/legal/safety/VIP/risk/SLA policy; chỉ actor có permission hoặc rule engine tạo. `escalated -> normal` cần resolution reason.

## 10.9 Inventory reservation lifecycle

| From | Command/Event | To | Inventory effect |
|---|---|---|---|
| none | reserve | active | `reserved += quantity` |
| active | extend | active | expiry only; policy max TTL |
| active | release | released | `reserved -= quantity` |
| active | expiry job | expired | `reserved -= quantity` |
| active | convert on order confirm | converted | `reserved -= quantity`, `on_hand -= quantity`, ledger sale/allocation movement |
| released/expired/converted | retry same command | same | idempotent replay/no double effect |

Không cho convert reservation thuộc owner khác hoặc hết hạn. Partial conversion chỉ khi order/business rule explicitly hỗ trợ; v1 default all-or-nothing.

## 10.10 Order dimensions

### 10.10.1 `order_status`

```text
draft -> pending_customer_confirmation -> confirmed -> completed
  \                \                    \
   -> expired       -> cancelled         -> cancelled (chỉ nếu chưa fulfillment/payment rule cho phép)
```

| From | Command | To | Preconditions |
|---|---|---|---|
| none | create draft | draft | valid tenant/customer/source |
| draft | request customer confirm | pending_customer_confirmation | calculated quote, required contact fields |
| draft/pending | confirm | confirmed | quote/version valid, reservation active, permission/approval |
| draft/pending | expire | expired | timeout policy |
| draft/pending/confirmed | cancel | cancelled | cancellation policy; release/restock/refund orchestration as needed |
| confirmed | complete | completed | delivered/paid policy satisfied or manual override audited |

### 10.10.2 `payment_status`

`unpaid -> pending -> partially_paid -> paid -> partially_refunded -> refunded`; `failed` applies payment attempt, không nhất thiết toàn order. Totals derive from immutable payment/refund records, not arbitrary status update.

### 10.10.3 `fulfillment_status`

`unfulfilled -> allocated -> picking -> packed -> shipped -> delivered`; return dimension riêng. Cancel chỉ trước shipped trừ carrier cancellation flow.

### 10.10.4 `return_status`

`none -> requested -> approved|rejected -> in_transit -> received -> inspected -> completed`; có `cancelled` trước completed. Restock/refund quyết định theo item condition.

## 10.11 Prompt/version lifecycle

| From | Command | To | Gate |
|---|---|---|---|
| none | create | draft | immutable version ID/checksum |
| draft | run evaluation | evaluating | frozen eval set/model config |
| evaluating | pass | approved | all critical cases pass, metrics threshold |
| evaluating | fail | draft/failed | cannot activate |
| approved | activate | active | approver != creator when required; canary flag |
| active | retire/replace | retired | historical logs keep version |
| active | emergency rollback | retired/approved previous active | audit/incident reference |

## 10.12 AI suggestion lifecycle

`queued -> generating -> qc_pending -> ready | approval_required | blocked | failed -> sent | expired`.

- `ready` chỉ cho read/low-risk response theo tenant AI mode.
- `approval_required` không được auto-send.
- `sent` phải link outbound message.
- Suggestion expiry khi source/tool data stale hoặc conversation state/version thay đổi.

---

# 11. Transaction, locking và concurrency

## 11.1 Transaction policy

- Default PostgreSQL isolation: `READ COMMITTED` với explicit row locks/constraints.
- Dùng `REPEATABLE READ`/`SERIALIZABLE` chỉ cho flow được benchmark và có retry handler.
- Transaction phải ngắn; không gọi provider/LLM bên trong DB transaction.
- Lock rows theo thứ tự deterministic `(warehouse_id, variant_id)` hoặc aggregate ID để giảm deadlock.
- Mọi retry transaction cần idempotency và bounded attempts.
- Unique/check/foreign key là lớp bảo vệ cuối; không chỉ validate ở application.

## 11.2 Reservation algorithm

Pseudocode chuẩn:

```text
BEGIN tenant transaction
  claim idempotency key
  validate owner and requested items
  sort requested allocations by warehouse_id, variant_id

  SELECT balances FOR UPDATE in deterministic order

  for each item:
      available = on_hand - reserved - blocked - damaged - safety_stock
      if available < requested:
          ROLLBACK with INVENTORY_INSUFFICIENT

  INSERT reservation header active
  INSERT reservation items
  UPDATE each balance SET reserved = reserved + qty, version = version + 1
  INSERT audit record
  INSERT outbox inventory.reserved
  complete idempotency response
COMMIT
```

Requirements:

- Không dùng read-then-update ngoài lock/atomic predicate.
- Có thể dùng conditional update `... WHERE available >= qty` nhưng multi-item vẫn cần all-or-nothing strategy.
- Missing balance row được tạo/lock an toàn bằng upsert trước hoặc explicit error theo catalog/warehouse policy.
- Expiry worker dùng `FOR UPDATE SKIP LOCKED`, kiểm tra status/expiry lại trong lock.

## 11.3 Confirm order transaction

```text
PRE-TRANSACTION
  authenticate/authorize
  validate request shape
  optionally compute quote preview (not authoritative)

BEGIN tenant transaction
  claim idempotency key
  SELECT order FOR UPDATE
  verify expected version and allowed state
  load customer/address/tenant policy
  validate quote version and recompute totals from authoritative catalog/rules
      # algorithm: docs/domain/order-calculation.md (rounding mode, discount-before-tax order,
      # per-line vs order-level rounding) — tax rate itself is pending Human Owner, see
      # docs/collaboration/SIGNOFF_TRACKER.md
  SELECT reservation + items FOR UPDATE
  verify reservation owner/order, active, not expired, quantities match
  lock balances deterministic
  convert reservation:
      reserved -= qty
      on_hand -= qty
      append inventory movements
  snapshot order items, price, cost, tax, discount, address
  set order confirmed + histories
  append audit
  append outbox order.confirmed + inventory reservation converted
  complete idempotency
COMMIT

POST-COMMIT ASYNC
  analytics projection
  warehouse task/shipment preparation
  customer/conversation update
  notification
```

Không gọi payment/carrier/AI provider trong transaction. Nếu external reservation/payment cần thiết sau này, dùng saga với explicit pending state và compensation.

## 11.4 Cancel order transaction

1. Lock order.
2. Validate allowed cancellation policy dựa order/payment/fulfillment.
3. Nếu reservation active: lock và release.
4. Nếu inventory đã converted nhưng chưa shipped và policy cho restore: append compensating movement `cancel_restore`; không sửa/xóa movement cũ.
5. Payment paid tạo refund-required workflow, không tự giả định refund thành công.
6. Set order cancelled + history/reason.
7. Audit + outbox.
8. Idempotent replay không double-release/restock/refund.

## 11.5 Payment callback/manual record

```text
receive callback -> signature verify -> store raw provider event/dedupe -> ACK
worker:
  BEGIN
    claim provider_event_id
    lock payment/order
    validate currency/amount/reference/current state
    insert immutable payment transaction or update attempt state
    recalculate order payment_status from sums
    audit/outbox/inbox complete
  COMMIT
```

- Duplicate provider callback trả/reprocess an toàn.
- Out-of-order callback dùng provider sequence/time và allowed state rules.
- Amount mismatch vào reconciliation, không tự mark paid.

## 11.6 Outbound message send

Request transaction chỉ tạo `outbound_messages=queued`, audit/outbox và trả accepted. Worker:

1. Lock/lease outbound row.
2. Recheck channel health, conversation AI/takeover mode, content policy và stale suggestion/tool data.
3. Apply provider/account rate limiter.
4. Gọi provider ngoài DB transaction với provider idempotency key nếu hỗ trợ.
5. Transaction ghi sent/retry/failed/blocked và attempt.
6. Emit event.

Nếu timeout không biết provider đã nhận hay chưa, ưu tiên query provider/dedupe external client reference trước retry để tránh gửi trùng.

## 11.7 Webhook normalize/upsert

- Dedupe raw event bằng unique key.
- Identity mapping và message upsert dùng unique external key.
- Conversation creation/upsert lock theo channel account + external thread ID.
- Repeated event không làm tăng unread count/lead score/order trigger lần hai.
- Normalize adapter output phải có schema version và original event reference.

## 11.8 Import apply

### Small/medium import

- Parse/validate vào staging tables trước.
- Confirm checksum/mapping/version.
- Một transaction merge toàn bộ rows; bất kỳ fatal error rollback.

### Large import

- Staging data immutable.
- Apply batch có row-level status nhưng final visibility dùng generation/version switch hoặc atomic merge phase.
- Retry batch idempotent theo job+row.
- Không để half-import “vô hình” nhưng ảnh hưởng inventory/order; trạng thái và report phải rõ.

## 11.9 Customer merge

- Lock source và target theo ID order.
- Revalidate không đã merged và cùng tenant.
- Resolve identity unique conflicts theo preview decision checksum.
- Repoint allowed foreign keys; immutable historical snapshots không nhất thiết rewrite.
- Mark source merged, append merge history/audit/outbox.
- Retry same key trả same target/result.

## 11.10 Deadlock/serialization retry

Infrastructure transaction runner chỉ retry SQLSTATE cho phép (`40P01`, `40001`) tối đa 3 lần, jitter ngẫu nhiên. Không retry validation/permission/business conflict. Log metric không chứa SQL parameter nhạy cảm.

## 11.11 Reconciliation jobs

Tối thiểu có:

- `inventory_balance_vs_ledger`.
- `reservation_sum_vs_balance_reserved`.
- `order_totals_vs_items`.
- `order_payment_status_vs_payment_sums`.
- `order_facts_vs_orders`.
- `outbox_pending_age` và event projection watermark.

Reconciliation không tự sửa dữ liệu critical ngoài approved repair command. Nó tạo discrepancy record/alert với evidence và runbook.

---
# 12. Security, privacy và secure SDLC

## 12.1 Security baseline

Mục tiêu release:

- OWASP ASVS 5.0 Level 2 cho toàn bộ web/API.
- Chọn lọc Level 3 cho authentication, tenant isolation, admin/support, payment/refund, secrets và audit.
- OWASP LLMSVS/AISVS controls phù hợp cho AI/LLM.
- NIST SSDF làm khung secure development và software supply chain.

Danh sách control cụ thể phải được export thành security backlog/test evidence; không ghi “theo OWASP” chung chung.

## 12.2 Threat modeling

Mỗi epic critical phải có threat model cập nhật trước implementation freeze:

1. Data flow diagram và trust boundary.
2. Assets: credential, provider token, PII, order/payment, inventory, prompt/model, audit.
3. Actors và abuse cases.
4. STRIDE hoặc phương pháp tương đương.
5. Risk rating, owner, mitigation, verification test.
6. Residual risk và approval.

Threat model tối thiểu riêng cho:

- Multi-tenant/RLS.
- Auth/refresh token/MFA.
- Facebook/provider OAuth + webhook.
- AI/RAG/tool calling/prompt injection.
- Payment/refund.
- Object upload/download.
- Support impersonation/break-glass.
- CI/CD and software supply chain.

## 12.3 Data classification

| Class | Ví dụ | Logging | Encryption/Access |
|---|---|---|---|
| Public | product public name, generic policy | allowed | integrity controls |
| Internal | IDs, operational metadata | structured minimal | employee/service need-to-know |
| Confidential | customer/order/message, cost, analytics | redacted/hash | TLS + at-rest + RBAC/RLS |
| Restricted | password hash, refresh token, OAuth token, recovery code, encryption key | never | secret manager/HSM/KMS, narrow service role |

Mỗi schema/field critical có classification trong data dictionary/OpenAPI extension.

## 12.4 Cryptography và key management

- TLS 1.2+; prefer TLS 1.3. Internal traffic qua private network; mTLS khi platform hỗ trợ/risk yêu cầu.
- Password dùng Argon2id với cost benchmark theo production hardware; parameters versioned và rehash-on-login.
- Refresh/reset/invite/recovery token chỉ lưu cryptographic hash/HMAC.
- PII field encryption dùng envelope encryption: data key -> KMS master key; lưu key version.
- Searchable PII dùng keyed blind index; không dùng unsalted SHA hash cho phone/email.
- JWT signing key asymmetric, rotate theo `kid`; private key trong KMS/secret manager.
- Provider OAuth tokens encrypted và tách repository/permission.
- Key rotation có dual-read/new-write plan và background re-encryption.
- Không tự thiết kế encryption primitive.

## 12.5 Secret management

- Secret không nằm trong git, image layer, frontend bundle, CI log hoặc `.env.example` thực.
- Production secret lấy runtime từ secret manager/workload identity.
- Credential theo environment và least privilege; không dùng chung staging/prod.
- Rotation định kỳ và ngay khi suspected exposure.
- Secret scanning ở pre-commit/PR/main; phát hiện secret thật phải revoke, không chỉ xóa commit.

## 12.6 Input/output security

- Validate allowlist type/length/range/format ở API boundary và domain invariant.
- SQL parameterized; raw SQL review bắt buộc.
- Không dựng shell command từ input; cấm dynamic code execution.
- HTML/Markdown từ message/AI coi là untrusted; frontend encode/sanitize, backend không đánh dấu safe tùy ý.
- URL fetch/import có SSRF protection: allowlist scheme, resolve DNS/IP, chặn private/link-local/metadata ranges, size/time limit.
- File upload: content length, MIME sniff, extension allowlist, checksum, malware scan, quarantine, private storage.
- CSV/Excel export chống formula injection bằng escaping policy.
- Error không leak stack, SQL, provider secret, internal hostname.

## 12.7 Rate limiting và abuse controls

Nhiều tầng:

| Scope | Ví dụ |
|---|---|
| Edge/IP | login, forgot password, webhook invalid signature |
| User/session | normal API burst |
| Tenant | AI calls, exports, imports, message send |
| Provider account | outbound rate per page/account |
| Resource | resend invite, retry message, evaluation run |

- Rate limit key không chỉ IP vì NAT/shared IP.
- `429` trả `Retry-After` và error code.
- AI/exports/imports có concurrency semaphore và budget, không chỉ RPS.
- Abuse metrics không dùng full PII label.

## 12.8 Tenant/IDOR controls

- Authorization check nằm server-side trên mọi object và nested relation.
- Không dùng “unguessable UUID” thay authorization.
- RLS + composite FK + repository context + automated tests là bốn lớp.
- Cross-tenant access trả 404 cho normal actor.
- Signed URL object storage có tenant-bound object key/authorization trước khi sign.
- Search/index/cache key bắt đầu tenant và invalidation đúng scope.

## 12.9 Audit integrity

- Audit append cùng transaction với critical action.
- Runtime role không có UPDATE/DELETE audit row.
- Có checksum/hash chain theo partition hoặc export manifest để phát hiện tamper; không tuyên bố immutable tuyệt đối nếu database admin vẫn có quyền.
- Audit clock dùng server UTC; trace request/correlation.
- Read audit/export audit cũng được audit.
- Retention/legal hold policy và access review định kỳ.

## 12.10 Privacy lifecycle

### 12.10.1 Data minimization

- Chỉ thu dữ liệu cần cho sales/support/order/fulfillment.
- Không gửi toàn bộ customer profile vào model nếu chỉ cần tên và lịch sử tóm tắt.
- Raw webhook/message retention ngắn hơn transaction/audit nếu business cho phép.

### 12.10.2 Export

Privacy export là async job:

1. Verify permission/recent MFA.
2. Resolve subject identities.
3. Collect allowed data và provenance.
4. Generate encrypted archive/signed manifest.
5. Signed URL TTL ngắn, download audited.
6. Auto-delete export object.

### 12.10.3 Delete/anonymize

- Không hard-delete accounting/order/payment/audit nếu có retention obligation.
- Xóa/anonymize direct identifiers, revoke identities/consents, crypto-shred encryption keys khi policy cho phép.
- Historical order giữ pseudonymous snapshot tối thiểu cần thiết.
- Search/vector/cache/read model phải nhận deletion event và purge.
- Deletion job có report từng subsystem và retry/reconciliation.

## 12.11 Object storage security

- Bucket private, block public access.
- Object key random/tenant-prefixed, không dùng raw filename/PII.
- Pre-signed upload giới hạn method, MIME/size/checksum, TTL 5–15 phút.
- Download URL chỉ sinh sau auth/RLS/permission check, TTL ngắn.
- Malware/quarantine status trước normal access.
- Lifecycle rule xóa temp/import/export object đúng retention.

## 12.12 Supply-chain security

CI/CD phải có:

- dependency lockfile và trusted registry policy;
- SCA/license scan;
- secret scan;
- SAST;
- IaC/container scan;
- SBOM SPDX/CycloneDX;
- signed OCI image/artifact và provenance/attestation;
- protected build runners/environments;
- least-privilege OIDC deploy credential, không long-lived cloud key;
- review dependency install scripts và package takeover risk;
- reproducible/build provenance mục tiêu SLSA phù hợp.

## 12.13 Vulnerability management SLA

| Severity | Triage | Remediation target |
|---|---:|---:|
| Critical exploited/exposed | immediate | ≤24 giờ hoặc mitigation/disable |
| Critical | ≤1 ngày | ≤3 ngày |
| High | ≤3 ngày | ≤14 ngày |
| Medium | ≤14 ngày | ≤60 ngày |
| Low | backlog risk-based | ≤180 ngày |

Exception cần Human Owner chấp nhận rủi ro (risk acceptance) kèm expiry và compensating control. Không release production với unresolved Critical/High thuộc đường critical trừ khi có Human Owner approval documented, dựa trên đánh giá kỹ thuật của Backend AI Agent.

## 12.14 Security test gate

- Auth bypass, token replay/rotation, session revoke.
- Tenant IDOR/RLS across every resource.
- Privilege escalation/field-level leak.
- SQL/command/template injection.
- SSRF/file upload/path traversal.
- Webhook signature/replay/body mutation.
- Rate limit/budget bypass.
- Support access abuse.
- AI prompt injection/tool authorization/data exfiltration.
- Dependency/container/IaC findings.
- DAST staging và manual pentest trước commercial launch.

---

# 13. AI architecture, safety và governance

## 13.1 Mục tiêu AI

AI hỗ trợ bán hàng nhưng không trở thành nguồn sự thật. AI tạo đề xuất hoặc yêu cầu tool; authoritative data và mutation nằm trong Backend domain services.

```text
Inbound/customer context
 -> Context policy/minimization
 -> Intent/risk classification
 -> Tenant-filtered retrieval
 -> Model planning/generation
 -> Tool calls through policy gateway
 -> Deterministic validation + QC
 -> approval/auto-send decision
 -> outbound queue or human review
 -> full trace/evaluation metrics
```

## 13.2 AI service boundaries

AI service MAY:

- classify intent/risk;
- retrieve published knowledge qua controlled interface;
- generate structured suggestion;
- request allowlisted tools;
- run QC/evaluation;
- return evidence/source/tool references.

AI service MUST NOT:

- connect trực tiếp production business database;
- receive provider/OAuth secrets;
- execute arbitrary URL/SQL/code;
- decide tenant/permission từ prompt;
- bypass approval/rate/billing policy;
- write order/payment/inventory directly;
- activate prompt/model của chính nó không qua governance.

## 13.3 Model provider abstraction

```ts
interface ModelGateway {
  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse>;
  embed(request: EmbeddingRequest, signal: AbortSignal): Promise<EmbeddingResponse>;
  health(): Promise<ModelHealth>;
}
```

Model policy xác định provider/model, region, data retention mode, timeout, token cap, fallback, allowed data classes. Prompt code không import provider SDK trực tiếp.

## 13.4 Structured output

- Model output cho orchestration MUST validate bằng JSON Schema/Pydantic.
- Invalid output có bounded repair attempt; sau đó fail safe/human handoff.
- Không dùng model-generated SQL, shell, template code hoặc URL không validate.
- Model text hiển thị cho user coi là untrusted content.

Ví dụ suggestion contract:

```json
{
  "intent": "product_inquiry",
  "risk_level": "low",
  "language": "vi",
  "reply": "...",
  "claims": [
    {
      "type": "price",
      "value": {"variant_id": "...", "price_minor": 120000},
      "evidence": {"tool_call_id": "...", "observed_at": "..."}
    }
  ],
  "requested_actions": [],
  "requires_human_approval": false
}
```

## 13.5 Tool registry và risk classes

| Risk | Tool examples | Default policy |
|---|---|---|
| R0 read public | `catalog.search`, `knowledge.search` | auto allowed với tenant filter |
| R1 read confidential | `inventory.get_available`, `customer.get_summary`, `order.get` | permission + minimization + audit sampling |
| R2 reversible draft | `order.create_draft`, `inventory.create_reservation` | policy + idempotency; approval tùy AI mode |
| R3 external communication | `conversation.queue_reply` | QC + stale check; human approval trong copilot |
| R4 financial/irreversible | discount override, confirm/cancel order, refund, payment update | human approval/recent auth; autopilot mặc định cấm |
| R5 prohibited | arbitrary DB/HTTP/code, secret read | không đăng ký tool |

Tool definition bắt buộc:

```text
name/version
input/output JSON Schema
risk class
timeout/retry
required permission
feature flag/quota
idempotency strategy
preconditions
PII classification
audit action
allowed AI modes
human approval rule
```

## 13.6 Tool execution protocol

1. AI trả structured tool request, không credential.
2. Orchestrator gắn trusted tenant/actor/context ngoài model output.
3. Policy engine kiểm tra tool allowlist, permission, AI mode, quota, risk, approval.
4. Input validate/canonicalize; bỏ mọi tenant/actor field model tự cung cấp.
5. Tool gọi application service như normal API command/query.
6. Output minimize/redact trước khi gửi lại model.
7. Log tool call/policy/result/correlation.
8. Mutation tool dùng idempotency key derived từ suggestion/action ID.

## 13.7 AI policy rules AI-R001…AI-R010

| ID | Rule | Severity | Enforcement | Required tests |
|---|---|---|---|---|
| AI-R001 | Tenant isolation trong retrieval, cache và tool | Critical | server context + RLS/filter | cross-tenant corpus/tool injection |
| AI-R002 | Không khẳng định giá/tồn nếu không có successful fresh tool evidence | Critical | claim validator | missing/stale/failed tool cases |
| AI-R003 | Không discount/override ngoài policy | Critical | deterministic rule engine | boundary, currency, role, prompt bypass |
| AI-R004 | PII minimization và không disclose restricted data | Critical | context filter + output DLP | ask-for-phone/secret/system data |
| AI-R005 | Complaint/refund/legal/safety/threat/high-risk phải escalate | High | intent/risk + deterministic keywords/rules + QC | multilingual/adversarial cases |
| AI-R006 | Untrusted message/knowledge không thể thay system/tool policy | Critical | prompt separation, instruction hierarchy, content marking | direct/indirect prompt injection corpus |
| AI-R007 | R3/R4 action cần policy/approval; model không tự nâng quyền | Critical | policy gateway | forged approval/tool parameters |
| AI-R008 | Policy/FAQ claim cần published source evidence | High | retrieval/source validator | unpublished/expired/conflicting source |
| AI-R009 | Không tiết lộ secret, hidden prompt, credential hoặc internal control | Critical | context exclusion + output scanner | extraction/jailbreak cases |
| AI-R010 | Bounded consumption: token, time, recursion, tool count và cost | High | budgets/circuit breaker | infinite loop/large input/retry storm |

Critical rule violation luôn `blocked` hoặc `human handoff`; không “soft warn” rồi auto-send.

## 13.8 RAG pipeline

### 13.8.1 Ingestion

1. Verify source lifecycle/permission.
2. Extract text trong sandbox; file size/type/malware controls.
3. Normalize nhưng giữ source offsets/checksum.
4. Chunk mặc định 400–800 tokens, overlap 10–15%; tune bằng eval.
5. Attach metadata: tenant, source/version, language, category, effective time, permission class, checksum.
6. Generate embedding qua pinned model/version.
7. Store chunks transactionally hoặc generation-based switch.
8. Run retrieval smoke test before published version becomes active.

### 13.8.2 Retrieval

- Filter `tenant_id`, published/effective version, language/scope trước similarity.
- Hybrid keyword+vector MAY dùng nếu eval chứng minh tốt hơn.
- Top-k và minimum similarity/rerank threshold versioned.
- Conflicting sources: deterministic precedence (effective date, policy priority) hoặc require human review.
- Không đủ evidence: model phải nói chưa đủ thông tin/ask clarification/handoff, không tự bịa.
- Log source IDs/chunk checksums, không nhất thiết log full sensitive text.

## 13.9 Context builder

Context budget có lớp ưu tiên:

1. System/policy instructions immutable.
2. Tool schemas/authorization hints.
3. Current conversation recent turns.
4. Customer summary tối thiểu cần thiết.
5. Current order/cart state.
6. Retrieved published knowledge.
7. Older history summary.

Customer messages/knowledge được bao trong delimiters và đánh dấu `UNTRUSTED_CONTENT`; không concatenate trực tiếp thành system instructions.

## 13.10 Freshness policy

| Claim/tool | Default freshness |
|---|---:|
| Available inventory | 30 giây hoặc revalidate trước send/confirm |
| Price/current promotion | 5 phút hoặc revalidate trước order |
| Published policy | theo version/effective window; revalidate on send nếu changed event |
| Customer summary | 5 phút |
| Order state | immediate/current version required for mutation |

Suggestion hết hạn nếu conversation/order/resource version thay đổi hoặc freshness vượt ngưỡng.

## 13.11 Human approval

Approval record có:

```text
suggestion/action ID, tool request hash, resource versions,
approver, permission, decision, reason, approved_at, expires_at
```

- Approval gắn đúng payload hash; thay input làm approval mất hiệu lực.
- High-risk approval TTL ngắn.
- Creator/approver separation configurable cho discount/refund/prompt activation.
- “Approve and send” vẫn revalidate permission, state và freshness tại execution time.

## 13.12 Prompt/model versioning

Một deployable AI configuration gồm:

```text
prompt_version
model_provider/model/version
parameters
tool registry version
retrieval configuration version
policy rule version
output schema version
fallback policy
```

Mỗi AI log lưu toàn bộ version IDs. Không dùng alias “latest” không trace được cho production decision.

## 13.13 Evaluation framework

### 13.13.1 Eval set tiers

- P0 Safety/Security: prompt injection, cross-tenant, secret/PII, unauthorized tool, harmful/illegal/internal policy.
- P0 Business correctness: price, stock, discount, order fields, refund escalation.
- P1 Quality: helpfulness, tone, language, product matching, source faithfulness.
- P1 Reliability: provider timeout, malformed output, tool failure, stale data.
- P2 Regression/edge: long context, multilingual, typo, attachments.

### 13.13.2 Release thresholds

| Metric | Gate |
|---|---:|
| Critical P0 violations | 0 |
| Unauthorized tool/action success | 0 |
| Cross-tenant retrieval/tool leak | 0 |
| Price/stock unsupported claim rate | 0 trong P0; <1% broader eval |
| Required escalation recall | ≥99% P0 set |
| Structured output validity after bounded repair | ≥99,5% |
| Source faithfulness | ≥95% applicable cases |
| Tool selection correctness | ≥95% |
| Human Owner reviewer pass for pilot sample | ≥90% |
| p95 latency/cost | trong SLO/budget |

Threshold là project gate, không thay thế manual risk review. Eval set/version/checksum phải frozen cho comparison.

## 13.14 Online monitoring

- block rate by rule/model/prompt/tenant;
- human edit distance/acceptance rate;
- unsupported claim reports;
- tool error/timeout/rate;
- cost/token per tenant/journey;
- latency and fallback rate;
- escalation rate/false negative review;
- retrieval no-answer/source conflict;
- customer complaint linked AI output.

Metric label không chứa prompt, customer ID high-cardinality hoặc PII.

## 13.15 Cost and consumption controls

- Max input/output tokens per request.
- Max tool calls và recursion depth, default 5 tool calls/2 planning rounds.
- Per-tenant daily/monthly soft/hard budget.
- Cache only tenant-scoped, non-sensitive, version-keyed result.
- Concurrency limit per tenant và global.
- Large conversation summarized; summary version/provenance logged.
- On hard budget: degrade to copilot template/human handoff, không silently fail.

## 13.16 Failure/fallback matrix

| Failure | Behavior |
|---|---|
| Model timeout/unavailable | one bounded fallback if policy; otherwise human handoff |
| Retrieval unavailable | no policy claim; generic safe response/handoff |
| Inventory/price tool unavailable | do not claim value; ask staff/customer to wait |
| Output schema invalid | bounded repair then block/handoff |
| QC unavailable | R3/R4 no auto-send; copilot may show warning only if policy allows |
| Prompt version disabled | route to approved previous version or AI off |
| Suspected prompt injection | block tool mutation, sanitize context, escalate/log |

## 13.17 AI incident kill switch

Kill switch levels:

1. Disable one prompt/model version.
2. Disable one tool.
3. Force tenant to copilot/human approval.
4. Disable AI for tenant.
5. Disable provider/global AI path.

Action propagated trong ≤60 giây, audited, có owner/expiry/recovery checklist. Pending auto-send jobs recheck kill switch before execution.

---
# 14. Analytics, metric dictionary và reconciliation

## 14.1 Nguyên tắc

- Analytics là derived read model, không sửa transaction source.
- Mọi metric có business definition, source, event time, timezone, metric version và reconciliation query.
- Dashboard hiển thị `data_freshness_at`/watermark.
- Permission được áp dụng cả ở report API và export.
- Không dùng một từ như “revenue” nếu chưa chỉ rõ gross/net/recognized/paid.

## 14.2 Time semantics

Mỗi event/fact phân biệt:

- `occurred_at`: sự kiện nghiệp vụ xảy ra.
- `ingested_at`: analytics nhận event.
- `business_date`: ngày theo tenant timezone.
- `processed_at`: projection cập nhật.

Late event policy mặc định: cập nhật lại fact của business date trong 7 ngày; quá cửa sổ đưa reconciliation/backfill job và đánh dấu revised.

## 14.3 Metric dictionary v1

### 14.3.1 Order metrics

| Metric | Định nghĩa |
|---|---|
| `orders_created` | số order draft được tạo trong period, dedupe theo order ID |
| `orders_confirmed` | số order có transition đầu tiên sang confirmed trong period |
| `orders_cancelled` | số order transition cancelled; dimension reason |
| `orders_completed` | số order transition completed |
| `average_order_value` | confirmed gross sales / confirmed order count; exclude zero/test orders |

### 14.3.2 Revenue

- `gross_sales_minor`: tổng `subtotal_minor` của order confirmed/completed theo report basis đã chọn.
- `discount_minor`: tổng discount snapshot.
- `net_sales_minor`: gross sales - discount +/− approved adjustment; tax/shipping tách dimension.
- `recognized_revenue_minor` v1: net item sales của order `completed`; shipping/tax tách riêng. Nếu business dùng delivered/paid basis phải tạo metric khác, không đổi nghĩa metric cũ.
- `refund_minor`: refund completed trong period.
- `net_revenue_after_refund_minor`: recognized revenue - allocated completed refunds.

Dashboard “doanh thu hôm nay” phải hiển thị basis rõ: confirmed, completed hay paid.

### 14.3.3 Gross profit

```text
gross_profit_minor = recognized_net_item_sales_minor - locked_cost_of_goods_minor
```

- Cost dùng `order_items.unit_cost_minor` snapshot.
- Shipping subsidy/payment fee chưa trừ trong `gross_profit`; nếu cần tạo `contribution_margin` metric riêng.
- Refund/return phân bổ đảo revenue và cost theo restock/disposition policy.
- Chỉ actor có `report.profit.read` được xem.

### 14.3.4 Conversation/SLA

| Metric | Definition |
|---|---|
| `first_response_seconds` | first staff/approved AI outbound - first inbound requiring staff |
| `resolution_seconds` | resolved time - open time, exclude archived/imported history theo rule |
| `sla_breaches` | transition/observation due_at exceeded while waiting_on=staff |
| `conversation_to_order_rate` | unique conversations có confirmed order / eligible conversations |
| `hot_lead_conversion_rate` | confirmed order from lead classified hot / hot lead count; score version stored |

Business hours/calendar policy phải versioned; không trừ ngoài giờ bằng hard-coded logic.

### 14.3.5 AI quality

- suggestion generated/ready/blocked/failed.
- acceptance rate = approved or sent suggestions / reviewable suggestions.
- edit rate/distance khi human sửa.
- critical rule violation count.
- unsupported claim/customer report.
- tool success and fallback rate.
- cost per suggestion/order-assisted.
- AI-attributed conversion chỉ là assisted attribution có definition, không tuyên bố causal.

## 14.4 Projection architecture

1. Domain event vào `analytics.project`.
2. Consumer inbox dedupe event ID.
3. Update atomic fact/read model và watermark.
4. Store source event link/version.
5. Emit projection health metric.
6. Rebuild capability từ event log/source transaction cho selected period.

Projection code versioned; schema/backfill có runbook. Materialized view refresh không được block transaction path.

## 14.5 Reconciliation

Daily job sau tenant day close:

- confirmed/completed order counts và amounts vs order source;
- payment sums/refunds vs payment source;
- locked cost vs order items;
- conversion facts vs conversation/order links;
- AI usage meters vs AI logs/provider usage;
- projection watermark/gaps/duplicate events.

Kết quả:

```text
reconciliation_run_id
metric/date/tenant
source_value, projected_value, difference
status matched|mismatch|waived
owner, investigation, corrected_at
```

Mismatch monetary/order count khác 0 tạo alert trước khi report “closed”.

## 14.6 Report query controls

- Date range max cho sync endpoint; range lớn dùng export job.
- Filter dimensions allowlist và index/read model tương ứng.
- Query timeout/statement timeout riêng read role.
- Không chạy ad-hoc aggregate nặng trên primary transaction DB trong peak.
- Khi scale, dùng read replica/warehouse nhưng metric definition/source lineage giữ nguyên.

---

# 15. Observability, SRE và operational readiness

## 15.1 OpenTelemetry baseline

Tất cả deployable instrument traces, metrics và logs qua OpenTelemetry/OTLP. Trace context propagate qua HTTP, queue và internal tool calls.

### 15.1.1 Standard attributes

```text
service.name, service.version, deployment.environment
http.request.method, http.route, http.response.status_code
request.id, correlation.id
tenant.id_hash hoặc tenant.id khi access-controlled backend cho phép
actor.type, auth.result
module, operation, outcome
job.queue, job.name, job.attempt
provider.name, provider.operation
ai.provider, ai.model, ai.prompt_version
error.type, error.code
```

Không đặt email, phone, message text, prompt, token, full URL query hoặc object payload vào attributes/metric labels.

## 15.2 Structured logs

JSON log tối thiểu:

```json
{
  "timestamp": "2026-06-26T10:00:00.000Z",
  "level": "info",
  "service": "api",
  "version": "sha256:...",
  "environment": "production",
  "message": "order confirmation completed",
  "request_id": "req_...",
  "correlation_id": "corr_...",
  "trace_id": "...",
  "tenant_id": "...",
  "actor_type": "user",
  "operation": "order.confirm",
  "resource_id": "...",
  "duration_ms": 187,
  "outcome": "success"
}
```

- `debug` production off mặc định và không được tăng global lâu dài.
- Exception log có stack nội bộ nhưng scrub request body/header.
- Sampling không bỏ audit/security/critical error.
- Log retention/index tier theo class và chi phí.

## 15.3 Metrics

### RED for services

- request rate;
- error rate theo route template/error class;
- duration histogram.

### USE for resources

- CPU, memory, event-loop lag;
- DB pool usage/wait;
- PostgreSQL connections/locks/deadlocks/replication lag/bloat;
- Redis memory/evictions/latency;
- queue depth/oldest job age/retry/DLQ;
- object storage/provider error.

### Business/reliability

- order confirm success/conflict/latency;
- inventory insufficient vs technical failure;
- webhook signature invalid/dedupe/processing lag;
- message send success/provider failure;
- AI blocked/fallback/cost/latency;
- RLS/authorization denial anomaly;
- outbox oldest pending age;
- reconciliation mismatch.

## 15.4 Trace requirements

Trace critical journey:

```text
webhook ingress -> queue -> normalize -> conversation/message -> outbox -> SSE
conversation reply -> outbound queue -> provider -> delivery event
order confirm -> inventory conversion -> outbox -> analytics/warehouse
AI suggestion -> retrieval -> model -> tool -> QC -> approval/send
```

Span names dùng low-cardinality operation, không nhét resource ID vào span name. External model/provider span record timeout/status/token counts, không raw prompt.

## 15.5 Health endpoints

| Endpoint | Purpose | Behavior |
|---|---|---|
| `/health/live` | process alive | không check dependency nặng |
| `/health/ready` | nhận traffic | DB/required dependency connection + migration compatibility |
| `/health/startup` | startup probe | warmup/migration check |
| `/internal/health/dependencies` | ops detailed | protected, redacted |

Redis/AI/provider degradation không nhất thiết làm core API unready; readiness theo capability và graceful degradation policy.

## 15.6 Dashboards

Tối thiểu:

1. Executive service health/SLO/error budget.
2. API latency/error by route/module.
3. PostgreSQL health/slow query/lock/deadlock.
4. Queue/outbox/DLQ.
5. Webhook/channel/provider health.
6. Conversation/realtime delivery.
7. Order/inventory/payment critical path.
8. AI latency/cost/quality/safety.
9. Security/auth/rate limit/support access.
10. Backup/restore and deployment health.

## 15.7 Alert policy

Alert phải actionable, có owner/runbook/severity/dedup; không alert mọi lỗi đơn lẻ.

| Alert | Trigger baseline | Severity |
|---|---|---|
| SLO burn fast | 14.4x burn 5m/1h pair | P1/P2 theo journey |
| Order confirm 5xx | >2% trong 5m và volume threshold | P1 |
| Inventory invariant/reconcile mismatch | bất kỳ negative/difference critical | P1 |
| Tenant isolation/security signal | confirmed/suspected leak | P0 |
| DB connection saturation | >85% + wait > threshold 10m | P2 |
| Queue oldest job | >SLO ×2 | P2 |
| DLQ growth | >0 critical queue hoặc rate threshold | P2/P1 |
| Outbox pending age | >60s critical event | P2 |
| Webhook invalid spike | anomaly/provider-specific | P2/security review |
| Channel send failure | >10% 10m by provider/account | P2 |
| AI critical block spike | baseline anomaly | P2; P1 if leakage/action risk |
| Backup/PITR failure | any scheduled failure | P1 |
| Certificate/secret expiry | 30/14/7-day ladder | P3/P2 |

## 15.8 On-call readiness gate

Trước production:

- service catalog/owner/escalation contact;
- runbook link trong alert;
- dashboards và synthetic checks;
- deploy/rollback access tested;
- backup restore drill;
- incident communication template;
- support/customer impact process;
- post-incident review không đổ lỗi, action có owner/date.

Backend AI Agent thực thi triage kỹ thuật theo runbook. Một khi hệ thống có production traffic thật với tenant trả phí, MUST luôn có Human Owner (hoặc người được Human Owner ủy quyền) reachable qua escalation contact cho incident ảnh hưởng khách hàng/tài chính thật — không vận hành production với on-call chỉ có AI agent và không có human backstop.

---

# 16. Infrastructure, environments, CI/CD và disaster recovery

## 16.1 Environment model

| Environment | Data | Purpose |
|---|---|---|
| local | synthetic | developer/docker compose |
| test/CI | ephemeral synthetic | automated tests/migrations |
| staging | synthetic/anonymized | contract/E2E/performance smoke |
| preprod optional | production-like no live customer | load/release rehearsal |
| production | live | customer workload |

- Không copy raw production PII về local/staging.
- Environment credential/network/data hoàn toàn tách.
- Config schema giống nhau; khác value/scale.

## 16.2 Production topology baseline

- WAF/CDN/load balancer public.
- API ít nhất 2 instances across failure zones.
- Worker scale theo queue; scheduler leader election/distributed lock.
- Managed PostgreSQL HA + PITR + encryption.
- Managed Redis HA với eviction policy phù hợp; queue data persistence/backup policy rõ.
- Object storage versioning/lifecycle/encryption.
- AI service private, không public ingress.
- Egress allowlist/NAT controls cho provider/model/object endpoints khi platform hỗ trợ.
- OTel collector/agent có buffer và không trở thành single point blocking request.

## 16.3 Configuration

Typed config validate startup:

```text
APP_ENV, SERVICE_NAME, RELEASE_VERSION
HTTP_PORT, PUBLIC_BASE_URL
DATABASE_URL or workload secret reference
REDIS_URL
OBJECT_STORAGE_ENDPOINT/BUCKET
JWT_ISSUER/AUDIENCE/KEY_REF
KMS_KEY_REF
OTEL_EXPORTER_OTLP_ENDPOINT
AI_PROVIDER_CONFIG_REF
FEATURE_FLAG_PROVIDER/LOCAL FALLBACK
```

- Missing/invalid critical config làm startup fail fast.
- Secret value không in ra validation error.
- Dynamic feature flag không thay thế immutable security invariant.

## 16.4 CI pipeline

### Pull request

1. Restore dependencies từ lockfile.
2. Format/lint/module-boundary.
3. Type check.
4. Unit tests.
5. Start ephemeral PostgreSQL/Redis.
6. Apply migrations from zero.
7. Integration tests.
8. OpenAPI/AsyncAPI lint + breaking change check.
9. Generate clients/types; fail nếu git diff.
10. Tenant isolation/security tests.
11. SAST, secret scan, SCA/license.
12. Build images and container/IaC scan where cost permits.

### Main branch

1. Repeat trusted checks.
2. Build immutable OCI images once.
3. Generate SBOM/provenance, sign image.
4. Deploy staging by digest.
5. Run migration compatibility, smoke, contract, E2E, DAST, AI P0 eval subset.
6. Store release evidence.

### Production promotion

1. Change/release approval.
2. Verify backup and rollback compatibility.
3. Run expand migration.
4. Canary 5% -> 25% -> 100% based on SLO/metrics.
5. Run synthetic critical journeys.
6. Confirm projection/queue/outbox health.
7. Contract migration later removes old fields only after all code versions retired.

## 16.5 Database migration policy

### Expand/contract

Release N:

- add nullable/new table/index concurrently where possible;
- dual read/write if needed;
- backfill throttled/idempotent;
- deploy code compatible old+new.

Release N+1:

- switch reads/validate data;
- stop old writes.

Release N+2:

- enforce not-null/constraint;
- drop old column/index only after rollback window.

Rules:

- No destructive migration before compatible code rollout.
- Large index dùng `CREATE INDEX CONCURRENTLY`/platform-safe procedure.
- Migration có statement/lock timeout và size estimate.
- Backfill là resumable job, không một transaction nhiều giờ.
- Rollback code không được phụ thuộc schema đã drop.

## 16.6 Deployment strategy

- Stateless API; graceful shutdown ngừng nhận request, drain in-flight.
- Worker stop lấy job mới, complete/return lease trước terminate.
- SSE server gửi reconnect hint; clients resume.
- Readiness false trước termination.
- Container non-root, minimal base, pinned digest.
- Resource requests/limits và autoscaling dựa CPU/event-loop/queue, không chỉ CPU.

## 16.7 Feature flags

Types:

- release flag;
- experiment flag;
- ops kill switch;
- tenant entitlement;
- permission/security policy (không dùng generic client-controlled flag).

Mỗi flag có owner, description, default, environment, created/expiry date, cleanup ticket. Server evaluates security/entitlement; frontend flag chỉ UI convenience.

## 16.8 Backup/PITR

- PostgreSQL automated backup + continuous WAL/PITR, RPO ≤5 phút.
- Daily snapshot retention 35 ngày baseline; monthly archive theo policy.
- Object storage versioning/lifecycle; critical config/contract/IaC in version control.
- Redis queue không là source of truth; outbox/DB cho phép replay. Nếu queue durability cần, cấu hình AOF/managed persistence.
- Encryption keys/secret manager có backup/rotation/recovery procedure.

## 16.9 Restore drill

Ít nhất hàng quý và trước commercial launch:

1. Chọn recovery point bất ngờ trong retention.
2. Restore vào isolated environment.
3. Apply application compatible version/config.
4. Run integrity/reconciliation tests.
5. Verify critical user journeys.
6. Measure RPO/RTO thực tế.
7. Securely destroy drill data.
8. Record evidence/gaps/actions.

Backup chưa restore thử không được coi là usable backup.

## 16.10 Disaster recovery

V1: warm/cold standby region tùy budget, không active-active.

Runbook phải bao gồm:

- incident declaration/decision authority (Backend AI Agent triage kỹ thuật; Human Owner là decision authority cho hành động ảnh hưởng khách hàng/dữ liệu thật, ví dụ chọn recovery point chấp nhận mất dữ liệu);
- freeze writes nếu consistency risk;
- restore/promote DB;
- rotate endpoints/secrets;
- reconcile queue/outbox/provider callbacks;
- validate RLS/keys/contracts;
- customer communication;
- failback plan.

## 16.11 External dependency resilience

- Timeout bắt buộc; không infinite wait.
- Circuit breaker và bulkhead theo provider.
- Retry only idempotent/safe operations.
- Provider health state và graceful degradation.
- Contract adapter test fixtures cho webhook/API version changes.
- Quota/rate limit metrics và alert trước cạn.

---

# 17. Testing strategy và quality gates

## 17.1 Test layers

| Layer | Mục tiêu | Chạy |
|---|---|---|
| Unit/domain | invariant, calculation, state transition, policy | mỗi PR |
| Repository integration | SQL, constraint, RLS, transaction | mỗi PR |
| API integration | auth/validation/error/idempotency | mỗi PR |
| Contract | OpenAPI/AsyncAPI producer/consumer | mỗi PR/staging |
| End-to-end | critical user journeys | staging/release |
| Concurrency/property | race/invariant/money | PR critical/nightly |
| Load/soak | SLO/capacity/leak | preprod/release cadence |
| Security | ASVS/IDOR/injection/webhook/AI | PR subset + release full |
| Migration | zero/upgrade/rollback compatibility | PR/release |
| AI eval/red-team | safety/business/quality | prompt/model release |
| DR/chaos | restore/failure modes | scheduled |

## 17.2 Coverage policy

- Không dùng line coverage đơn lẻ làm quality proof.
- Domain calculation/state/policy target ≥90% branch coverage.
- Overall changed-code target ≥80% có exception review.
- Mọi bug production phải thêm regression test nếu kỹ thuật cho phép.
- Critical SQL/transaction branch phải có integration/concurrency test.

## 17.3 Test data

- Factory tạo tenant A/B, roles, customer, catalog, inventory, conversation, order.
- Synthetic only; không commit production data.
- Time/UUID/provider client injectable để deterministic.
- Golden fixtures có schema version/checksum.
- PII test values rõ là giả.

## 17.4 Mandatory critical test suites

### 17.4.1 Auth

- login generic error;
- refresh rotation/reuse/family revoke;
- expired/revoked token/session/device;
- role change invalidates permission cache/token context;
- MFA/recovery code replay;
- tenant switch inactive membership.

### 17.4.2 Multi-tenant

- CRUD/list/search/export/aggregate across tenant;
- nested IDs/composite FK;
- cache/search/vector isolation;
- queue forged tenant;
- support grant expiry/scope;
- file signed URL.

### 17.4.3 Inventory/order concurrency

- 100 parallel reservations for last units;
- multi-SKU lock order/deadlock;
- reserve vs expire vs confirm race;
- double cancel/confirm/retry;
- idempotency key same/different payload;
- price/catalog changes between draft and confirm;
- reservation owner mismatch;
- rollback leaves no partial movement/outbox/audit.

### 17.4.4 Webhook/message

- valid/invalid signature, raw body mutation;
- duplicate/out-of-order event;
- unknown account;
- provider timeout/429/5xx;
- send timeout ambiguous outcome;
- DLQ/reprocess exactly one business effect;
- inbound-to-SSE latency.

### 17.4.5 Payment

- duplicate callback;
- amount/currency mismatch;
- out-of-order status;
- partial payment/refund;
- retry does not double credit/refund;
- reconciliation discrepancy.

### 17.4.6 AI

- direct/indirect prompt injection;
- cross-tenant retrieval/tool;
- stale/missing price/stock evidence;
- unauthorized discount/order/refund;
- PII/secret/system prompt extraction;
- malformed structured output;
- provider/tool/QC timeout;
- kill switch while job pending;
- approval payload tampering;
- unbounded tool loop/token input.

## 17.5 Property-based tests

Properties:

- order total = sum line allocations + shipping + tax + fee - discount;
- monetary values integer minor and no overflow;
- inventory `reserved/on_hand/blocked/damaged >= 0`;
- available formula invariant;
- sequence of reserve/release/convert never creates/destroys quantity ngoài movement semantics;
- state machine rejects every unspecified transition;
- idempotent command applied N times has same state as once.

## 17.6 Load test scenarios

- Baseline mixed API traffic at capacity target.
- Webhook burst 500 RPS/5m with queue drain SLO.
- 20k SSE connections + reconnect storm.
- 100 order confirms/s with hot SKU contention.
- AI 200 concurrent requests with tenant fairness/cost limit.
- Large import + normal transaction traffic.
- 4–8 hour soak for memory/event-loop/connection leak.

Pass requires latency/error/SLO, database/queue headroom và no invariant/reconciliation failure.

## 17.7 Migration tests

- Fresh DB apply all migrations.
- Upgrade snapshot from current production-compatible schema.
- Old code works after expand migration during rolling deploy.
- New code tolerates old optional data during rollout.
- Backfill resumable/idempotent.
- Contract/drop migration only after compatibility gate.

## 17.8 Release acceptance evidence

Release record includes:

- commit/image digest/SBOM/signature;
- migration list/result;
- OpenAPI/AsyncAPI diff;
- unit/integration/E2E/security test result;
- AI eval result if affected;
- load/smoke result according risk;
- known issues/risk acceptance;
- rollback plan/owner;
- dashboard/alert confirmation.

---
# 18. Delivery governance: Definition of Ready, Done và contract freeze

## 18.1 Definition of Ready (DoR)

Một Backend ticket chỉ được đưa vào sprint khi có đủ:

- [ ] Actor/use case và business outcome.
- [ ] In-scope/out-of-scope.
- [ ] Business invariant và state transition liên quan.
- [ ] Permission/tenant/data classification.
- [ ] OpenAPI/AsyncAPI schema hoặc xác nhận không đổi contract.
- [ ] Database impact, migration/backfill/index.
- [ ] Transaction boundary, lock/idempotency.
- [ ] Audit/event/telemetry requirements.
- [ ] Error codes.
- [ ] Acceptance tests gồm negative/concurrency/security khi cần.
- [ ] Dependency đã ready hoặc mock/port được freeze.
- [ ] Feature flag/rollout/rollback plan.
- [ ] Quyết định business (Human Owner) và security (Backend AI Agent kỹ thuật; escalate Human Owner nếu là risk acceptance) không còn câu hỏi P0.

Ticket thiếu mục critical ở trạng thái `needs-refinement`, không giao Backend AI Agent tự đoán.

## 18.2 Definition of Done (DoD)

- [ ] Code tuân module boundary và strict typing.
- [ ] Migration immutable, index/constraint/RLS đúng; fresh + upgrade test pass.
- [ ] OpenAPI/AsyncAPI cập nhật, lint/breaking-change check pass.
- [ ] Validation, auth, permission, tenant isolation và field masking.
- [ ] Idempotency/transaction/audit/outbox cho command critical.
- [ ] Unit/integration/contract/concurrency/security tests tương ứng.
- [ ] Structured logs/traces/metrics và dashboard/alert nếu critical.
- [ ] Error catalog/example/mock/generated client cập nhật.
- [ ] Feature flag và rollout/rollback note.
- [ ] Documentation/runbook nếu thay behavior vận hành.
- [ ] CI green, review required hoàn tất, không unresolved Critical/High finding.
- [ ] Staging smoke/acceptance pass.

## 18.3 Contract freeze

Backend AI Agent và Frontend AI Agent chạy trong session/repo riêng biệt, không có kênh họp trực tiếp hay chat đồng bộ. Toàn bộ phối hợp contract đi qua file trong `docs/collaboration/` ở cả hai repo:

- **Contract-gap-board** (`docs/collaboration/contract-gap-board.md` hoặc tương đương): danh sách operation/schema/enum/error/permission/event đang mở, ai đề xuất, trạng thái (`proposed` / `acked` / `frozen`).
- **Decision queue** (`docs/collaboration/SIGNOFF_TRACKER.md`): các mục không thể tự giải quyết bằng rule đã viết sẵn, chờ Human Owner quyết định.

Quy trình:

- Trước khi implementation của sprint bắt đầu: Backend AI Agent publish operation/schema/enum/error/permission/event lên contract-gap-board và đặt trạng thái `proposed`.
- Frontend AI Agent review async (không đồng bộ theo thời gian thực), ghi gap/objection ngay trên board; không có bước "hai bên thảo luận trực tiếp".
- Bất đồng được giải quyết theo đúng một trong hai cách: (1) áp dụng rule/precedent đã có sẵn trong blueprint/ADR — bên phát hiện gap tự áp rule và cập nhật board; (2) nếu không có rule xác định hoặc bất đồng chạm invariant/security/money, đẩy vào decision queue để Human Owner quyết định. Không có bước "hai lead bàn bạc rồi thống nhất".
- Khi mọi mục trên board đạt `acked` bởi Frontend AI Agent (hoặc được Human Owner quyết định qua decision queue), Backend AI Agent chuyển trạng thái sang `frozen`. Contract source merge trước hoặc cùng implementation skeleton.
- Frontend AI Agent dùng generated client/mock từ cùng commit/tag.
- Breaking change trong sprint chỉ khi change request trên contract-gap-board nêu rõ impact/migration, và được cả Backend AI Agent lẫn Frontend AI Agent ack trên board (escalate Human Owner nếu ảnh hưởng invariant/security/money).
- Cuối sprint chạy consumer contract test against staging; kết quả ghi lại trên contract-gap-board để đóng các mục còn mở.

## 18.4 Ownership/RACI tối thiểu

| Artifact/Decision | Accountable | Responsible/Review |
|---|---|---|
| Domain invariant/state | Human Owner (business rule) + Backend AI Agent (technical correctness) | Backend AI Agent self-verification (`invariant-reviewer`, `module-test-writer`) |
| Architecture/ADR | Backend AI Agent (routine); Human Owner (khi ảnh hưởng security/tenant/money invariant) | Backend AI Agent self-review |
| OpenAPI/AsyncAPI | Backend AI Agent | Frontend AI Agent (consumer review qua contract-gap-board) + Backend AI Agent QA tooling |
| ERD/migration | Backend AI Agent | Backend AI Agent self-verification (`invariant-reviewer`) |
| Threat model/security gate | Backend AI Agent (technical enforcement); Human Owner (risk acceptance/waiver) | Backend AI Agent (`invariant-reviewer`) |
| AI rule/eval/activation | Backend AI Agent (technical); Human Owner (autopilot/high-risk activation approval) | Backend AI Agent QA tooling |
| SLO/runbook | Backend AI Agent | Backend AI Agent; Human Owner phải reachable cho incident ảnh hưởng khách hàng/tài chính thật |
| Production release | Human Owner (go/no-go, không thể đảo ngược) | Backend AI Agent + Frontend AI Agent self-certification |

---

# 19. Implementation playbook theo phase

## 19.1 Dependency map

```text
P0 Architecture/Contracts
  -> P1 Foundation/Platform
      -> P2 Identity/Tenant/Audit
          -> P3 Customer/Catalog/Import
              -> P4 Inventory/Knowledge
                  -> P5 Channel/Webhook
                      -> P6 Conversation/Realtime
                          -> P7 Order/Payment/Fulfillment Core
                              -> P8 AI Copilot/Tools/QC
                                  -> P9 Analytics/Reporting
                                      -> P10 Billing/Ops/Desktop Support
                                          -> P11 Hardening/Pilot
                                              -> P12 Commercial Production
```

Một số stream làm song song sau khi contract freeze, nhưng không bỏ dependency exit gate.

## 19.2 Phase P0 — Architecture và implementation contracts

### Entry

- Blueprint v2.0 được Human Owner chấp thuận làm baseline.
- Backend AI Agent là owner thực thi cho Backend, AI, Platform, Security (kỹ thuật) và QA (qua verification tooling riêng); Human Owner là owner duy nhất cho quyết định rủi ro/pháp lý và go-live.

### Tasks

| ID | Task | Deliverable |
|---|---|---|
| BE-P0-001 | Xác nhận capacity/SLO/cost assumptions | NFR sign-off (Human Owner phê duyệt baseline; Backend AI Agent xác nhận khả thi kỹ thuật) |
| BE-P0-002 | Commit ADR-001…ADR-010 | `docs/adr/*.md` |
| BE-P0-003 | System context/data flow/trust boundary | diagrams + threat model seed |
| BE-P0-004 | ERD v1 và table classification | ERD/data dictionary |
| BE-P0-005 | Permission matrix và default roles | CSV/seed plan |
| BE-P0-006 | State machine transition matrices | reviewed spec/tests outline |
| BE-P0-007 | OpenAPI/AsyncAPI skeleton + lint rules | contracts compile |
| BE-P0-008 | Error/idempotency/audit/event catalogs | machine-readable catalogs |
| BE-P0-009 | Environment/topology/release strategy | platform plan |
| BE-P0-010 | Security/AI threat model P0 | risks/mitigations/tests |
| BE-P0-011 | Epic decomposition và dependency board | implementation-ready backlog |

### Exit gate

- Không còn lựa chọn “A hoặc B” trong core stack.
- ERD core, permission, state machines, API/event common contracts reviewed.
- P1 tickets đạt DoR.
- Risks Critical có mitigation owner.

## 19.3 Phase P1 — Foundation, platform và walking skeleton

### Tasks

| ID | Task | Implementation details |
|---|---|---|
| BE-FND-001 | Monorepo/bootstrap | pnpm workspace, apps/packages/modules, strict TS, boundary lint |
| BE-FND-002 | Local stack | Docker Compose PostgreSQL/Redis/object emulator/OTel |
| BE-FND-003 | Config package | typed schema, fail-fast, secret redaction |
| BE-FND-004 | HTTP baseline | Fastify/Nest, request/correlation ID, RFC9457 error, validation |
| BE-FND-005 | OpenAPI pipeline | lint, docs, generated client/types/mock |
| BE-FND-006 | Database package | Kysely/pg pool, transaction runner, statement timeout |
| BE-FND-007 | Migration framework | role/schema/bootstrap, immutable migrations |
| BE-FND-008 | Tenant transaction/RLS test harness | context setter, runtime DB role, deny-default tests |
| BE-FND-009 | Idempotency component | storage/service/interceptor + replay tests |
| BE-FND-010 | Outbox/inbox component | schema, publisher, consumer base, DLQ |
| BE-FND-011 | Queue/scheduler skeleton | BullMQ queues, retry/lease/graceful shutdown |
| BE-FND-012 | Audit append port | transaction-aware writer, redaction |
| BE-FND-013 | Observability | OTel logs/traces/metrics, health endpoints |
| BE-FND-014 | CI/CD | PR/main/staging pipeline, scans, SBOM/image signing |
| BE-FND-015 | Staging infra | HA-appropriate managed dependencies baseline |
| BE-FND-016 | Walking skeleton | `/health`, temporary authenticated test flow, DB/RLS/outbox trace |

### Acceptance

- Clone -> one documented command starts local stack.
- Fresh DB migration works; runtime role cannot bypass RLS.
- Sample command demonstrates API -> transaction -> audit -> outbox -> worker.
- Request/trace/correlation visible end-to-end.
- CI blocks contract drift/secret/vulnerability baseline.
- Staging deploy/rollback smoke works.

## 19.4 Phase P2 — Identity, Tenant, RBAC, MFA, Device, Audit

### Tasks

| ID | Task |
|---|---|
| BE-IDN-001 | Create identity/tenant/membership/role/session/device schema + RLS |
| BE-IDN-002 | Tenant provisioning/default roles/owner invitation |
| BE-IDN-003 | Password login + Argon2id + generic errors/rate limits |
| BE-IDN-004 | Access JWT key rotation/validation/audience |
| BE-IDN-005 | Refresh token family/rotation/reuse detection |
| BE-IDN-006 | Logout/session/device revoke + SSE/session event hooks |
| BE-IDN-007 | Password forgot/reset single-use flow |
| BE-IDN-008 | TOTP MFA/recovery codes/step-up |
| BE-IDN-009 | Tenant switch and request context resolution |
| BE-IDN-010 | Member invitation/accept/suspend/revoke |
| BE-IDN-011 | Role/permission APIs/cache/version invalidation |
| BE-IDN-012 | Field-level authorization policy utilities |
| BE-IDN-013 | Audit list/export with permission/redaction |
| BE-IDN-014 | Support access grant model/API baseline |
| BE-IDN-015 | Auth/RBAC/tenant isolation security suite |

### Exit gate

- User có thể login, MFA, switch tenant, refresh/revoke an toàn.
- Owner quản lý member/role; Sales không đọc cost/profit.
- Cross-tenant test pass mọi Identity/Tenant endpoints.
- Role change hiệu lực trong thời gian cache SLA và revoke path tested.
- Audit ghi cùng transaction cho invite/role/revoke/tenant update.

## 19.5 Phase P3 — Customer, Catalog, SKU và Import

### Tasks

| ID | Task |
|---|---|
| BE-CUS-001 | Customer/identity/address/tag/consent/note schema + encryption/blind index |
| BE-CUS-002 | Customer CRUD/search/PII field masking |
| BE-CUS-003 | Identity attach/dedupe rules |
| BE-CUS-004 | Merge preview/merge transaction/history |
| BE-CAT-001 | Category/product/variant/media schema + RLS/constraints |
| BE-CAT-002 | Product/category/variant CRUD + ETag |
| BE-CAT-003 | Cost/price permission + history/audit |
| BE-CAT-004 | Private media upload/scan/signed URL flow |
| BE-IMP-001 | Import upload/job/staging schema |
| BE-IMP-002 | Parser, encoding/file limits, mapping detection |
| BE-IMP-003 | Validation/dedupe/preview/error report |
| BE-IMP-004 | Confirm/apply idempotent atomic merge |
| BE-IMP-005 | Large import resumability/cancellation/metrics |

### Exit gate

- SKU unique tenant/case policy enforced DB + API.
- Cost không leak qua list/detail/export/error/log.
- Import preview checksum prevents changed-data apply.
- Fatal import leaves no half-visible catalog state.
- Customer merge concurrent/idempotent tests pass.

## 19.6 Phase P4 — Inventory, Reservation, Knowledge và RAG ingestion

### Tasks

| ID | Task |
|---|---|
| BE-INV-001 | Warehouse/balance/movement/reservation schema + constraints/RLS |
| BE-INV-002 | Balance query/read DTO/indexes |
| BE-INV-003 | Adjustment command/reason/approval/audit |
| BE-INV-004 | Reservation create with deterministic locks |
| BE-INV-005 | Release/extend/expire/convert state machine |
| BE-INV-006 | Expiry scheduler/worker/idempotency |
| BE-INV-007 | Inventory ledger/balance reconciliation |
| BE-INV-008 | High-contention/concurrency/property tests |
| BE-KNW-001 | Source/version/chunk lifecycle schema |
| BE-KNW-002 | CRUD/review/approve/publish/archive APIs |
| BE-KNW-003 | File extraction sandbox/content checksum |
| BE-KNW-004 | Chunk/embed generation/versioning |
| BE-KNW-005 | Published/effective-only tenant retrieval API |
| BE-KNW-006 | Ingestion health/retry/rebuild/test search |

### Exit gate

- 100 parallel requests không làm oversell/negative invariant.
- Cancel/retry/expiry/confirm race suite pass.
- Ledger reconciliation zero difference.
- Unpublished/expired/cross-tenant chunks không retrieval được.
- Knowledge publish có version/checksum/audit/rollback.

## 19.7 Phase P5 — Channel adapter, OAuth, Webhook và Outbound

### Tasks

| ID | Task |
|---|---|
| BE-CHN-001 | Provider adapter interfaces + normalized schemas |
| BE-CHN-002 | Channel account/credential/health schema |
| BE-CHN-003 | OAuth state/PKCE where applicable/callback/token vault |
| BE-CHN-004 | Raw-body webhook signature verification |
| BE-CHN-005 | Webhook storage/dedupe/fast ACK |
| BE-CHN-006 | Normalize message/comment/identity events |
| BE-CHN-007 | Queue retry/backoff/DLQ/reprocess |
| BE-CHN-008 | Outbound message state/attempt/provider send |
| BE-CHN-009 | Per-account/provider rate limiting/circuit breaker |
| BE-CHN-010 | Token/scope/health monitoring and alerts |
| BE-CHN-011 | Provider fixture/contract/replay test suite |

### Exit gate

- Duplicate/out-of-order webhook tạo đúng một business effect.
- Invalid signature rejected before processing.
- Token không xuất hiện logs/API/client.
- Ambiguous send timeout có dedupe/reconciliation strategy.
- Health API phản ánh token/scope/provider/queue state.

## 19.8 Phase P6 — Conversation, Smart Inbox và Realtime

### Tasks

| ID | Task |
|---|---|
| BE-CON-001 | Conversation/message/attachment/assignment/note schema |
| BE-CON-002 | Inbound normalized event -> identity/conversation/message upsert |
| BE-CON-003 | List/detail/message cursor APIs + indexes |
| BE-CON-004 | Multidimensional state handlers |
| BE-CON-005 | Assignment/history/internal notes |
| BE-CON-006 | Reply command -> outbound queue |
| BE-CON-007 | SLA calendar/calculation/breach scheduler |
| BE-CON-008 | Lead score v1 with rule version/provenance |
| BE-CON-009 | Human takeover/AI mode/escalation |
| BE-CON-010 | SSE authorization/fan-out/replay/resync |
| BE-CON-011 | Attachment download security/malware state |
| BE-CON-012 | End-to-end webhook-to-inbox/reply-to-provider test |

### Exit gate

- Inbound message xuất hiện UI qua SSE trong SLO; REST resync works.
- Reconnect/token revoke/permission changes handled.
- State dimensions không overwrite lẫn nhau.
- Reply idempotency không gửi trùng.
- SLA/assignee/hot lead filters đúng index và tenant.

## 19.9 Phase P7 — Order, Payment và Fulfillment Core

### Tasks

| ID | Task |
|---|---|
| BE-ORD-001 | Order/item/history schema + money value objects |
| BE-ORD-002 | Deterministic calculation/rounding/discount/tax rules |
| BE-ORD-003 | Create/update/recalculate draft + quote version |
| BE-ORD-004 | Reservation ownership/integration |
| BE-ORD-005 | Confirm transaction and snapshots |
| BE-ORD-006 | Cancel/expire/compensating inventory flows |
| BE-ORD-007 | Duplicate fingerprint/warning/idempotency |
| BE-PAY-001 | Payment/payment-attempt/refund schema/lifecycle |
| BE-PAY-002 | Manual payment record/confirm/reconcile |
| BE-PAY-003 | Provider callback adapter baseline when selected |
| BE-FUL-001 | Shipment/item/tracking/packing-slip data |
| BE-FUL-002 | Pack/ship/deliver transitions |
| BE-RET-001 | Return/receive/inspect/restock/refund flow |
| BE-ORD-008 | Concurrency/property/reconciliation test suites |

### Exit gate

- Order confirm atomic với reservation/inventory/audit/outbox.
- Retry/double click không tạo trùng order/payment/shipment.
- Price/cost/address locked và calculation fixtures pass.
- Cancel/return/refund không tạo/destroy stock/money ngoài ledger.
- Dashboard source events đầy đủ dù analytics chưa xong.

## 19.10 Phase P8 — AI Copilot, RAG, Tool Calling và QC

### Tasks

| ID | Task |
|---|---|
| BE-AI-001 | FastAPI skeleton, model gateway, OTel, health/timeouts |
| BE-AI-002 | Prompt/model/tool/retrieval config version model |
| BE-AI-003 | Context builder/minimization/untrusted-content separation |
| BE-AI-004 | Intent/risk classifier interface and deterministic fallback |
| BE-AI-005 | Tenant-filtered knowledge retrieval client |
| BE-AI-006 | Tool registry/policy gateway/R0–R5 enforcement |
| BE-AI-007 | Catalog/inventory/policy/customer/order read tools |
| BE-AI-008 | Draft/reservation/message mutation tools with idempotency/approval |
| BE-AI-009 | Structured suggestion schema + bounded repair |
| BE-AI-010 | QC/claim/source/freshness validators |
| BE-AI-011 | AI-R001…AI-R010 enforcement and blocked output records |
| BE-AI-012 | Suggestion/log/review/send APIs |
| BE-AI-013 | Prompt lifecycle/eval runner/activation/rollback |
| BE-AI-014 | P0/P1 eval sets/red-team regression |
| BE-AI-015 | Budget/rate/concurrency/fallback/kill switches |
| BE-AI-016 | Online quality/cost/safety dashboards |

### Exit gate

- 0 P0 critical violation in frozen eval set.
- AI không claim giá/tồn/policy thiếu evidence.
- Unauthorized/high-risk action không thực thi dù prompt yêu cầu.
- Suggestion trace đầy đủ prompt/model/tool/source/QC/policy/version.
- Kill switch dừng pending auto action trong propagation SLO.
- Pilot bắt đầu ở copilot; semi-auto/autopilot cần gate riêng.

## 19.11 Phase P9 — Analytics, Dashboard và Reporting

### Tasks

| ID | Task |
|---|---|
| BE-DAT-001 | Business event schema/taxonomy completeness review |
| BE-DAT-002 | Event log/projection consumer/inbox/watermark |
| BE-DAT-003 | Order/revenue/profit facts |
| BE-DAT-004 | Conversation/SLA/conversion facts |
| BE-DAT-005 | Channel/sales agent/product daily facts |
| BE-DAT-006 | AI quality/usage facts |
| BE-DAT-007 | Dashboard/report APIs/permission/freshness |
| BE-DAT-008 | Export jobs/private signed output |
| BE-DAT-009 | Daily reconciliation/late event/backfill |
| BE-DAT-010 | Query/load/index/read replica assessment |

### Exit gate

- Metric dictionary signed off.
- Closed-day order/revenue/profit reconcile exact.
- Reports show basis/timezone/freshness/version.
- Cost/profit/PII permissions pass.
- Rebuild/backfill tested without impacting transaction SLO.

## 19.12 Phase P10 — Billing, Operations và Desktop support

### Tasks

| ID | Task |
|---|---|
| BE-BIL-001 | Plan/subscription/entitlement/usage schemas |
| BE-BIL-002 | Usage event metering/idempotency/reconciliation |
| BE-BIL-003 | Soft/hard limit policy and API |
| BE-OPS-001 | Tenant/system health aggregation |
| BE-OPS-002 | Feature flags/kill switches with expiry/audit |
| BE-OPS-003 | Support access grants and scoped service token |
| BE-OPS-004 | Reprocess webhook/import/job APIs |
| BE-OPS-005 | System alerts/actions audit |
| BE-DSK-001 | Device registration/revoke/version policy |
| BE-DSK-002 | SSE/notification contract for Windows |
| BE-DSK-003 | Print/packing payload and signed assets |
| BE-DSK-004 | Offline draft server revalidation |
| BE-DSK-005 | Crash telemetry ingestion if not vendor SDK |

### Exit gate

- Entitlement enforced server-side and usage reconciles.
- Support cannot access tenant without grant/reason/TTL/audit.
- Ops can disable AI/reprocess safely without duplicate effect.
- Desktop không giữ provider token; revoke closes session.
- Offline draft cannot bypass current price/inventory/policy.

## 19.13 Phase P11 — Production hardening và pilot

### Tasks

| ID | Task |
|---|---|
| BE-HRD-001 | Full ASVS/AI security verification and pentest |
| BE-HRD-002 | Capacity/load/soak/connection/reconnect storm tests |
| BE-HRD-003 | Failure injection: DB failover, Redis restart, provider outage |
| BE-HRD-004 | Backup/PITR restore drill and measured RPO/RTO |
| BE-HRD-005 | Migration/rollback/canary rehearsal |
| BE-HRD-006 | SLO dashboards/burn alerts/on-call/runbooks |
| BE-HRD-007 | Data retention/privacy export/anonymize test |
| BE-HRD-008 | Reconciliation and repair procedure rehearsal |
| BE-HRD-009 | Pilot tenant onboarding/feature flag/capacity guard |
| BE-HRD-010 | Defect closure and production readiness review |

### Exit gate

- No open Critical/High release-blocking finding.
- SLO/capacity/soak pass with headroom.
- Restore and rollback executed, not chỉ documented.
- Pilot incidents/bugs have regression tests and runbook updates.
- AI remains copilot/semi-auto only according risk approval.

## 19.14 Phase P12 — Commercial production release

Checklist:

- [ ] Production environment/IaC drift clean.
- [ ] Image digest/SBOM/signature/provenance approved.
- [ ] Backup/PITR current and restore evidence valid.
- [ ] Migration dry-run/lock estimate/rollback compatibility.
- [ ] SLO dashboard/alerts/on-call/support staffing active.
- [ ] Privacy/terms/retention/incident contacts finalized.
- [ ] Provider quotas/webhook configuration/certificates verified.
- [ ] Tenant provisioning/billing/support access tested.
- [ ] Canary cohort/feature flags/kill switches defined.
- [ ] AI prompt/model/eval version approved; autopilot off by default unless separately approved.
- [ ] Go/no-go do Human Owner ký duyệt, dựa trên self-certification kỹ thuật đầy đủ của Backend AI Agent (bao gồm SRE/QA/Security/AI) và xác nhận tương ứng từ Frontend AI Agent nếu phase phụ thuộc frontend.

---

# 20. Protocol vận hành của Backend AI Agent

## 20.1 Thứ tự đọc trước khi code

1. Ticket và acceptance criteria.
2. Blueprint sections liên quan.
3. ADR mới nhất.
4. OpenAPI/AsyncAPI/error/permission catalogs.
5. Existing module public API và migrations.
6. Tests hiện có và generated artifacts.

Code hiện hữu không tự động có quyền ưu tiên hơn invariant/security contract.

## 20.2 Quy trình thực hiện một ticket

### Step 1 — Preflight

- Xác nhận ticket đạt DoR.
- Liệt kê module/files/contracts/tables/events bị ảnh hưởng.
- Xác nhận transaction/idempotency/audit/permission/tenant requirements.
- Chạy baseline tests.

### Step 2 — Contract first

- Thêm/sửa OpenAPI/AsyncAPI/schema/error/permission trước.
- Chạy lint/breaking change/generated diff.
- Thêm request/response/event examples và mock fixture.

### Step 3 — Test design

Viết test cases trước hoặc cùng implementation:

- happy path;
- validation/permission/tenant negative;
- idempotency/retry;
- state/precondition conflict;
- transaction rollback;
- concurrency nếu critical;
- telemetry/audit/event assertion.

### Step 4 — Data change

- Tạo migration mới; không sửa migration đã chia sẻ.
- Constraint/index/RLS/composite FK.
- Backfill/resumability/lock impact.
- Fresh/upgrade migration test.

### Step 5 — Domain/application implementation

- Domain invariant/state transition không phụ thuộc framework.
- Application handler điều phối transaction/ports/policy.
- Repository parameterized và tenant transaction context.
- External call ngoài DB transaction.

### Step 6 — Cross-cutting controls

- Authorization/field filtering.
- Idempotency.
- Audit/outbox.
- Logs/traces/metrics.
- Feature flag/quota/rate limit.
- Error mapping.

### Step 7 — Verification

- Unit/integration/contract/security tests.
- Generated client compile.
- Manual/staging smoke theo acceptance.
- Kiểm tra log không chứa PII/secret.
- Kiểm tra rollback/old-code compatibility nếu migration.

### Step 8 — PR completion manifest

PR description phải ghi:

```text
Ticket:
Behavior changed:
Contracts changed:
DB migration/backfill:
Permissions/data classification:
Transaction/idempotency:
Audit/events:
Telemetry:
Tests/evidence:
Feature flag/rollout:
Rollback:
Known risks:
```

## 20.3 Quy tắc khi gặp mơ hồ

Backend AI Agent không được âm thầm phát minh business rule. Thứ tự xử lý:

1. Tìm trong blueprint/ADR/contract/metric dictionary.
2. Chọn safe default đã nêu trong tài liệu.
3. Nếu vẫn thiếu và không ảnh hưởng P0, triển khai extension point/feature flag không mở production behavior và ghi proposed ADR/open question (đẩy vào `docs/collaboration/SIGNOFF_TRACKER.md` nếu cần Human Owner xác nhận sau).
4. Nếu ảnh hưởng tiền, tồn kho, permission, tenant, privacy, payment, AI high-risk hoặc data deletion: dừng phần mutation đó ở interface/mock an toàn cho tới khi quyết định được Human Owner phê duyệt (qua decision queue); vẫn hoàn thành phần không phụ thuộc.

Không dùng `TODO` âm thầm trên đường critical; TODO phải có ticket/owner.

## 20.4 Hành vi bị cấm đối với Backend AI Agent

- Tắt/né test, RLS, permission, audit hoặc scan để CI xanh.
- Dùng `any`, dynamic SQL/string interpolation, plaintext secret.
- Thêm endpoint không có OpenAPI/permission/error contract.
- Generic PATCH cho critical status.
- Gọi external provider trong transaction.
- Retry mutation không idempotent.
- Ghi trực tiếp table module khác/AI ghi business DB.
- Log request body/token/message/PII mặc định.
- Sửa migration đã chạy.
- Tự activate AI model/prompt/autopilot.
- Dùng production data trong test/local.

## 20.5 Review checklist tự đánh giá của Backend AI Agent

Trước khi đánh dấu ticket hoàn thành, Backend AI Agent tự chạy lại checklist này như một self-review tách biệt khỏi lúc implement — không chỉ đọc lại diff một lần cho có. Với ticket chạm tới tiền, tenant isolation, permission hoặc security invariant, Human Owner có thể spot-check bất kỳ lúc nào bằng đúng checklist này.

- Invariant/state transition có đủ và đặt đúng layer?
- Tenant context có thể bị giả mạo/rò qua cache/search/event/file không?
- Constraint/lock/idempotency có bảo vệ khi concurrency/retry/crash?
- Dual-write đã dùng outbox/inbox?
- Permission/field-level data leak/error existence leak?
- Money/timezone/rounding/snapshot semantics?
- External timeout/retry/circuit breaker/failure state?
- Audit/telemetry đủ điều tra nhưng không leak data?
- Migration rolling-safe/lock-safe/rollback-safe?
- Contract backward compatible/generated artifacts updated?
- Test có negative/concurrency/failure, không chỉ happy path?

---
# 21. Operational runbooks tối thiểu

Mỗi runbook thực tế trong `infra/runbooks/` phải chứa dashboard/query/command cụ thể theo platform. Dưới đây là logic bắt buộc. Backend AI Agent thực thi các bước triage/kỹ thuật dưới đây; khi hệ thống có production traffic thật với tenant trả phí, hành động khôi phục ảnh hưởng khách hàng thật (data restore, force-revoke, compensating financial/inventory adjustment) MUST có Human Owner phê duyệt trước khi thực thi, không tự động hoá.

## 21.1 API 5xx hoặc SLO burn

**Trigger:** fast/slow burn alert hoặc critical journey error spike.

1. Xác nhận blast radius: environment, tenant, route, release version, provider dependency.
2. So sánh thời điểm với deploy/migration/feature flag.
3. Nếu release-related: pause rollout, rollback/canary off bằng image digest cũ; không drop schema.
4. Nếu dependency: activate circuit breaker/degraded mode.
5. Bảo vệ data correctness trước availability; disable mutation nếu consistency không chắc.
6. Verify synthetic login/product/order read/confirm theo scope.
7. Theo dõi error budget/queue/outbox sau recovery.
8. Tạo incident timeline và regression action.

## 21.2 PostgreSQL saturation/deadlock/replication issue

1. Kiểm tra connections/pool wait, long transactions, lock graph, CPU/I/O, replication lag.
2. Dừng/throttle import/backfill/report job trước, không kill random transaction critical.
3. Hạ worker concurrency/read traffic hoặc route report sang replica.
4. Cancel query theo runbook/owner nếu vượt timeout và safe.
5. Nếu failover: freeze risky writes, promote managed replica theo procedure, verify RLS/migration/version.
6. Sau recovery chạy inventory/order/payment/outbox reconciliation.
7. Không tăng connection limit như giải pháp đầu tiên nếu DB đã saturated.

## 21.3 Queue backlog/DLQ

1. Xác định queue, oldest age, failure class, provider/tenant concentration.
2. Pause poison producer/consumer nếu gây retry storm.
3. Sửa auth/token/schema/provider issue hoặc scale worker khi bottleneck compute.
4. Reprocess qua ops API theo batch nhỏ, giữ event/job ID.
5. Verify no duplicate message/order/payment effect.
6. Drain backlog tới SLO và monitor outbox/inbox.

## 21.4 Webhook/provider incident

- Signature invalid spike: kiểm tra secret/version/provider change; không bypass verification.
- Provider outage/429: honor backoff, circuit breaker, surface channel health/degraded UI.
- Token expired/revoked: mark `action_required`, stop blind retry, notify owner reconnect.
- Webhook gap: use provider reconciliation/backfill API nếu có; store cursor/checkpoint.
- Sau phục hồi replay raw events idempotently và reconcile message counts.

## 21.5 Inventory discrepancy hoặc negative invariant

Severity P1/P0 tùy impact.

1. Disable reservation/confirm cho affected tenant/SKU bằng scoped flag nếu cần.
2. Snapshot balances, reservation items, movement ledger, orders và recent correlation IDs.
3. Không sửa trực tiếp balance bằng SQL ad-hoc.
4. Chạy reconciliation để định vị first divergence/race/duplicate.
5. Chuẩn bị repair adjustment/compensating movement với audit/evidence; Human Owner duyệt trước khi apply nếu ảnh hưởng số dư/tồn kho khách hàng thật.
6. Re-run reconciliation; verify affected orders/reservations.
7. Add regression/concurrency test và review similar SKUs/tenants.

## 21.6 Payment/order mismatch

1. Freeze automatic fulfillment/refund cho affected order/provider.
2. Preserve provider event/evidence/signature.
3. Compare payment immutable records, order totals, callback sequence và reconciliation.
4. Không mark paid/refunded thủ công bằng status update; dùng repair/reconciliation command. Compensating financial adjustment cần Human Owner duyệt trước khi thực thi.
5. Verify ledger, customer communication và audit.
6. Backfill/replay duplicate callback tests.

## 21.7 AI unsafe output hoặc excessive agency

1. Activate most scoped kill switch đủ an toàn: prompt/tool/tenant/provider/global.
2. Cancel/recheck pending auto-send/mutation jobs.
3. Preserve redacted AI log, prompt/model/tool/policy versions, source IDs và approvals.
4. Determine exposure/actions/data leakage; involve Security/Privacy if applicable.
5. Roll back to approved previous version or force copilot/off.
6. Add case to frozen eval/red-team set; fix deterministic policy before prompt-only mitigation where possible.
7. Re-run P0 full gate; re-enable canary chỉ sau khi Human Owner phê duyệt tường minh.

## 21.8 Suspected tenant data leak/security incident

1. Declare P0; stop affected endpoint/feature/credential.
2. Preserve logs/audit/traces without broadening exposure.
3. Revoke sessions/tokens/keys as applicable.
4. Determine tenants/data/time window via audit/query with Security oversight.
5. Patch RLS/authorization/cache/index; test all sibling resources.
6. Follow legal/privacy notification obligations; Human Owner chủ trì quyết định thông báo khách hàng/pháp lý — đây là rủi ro business/pháp lý thật, không tự động hoá.
7. Do not hide or delete evidence; do not communicate unverified scope as fact.

## 21.9 Failed deploy/migration

- If code issue and schema backward-compatible: rollback image digest.
- If expand migration partially applied: migrations must be idempotent/resumable; do not manually mark success without verification.
- If destructive/contract phase: follow prewritten reverse/forward-fix plan; restore only when data integrity requires and Human Owner approves the RPO impact.
- Verify app readiness, queue/outbox, projections, critical synthetic and migration version.

## 21.10 Disaster restore

1. Backend AI Agent proposes recovery point and expected data loss window; Human Owner approves before restore executes.
2. Isolate destination/network and restore DB/object/keys.
3. Deploy exact compatible app version by digest.
4. Apply only verified migrations.
5. Run integrity/RLS/reconciliation/synthetic tests.
6. Reconcile provider callbacks/outbox since recovery point; avoid duplicate external sends.
7. Open traffic gradually and monitor.
8. Document actual RPO/RTO and post-recovery gaps.

---

# 22. Error code catalog baseline

Full machine-readable catalog nằm trong `matrices/error_catalog.csv`. Các nhóm bắt buộc:

## 22.1 Auth/Tenant

```text
AUTH_INVALID_CREDENTIALS
AUTH_MFA_REQUIRED
AUTH_MFA_INVALID
AUTH_TOKEN_EXPIRED
AUTH_REFRESH_REUSED
AUTH_SESSION_REVOKED
AUTH_RECENT_AUTH_REQUIRED
TENANT_INACTIVE
TENANT_CONTEXT_INVALID
MEMBERSHIP_INACTIVE
INSUFFICIENT_PERMISSION
RESOURCE_NOT_FOUND
RESOURCE_VERSION_MISMATCH
```

## 22.2 Validation/Idempotency/Rate

```text
VALIDATION_FAILED
REQUEST_TOO_LARGE
UNSUPPORTED_MEDIA_TYPE
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_KEY_REUSED
IDEMPOTENCY_IN_PROGRESS
RATE_LIMITED
QUOTA_EXCEEDED
FEATURE_DISABLED
```

## 22.3 Catalog/Import

```text
SKU_DUPLICATE
BARCODE_DUPLICATE
CATEGORY_CYCLE
PRODUCT_ARCHIVED
COST_PERMISSION_REQUIRED
IMPORT_FILE_INVALID
IMPORT_MAPPING_INVALID
IMPORT_PREVIEW_STALE
IMPORT_JOB_STATE_INVALID
IMPORT_APPLY_FAILED
```

## 22.4 Inventory/Order

```text
INVENTORY_BALANCE_NOT_FOUND
INVENTORY_INSUFFICIENT
INVENTORY_RESERVATION_EXPIRED
INVENTORY_RESERVATION_STATE_INVALID
INVENTORY_RESERVATION_OWNER_MISMATCH
ORDER_STATE_INVALID
ORDER_QUOTE_STALE
ORDER_TOTAL_CHANGED
ORDER_DUPLICATE_SUSPECTED
ORDER_CANCELLATION_NOT_ALLOWED
PAYMENT_AMOUNT_MISMATCH
PAYMENT_STATE_INVALID
REFUND_APPROVAL_REQUIRED
SHIPMENT_STATE_INVALID
RETURN_STATE_INVALID
```

## 22.5 Channel/Conversation

```text
CHANNEL_NOT_CONNECTED
CHANNEL_TOKEN_EXPIRED
CHANNEL_PERMISSION_MISSING
WEBHOOK_SIGNATURE_INVALID
WEBHOOK_DUPLICATE
PROVIDER_RATE_LIMITED
PROVIDER_UNAVAILABLE
MESSAGE_SEND_BLOCKED
MESSAGE_SEND_AMBIGUOUS
CONVERSATION_STATE_INVALID
HUMAN_TAKEOVER_ACTIVE
SSE_RESYNC_REQUIRED
```

## 22.6 AI

```text
AI_DISABLED
AI_BUDGET_EXCEEDED
AI_PROVIDER_UNAVAILABLE
AI_OUTPUT_INVALID
AI_OUTPUT_BLOCKED
AI_APPROVAL_REQUIRED
AI_APPROVAL_EXPIRED
AI_APPROVAL_PAYLOAD_CHANGED
AI_TOOL_NOT_ALLOWED
AI_TOOL_FAILED
AI_SOURCE_REQUIRED
AI_SOURCE_STALE
AI_PROMPT_VERSION_NOT_APPROVED
AI_EVALUATION_FAILED
```

---

# 23. Default role matrix

Chi tiết CSV là source seed. Default intent:

| Capability | Owner | Admin | Manager | Sales | Warehouse | Analyst | Support platform |
|---|---:|---:|---:|---:|---:|---:|---:|
| Tenant/billing manage | ✓ | limited | – | – | – | – | via grant |
| Member/role manage | ✓ | ✓ | limited | – | – | – | via grant |
| Product read/write | ✓ | ✓ | ✓ | read | read | read | via grant |
| Cost/profit read | ✓ | configurable | configurable | – | – | configurable | no default |
| Inventory adjust | ✓ | ✓ | configurable | – | ✓ | – | no default |
| Conversation reply | ✓ | ✓ | ✓ | ✓ | – | read | no default |
| AI use/review | ✓ | ✓ | ✓ | use | – | review metrics | no default |
| AI configure/activate | ✓ | configurable | – | – | – | – | emergency scoped |
| Order create/confirm | ✓ | ✓ | ✓ | ✓ | fulfill only | read | no default |
| Cancel/refund | ✓ | configurable | configurable | limited/no | – | – | no default |
| Reports/profit/export | ✓ | configurable | configurable | own/basic | inventory | analytics | no default |
| Audit read/export | ✓ | configurable | – | – | – | – | scoped grant |

Roles là template; tenant custom role không được cấp platform-only permission.

---

# 24. Retention baseline

Giá trị thực phải phù hợp pháp lý/hợp đồng/data region; dưới đây là default engineering.

| Data | Hot retention | Archive/delete behavior |
|---|---:|---|
| Access/application logs | 30 ngày | archive 90 ngày nếu cần, scrub PII |
| Security/audit logs | 365 ngày | archive theo legal policy |
| Raw webhook payload | 30 ngày | delete/anonymize; keep hash/metadata longer |
| Normalized messages | theo tenant/product policy, baseline 24 tháng | anonymize/delete subject data where applicable |
| Outbound attempts | 90 ngày | aggregate delivery metrics longer |
| Idempotency records | 24h–7 ngày by operation | provider/payment keys longer |
| Outbox published rows | 7–30 ngày | archive/delete after consumer/reconciliation confidence |
| Inbox dedupe | ≥max replay window, baseline 30 ngày | compact/archive |
| AI logs redacted | 90 ngày | aggregate quality/cost longer |
| AI raw sensitive trace | off by default or shortest approved TTL | encrypted/restricted/purge |
| Import source/error file | 7–30 ngày | lifecycle delete |
| Export files | ≤24 giờ | auto-delete |
| Orders/payments/inventory ledger | legal/business retention | append-only/pseudonymize PII |
| Backup/PITR | 35 ngày baseline | monthly archive policy |

Retention job phải observable, idempotent và có legal hold override.

---

# 25. Feature flag catalog baseline

```text
ai.enabled
ai.mode.copilot
ai.mode.semi_auto
ai.mode.autopilot
ai.tool.order_draft.enabled
ai.tool.inventory_reserve.enabled
ai.provider.<provider>.enabled
channel.facebook.enabled
conversation.sse.enabled
order.confirm.v1
payment.manual.enabled
returns.enabled
analytics.dashboard.v1
billing.enforcement.hard
support.break_glass.enabled
```

Mỗi flag có owner, safe default, scope global/tenant/user, expiry/cleanup và audit cho ops changes.

---

# 26. Production readiness gate tổng hợp

## 26.1 Architecture/Data

- [ ] ADR và service boundary approved.
- [ ] ERD/data dictionary/RLS/composite FK complete.
- [ ] State machines và transaction boundaries tested.
- [ ] No unresolved dual-write.

## 26.2 API/Event

- [ ] OpenAPI/AsyncAPI lint + generated client + compatibility pass.
- [ ] Error/idempotency/pagination/versioning consistent.
- [ ] Outbox/inbox/retry/DLQ/replay verified.
- [ ] SSE reconnect/resync/security pass.

## 26.3 Security/Privacy

- [ ] ASVS/security test evidence complete.
- [ ] Tenant isolation/IDOR full suite pass.
- [ ] Secrets/PII/log/object storage controls verified.
- [ ] Privacy export/anonymize/retention tested.
- [ ] Pentest Critical/High resolved or risk accepted by Human Owner.

## 26.4 AI

- [ ] AI-R001…R010 implemented/tested.
- [ ] Tool risk/permission/approval/idempotency enforced.
- [ ] P0 evaluation critical violations = 0.
- [ ] Prompt/model/retrieval/tool versions traceable and rollbackable.
- [ ] Cost/latency/kill switch/monitoring operational.

## 26.5 Reliability/Operations

- [ ] Capacity/load/soak within SLO with headroom.
- [ ] SLO/error budget dashboards/alerts/runbooks/on-call active.
- [ ] Backup restore and deploy rollback drills pass.
- [ ] Reconciliation zero unexplained critical mismatch.
- [ ] Provider failure/degraded mode tested.

## 26.6 Release/Supply chain

- [ ] Immutable signed images, SBOM/provenance available.
- [ ] Migration rolling-safe and rehearsed.
- [ ] Same digest promoted staging -> production.
- [ ] Feature flags/canary/rollback owners defined.
- [ ] Go/no-go approval (Human Owner) recorded, based on Backend AI Agent's technical self-certification.

---

# 27. Standards baseline và tham chiếu kỹ thuật

Tài liệu áp dụng hoặc tham chiếu các chuẩn chính thức sau; version/tooling phải được kiểm tra lại trong mỗi review cycle:

- OWASP Application Security Verification Standard 5.0.0: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Large Language Model Security Verification Standard: https://owasp.org/www-project-llm-verification-standard/
- OWASP GenAI Top 10 / AI testing resources: https://genai.owasp.org/
- NIST Secure Software Development Framework SP 800-218: https://csrc.nist.gov/pubs/sp/800/218/final
- NIST SP 800-218A for AI model development: https://csrc.nist.gov/pubs/sp/800/218/a/final
- NIST AI RMF / Generative AI Profile: https://www.nist.gov/itl/ai-risk-management-framework
- OAuth 2.0 Security Best Current Practice, RFC 9700: https://www.rfc-editor.org/info/rfc9700/
- Problem Details for HTTP APIs, RFC 9457: https://www.rfc-editor.org/info/rfc9457/
- UUIDs/UUIDv7, RFC 9562: https://www.rfc-editor.org/info/rfc9562/
- Internet timestamps, RFC 3339 and RFC 9557: https://www.rfc-editor.org/info/rfc3339/
- OpenAPI Specification 3.1.1: https://spec.openapis.org/oas/v3.1.1.html
- JSON Schema 2020-12: https://json-schema.org/draft/2020-12
- AsyncAPI Specification 3.1.0: https://www.asyncapi.com/docs/reference/specification/latest
- CloudEvents 1.0.x: https://cloudevents.io/
- OpenTelemetry Specification/OTLP: https://opentelemetry.io/docs/specs/
- PostgreSQL Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- SLSA supply-chain security: https://slsa.dev/

---

# 28. Kết luận thực thi

Sau khi Phase P0 được Human Owner phê duyệt (dựa trên self-certification kỹ thuật của Backend AI Agent), Backend AI Agent có thể bắt đầu P1 mà không cần tự chọn lại kiến trúc. Mỗi phase chỉ mở khi exit gate của dependency đã đạt. Tài liệu này cố ý đặt các invariant, permission, transaction, state machine, AI rule, test và runbook ở mức bắt buộc để tránh tình trạng “code xong CRUD rồi mới harden production”.

**Nguyên tắc điều hành cuối cùng:**

```text
Contract trước code.
Invariant trước endpoint.
Constraint/transaction trước retry.
Tenant/security trước convenience.
Outbox/reconciliation trước dashboard.
Evaluation/approval trước AI automation.
Observability/restore/rollback trước production.
```
