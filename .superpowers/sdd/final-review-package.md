# Final review package — umbrella backend/frontend rename

Plan: backend/docs/superpowers/plans/2026-07-22-umbrella-backend-frontend-rename.md
Spec: backend/docs/superpowers/specs/2026-07-22-umbrella-backend-frontend-rename-design.md
BASE (branch tip before this work): 450c1f1c1f575129309be7e5cf6340645ecedfde
HEAD: working tree (no commits for this plan — Human Owner deferred commits)

## Scope of THIS plan (ignore unrelated WIP in working tree)

1. Rename workspaces to `backend/` + `frontend/`
2. Fix `frontend/tooling/scripts/sync-backend-contracts.mjs` resolveBackendRoot
3. Update long-name strings in README, CLAUDE.md, freeze docs, w6 script
4. Delete `console.error(e))`; verify contracts:sync / contracts:validate

## Delivered

- Disk: `backend/`, `frontend/` present with package.json / apps
- `frontend_phan_mem_ban_hang_online` removed
- Empty locked `backend_phan_mem_ban_hang_online` may remain (0 children)
- sync script prefers sibling `../backend`
- README has Workspace layout (canonical)
- Path docs updated; grep clean outside historical superpowers docs
- `pnpm -C frontend contracts:sync` exit 0 without BACKEND_CONTRACTS_ROOT
- `CI=true pnpm -C backend contracts:validate` exit 0

## Minor ledger for final triage

- Empty locked backend_phan_mem_ban_hang_online shell — user must delete when Cursor releases lock
- Windows non-TTY: backend validate may need CI=true
- Large working tree has unrelated WIP; do not attribute all diffs to this plan

## SDD reports

- .superpowers/sdd/task-1-report.md … task-4-report.md
- .superpowers/sdd/progress.md

## Fix after final review

- **README topology wording (2026-07-22):** Actor table and "Nguyên tắc phối hợp" now say **workspace** (not separate git repos); "## Workspace layout (canonical)" unchanged. Aligns with one umbrella git repo + two pnpm workspaces.
- **`backend_phan_mem_ban_hang_online`:** Retry delete failed — folder still present (0 children, likely Cursor lock). Human Owner can remove when lock releases.
