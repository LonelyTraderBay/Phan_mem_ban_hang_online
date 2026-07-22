# AI Sales Operating System — Phần mềm bán hàng online

## Mô hình tổ chức (đọc trước mọi thứ khác)

Đây **không phải** dự án có 2 đội kỹ sư con người. Toàn bộ việc build được thực hiện bởi:

| Actor | Là gì | Hoạt động ở đâu | Ra quyết định gì |
|---|---|---|---|
| **Backend AI Agent** | AI coding agent (Claude Code) | Workspace `backend/` | Toàn bộ kỹ thuật backend: schema, API, domain rule, security invariant kỹ thuật, CI/CD |
| **Frontend AI Agent** | AI coding agent (Claude Code) | Workspace `frontend/` | Toàn bộ kỹ thuật frontend: component, state, routing, contract consumption, CI/CD |
| **Design AI Agent** | AI subagent (`frontend/.claude/agents/design-spec-writer.md`) | Trong workspace `frontend/`, chạy trước khi Frontend AI Agent code UI một màn hình | Bản đặc tả thiết kế dạng text/markdown thay thế Figma — xem `frontend/docs/ux/handoff-checklist.md` |
| **Human Owner** | Bạn — người duy nhất | Ngoài cả 2 workspace | Chấp nhận rủi ro kinh doanh/bảo mật/pháp lý, phê duyệt hành động không thể đảo ngược (go-live, xóa dữ liệu, chi tiêu hạ tầng thật), phân xử khi 2 agent không tự giải quyết được |

**Không có** Product Owner, UX Lead, Security Lead, QA Lead, DevOps/SRE, Backend Lead, Frontend
Architect... như những vai trò con người riêng biệt — tất cả trách nhiệm kỹ thuật của các vai trò
đó đã gộp vào 2 AI Agent tương ứng. Chỗ nào một quyết định **thực sự** cần phán đoán rủi ro/kinh
doanh/pháp lý mà không AI nào được tự quyết, nó thuộc về **Human Owner** — luôn luôn là bạn, không
phải một "role" trừu tượng.

> Lưu ý quan trọng bị giữ nguyên dù đội là AI: mọi hành động **không thể đảo ngược** hoặc có rủi ro
> tài chính/khách hàng thật (go-live production, xóa dữ liệu, chi tiêu hạ tầng, ký release desktop)
> vẫn luôn cần Human Owner xác nhận — không AI agent nào được tự phê duyệt việc này, bất kể nó tự
> tin đến đâu về mặt kỹ thuật.

## Workspace layout (canonical)

One git repository (umbrella). Two independent pnpm workspaces — do not mix code across them:

| Path | Owner | Contents |
|------|-------|----------|
| `backend/` | Backend AI Agent | NestJS/FastAPI apps, modules, infra, `backend_doc/`, BE docs |
| `frontend/` | Frontend AI Agent | Web/desktop apps, UI packages, synced `contracts/`, FE docs |

Contract source of truth lives under `backend/`. Frontend refreshes copies with `pnpm -C frontend contracts:sync`.

## Nguyên tắc phối hợp — 2 AI Agent không họp, không chat trực tiếp

Backend AI Agent và Frontend AI Agent chạy trong **2 phiên/agent độc lập, 2 workspace riêng, không có
kênh chat real-time giữa 2 bên**. Vì vậy mọi phối hợp phải là **bất đồng bộ, dựa trên file**:

1. **Backend sở hữu contract.** Nguồn chuẩn của API/event/permission/error nằm trong workspace backend.
   Frontend chỉ pull về bằng `pnpm contracts:sync`, không sửa tay.
2. **Không có "2 agent thảo luận rồi quyết".** Khi 2 agent cần thống nhất một điểm kỹ thuật:
   - Nếu đã có rule cố định trong docs (ADR, contract, blueprint) → agent tự áp dụng, không hỏi ai.
   - Nếu chưa có rule và là vấn đề thuần kỹ thuật, không rủi ro kinh doanh/bảo mật → agent đang sở
     hữu layer đó (thường là Backend AI Agent cho contract, Frontend AI Agent cho UI) quyết định
     một mình, ghi lại bằng ADR/ghi chú, bên kia tuân theo.
   - Nếu là vấn đề kinh doanh/bảo mật/pháp lý hoặc 2 agent thực sự mâu thuẫn không tự xử lý được →
     mỗi agent ghi vào **outbox của chính mình** (không phải file dùng chung — xem lý do dưới):
     `backend/docs/collaboration/OUTBOX.md` hoặc `frontend/docs/collaboration/OUTBOX.md`.
3. **Thiếu contract → mở gap**, không tự bịa field/status/permission — Frontend AI Agent ghi vào
   `OUTBOX.md` của chính nó; Backend AI Agent đọc và chép vào
   [`backend/docs/collaboration/contract-gap-board.md`](backend/docs/collaboration/contract-gap-board.md)
   (chỉ Backend AI Agent ghi file này).
4. **Mỗi file phối hợp chỉ có 1 người viết** (single-writer). Một audit phát hiện mô hình cũ (2
   agent cùng sửa 1 file dùng chung) có 2 rủi ro thật: Frontend AI Agent có thể không có quyền
   filesystem vào `backend/` tùy topology chạy, và 2 agent ghi đồng thời có thể đè lên nhau. Xem
   `backend/docs/collaboration/OUTBOX.md` để hiểu đầy đủ. **Human Owner nên đọc thẳng cả 2 file
   `OUTBOX.md`** thay vì chỉ đọc bản tổng hợp — nhanh và chắc chắn hơn.
5. **Thứ tự ưu tiên khi mâu thuẫn** (không đổi): ADR đã duyệt → contract đã freeze cho sprint hiện
   tại → Blueprint/Spec v2.0 → ticket → code hiện hữu.

## Tài liệu phối hợp (bản chuẩn ở backend, bản sao ở frontend)

| Tài liệu | Bản chuẩn (canonical) | Bản sao cho FE |
|---|---|---|
| Quy trình thay đổi contract (async, file-based) | `backend/docs/collaboration/CONTRACT_WORKFLOW.md` | `frontend/docs/collaboration/CONTRACT_WORKFLOW.md` |
| Outbox riêng của mỗi agent (single-writer, xem "Nguyên tắc phối hợp" trên) | `backend/docs/collaboration/OUTBOX.md` | `frontend/docs/collaboration/OUTBOX.md` |
| Contract Gap board (chỉ Backend AI Agent ghi, chép lại từ outbox của FE) | `backend/docs/collaboration/contract-gap-board.md` | — |
| Hàng đợi quyết định của Human Owner (chỉ Backend AI Agent ghi — bản tổng hợp, không phải nguồn nhanh nhất) | `backend/docs/collaboration/SIGNOFF_TRACKER.md` | — |
| Vai trò/thuật ngữ dùng chung (Backend/Frontend/Design AI Agent, Human Owner) | `backend/docs/domain/glossary.md` | `frontend/docs/domain/glossary.md` |
| ERD + Data dictionary | `backend/docs/data/ERD.md`, `backend/docs/data/data-dictionary.md` | (FE chỉ đọc, không phụ thuộc) |
| Môi trường tích hợp FE↔BE | `backend/docs/release/fe-integration-environment.md` | `frontend/docs/runbooks/backend-integration.md` |
| UX/Design handoff (Design AI Agent thay Figma) | — | `frontend/docs/ux/handoff-checklist.md`, `frontend/.claude/agents/design-spec-writer.md` |

Khi sửa bản chuẩn, agent sửa file đó chịu trách nhiệm đồng bộ bản sao trong cùng lần sửa.

## Trạng thái hiện tại (2026-07-22)

- **Full-product doc freeze:** **PASS** —
  `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`.
  Coding theo phase: `…/readiness/ENTERPRISE_DOC_GATE.md` — kickoff **BE-IDN-001**, rồi FE F01;
  không nhảy ORD/PAY.
- **Backend:** P0/P1 foundation + Identity tickets `doc-frozen`/`ready`; backlog coverage 100%.
- **Frontend:** F00 scaffolding; mọi product screen **READY-MOCK**; `contracts:sync` + codegen sạch.

## Việc chỉ Human Owner mới quyết được (đọc trước khi để agent tự chạy dài hạn)

Đọc thẳng cả 2 file outbox — nhanh nhất, không phụ thuộc Backend AI Agent đã kịp tổng hợp hay chưa:
[`backend/docs/collaboration/OUTBOX.md`](backend/docs/collaboration/OUTBOX.md) và
[`frontend/docs/collaboration/OUTBOX.md`](frontend/docs/collaboration/OUTBOX.md). Bản tổng hợp ở
[`backend/docs/collaboration/SIGNOFF_TRACKER.md`](backend/docs/collaboration/SIGNOFF_TRACKER.md)
— gồm: chấp nhận rủi ro bảo mật/kinh doanh trước staging/production, phê duyệt copy/brand do Design
AI Agent soạn, giá/gói billing (business, không AI nào tự quyết), và các mâu thuẫn kỹ thuật 2 agent
không tự giải quyết được.
