# Task 2 brief — Fix resolveBackendRoot for umbrella layout

Source plan: `backend/docs/superpowers/plans/2026-07-22-umbrella-backend-frontend-rename.md` (Task 2)
(If plan still referenced under old path in git history, live file is under `backend/docs/superpowers/plans/…`)

**Work from:** `c:\Users\C-PC\Documents\Phan_mem_ban_hang_online`

## Global Constraints (binding)

- Topology: umbrella monorepo — `backend/` + `frontend/` siblings
- Do **not** commit unless Human Owner asks
- Do **not** hand-edit `frontend/contracts/**` except via `pnpm contracts:sync`
- Do not add root package.json

## After Task 1

Folders are already renamed to `backend/` and `frontend/`. Empty locked `backend_phan_mem_ban_hang_online` may still exist — ignore it; do not block on it.

## Task 2: Fix `resolveBackendRoot`

**Files:**
- Modify: `frontend/tooling/scripts/sync-backend-contracts.mjs`

**Steps:**

1. Change fs import to:
```javascript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
```

2. Replace `resolveBackendRoot` with exactly:

```javascript
function resolveBackendRoot() {
  if (process.env.BACKEND_CONTRACTS_ROOT) {
    return process.env.BACKEND_CONTRACTS_ROOT;
  }

  const looksLikeBackend = (candidate) =>
    existsSync(resolve(candidate, "packages/contracts-http/openapi.yaml"));

  // Umbrella (and normal sibling checkout): frontend/../backend
  const sibling = resolve(frontendRoot, "..", "backend");
  if (looksLikeBackend(sibling)) {
    return sibling;
  }

  // Worktree / alternate layouts: walk from git common dir
  try {
    const gitCommonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: fileURLToPath(new URL(".", import.meta.url)), encoding: "utf8" },
    ).trim();
    const gitRoot = dirname(gitCommonDir);

    const underGitRoot = resolve(gitRoot, "backend");
    if (looksLikeBackend(underGitRoot)) {
      return underGitRoot;
    }

    // Legacy two-repo: git root is frontend/, sibling is ../backend
    const siblingOfCheckout = resolve(gitRoot, "..", "backend");
    if (looksLikeBackend(siblingOfCheckout)) {
      return siblingOfCheckout;
    }
  } catch {
    // fall through
  }

  return fileURLToPath(new URL("../../../backend", import.meta.url));
}
```

Update the comment above the function to:
```javascript
// Prefer <frontend>/../backend (umbrella monorepo). BACKEND_CONTRACTS_ROOT overrides
// for CI. Git-common-dir heuristics cover worktrees and legacy two-repo checkouts.
```

3. Verify with:
```powershell
pnpm -C frontend contracts:sync
```
Expected: exit 0; writes under frontend/contracts/; no ENOENT for backend openapi.

4. Do NOT leave debug console.log(backendRoot).

## Report

Write to: `.superpowers/sdd/task-2-report.md`
Do NOT commit.
