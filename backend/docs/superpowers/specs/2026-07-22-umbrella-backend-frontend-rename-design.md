# Design: Umbrella Monorepo — Rename to `backend/` + `frontend/`

**Date:** 2026-07-22  
**Status:** Approved by Human Owner (chat) — Option A, Approach 1 (minimal rename + sync fix)  
**Owner:** Human Owner (topology) · Backend AI Agent / Frontend AI Agent (path updates in own trees)

## 1. Goal

Chuẩn hóa layout Enterprise-Grade: **một git clone**, hai workspace tách rõ BE/FE, tên folder ngắn khớp docs/scripts — không trộn code, không sửa lại sau này vì lệch tên.

## 2. Decisions locked

| Decision | Choice |
|----------|--------|
| Topology | Umbrella monorepo (1 remote, 1 `.git` root) |
| Folder names | `backend/` + `frontend/` (đổi từ `*_phan_mem_ban_hang_online`) |
| Workspaces | Giữ 2 pnpm workspace độc lập (không gộp root workspace) |
| Contract ownership | BE canonical → FE sync copies (không đổi) |
| Scope depth | Approach 1: rename + fix `contracts:sync` + cập nhật path tên dài + cleanup rác |
| Root `package.json` | Không thêm trong lần này |
| Split 2 remotes | Không |

## 3. Target layout

```text
Phan_mem_ban_hang_online/          ← git root (umbrella)
├── README.md
├── .gitignore
├── backend/                       ← Backend AI Agent workspace
│   ├── apps/ packages/ modules/ infra/
│   ├── backend_doc/ docs/ tools/
│   └── …
└── frontend/                      ← Frontend AI Agent workspace
    ├── apps/ packages/ contracts/ tooling/
    ├── frontend_doc/ docs/
    └── …
```

**Invariants**

- Không có React/Vite/UI app trong `backend/`.
- Không có NestJS/SQL migrations/`backend_doc` SoT trong `frontend/`.
- `frontend/contracts/` = bản GENERATED từ BE; không hand-edit.

## 4. Implementation steps

1. `git mv backend_phan_mem_ban_hang_online backend`
2. `git mv frontend_phan_mem_ban_hang_online frontend`
3. Sửa `frontend/tooling/scripts/sync-backend-contracts.mjs` — resolve BE theo thứ tự:
   - `BACKEND_CONTRACTS_ROOT` (CI / override)
   - Sibling: `<frontendRoot>/../backend` (umbrella đúng)
   - Fallback relative cũ nếu cần
4. Cập nhật chỗ còn hard-code tên dài (~5):
   - Root `README.md`
   - `frontend/CLAUDE.md`
   - `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`
   - `backend/docs/enterprise-freeze/waves/W6_fe_design_specs.md`
   - `frontend/tools/w6-freeze-design-specs.mjs`
5. Xóa file rác `backend/console.error(e))`
6. Verify:
   - `pnpm -C frontend contracts:sync` (không cần env var trên máy local)
   - `pnpm -C backend contracts:validate` (smoke)
   - `git status` chỉ chứa rename + path fixes + cleanup

## 5. Out of scope

- Tách 2 Git remote / submodule
- Root `package.json` convenience scripts
- Chuyển `fe_screen_inventory.csv` sang FE
- Dọn `.cursor/skills` FE bloat
- Commit / tạo `.github/workflows` nếu chưa có trong repo
- Refactor nội dung apps/packages/modules

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Cursor / agent đang mở path cũ | Sau rename: reopen workspace / `move_agent_to_root` về umbrella |
| `contracts:sync` vẫn tìm sai nếu chỉ rename không sửa resolver | Bắt buộc step 3 trước khi claim done |
| Worktree / Claude nested path | Resolver ưu tiên sibling của FE workspace, không phụ thuộc giả định “git parent = frontend” |
| Link markdown `backend/` / `frontend/` | Hầu hết đã đúng; rename làm chúng hợp lệ |

## 7. Success criteria

- [ ] Disk paths: `…/Phan_mem_ban_hang_online/backend` và `…/frontend`
- [ ] Không còn folder `*_phan_mem_ban_hang_online` ở root
- [ ] `pnpm -C frontend contracts:sync` chạy được không set `BACKEND_CONTRACTS_ROOT`
- [ ] README mô tả rõ 1 repo + 2 workspace + tên ngắn
- [ ] Không còn file `console.error(e))` trong backend
