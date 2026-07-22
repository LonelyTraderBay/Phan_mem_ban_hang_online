# START HERE — Cách khởi động triển khai Backend

## 1. Đọc theo thứ tự

0. `../docs/enterprise-freeze/README.md` + `FULL_PRODUCT_DOC_FREEZE.md` — **nếu gate FAIL: chỉ làm
   wave docs/contracts, không code feature domain.**
1. `01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` — mục 0–6, 18–20.
2. `CHANGELOG_FROM_V1_TO_V2.md` — hiểu thay đổi và phạm vi.
3. `matrices/implementation_backlog.csv` — import Jira/Linear.
4. `contracts/openapi.yaml`, `contracts/asyncapi.yaml` — contract baseline.
5. `matrices/permission_matrix.csv`, `matrices/error_catalog.csv`.
6. `templates/adr_template.md`, `templates/backend_ticket_template.md`.
7. `../docs/data/ERD.md` + `../docs/data/data-dictionary.md` — trước khi viết migration cho bảng
   nào, tra class (GLOBAL/TENANT_OWNED/...) và trạng thái RLS của bảng đó.
8. `../docs/collaboration/CONTRACT_WORKFLOW.md` — quy trình đổi contract khi Frontend AI Agent phụ
   thuộc vào nó (async, file-based — không có họp/chat trực tiếp giữa 2 agent);
   `../docs/collaboration/contract-gap-board.md` để xem gap Frontend AI Agent đang chờ.
9. `../docs/business/HO_DEFAULTS_v1.md` — VAT/plans/over-limit (Resolved 2026-07-22).

## 2. Việc phải làm trước commit production đầu tiên

- Đội build là Backend AI Agent + Human Owner (không phải nhiều role con người riêng biệt) — xem
  `../docs/domain/glossary.md`'s "Vai trò / Roles". Backend AI Agent thực thi mọi phần kỹ thuật
  (từng do Backend/Platform/SRE/Security/QA/AI Lead làm); Human Owner chỉ ký các quyết định rủi
  ro/không thể đảo ngược — xem `../docs/collaboration/SIGNOFF_TRACKER.md`.
- Tạo repository theo cấu trúc mục 3 của blueprint.
- Import backlog; bắt đầu với `BE-P0-001` đến `BE-P0-011`.
- Commit ADR-001…ADR-010; không để lựa chọn “A hoặc B”.
- Chạy lint/validation cho OpenAPI/AsyncAPI và sinh client/mock.
- Hoàn tất ERD/data dictionary/RLS classification cho P1–P2 — khung đã có ở
  `../docs/data/ERD.md` và `../docs/data/data-dictionary.md`; cập nhật trạng thái "Not started" →
  "Done" theo từng bảng khi migration + tenant isolation test pass, và giải quyết các dòng "Needs
  confirmation" trước khi migration bảng đó.
- Freeze permission/error/idempotency/event catalogs.
- Tạo threat model và risk register có owner.
- Chỉ đưa `BE-FND-*` vào sprint khi P0 exit gate đạt.

## 3. Nhịp làm việc cho từng ticket

```text
Definition of Ready
→ Contract/schema first
→ Test design
→ Migration/constraint/RLS
→ Domain/application implementation
→ Permission/idempotency/audit/outbox/telemetry
→ Integration/concurrency/security verification
→ Staging smoke
→ Completion manifest + review
```

## 4. Lệnh kiểm tra tối thiểu cho pack

```bash
python -c "import yaml; yaml.safe_load(open('contracts/openapi.yaml')); yaml.safe_load(open('contracts/asyncapi.yaml'))"
```

Trong repository triển khai, CI phải bổ sung OpenAPI/AsyncAPI linter, breaking-change detector, generated-client compile, migration fresh/upgrade test, SAST/SCA/secret scan, SBOM và image/provenance verification như blueprint quy định.

## 5. Điều kiện được phép bắt đầu code domain

- P1 Foundation: bắt đầu sau khi P0 exit gate đạt.
- **Trước module P2 đầu tiên (Identity)**: ưu tiên hoàn tất `BE-FND-017`/`BE-FND-018` (test đầy đủ
  cho `modules/audit` + helper invariant-test dùng chung trong `packages/test-utils`) nếu còn "Not
  Started" — mọi module sau đó copy pattern từ `modules/audit`; bắt đầu module mới khi pattern đó
  còn thiếu test nghĩa là mỗi module tự phát minh lại cách test tenant isolation/idempotency, dễ
  lệch chuẩn. Không bắt buộc chặn cứng nếu áp lực thời gian thật, nhưng đây là ưu tiên rất cao.
- Identity/Auth: cần identity–membership model, token/MFA policy, permission matrix, RLS test plan.
- Inventory/Order: cần state machine, money rule, transaction/lock/idempotency spec và concurrency cases.
- Channel: cần provider adapter, signature/dedupe/token lifecycle và retry/DLQ policy.
- AI: cần tool schemas, risk/approval matrix, AI-R rules, frozen eval set và kill switch.
- Analytics: cần metric dictionary, event completeness và reconciliation query.

Không giao AI coding agent tự phát minh rule về tiền, tồn kho, tenant, permission, privacy, payment hoặc high-risk AI action.
