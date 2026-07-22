# Task 4 brief — Delete stray file + verify success criteria

**Work from:** `c:\Users\C-PC\Documents\Phan_mem_ban_hang_online`
**Do NOT commit** unless Human Owner already asked (they have not).

## Steps

1. Confirm `backend/console.error(e))` is already gone (deleted in Task 1 fix). If present, delete it.
2. Try again to remove empty `backend_phan_mem_ban_hang_online` if it still exists. If locked, note in report — do not fail the whole task.
3. Run:
```powershell
pnpm -C frontend contracts:sync
pnpm -C backend contracts:validate
```
If backend needs `pnpm install` first, run it (CI=true ok on Windows), then validate.
4. Layout check:
```powershell
Get-ChildItem -Name | Sort-Object
```
Expect `backend`, `frontend`, `README.md`, `.gitignore`. Note if empty old backend shell remains.
5. Success criteria checklist — mark each true/false in report:
   - Disk: backend/ and frontend/ exist
   - Long-named folders gone (or only empty locked shell remains — document)
   - pnpm -C frontend contracts:sync works without BACKEND_CONTRACTS_ROOT
   - README documents 1 repo + 2 short workspaces
   - backend/console.error(e)) gone

## Report
`.superpowers/sdd/task-4-report.md`
