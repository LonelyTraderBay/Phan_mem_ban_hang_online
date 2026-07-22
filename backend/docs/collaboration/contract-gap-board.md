# Contract Gap Board

**Ownership: chỉ Backend AI Agent ghi vào file này.** Đây KHÔNG còn là file dùng chung 2 agent cùng
sửa — một audit phát hiện việc đó có 2 rủi ro thật: (1) Frontend AI Agent có thể không có quyền
truy cập filesystem vào `backend/` tùy topology chạy (đã xác nhận: CI của chính repo này checkout
backend vào subdirectory riêng, không phải sibling, nên đường dẫn tương đối tới file này đôi khi sai
theo đúng nghĩa đen); (2) 2 agent cùng sửa 1 bảng markdown đồng thời có thể ghi đè nhau, không có
merge.

**Quy trình mới:** Frontend AI Agent ghi gap vào [`frontend/docs/collaboration/OUTBOX.md`](../../../frontend/docs/collaboration/OUTBOX.md)
(file trong chính repo của nó, luôn ghi được, không phụ thuộc topology). Backend AI Agent đọc file
đó (best-effort, khi bắt đầu việc chạm contract) và chép các mục liên quan vào bảng dưới đây, xử lý
theo priority, cập nhật Status/Ticket — chỉ Backend AI Agent sửa bảng dưới. Human Owner có cả 2 repo
nên có thể đọc thẳng `frontend/docs/collaboration/OUTBOX.md` bất cứ lúc nào mà không cần chờ bước
chép lại này — xem [`OUTBOX.md`](OUTBOX.md) của chính repo này để hiểu đầy đủ lý do thiết kế lại.
Không ai xóa dòng — chỉ chuyển Status sang `Closed` kèm ngày, để giữ lịch sử quyết định.

Khi có project tracker thật (Jira/Linear do Human Owner chọn), mirror sang đó và ghi link ở cột
cuối — nhưng file này vẫn là nguồn dữ liệu chính vì 2 agent đọc file trực tiếp, không có tích hợp
API tới tracker ngoài.

## Cách ghi một gap mới

```text
| <ID tăng dần> | <Ngày> | <P0/P1/P2 — xem CONTRACT_WORKFLOW.md §3> | <Mô tả field/status/permission còn thiếu, có ví dụ request/response cụ thể> | <Module/endpoint liên quan> | Open | — |
```

- **Priority** quyết định Frontend AI Agent có tiếp tục việc khác hay phải dừng hẳn (xem
  [`CONTRACT_WORKFLOW.md`](CONTRACT_WORKFLOW.md#3-quy-trình-khi-frontend-ai-agent-thiếu-contract--contract-gap)),
  KHÔNG phải một SLA tính theo ngày làm việc của con người — Backend AI Agent không có "giờ hành
  chính". P0 = dừng phần việc phụ thuộc + escalate `SIGNOFF_TRACKER.md` nếu cần Human Owner tự chạy
  Backend AI Agent gấp; P1 = ghi gap, chuyển việc khác; P2 = ghi gap, tiếp tục với mock đánh dấu rõ.
- Mô tả phải là **ví dụ concrete** (request/response/state transition thật), không mô tả chung
  chung — Backend AI Agent cần đủ thông tin để tự xử lý mà không phải hỏi lại (không có kênh hỏi
  lại nhanh giữa 2 agent).

## Bảng gap

| ID | Ngày mở | Priority | Mô tả | Module/endpoint | Status | Ticket/PR |
|---|---|---|---|---|---|---|
| GAP-001 | 2026-07-21 | P2 | Catalog bulk-import/publish dùng chung `catalog.write`, chưa có permission riêng (tương tự cách `knowledge.write`/`knowledge.publish` đã tách) — chi tiết đầy đủ trong `frontend/docs/collaboration/OUTBOX.md` | F03 Product/Import | **Closed 2026-07-22 (W3)** | `catalog.import` + `catalog.publish`; import mutations → `catalog.import` |
| GAP-002 | 2026-07-21 | P2 | F11 Super Admin: chưa có ops-scoped key cho alert-acknowledge, AI kill switch, channel manage — cần quyết định dùng lại tenant-scoped key khi elevated hay tạo key `ops.*` riêng | F11 Super Admin | **Closed 2026-07-22 (W3)** | `ops.alert.acknowledge`, `ops.ai.disable`, `ops.channel.manage`; `disableTenantAI` → `ops.ai.disable` |
| GAP-003 | 2026-07-21 | P1 | Lệch permission-key hệ thống ngoài phạm vi 2 lần rà đã làm (F01/F03/F09/F11) — danh sách đầy đủ ~30 key trong `frontend/docs/collaboration/OUTBOX.md`. **F01 slice closed 2026-07-21** — see `gap-003-f01-slice.md`. | F02, F04–F08, F10 | **Closed 2026-07-22 (W3)** | [`gap-003-remaining-resolution.md`](gap-003-remaining-resolution.md) |
| GAP-004 | 2026-07-21 | P0 | `GET /me` (`getCurrentContext`) must return `SessionBootstrapResponse` (user/tenant/session/device/permissions/feature_flags/entitlements?) per FE auth schema §9.3 — was `GenericDataResponse` | Auth `/me` | Closed 2026-07-21 | OpenAPI restore |
| GAP-005 | 2026-07-21 | P0 | F01 error codes missing from catalog: `INVITE_*`, `USER_LAST_OWNER`, `ROLE_WOULD_REMOVE_LAST_ADMIN`, `DEVICE_ALREADY_REVOKED`; `AUTH_SESSION_EXPIRED`→`AUTH_TOKEN_EXPIRED`; `ROLE_VERSION_CONFLICT`→`RESOURCE_VERSION_MISMATCH` | error_catalog.csv | Closed 2026-07-21 | — |
| GAP-006 | 2026-07-21 | P0 | CSRF contract for cookie-authenticated mutations: reusable `X-CSRF-Token`, double-submit semantics, `x-csrf-protection` on protected writes | Auth mutations | Closed 2026-07-21 | BE-IDN-003 |
| GAP-007 | 2026-07-21 | P1 | Permission matrix now exports Backend-owned `group_id`, Vietnamese label, and display order; FE sync preserves them as `group` metadata | Roles / permission registry | Closed 2026-07-21 | permission_matrix.csv |
| GAP-008 | 2026-07-21 | P1 | `POST /auth/mfa/verify` now uses strict `MfaVerifyRequest` (`challenge_id` UUID + six-digit `code`) | Auth MFA | Closed 2026-07-21 | BE-IDN-008 |
| GAP-009 | 2026-07-21 | P0 | Web Admin auth channel locked to OIDC Authorization Code + BFF cookies (HO 2026-07-21) but OpenAPI/ticket still centered on `POST /auth/login` password — agents would implement wrong channel | Auth OIDC BFF | Closed 2026-07-21 | gap-009-oidc-bff-contract.md; OpenAPI `startOidcLogin`/`completeOidcLogin`; BE-IDN-003 rewrite |

## Gap đã biết nhưng chưa phải "FE-reported" (ghi lại từ tài liệu hiện có để không lặp lại)

Những mục này đã được chính 2 spec/README tự flag — liệt kê ở đây để BE ưu tiên trước khi FE phải
report lại qua quy trình gap chính thức:

| Mục | Nguồn | Ghi chú |
|---|---|---|
| `asyncapi/ops-events.yaml` | was FE stub | **Closed 2026-07-22 (W2)** — backend `channels.opsEvents` + FE sync populates `ops-events.yaml` (10 messages) |
| `metrics/metric-catalog.yaml` chưa tồn tại | `frontend/docs/ARTEFACT_STATUS.md` | Cần trước khi F09 Dashboard bắt đầu |
| `GET /me` SessionBootstrap | was FE test-utils README gap | **Closed** via GAP-004 — BE OpenAPI now declares `SessionBootstrapResponse` |
| 21 operation OpenAPI chưa có response 2xx hoặc dùng schema generator chưa nhận diện (`AuthResponse`, `ReservationResponse`) | `tooling/scripts/generate-msw-fixtures.mjs` output | Xem console log của script để lấy danh sách đầy đủ; MFA verify 2xx now `AuthResponse` |
