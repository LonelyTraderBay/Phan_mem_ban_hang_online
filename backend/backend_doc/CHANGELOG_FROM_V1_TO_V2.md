# CHANGELOG — Backend Workplan v1.0 → Enterprise Implementation Blueprint v2.0

## Mục tiêu nâng cấp

Bản v1.0 là workplan định hướng tốt nhưng còn để mở nhiều quyết định và chưa đủ contract triển khai. Bản v2.0 biến workplan thành baseline có tính quy phạm để Backend AI Agent, Frontend AI Agent và Human Owner làm việc theo cùng nguồn sự thật.

## Các thay đổi chính

| Khu vực | Bản v1.0 | Bản v2.0 |
|---|---|---|
| Kiến trúc | Nhiều lựa chọn stack/service | Khóa modular monolith, worker/scheduler và AI service tách deployment |
| Multi-tenancy | Nguyên tắc `tenant_id` | Table classification, DB roles, RLS, transaction-local tenant context, composite FK, isolation tests |
| Identity | User thuộc tenant | Global identity + tenant membership + role/session/device/MFA/support grant |
| Data | Danh sách bảng | Data type convention, source of truth, constraint/index/RLS, lifecycle và retention threshold |
| API | Danh sách route | Contract-first, RFC 9457 error, cursor, ETag, idempotency, permission/audit extensions, 158 path starter |
| Event | Danh sách event | AsyncAPI, CloudEvents-style envelope, outbox/inbox, ordering, retry, DLQ, replay và SSE resume |
| State | Enum đơn chiều | State machine tách lifecycle/payment/fulfillment/return và conversation multidimensional state |
| Transaction | Yêu cầu transaction-safe | Lock order, isolation, atomic command algorithms, provider call boundary, reconciliation |
| Security | Security epic | Secure-by-default xuyên SDLC, ASVS baseline, threat model, supply chain, secrets, PII, incident controls |
| AI | Tool/RAG/QC cấp cao | Risk classes R0–R5, AI-R001…AI-R010, approval binding, evidence/freshness, eval/release/rollback/kill switch |
| Analytics | Tên báo cáo | Metric dictionary, recognition rule, timezone, watermark, late events, exact reconciliation |
| SRE | Monitoring/backup chung | SLI/SLO, error budget, telemetry conventions, alerting, DR, restore drill, migration safety |
| Testing | Unit/integration chung | Test pyramid, contract, RLS/IDOR, concurrency/property/failure/load/restore/eval gates |
| Delivery | Sprint list | DoR/DoD, RACI, P0–P12 entry/exit gates, 155 implementation tasks |
| AI coding agent | Chưa có protocol | Preflight → contract → test → migration → implementation → controls → verification → completion manifest |

## Artifact mới

- `01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md`
- `contracts/openapi.yaml`
- `contracts/asyncapi.yaml`
- `matrices/permission_matrix.csv`
- `matrices/error_catalog.csv`
- `matrices/implementation_backlog.csv`
- `templates/backend_ticket_template.md`
- `templates/adr_template.md`
- `MANIFEST.sha256`

## Quy tắc áp dụng

Bản v2.0 là implementation-ready baseline, không phải tuyên bố rằng mọi provider-specific schema đã được sản phẩm phê duyệt. Trước từng phase, đội phải freeze các schema/operation/event của phase đó, cập nhật artifact máy đọc được và chỉ kéo ticket đạt Definition of Ready vào sprint.
