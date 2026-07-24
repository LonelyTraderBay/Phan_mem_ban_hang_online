# Task P0.1 — Apply pending trên local

**Phase:** P0 — Sync migration local ↔ staging  
**Plan:** `backend/docs/superpowers/plans/2026-07-24-db-schema-completion.md`

**Mục tiêu:** Local và staging cùng số version; không lệch schema trước mọi thay đổi mới.

**Files:** không sửa code (trừ evidence doc 1 dòng); chạy migrate.

## Steps

- [ ] **Step 1:** Từ `backend/`, nạp `DATABASE_URL` từ `.env.local` (PowerShell):

```powershell
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] }
}
pnpm migrate
```

Expected: apply mọi file pending (ít nhất `000034_fix_accept_invitation_ambiguity.sql` nếu chưa có) hoặc `No pending migrations.`

- [ ] **Step 2:** Đếm version local — expected count = số file `000NNN_*.sql` trong `infra/migrations`.

- [ ] **Step 3:** So staging (từ `.env.staging`, **không** in password). Expected: `app.schema_migrations` count == số file migration trong repo.

- [ ] **Step 4:** Ghi 1 dòng evidence vào `backend/docs/release/HO-STAGING-CHECKLIST.md` (hoặc ticket BE-FND-015) — “local migrations = staging = N” + ngày; **không** dán URL/password.

**Done khi:** local apply xong; count local == staging == số file SQL.

## Controller resolutions (binding)

- **Do NOT git commit** — Human Owner chưa yêu cầu commit; chỉ thay đổi working tree.
- **Do NOT print** DATABASE_URL, passwords, or connection strings in reports.
- Work directory: `backend/` under repo `C:/Users/C-PC/Documents/Phan_mem_ban_hang_online`.
- If local count already equals staging and file count, still write evidence line and report DONE.
