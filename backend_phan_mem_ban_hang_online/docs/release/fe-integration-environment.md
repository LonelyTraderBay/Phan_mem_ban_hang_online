# Backend AI Agent ↔ Frontend AI Agent Integration Environment (CANONICAL)

> Bản chuẩn. Bản sao/hướng dẫn thao tác cho Frontend AI Agent:
> `frontend/docs/runbooks/backend-integration.md`.

## Mục tiêu file này

Trả lời câu hỏi Frontend AI Agent cần nhất khi bắt đầu tích hợp thật: **chạy Backend ở đâu, bằng
URL nào, tài khoản nào, và khi nào chuyển từ mock sang API thật.** Đây là gap được
`ARTEFACT_STATUS.md` (FE) tự đánh dấu: "chưa có staging environment... FE release runbooks đang
blocked vì điều này."

## Tình trạng thật tại thời điểm viết (không suy đoán trước)

Environment taxonomy đã thống nhất 5 tầng giữa 2 repo (xem
`docs/release/environment-topology.md` — đã giải quyết, không còn là điểm cần Human Owner phân xử,
vì đây thuần là chọn tên gọi, không phải quyết định rủi ro/kinh doanh):

| Environment | Trạng thái | Nguồn |
|---|---|---|
| `local` (docker compose) | ✅ Tồn tại: PostgreSQL 18.1, Redis 8.4, OTel collector, MinIO (S3-compatible) | `backend/infra/docker/compose.yaml` |
| `ci` (bên trong `dev`) | ✅ Tồn tại về nguyên tắc (ephemeral Postgres/Redis mỗi lần chạy pipeline) | `backend/docs/release/environment-topology.md` |
| `dev` | ❌ Chưa tồn tại | Không có workflow deploy nào trong repo backend tại thời điểm này |
| `staging` | ❌ Chưa tồn tại | `frontend/docs/ARTEFACT_STATUS.md` xác nhận: "no staging environment exists yet to deploy to" |
| `pilot` | ❌ Chưa tồn tại | — |
| `production` | ❌ Chưa tồn tại | — |

**Chỉ 2 migration đã có** (`000001_bootstrap_roles.sql`, `000002_walking_skeleton.sql`) — hầu hết
bảng trong blueprint §7 chưa có migration thật. **Chưa có seed data script**.

## Việc tự Backend AI Agent làm được, không cần chờ Human Owner

- **Provisioning `dev` environment lần đầu** (chỉ hạ tầng free/dev-tier, không phát sinh chi phí
  thật): Backend AI Agent tự thực hiện khi P1 Foundation có ít nhất Identity + 1 module đọc-only
  chạy được — không cần hỏi trước, vì đây là hạ tầng phát triển nội bộ, không phải production.
- **Seed data script**: tạo cùng lúc với migration của module Identity (vì cần user+tenant trước
  mọi module khác) — không cần ticket riêng chờ duyệt, Backend AI Agent tự đưa vào Definition of
  Done của ticket Identity đầu tiên.
- **Test account naming convention**: chốt ngay dưới đây, không còn là "đề xuất chờ xác nhận" —
  xem mục cuối file.

## Chưa từng có test tự động chạy cả 2 phía cùng lúc — gap thật, tracked ở đây

Một audit xác nhận: chưa có bất kỳ CI job hay test nào khởi động backend thật (`docker compose`) và
chạy frontend E2E nhắm vào nó — `playwright.config.ts` chỉ khởi động `pnpm dev:web-admin`, không
có backend process nào; toàn bộ E2E hiện tại chạy trên MSW mock. Nghĩa là 2 repo **chưa từng được
chứng minh thực sự tích hợp được**, chỉ mới kiểm tra type-shape khớp nhau (`codegen:check-clean`) —
điều đó không bắt được lỗi hành vi runtime (ví dụ field đúng kiểu nhưng sai ý nghĩa).

**Kế hoạch cụ thể** (không làm ngay — phụ thuộc BE-FND-016 walking skeleton đủ trưởng thành, tránh
xây CI job cho hệ thống chưa có gì để test thật):

1. Khi BE-FND-016 (walking skeleton) và ít nhất module Identity chạy được end-to-end: thêm 1 CI job
   (đặt ở backend vì nó điều khiển cả 2 process) khởi động `backend/infra/docker/compose.yaml` +
   migration, khởi động frontend dev server trỏ vào đó, chạy tập con Playwright spec với MSW tắt.
2. `READY-INTEGRATION` (spec FE §1.5) chỉ nên coi là đạt cho module nào khi job này pass cho đúng
   endpoint của module đó — gắn evidence link (CI run URL) vào ticket hoàn thành, cùng cách các
   evidence khác được ghi trong completion manifest.

Cho tới khi job này tồn tại, đừng coi `pnpm contracts:sync` + typecheck xanh là bằng chứng 2 repo
đã "nối lại hoàn hảo" — nó chỉ chứng minh shape khớp, không chứng minh hành vi đúng.

## Việc CẦN Human Owner (chi phí thật, hạ tầng thật)

Provisioning `staging`/`pilot`/`production` thật (managed database, object storage, domain, TLS
cert, observability backend trả phí) là chi tiêu hạ tầng thật — ghi vào
[`../collaboration/SIGNOFF_TRACKER.md`](../collaboration/SIGNOFF_TRACKER.md) khi Backend AI Agent
sẵn sàng về mặt kỹ thuật để triển khai `staging`, để Human Owner quyết định nhà cung cấp/ngân sách.

## Lộ trình Frontend AI Agent chuyển từ mock sang API thật

```text
Giai đoạn 1 (hiện tại — F00/P0-P1)
  Frontend AI Agent chạy hoàn toàn bằng MSW mock (packages/test-utils), không cần Backend chạy.
  Backend AI Agent chạy local qua docker compose, chưa có endpoint nào đủ đầy để gọi thật.

Giai đoạn 2 (khi P1 Foundation có ít nhất Identity + 1 module đọc-only chạy được)
  Backend AI Agent tự provision `dev` environment tối thiểu và ghi URL vào file này (thay placeholder
  bên dưới).
  Frontend AI Agent bắt đầu integration test có chọn lọc nhắm vào `dev`, vẫn giữ MSW cho phần chưa
  sẵn sàng — không chuyển toàn bộ một lần.

Giai đoạn 3 (staging thật tồn tại, sau khi Human Owner duyệt hạ tầng)
  Frontend AI Agent E2E (Playwright) chuyển một phần sang chạy against staging thay vì chỉ MSW.
  Cần: seed data thật (đã có từ Giai đoạn 1), tài khoản test cố định (xem dưới), rotation policy cho
  secret test — Backend AI Agent tự thiết lập rotation kỹ thuật, secret vault/nhà cung cấp do Human
  Owner chọn.
```

`dev` URL hiện tại: *(chưa provisioned — Backend AI Agent điền vào đây khi Giai đoạn 2 bắt đầu)*

## Seed data — gap, Backend AI Agent tự đóng khi làm ticket Identity

Không có script seed nào trong `backend/` tại thời điểm viết file này. Trước khi `dev`/`staging`
tồn tại, cần tối thiểu — Backend AI Agent tự thêm vào scope ticket Identity đầu tiên, không cần
ticket riêng:

- Script tạo 1 tenant mẫu + 1 user owner + password test cố định (chỉ non-production).
- Fixture tối thiểu cho mỗi bounded context có API đọc (vài `products`, `customers`, `orders` mẫu)
  để Frontend AI Agent Playwright E2E không phụ thuộc dữ liệu tự tạo bằng tay.
- Quy tắc: seed data không bao giờ chứa PII thật (dùng dữ liệu giả theo Blueprint §21 data
  correctness / spec FE §5.1 "không dùng production data ở local/dev").

## Test account convention — chốt, không còn "đề xuất"

| Vai trò (permission test persona) | Mục đích | Ghi chú |
|---|---|---|
| `owner@dev.local` | Test full-permission flow | Password chỉ tồn tại trong `.env` môi trường non-prod, không commit |
| `sales@dev.local` | Test permission bị giới hạn | Dùng cho negative permission test |
| `support-agent@dev.local` | Test break-glass support access flow | MFA bắt buộc theo §5.6 |

Credential lưu trong secret của CI (GitHub Actions secrets ở giai đoạn hiện tại) — không commit vào
repo dưới bất kỳ hình thức nào. Nhà cung cấp secret manager thật cho `staging`/`production` là
quyết định hạ tầng thật → Human Owner (xem mục trên).
