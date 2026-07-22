# Task 3 report — Update remaining long-name path strings

**Date:** 2026-07-22  
**Status:** COMPLETE  
**Commit:** None (per brief)

## Summary

Updated all live path/doc references from `backend_phan_mem_ban_hang_online` / `frontend_phan_mem_ban_hang_online` to short names `backend/` and `frontend/` per task brief. Added canonical workspace layout section to umbrella README.

## Files changed

| File | Change |
|------|--------|
| `README.md` | Added `## Workspace layout (canonical)` after team model; freeze path → `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md` |
| `frontend/CLAUDE.md` | Freeze gate path, ENTERPRISE_DOC_GATE path, and `pnpm contracts:sync` sibling-backend wording |
| `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md` | FE sync bullet → sibling `backend/` + optional CI `BACKEND_CONTRACTS_ROOT` |
| `backend/docs/enterprise-freeze/waves/W6_fe_design_specs.md` | Tool path → `frontend/tools/w6-freeze-design-specs.mjs` |
| `frontend/tools/w6-freeze-design-specs.mjs` | `beInventory` resolves `../backend/docs/enterprise-freeze/inventory/fe_screen_inventory.csv` |

## Grep verification

Command (per brief):

```powershell
rg -n "backend_phan_mem_ban_hang_online|frontend_phan_mem_ban_hang_online" --glob "!**/node_modules/**" --glob "!**/.git/**" --glob "!**/.superpowers/**"
```

**Result:** No live path references in tracked docs/scripts targeted by this task.

Remaining matches (expected / acceptable):

| Location | Notes |
|----------|-------|
| `backend/docs/superpowers/plans/2026-07-22-umbrella-backend-frontend-rename.md` | Historical rename plan — uses "was …" / `git mv` command examples |
| `backend/docs/superpowers/specs/2026-07-22-umbrella-backend-frontend-rename-design.md` | Historical design — `git mv` steps only |

Excluded from grep scope: `.superpowers/sdd/*` (task briefs/reports from Tasks 1–2).

## Concerns

1. **README line 71** still uses ellipsis shorthand `…/readiness/ENTERPRISE_DOC_GATE.md` in the "Trạng thái hiện tại" section — brief only required freeze path fix; full path left as-is for consistency with existing Vietnamese doc style in that block.
2. **Empty `backend_phan_mem_ban_hang_online` shell** (Task 1 leftover) — not in scope; may still exist on disk if Cursor lock persists.
3. **No commit** — changes remain unstaged per brief.

## Acceptance

- [x] All six brief file edits applied exactly
- [x] Grep shows no live long-name paths outside historical superpowers docs
- [x] Report written
- [x] No commit
