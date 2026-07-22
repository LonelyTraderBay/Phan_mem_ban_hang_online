# Domain Glossary (VN/EN)

> Bản chuẩn (canonical) nằm ở `backend/docs/domain/glossary.md` — sửa ở đó trước, đồng bộ file
> này sau. Bản này chỉ thêm phần FE-specific mà backend không cần biết chi tiết (tên route, tên
> screen state, tên UI component pattern).

Đọc bản chuẩn để có: bảng 4 actor (Backend AI Agent, Frontend AI Agent, Design AI Agent, Human
Owner), bounded context table, tên entity/trạng thái nghiệp vụ (tenant, membership, customer,
variant, reservation, order_code, conversation lifecycle, ai_mode, support_access,
permission_version, idempotency key, RLS).

**Không** dùng lại job title cũ (Product Owner, UX Lead, Frontend Architect...) trong bất kỳ tài
liệu/ticket nào ở repo này — luôn dùng 1 trong 4 actor ở bản chuẩn.

## Thuật ngữ chỉ FE dùng (không có bên backend)

| Term (EN) | Diễn giải VN | Nguồn |
|---|---|---|
| `READY-MOCK` | Màn hình đã qua design-spec handoff gate (spec §7.7 — Design AI Agent, không phải Figma), sẵn sàng code UI thật | Spec FE §1.5 readiness scale |
| `READY-INTEGRATION` | Màn hình đã nối API thật, qua review security nếu chạm PII/payment | Spec FE §1.5 |
| Screen state chuẩn | 6 trạng thái bắt buộc: happy/empty/loading/error/forbidden/conflict | Spec FE §7.7 |
| `PermissionGate` / `FeatureFlagGate` | Component nhận quyết định allow/enable qua prop, không tự tính toán | `frontend/CLAUDE.md` |
| Contract Gap | Xem bản chuẩn — quy trình report khi thiếu contract | `docs/collaboration/CONTRACT_WORKFLOW.md` |
| View-model (vs DTO) | Dữ liệu đã qua mapper của `api-client`, không phải raw API response | `frontend/CLAUDE.md` — apps không import `api-generated` trực tiếp |

Khi một feature module mới (F01+) được thiết kế, thêm thuật ngữ UI-specific của module đó vào
đây; thuật ngữ nghiệp vụ dùng chung với BE (order, reservation, conversation...) luôn tra ở bản
chuẩn, không định nghĩa lại ở đây để tránh lệch nghĩa.
