# Task 4 report — Delete stray + verify success criteria

**Date:** 2026-07-22  
**Workdir:** `c:\Users\C-PC\Documents\Phan_mem_ban_hang_online`  
**Commit:** None (per brief)

## Actions

1. **`backend/console.error(e))`** — Not present (`Test-Path` → False). No delete needed (Task 1 fix confirmed).
2. **`backend_phan_mem_ban_hang_online`** — Removal attempted (`Remove-Item -Recurse -Force`). **Failed:** directory locked — *"The process cannot access the file ... because it is being used by another process."* Folder appears **empty** (no child items listed). Still exists at report time.
3. **Verify commands** — See below.

## Command results

| Command | Exit code | Notes |
|---------|-----------|--------|
| `pnpm -C frontend contracts:sync` | **0** | Completed; wrote openapi/asyncapi/permissions/errors + `BACKEND_REF.lock`. No `BACKEND_CONTRACTS_ROOT` set (umbrella `../backend` resolution). |
| `pnpm -C backend contracts:validate` (first run) | **1** | Failed during deps check: `[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY]` — needs `CI=true` on Windows non-TTY. |
| `CI=true` + `pnpm -C backend contracts:validate` | **0** | Reinstalled backend `node_modules`; OpenAPI 3.1.1 + AsyncAPI 3.1.0 OK. |

## Root layout (`Get-ChildItem -Name | Sort-Object`)

```
.claude
.gitignore
.superpowers
backend
backend_phan_mem_ban_hang_online   ← empty shell, locked
frontend
README.md
```

Brief expects at minimum: `backend`, `frontend`, `README.md`, `.gitignore`. **Also present:** `.claude`, `.superpowers`, locked legacy folder.

## Success criteria checklist

| Criterion | Pass |
|-----------|------|
| Disk: `backend/` and `frontend/` exist | **true** |
| Long-named folders gone (or only empty locked shell — document) | **partial** — empty `backend_phan_mem_ban_hang_online` remains, delete blocked by file lock |
| `pnpm -C frontend contracts:sync` works without `BACKEND_CONTRACTS_ROOT` | **true** (exit 0) |
| README documents 1 repo + 2 short workspaces | **true** — section "Workspace layout (canonical): One git repository … Two independent pnpm workspaces" |
| `backend/console.error(e))` gone | **true** |

## Overall status

**PASS (with follow-up)** — All functional criteria met; legacy folder removal deferred until nothing holds the path open (IDE, terminal cwd, indexer, etc.).

## Concerns / follow-up

- Close handles on `backend_phan_mem_ban_hang_online` and delete manually, or retry after reboot.
- Run `CI=true pnpm -C backend contracts:validate` (or set `confirmModulesPurge=false`) in non-interactive Windows shells to avoid PNPM TTY abort.
