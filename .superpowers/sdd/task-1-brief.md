# Task 1 brief — Rename folders with `git mv`

Source plan: `backend_phan_mem_ban_hang_online/docs/superpowers/plans/2026-07-22-umbrella-backend-frontend-rename.md` (Task 1)

**Work from:** `c:\Users\C-PC\Documents\Phan_mem_ban_hang_online`

## Global Constraints (binding)

- Topology: umbrella monorepo only — do **not** split remotes or add submodules.
- Folder names after Task 1: exactly `backend/` and `frontend/` at umbrella root.
- Do **not** add a root `package.json` in this plan.
- Do **not** move `fe_screen_inventory.csv` or refactor apps/packages/modules.
- Do **not** hand-edit `frontend/contracts/**`.
- **Commits: only when Human Owner explicitly asks — DO NOT commit in this task.**
- Working directory for all commands: `c:\Users\C-PC\Documents\Phan_mem_ban_hang_online`

## Task 1: Rename folders with `git mv`

**Files:**
- Rename: `backend_phan_mem_ban_hang_online/` → `backend/`
- Rename: `frontend_phan_mem_ban_hang_online/` → `frontend/`

**Interfaces:**
- Consumes: existing umbrella git root
- Produces: disk paths `…/Phan_mem_ban_hang_online/backend` and `…/frontend`

- [ ] **Step 1: Confirm current names exist**

```powershell
Test-Path .\backend_phan_mem_ban_hang_online; Test-Path .\frontend_phan_mem_ban_hang_online; Test-Path .\backend; Test-Path .\frontend
```

Expected: `True`, `True`, `False`, `False`

- [ ] **Step 2: Rename backend**

```powershell
git mv backend_phan_mem_ban_hang_online backend
```

- [ ] **Step 3: Rename frontend**

```powershell
git mv frontend_phan_mem_ban_hang_online frontend
```

- [ ] **Step 4: Verify layout**

```powershell
Test-Path .\backend\package.json; Test-Path .\frontend\package.json; Test-Path .\backend_phan_mem_ban_hang_online; Test-Path .\frontend_phan_mem_ban_hang_online
```

Expected: `True`, `True`, `False`, `False`

- [ ] **Step 5: Re-point agent workspace if needed**

If tools fail to see files, note it in the report (controller can call move_agent_to_root).

## Report

Write full report to: `.superpowers/sdd/task-1-report.md`

Return ONLY: Status, commits (none expected), one-line verify summary, concerns, report path.
