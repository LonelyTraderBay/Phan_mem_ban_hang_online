# Kế hoạch tự động hoàn thiện theo DOC_GATE

**Date:** 2026-07-22  
**Mode:** Autonomous coding agent — chạy tuần tự theo ưu tiên đến hết backlog **code được phép**  
**Constitution:** `ENTERPRISE_DOC_GATE.md` + Blueprint v2.0  
**Ledger:** `.superpowers/sdd/autonomous-progress.md`

## Định nghĩa “100%” (hai tầng)

| Tầng | Mục tiêu | AI tự làm? |
|------|----------|------------|
| **A. Code-complete theo DOC_GATE** | Mọi ticket backlog `Done` trong phase được mở lần lượt (P3→P4→…→P11 code) | **Có** — đây là quỹ đạo tự động |
| **B. Production-ready** | Staging, cloud spend, go-live, brand/legal HO | **Không** — dừng và ghi `SIGNOFF_TRACKER` / OUTBOX |

Agent **không** nhảy ORD/PAY khi phase hiện tại chưa exit. Agent **không** tự approve go-live.

## Vòng lặp mỗi ticket (bắt buộc)

```text
1. Đọc ticket + pnpm agent:context <ID>
2. Preflight → status ready (contract/permission/error/migration)
3. Contract-first nếu thiếu schema/error
4. TDD: test → implement → eslint module → vitest focused
5. pnpm contracts:validate + typecheck + test (verify đầy đủ khi Node pin khớp)
6. Cập nhật ticket done + backlog CSV + DOC_GATE dòng liên quan
7. Commit tiếng Việt trên nhánh feat/autonomous-backlog
8. Sang ticket kế trong hàng đợi
```

Dừng vòng lặp khi: BLOCKED (thiếu HO rule tiền/bảo mật), hoặc hết phase được phép, hoặc hết ngân sách phiên.

## Hàng đợi ưu tiên (cập nhật khi xong)

### Wave 1 — Đóng P3 Customer/Catalog/Import (đang chạy)

1. [x] BE-CUS-003 Identity attach/dedupe
2. [x] BE-CUS-004 Merge preview/merge transaction/history
3. [x] BE-CAT-003 Cost/price permission + history/audit
4. [x] BE-CAT-004 Private media upload/scan/signed URL
5. [x] BE-IMP-001 … BE-IMP-005 (in-memory + `000014`)

### Wave 2 — FE slice P3 (sau API Done)

6. [ ] FE customers list/detail/merge MSW + routes
7. [ ] FE products/catalog (+ media) MSW + routes
8. [ ] `pnpm -C frontend contracts:sync` sau mỗi wave BE đổi contract

### Wave 3 — P4 Inventory + Knowledge (chỉ khi Wave 1 exit)

9. [x] BE-INV-001 … BE-INV-008 theo thứ tự backlog
10. [x] BE-KNW-001 … BE-KNW-006 knowledge schema + in-memory application (`000016`)

### Wave 4 — P5 Channel (chỉ khi Wave 3 exit)

11. [x] BE-CHN-001 … BE-CHN-011 channel schema + in-memory application (`000017`)

### Wave 5+ — theo phase blueprint

P6 Conversation → P7 Order → P8 Payment → … → P11 Hardening  
Mỗi wave: cập nhật DOC_GATE exit trước khi mở wave sau.

### Wave HO (không tự merge/go-live)

- BE-FND-015 Staging infra  
- SIGNOFF production / chi tiêu cloud  
- Pilot tenant  

## Nhánh git

- Working branch: `cursor/autonomous-p3-wave1` (Wave 1 P3 BE)
- 1 commit / ticket (hoặc 1 PR / wave nếu Human Owner muốn gộp)
- Không commit `.superpowers/sdd/*` scratch trừ ledger nếu được phép

## Tiêu chí dừng phiên

- Ghi ledger ticket vừa xong + ticket kế  
- Nếu còn thời gian → tiếp tục Wave 1 item tiếp theo  
- Báo cáo % backlog Done sau mỗi wave
