# Backend Enterprise Implementation Pack v2.0

Bộ tài liệu này nâng cấp `BACKEND WORKPLAN — AI SALES OPERATING SYSTEM` từ workplan cấp cao thành implementation blueprint có thể giao cho đội Backend hoặc AI coding agent.

## Tệp chính

- `01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md`: nguồn yêu cầu chuẩn, quyết định kiến trúc, domain rules, state machine, transaction, security, testing, CI/CD, vận hành và kế hoạch thực thi.
- `contracts/openapi.yaml`: OpenAPI starter contract cho HTTP API.
- `contracts/asyncapi.yaml`: AsyncAPI starter contract cho domain event và realtime event.
- `matrices/permission_matrix.csv`: ma trận quyền mặc định.
- `matrices/error_catalog.csv`: danh mục error code chuẩn.
- `matrices/implementation_backlog.csv`: backlog task ID theo phase để import vào Jira/Linear.
- `templates/backend_ticket_template.md`: mẫu ticket implementation-ready.
- `templates/adr_template.md`: mẫu Architecture Decision Record.
- `00_SOURCE_BACKEND_WORKPLAN_v1.0.md`: bản nguồn để đối chiếu.

## Tài liệu phối hợp và data (bổ sung, ngoài `backend_doc/`)

- `../docs/data/ERD.md`, `../docs/data/data-dictionary.md`: ERD + bảng phân loại RLS cho từng
  table trong blueprint §7 — dùng khi viết migration.
- `../docs/collaboration/CONTRACT_WORKFLOW.md`, `contract-gap-board.md`, `SIGNOFF_TRACKER.md`:
  quy trình đổi contract với FE, bảng gap đang chờ xử lý, và tổng hợp sign-off còn treo.
- `../docs/domain/glossary.md`: thuật ngữ VN/EN dùng chung với FE.
- `../docs/release/fe-integration-environment.md`: môi trường FE dùng để tích hợp, tình trạng seed
  data hiện tại.

## Quy tắc ưu tiên

Khi có xung đột, thứ tự ưu tiên là:

1. ADR đã được phê duyệt mới nhất.
2. OpenAPI/AsyncAPI đã freeze cho sprint.
3. Blueprint v2.0 này.
4. Ticket sprint.
5. Code hiện hữu.

Không được lấy code hiện hữu làm lý do bỏ qua security invariant, tenant isolation, audit, idempotency hoặc transaction rule trong blueprint.
