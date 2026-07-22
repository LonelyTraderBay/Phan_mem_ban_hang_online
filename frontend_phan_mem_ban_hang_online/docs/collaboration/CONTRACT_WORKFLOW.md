# Quy trình thay đổi contract Backend AI Agent ↔ Frontend AI Agent

> Đây là **bản sao đọc** cho Frontend AI Agent. Bản chuẩn (canonical) nằm ở
> `backend/docs/collaboration/CONTRACT_WORKFLOW.md`. Sửa bản chuẩn trước, đồng bộ file này sau.

## Điều quan trọng nhất: không có ai để hỏi trực tiếp

Backend AI Agent chạy trong một phiên/repo hoàn toàn khác, không đồng bộ thời gian với bạn (Frontend
AI Agent). Không giả định "hỏi backend rồi chờ trả lời trong ngày" — mọi phối hợp là bất đồng bộ qua
file. Việc của bạn:

1. **Không hand-edit** bất kỳ file nào dưới `contracts/` hoặc `**/src/generated/**` (đều có banner
   `GENERATED — do not hand-edit`). Cần thay đổi → chạy:
   ```sh
   pnpm contracts:sync && pnpm codegen:api
   ```
   Đây là bước đầu tiên của bất kỳ ticket nào chạm tới contract, không phải bước cuối.
2. **Thiếu field/status/permission** → ghi vào **outbox của chính bạn**:
   [`docs/collaboration/OUTBOX.md`](OUTBOX.md) (file trong repo `frontend/`, luôn ghi được — không
   phụ thuộc `backend/` có được mount cùng phiên hay không). **Không ghi trực tiếp vào**
   `backend/docs/collaboration/contract-gap-board.md` nữa — file đó giờ chỉ Backend AI Agent ghi
   (đổi từ mô hình "2 agent cùng sửa 1 file" sang "mỗi agent chỉ ghi outbox của mình", vì mô hình cũ
   có rủi ro thật: bạn có thể không có quyền ghi vào `backend/` tùy topology chạy, và 2 agent cùng
   sửa 1 bảng markdown có thể ghi đè nhau). Kèm ví dụ request/response cụ thể, gán priority P0/P1/P2.
   Không tự đặt tên field cho xong việc.
   - **P0** (block auth/order/send/security): dừng phần việc phụ thuộc, ghi vào outbox VÀ nói rõ
     trong output phiên làm việc của bạn rằng đây là block P0 — đừng chỉ dựa vào việc Backend AI
     Agent tình cờ đọc outbox kịp lúc; Human Owner có thể tự chạy Backend AI Agent để xử lý gấp nếu
     cần.
   - **P1**: ghi vào outbox, chuyển sang phần việc khác không phụ thuộc.
   - **P2**: ghi vào outbox, tiếp tục với mock có đánh dấu rõ.
3. **Nghi ngờ breaking change từ backend** → chạy `pnpm codegen:check-clean`. Gãy typecheck do đổi
   tên/kiểu tương thích → tự sửa call site. Gãy do thay đổi hành vi (field bị xóa mà UI đang hiển
   thị, status machine đổi) → ghi vào `OUTBOX.md`, không tự đoán ý đồ backend.
4. **Không có "2 agent thảo luận"**: nếu cách backend hiện thực một field không khớp nhu cầu của
   bạn, ghi rõ nhu cầu vào `OUTBOX.md` — Backend AI Agent (chủ sở hữu contract) là bên quyết định
   cách hiện thực cuối cùng miễn đáp ứng đúng nhu cầu đó, sau khi nó đọc outbox của bạn. Nếu bản
   thân nhu cầu là câu hỏi business (có nên hiển thị field nhạy cảm này không?) → đó là việc của
   Human Owner — ghi rõ trong `OUTBOX.md` rằng mục này cần Human Owner, không phải việc 2 agent tự
   quyết. Human Owner có thể đọc thẳng `OUTBOX.md` của bạn bất cứ lúc nào, không cần chờ Backend AI
   Agent transcribe sang `SIGNOFF_TRACKER.md`.

Toàn bộ chi tiết (bảng phân loại additive/breaking, nghĩa vụ giữ contract ổn định của mỗi bên, lý do
đầy đủ đằng sau mô hình outbox) — đọc bản chuẩn ở backend, mục 1–5, và
`backend/docs/collaboration/OUTBOX.md`.
