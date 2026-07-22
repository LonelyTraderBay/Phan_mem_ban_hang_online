# Domain Glossary (VN/EN) — CANONICAL

> Bản chuẩn. Bản sao cho FE: `frontend/docs/domain/glossary.md`. Mục tiêu: 2 đội dùng **cùng một
> từ** cho cùng một khái niệm nghiệp vụ, tránh BE gọi là "reservation" trong khi FE gọi là "hold"
> cho cùng một entity. Thuật ngữ và định nghĩa lấy nguyên văn từ
> `backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` §4.1 và §7 — không tự đặt
> tên mới. Thêm thuật ngữ mới ở đây khi module tương ứng được thiết kế, không suy đoán trước.

## Vai trò / Roles (đội build là AI, không phải người)

Dùng đúng 4 tên này trong mọi ticket/ADR/tài liệu — không dùng lại các job title cũ (Product Owner,
Backend Lead, Security Lead, UX Lead, QA Lead, DevOps/SRE...), vì chúng không còn tồn tại như vai
trò con người riêng biệt trong dự án này:

| Actor | Là gì | Ghi chú |
|---|---|---|
| **Backend AI Agent** | AI coding agent thực thi toàn bộ kỹ thuật backend | Gộp mọi trách nhiệm kỹ thuật của Backend Engineer/Tech Lead/Architect/AI Lead/Data Lead/Platform Lead cũ |
| **Frontend AI Agent** | AI coding agent thực thi toàn bộ kỹ thuật frontend | Gộp mọi trách nhiệm kỹ thuật của Frontend Architect/Lead/DevOps-FE/QA-FE cũ |
| **Design AI Agent** | Subagent tạo đặc tả thiết kế dạng text/markdown thay Figma | Xem `frontend/.claude/agents/design-spec-writer.md` |
| **Human Owner** | Người duy nhất trong dự án | Chấp nhận rủi ro kinh doanh/bảo mật/pháp lý, phê duyệt hành động không thể đảo ngược, phân xử khi 2 agent không tự giải quyết được |

Vai trò **RBAC của chính sản phẩm** (Owner/Admin/Manager/Sales/Warehouse/Analyst/Support — trong
Blueprint §23, permission_matrix.csv) là chuyện hoàn toàn khác — đó là vai trò của nhân viên tenant
sẽ dùng phần mềm sau khi ra mắt, không liên quan tới 4 actor build ở trên. Không nhầm lẫn 2 nhóm
này.

## Nguyên tắc

- Tên bảng/entity (tiếng Anh, snake_case số ít/nhiều theo blueprint) là **tên chuẩn duy nhất**
  dùng trong code, ticket, và giao tiếp giữa 2 team.
- Cột "Diễn giải VN" dùng cho giao tiếp nội bộ, họp, tài liệu Product — không dùng làm tên biến/API.
- Nếu một từ tiếng Việt có thể ánh xạ nhầm sang 2 entity khác nhau (ví dụ "đơn hàng" vs "đơn nhập
  hàng"), cột Ghi chú phải nêu rõ để tránh nhầm lẫn khi trao đổi bằng lời.

## Bounded context (module nghiệp vụ)

| Module (EN) | Diễn giải VN | Source of truth (entity chính) | Command chính | Event chính |
|---|---|---|---|---|
| Identity | Định danh người dùng | user, credential, session, device | login, refresh, revoke | `identity.session_revoked` |
| Tenant | Khách hàng thuê hệ thống (công ty/shop) | tenant, membership, role, permission | invite, change role, suspend | `tenant.member_updated` |
| Customer | Khách hàng của tenant (CDP) | customer, identity, consent, address | create/update/merge | `customer.updated` |
| Catalog | Danh mục sản phẩm | category, product, variant, price | create/update/import | `catalog.variant_updated` |
| Inventory | Tồn kho | warehouse, balance, movement, reservation | adjust/reserve/release/convert | `inventory.reserved` |
| Knowledge | Kho tri thức cho AI | source, version, chunk, publish lifecycle | approve/publish/archive | `knowledge.published` |
| Channel | Kênh bán hàng/nhắn tin (Facebook, Zalo...) | account, credential ref, webhook raw, outbound delivery | connect/verify/send | `channel.message_normalized` |
| Conversation | Hội thoại với khách | conversation, message, assignment, SLA | assign/reply/takeover | `conversation.updated` |
| AI orchestration | Điều phối AI | suggestion, prompt, tool call, eval, policy decision | suggest/evaluate/activate | `ai.suggestion_ready` |
| Order | Đơn hàng | order, item, calculation, status history | draft/confirm/cancel | `order.confirmed` |
| Payment | Thanh toán | payment intent/record/reconciliation | record/confirm/refund | `payment.marked_paid` |
| Fulfillment | Giao hàng/vận đơn | shipment, tracking, return | create/ship/deliver/return | `shipment.updated` |
| Analytics | Báo cáo/số liệu | event projection, daily facts/read models | rebuild/reconcile | `analytics.projection_updated` |
| Billing | Gói dịch vụ/hạn mức | plan, subscription, usage | meter/enforce/update | `billing.limit_reached` |
| Audit | Nhật ký kiểm toán | immutable audit records | append/export | `audit.recorded` |
| Operations | Vận hành hệ thống (Super Admin) | feature flag, alert, support access | toggle/reprocess/disable | `operations.action_executed` |

## Thuật ngữ entity/trạng thái quan trọng

| Term (EN) | Diễn giải VN | Ghi chú / nguồn |
|---|---|---|
| `tenant` | Đơn vị thuê bao (1 shop/1 doanh nghiệp) — **không phải** "khách hàng mua hàng" | Không nhầm với `customer` |
| `membership` | Tư cách thành viên của 1 user trong 1 tenant | Blueprint §5.1.2 — status: `invited, active, suspended, revoked` |
| `customer` | Khách hàng của tenant (người mua) | Blueprint §7.6 |
| `variant` | Biến thể sản phẩm (size/màu...) có SKU riêng | `product` không chứa số lượng tồn — Blueprint §7.7.2 |
| `available_to_sell` | Số lượng có thể bán = `on_hand - reserved - blocked - damaged - safety_stock` | Blueprint §7.8.2 — không được âm |
| `reservation` (inventory) | Giữ hàng tạm thời cho 1 order/conversation | Không tự thay đổi `on_hand`, chỉ thay đổi `reserved` — Blueprint §7.8.4 |
| `order_code` | Mã đơn hàng hiển thị, immutable, unique theo tenant | Không phải `id` (UUID nội bộ) — Blueprint §7.11.1 |
| `conversation.lifecycle_status` | Trạng thái vòng đời hội thoại: `new/open/resolved/archived` | Tách biệt với `waiting_on`, `sales_stage`, `ai_mode` — Blueprint §7.10.4 |
| `ai_mode` | Chế độ AI trong hội thoại: `off/copilot/semi_auto/autopilot/human_takeover` | Không nhầm với `ai.use` permission |
| `support_access` (break-glass) | Quyền truy cập tạm thời của nhân viên platform vào dữ liệu tenant | Luôn có approver, TTL ≤ 30 phút, audit — Blueprint §5.6 |
| `permission_version` | Số phiên bản quyền, tăng khi role/membership đổi — dùng để invalidate cache/token | Blueprint §5.2.1, §7.5.1 |
| `idempotency key` | Khóa chống trùng lặp cho command có thể retry | Bắt buộc cho order/payment/inventory mutation |
| `RLS` (Row-Level Security) | Cơ chế PostgreSQL chặn truy cập chéo tenant ở tầng DB | Blueprint §6 — bắt buộc `ENABLE` + `FORCE` |

## Thuật ngữ phía Frontend (đồng bộ với FE glossary)

| Term (EN) | Diễn giải VN | Ghi chú |
|---|---|---|
| `READY-MOCK` | Màn hình đã qua Figma handoff gate, có đủ state, sẵn sàng code UI | Spec FE §7.7 |
| `Contract Gap` | Thiếu field/status/permission trong contract — FE phải report, không tự bịa | Spec FE §1.4 |
| Screen state (`happy/empty/loading/error/forbidden/conflict`) | 6 trạng thái bắt buộc mỗi màn hình phải có thiết kế | Spec FE §7.7 |

---

*Thêm thuật ngữ mới: chỉ thêm khi entity/khái niệm đã có trong blueprint/spec hoặc đã được 2 team
thống nhất bằng ADR/ticket — không suy đoán trước tên gọi cho module chưa thiết kế.*
