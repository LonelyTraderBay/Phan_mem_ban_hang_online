# Quy trình thay đổi contract Backend AI Agent ↔ Frontend AI Agent (CANONICAL)

> Bản chuẩn. Bản sao cho Frontend AI Agent: `frontend/docs/collaboration/CONTRACT_WORKFLOW.md` —
> agent nào sửa file này phải đồng bộ bản sao đó trong cùng lần sửa.

## Tiền đề: 2 agent không có kênh chat, không họp

Backend AI Agent và Frontend AI Agent là 2 tiến trình AI độc lập, chạy trong 2 repo riêng, **không
chia sẻ context, không có tin nhắn real-time cho nhau**. Mọi phối hợp phải đi qua file trong
`docs/collaboration/` — không viết quy trình nào giả định "2 bên thảo luận" hay "review đồng bộ".
Nếu bạn (Backend AI Agent hoặc Frontend AI Agent) đang đọc file này để quyết định phải làm gì tiếp
theo: đọc mục tương ứng dưới đây, tự hành động theo rule đã định, và chỉ dừng lại chờ khi mục đó nói
rõ phải escalate cho Human Owner.

## 1. Nguồn chuẩn và luồng dữ liệu

Backend AI Agent **sở hữu** contract — nó là bên duy nhất được sửa các file nguồn dưới đây. Frontend
AI Agent **tiêu thụ** qua codegen, không bao giờ sửa tay.

| Artefact | File nguồn (backend, Backend AI Agent sở hữu) | Frontend AI Agent nhận được gì sau `pnpm contracts:sync` |
|---|---|---|
| HTTP API | `packages/contracts-http/openapi.yaml` | `contracts/openapi/tenant-api.yaml` + `ops-api.yaml` → types trong `packages/api-generated` |
| Domain/realtime events | `backend_doc/contracts/asyncapi.yaml` | `contracts/asyncapi/tenant-events.yaml` (ops-events còn là stub) |
| Permission matrix | `backend_doc/matrices/permission_matrix.csv` | `contracts/permissions/permission-matrix.yaml` + union type `PermissionKey` |
| Error catalog | `backend_doc/matrices/error_catalog.csv` | `contracts/errors/error-catalog.yaml` + union type `ErrorCode` |

Ghi chú kỹ thuật: script sync tự tìm repo backend là thư mục anh em (`../backend`); layout khác
(CI, worktree) dùng biến môi trường `BACKEND_CONTRACTS_ROOT`.

## 2. Quy trình khi Backend AI Agent thay đổi contract — event-triggered, không phải lịch họp

Không còn "weekly contract review" hay "sprint ceremony" — cả 2 khái niệm giả định con người họp
theo lịch. Thay bằng gate kích hoạt theo sự kiện:

```text
1. PROPOSE   Backend AI Agent sửa openapi.yaml/asyncapi.yaml/CSV trong cùng PR/commit với code
             liên quan (ADR-003 OpenAPI-first) — không sửa sau. Ghi rõ trong commit message:
             additive hay breaking, và operation/schema/permission nào bị ảnh hưởng.
2. SELF-CHECK Trước khi coi contract đã "frozen", Backend AI Agent tự chạy validation
             (`pnpm contracts:validate` phía backend) và xác nhận OpenAPI lint pass (operationId,
             error response, x-permission, idempotency, example — Blueprint §8.1).
3. AVAILABLE  Ngay khi merge vào nhánh chính, contract coi như sẵn sàng cho Frontend AI Agent —
             không có bước "chờ FE duyệt trước khi merge". Nếu thay đổi là breaking, Backend AI
             Agent phải tự đánh giá tác động bằng cách đọc `frontend/packages/api-generated` và
             các call site hiện có (nếu có quyền truy cập cả 2 repo trong phiên làm việc), hoặc ghi
             rõ trong contract-gap-board.md rằng đây là breaking change cần Frontend AI Agent xử lý
             ở lần chạy tiếp theo của nó.
4. SYNC       Khi Frontend AI Agent chạy (không đồng bộ thời gian với Backend AI Agent — có thể
             cách nhau vài giờ/ngày), việc đầu tiên trong bất kỳ ticket nào chạm tới contract là
             chạy `pnpm contracts:sync && pnpm codegen:api`. Nếu diff xuất hiện, đó là thay đổi cần
             xử lý — commit như một thay đổi bình thường (CI gate `codegen:check-clean` bắt drift
             nếu quên).
5. BREAKING   Nếu sync làm gãy typecheck: đây là breaking change. Frontend AI Agent tự sửa call site
             nếu là refactor cơ học rõ ràng (đổi tên field, đổi kiểu tương thích); nếu cần quyết
             định hành vi (field bị xóa mà UI đang hiển thị, status mới cần UX khác) → ghi vào
             contract-gap-board.md làm rõ đây là "breaking change cần quyết định", không tự đoán.
```

### Phân loại thay đổi

| Loại | Ví dụ | Quy tắc |
|---|---|---|
| Additive (không breaking) | Thêm endpoint, thêm optional field, thêm error code mới | Backend AI Agent merge tự do; Frontend AI Agent sync khi ticket của nó cần |
| Breaking, thuần kỹ thuật | Đổi tên field, đổi kiểu tương thích ngược được | Backend AI Agent tự thực hiện + note trong PR; Frontend AI Agent tự áp dụng khi sync, không cần hỏi |
| Breaking, ảnh hưởng hành vi/UX | Xóa field đang hiển thị, đổi status machine, xóa permission | Backend AI Agent ghi vào contract-gap-board.md dưới dạng "cần Frontend AI Agent xử lý" kèm ví dụ request/response cụ thể; major version đổi path `/api/v1` → `/api/v2` nếu thực sự breaking (Blueprint §8.2) |
| Sửa matrices (permission/error) | Thêm/xóa dòng CSV | Xóa/đổi tên key = breaking (Frontend có union type sinh từ CSV — code cũ gãy compile ngay, đó là tín hiệu tự động, không cần thông báo riêng) |

## 3. Quy trình khi Frontend AI Agent thiếu contract — "Contract Gap"

Spec FE §1.4: **thiếu gì thì mở gap, không bịa field/status/permission.** Không có SLA tính theo
"ngày làm việc" nữa — Backend AI Agent không "làm việc theo giờ hành chính", nó xử lý gap ở lần
chạy tiếp theo có liên quan tới khu vực đó. Priority quyết định **agent có được tiếp tục việc khác
hay phải dừng**, không quyết định "bao lâu có người trả lời":

| Priority | Ví dụ | Frontend AI Agent làm gì trong lúc chờ |
|---|---|---|
| P0 | Block auth/order/send/security | Dừng hẳn phần việc phụ thuộc gap này; ghi vào outbox của chính nó (bước 1 dưới) VÀ nói rõ trong output phiên làm việc rằng đây là P0 blocking — không giả định việc đọc outbox bất đồng bộ sẽ đủ nhanh cho trường hợp khẩn |
| P1 | Block một feature/module cụ thể | Ghi gap, chuyển sang làm phần khác của cùng module hoặc module khác không phụ thuộc |
| P2 | UX/optional field | Ghi gap, tiếp tục bình thường, dùng mock/placeholder có đánh dấu rõ |

Quy trình (đã đổi từ "sửa file dùng chung" sang mô hình outbox 1-writer-mỗi-repo — xem
[`OUTBOX.md`](OUTBOX.md) để hiểu lý do: agent kia có thể không có quyền ghi vào repo này tùy
topology, và 2 agent cùng sửa 1 file có thể ghi đè nhau):

1. Frontend AI Agent ghi gap vào **outbox của chính nó**
   (`frontend/docs/collaboration/OUTBOX.md` — file trong repo của nó, luôn ghi được) theo template
   trong đó, gán priority ở trên, kèm **ví dụ concrete** (request/response/state transition thật).
   Không ghi trực tiếp vào `contract-gap-board.md` — file đó giờ chỉ Backend AI Agent ghi.
2. Khi Backend AI Agent chạy (dù trong ticket khác) và cần chạm contract, nó đọc
   `frontend/docs/collaboration/OUTBOX.md` (best-effort, nếu `frontend/` được mount cùng phiên) như
   một phần context chuẩn, chép mục liên quan vào [`contract-gap-board.md`](contract-gap-board.md)
   của chính nó, xử lý theo priority, cập nhật cột Status/Ticket.
3. Nếu 2 agent "bất đồng" về cách giải quyết (ví dụ Backend AI Agent đề xuất field A, Frontend AI
   Agent cần field B) — không có bước "2 kiến trúc sư ngồi lại bàn": Backend AI Agent (chủ sở hữu
   contract) quyết định cách hiện thực kỹ thuật cuối cùng, miễn nó đáp ứng đúng nhu cầu Frontend đã
   nêu; nếu nhu cầu đó bản thân là một câu hỏi business (ví dụ: có nên hiển thị field nhạy cảm này
   không) → Backend AI Agent ghi vào [`SIGNOFF_TRACKER.md`](SIGNOFF_TRACKER.md) cho Human Owner
   quyết định (Human Owner cũng có thể đọc thẳng cả 2 file `OUTBOX.md` nếu cần nhanh hơn), không
   phải 2 agent tự thương lượng.
4. Gap đóng khi contract mới đã merge và Frontend AI Agent đã sync + build thành công — Frontend AI
   Agent có thể tự thêm dòng `Resolution` vào entry tương ứng trong outbox của chính nó.
5. Trong lúc chờ: Frontend AI Agent được phép mock phía MSW (`packages/test-utils`) **có đánh dấu**
   rõ là tạm — không merge code phụ thuộc field chưa tồn tại trong contract vào nhánh chính.

## 4. Điều Backend AI Agent phải giữ để Frontend AI Agent không gãy

- Mọi operation có `operationId`, error response, security, `x-permission`, khai báo idempotency
  và example — OpenAPI lint đã chặn (Blueprint §8.1).
- Error trả về theo RFC 9457 `application/problem+json`, `code` thuộc error catalog.
- Permission key theo format `<resource>.<action>` (Blueprint §5.4).
- Event AsyncAPI có schema version; đổi envelope phải ghi rõ trong contract-gap-board.md trước khi
  merge, không đổi âm thầm.

## 5. Điều Frontend AI Agent phải giữ để không ép Backend AI Agent sai kiến trúc

- Không gọi thẳng `api-generated` từ feature — luôn qua `api-client`.
- Không suy luận quyền ở client làm nguồn chân lý — chỉ dùng để ẩn/hiện UI; 403 từ server luôn thắng.
- Không cache/persist dữ liệu nhạy cảm ngoài quy định spec FE §9–10.
