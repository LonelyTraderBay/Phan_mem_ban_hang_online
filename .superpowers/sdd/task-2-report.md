# Task 2 Report — Fix resolveBackendRoot for umbrella layout

**Date:** 2026-07-22  
**Work directory:** c:\Users\C-PC\Documents\Phan_mem_ban_hang_online  
**Brief:** .superpowers/sdd/task-2-brief.md

## Status: DONE

## Commits: none

## Changes applied

**File modified:** `frontend/tooling/scripts/sync-backend-contracts.mjs`

1. Added `existsSync` to the `node:fs` import.
2. Replaced the long worktree/CI comment block with the brief's two-line comment.
3. Replaced `resolveBackendRoot()` with the brief's implementation:
   - `BACKEND_CONTRACTS_ROOT` env override (unchanged behavior for CI)
   - `looksLikeBackend()` probe via `packages/contracts-http/openapi.yaml`
   - Primary path: `frontend/../backend` (umbrella sibling)
   - Fallback: git-common-dir → `<gitRoot>/backend`, then legacy `<gitRoot>/../backend`
   - Final fallback: script-relative `../../../backend`
4. No debug `console.log(backendRoot)` added.

## Verification

### Pre-check: backend openapi exists

```
backend/packages/contracts-http/openapi.yaml — present on disk
```

### pnpm install (required before sync)

Initial `pnpm -C frontend contracts:sync` failed because `yaml` was missing (`ERR_MODULE_NOT_FOUND`).

```powershell
$env:CI='true'; pnpm install   # in frontend/
```

Exit code: **0** (947 packages, including `yaml@2.9.0`).

### contracts:sync

```powershell
pnpm -C frontend contracts:sync
```

Exit code: **0**

Key output:

```
wrote .../frontend/contracts/openapi/tenant-api.yaml
wrote .../frontend/contracts/openapi/ops-api.yaml
openapi split: 155 tenant paths, 10 ops paths
wrote .../frontend/contracts/asyncapi/tenant-events.yaml
wrote .../frontend/contracts/asyncapi/ops-events.yaml (10 messages)
wrote .../frontend/contracts/permissions/permission-matrix.yaml
wrote .../frontend/packages/permissions/src/generated/permissionKeys.ts
wrote .../frontend/contracts/errors/error-catalog.yaml
wrote .../frontend/packages/api-client/src/generated/errorCodes.ts
wrote contracts/BACKEND_REF.lock (450c1f1c1f575129309be7e5cf6340645ecedfde)
contracts:sync complete
```

No ENOENT for backend openapi. Backend resolved via umbrella sibling path (`frontend/../backend`) without `BACKEND_CONTRACTS_ROOT`.

## Self-review

| Check | Result |
|-------|--------|
| Import matches brief verbatim | PASS |
| `resolveBackendRoot` matches brief verbatim | PASS |
| Comment matches brief verbatim | PASS |
| No debug logging of backendRoot | PASS |
| `pnpm contracts:sync` exit 0 | PASS |
| No commit made | PASS |
| Only scoped file changed (script, not hand-edited contracts) | PASS |

## Concerns

- **pnpm install prerequisite:** After Task 1 folder rename, `frontend/node_modules` needed recreation (`CI=true pnpm install`). Document for developers post-rename.
- **Generated contract drift:** `contracts:sync` refreshed generated files under `frontend/contracts/` and `packages/*/src/generated/`. These are expected sync outputs, not hand edits; they will appear in git status until committed separately.
- **Minor pre-existing quirk:** Sync logs `wrote .../tenant-events.yaml` twice (harmless duplicate log line in script output).

## Diff summary

Single file changed: `frontend/tooling/scripts/sync-backend-contracts.mjs` (+33 / −20 lines in `resolveBackendRoot` region).
