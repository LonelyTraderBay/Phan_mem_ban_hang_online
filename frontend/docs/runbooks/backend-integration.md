# Backend integration runbook

> Bản chuẩn (canonical) và chi tiết đầy đủ nằm ở
> `backend/docs/release/fe-integration-environment.md`. File này chỉ tóm tắt phần Frontend AI Agent
> cần thao tác hằng ngày.

## Trạng thái hiện tại (đọc bản chuẩn để có bảng đầy đủ)

- **Chưa có `dev`/`staging` environment nào để trỏ vào.** Đừng hardcode URL nào ngoài `local`.
  Environment taxonomy đã thống nhất 5 tầng (`local, dev, staging, pilot, production`) giữa 2 repo
  — không còn là điểm mơ hồ.
- Frontend AI Agent chạy hoàn toàn qua MSW mock (`packages/test-utils`) cho tới khi Backend AI Agent
  tự provision `dev` environment đầu tiên — xem [`local-setup.md`](local-setup.md) cho cách chạy MSW.
- Khi cần dữ liệu backend thật để test tay: chạy `backend/infra/docker/compose.yaml` (Postgres,
  Redis, OTel, MinIO) — nhưng lưu ý: hầu hết bảng nghiệp vụ **chưa có migration**, chỉ 2 migration
  bootstrap tồn tại. Seed data sẽ có cùng lúc với ticket Identity đầu tiên của Backend AI Agent.

## Việc Frontend AI Agent tự làm khi Backend AI Agent công bố `dev` environment đầu tiên

Không cần chờ xác nhận từ ai — đây là quy trình kỹ thuật đã định sẵn:

1. Đọc URL `dev` mới trong bản chuẩn, điền `apiBaseUrl`/`sseUrl` vào `runtime-config.json`
   (spec FE §5.2).
2. Chạy lại `pnpm contracts:sync && pnpm codegen:api` để chắc chắn types khớp với environment đó.
3. Chuyển dần Playwright E2E smoke từ MSW sang environment thật theo lộ trình ở bản chuẩn — không
   chuyển toàn bộ một lần, giữ MSW cho phần backend chưa sẵn sàng.
4. Dùng tài khoản test đã chốt (`owner@dev.local`, `sales@dev.local`, `support-agent@dev.local` —
   xem bản chuẩn) — production data không bao giờ được dùng ở `local`/`dev` (spec FE §5.1).

## Việc cần Human Owner (không phải Frontend AI Agent tự quyết)

Provisioning `staging`/`pilot`/`production` thật là chi tiêu hạ tầng thật — nằm trong
`backend/docs/collaboration/SIGNOFF_TRACKER.md`, không phải việc Frontend AI Agent hay Backend AI
Agent tự quyết định nhà cung cấp/ngân sách.
