# Umbrella Backend/Frontend Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename workspace folders to `backend/` + `frontend/` under one umbrella git root, fix `contracts:sync` for that layout, update remaining long-name paths, and delete stray junk — without mixing BE/FE code.

**Architecture:** Keep one git repo with two independent pnpm workspaces. Rename directories with `git mv`. Resolve the backend contracts root from the frontend workspace sibling (`../backend`) instead of assuming `.git`'s parent is a standalone frontend checkout.

**Tech Stack:** Git, Node.js (existing `sync-backend-contracts.mjs`), pnpm workspaces (unchanged).

**Spec:** `backend/docs/superpowers/specs/2026-07-22-umbrella-backend-frontend-rename-design.md`  
(Before Task 1 completes, the same file lives under `backend_phan_mem_ban_hang_online/docs/superpowers/specs/…`.)

## Global Constraints

- Topology: umbrella monorepo only — do **not** split remotes or add submodules.
- Folder names after Task 1: exactly `backend/` and `frontend/` at umbrella root.
- Do **not** add a root `package.json` in this plan.
- Do **not** move `fe_screen_inventory.csv` or refactor apps/packages/modules.
- Do **not** hand-edit `frontend/contracts/**` — only refresh via `pnpm contracts:sync`.
- Commits: only when Human Owner explicitly asks (user rule overrides frequent-commit habit).
- Working directory for all commands: `c:\Users\C-PC\Documents\Phan_mem_ban_hang_online` unless a step says otherwise.

## File map

| File | Role after change |
|------|-------------------|
| `backend/` (was `backend_phan_mem_ban_hang_online/`) | Backend workspace root |
| `frontend/` (was `frontend_phan_mem_ban_hang_online/`) | Frontend workspace root |
| `frontend/tooling/scripts/sync-backend-contracts.mjs` | Resolve BE as sibling `../backend` |
| `frontend/tools/w6-freeze-design-specs.mjs` | BE inventory path → `../backend/...` |
| `README.md` | Topology note + short freeze path |
| `frontend/CLAUDE.md` | Short BE paths; drop env-var workaround as default |
| `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md` | Short sync command |
| `backend/docs/enterprise-freeze/waves/W6_fe_design_specs.md` | Short FE tool path |
| Delete: `backend/console.error(e))` | Accidental terminal spill |

---

### Task 1: Rename folders with `git mv`

**Files:**
- Rename: `backend_phan_mem_ban_hang_online/` → `backend/`
- Rename: `frontend_phan_mem_ban_hang_online/` → `frontend/`

**Interfaces:**
- Consumes: existing umbrella git root
- Produces: disk paths `…/Phan_mem_ban_hang_online/backend` and `…/frontend`

- [ ] **Step 1: Confirm current names exist**

Run:

```powershell
Test-Path .\backend_phan_mem_ban_hang_online; Test-Path .\frontend_phan_mem_ban_hang_online; Test-Path .\backend; Test-Path .\frontend
```

Expected: `True`, `True`, `False`, `False`

- [ ] **Step 2: Rename backend**

Run:

```powershell
git mv backend_phan_mem_ban_hang_online backend
```

Expected: exit 0, no error about destination existing.

- [ ] **Step 3: Rename frontend**

Run:

```powershell
git mv frontend_phan_mem_ban_hang_online frontend
```

Expected: exit 0.

- [ ] **Step 4: Verify layout**

Run:

```powershell
Test-Path .\backend\package.json; Test-Path .\frontend\package.json; Test-Path .\backend_phan_mem_ban_hang_online; Test-Path .\frontend_phan_mem_ban_hang_online
```

Expected: `True`, `True`, `False`, `False`

- [ ] **Step 5: Re-point agent workspace if needed**

If tools fail to see files, call Cursor `move_agent_to_root` with  
`c:\Users\C-PC\Documents\Phan_mem_ban_hang_online`.

---

### Task 2: Fix `resolveBackendRoot` for umbrella layout

**Files:**
- Modify: `frontend/tooling/scripts/sync-backend-contracts.mjs` (imports + `resolveBackendRoot`)

**Interfaces:**
- Consumes: `frontendRoot` (already defined as parent of `tooling/`)
- Produces: `resolveBackendRoot()` → absolute path to a directory containing `packages/contracts-http/openapi.yaml`

- [ ] **Step 1: Update imports**

At the top of `frontend/tooling/scripts/sync-backend-contracts.mjs`, change the `fs` import to include `existsSync`:

```javascript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
```

- [ ] **Step 2: Replace `resolveBackendRoot`**

Replace the entire `resolveBackendRoot` function with:

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

Keep the comment block above the function, but rewrite it to say:

```javascript
// Prefer <frontend>/../backend (umbrella monorepo). BACKEND_CONTRACTS_ROOT overrides
// for CI. Git-common-dir heuristics cover worktrees and legacy two-repo checkouts.
```

- [ ] **Step 3: Smoke-resolve without syncing**

Run:

```powershell
node -e "import('./frontend/tooling/scripts/sync-backend-contracts.mjs').catch(e=>{console.error(e); process.exit(1)})"
```

If the module always runs sync on import (it does), prefer:

```powershell
pnpm -C frontend contracts:sync
```

Expected: logs `wrote …/frontend/contracts/…` lines; **no** `ENOENT` for backend openapi; exit 0.

- [ ] **Step 4: Confirm openapi source path used**

If sync fails, print resolved path by temporarily adding `console.log(backendRoot)` — then remove it. Do not leave debug logs.

---

### Task 3: Update remaining long-name path strings

**Files:**
- Modify: `README.md`
- Modify: `frontend/CLAUDE.md`
- Modify: `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`
- Modify: `backend/docs/enterprise-freeze/waves/W6_fe_design_specs.md`
- Modify: `frontend/tools/w6-freeze-design-specs.mjs`

**Interfaces:**
- Consumes: short names `backend/`, `frontend/`
- Produces: zero remaining `*_phan_mem_ban_hang_online` path references in tracked docs/scripts (except historical commit messages)

- [ ] **Step 1: Patch root README status + topology**

In `README.md`, replace the freeze path line that still uses the long backend name with:

```markdown
  `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`.
```

Near the top of `README.md` (after the title, before or right after the team-model table), ensure this note exists (add if missing):

```markdown
## Workspace layout (canonical)

One git repository (umbrella). Two independent pnpm workspaces — do not mix code across them:

| Path | Owner | Contents |
|------|-------|----------|
| `backend/` | Backend AI Agent | NestJS/FastAPI apps, modules, infra, `backend_doc/`, BE docs |
| `frontend/` | Frontend AI Agent | Web/desktop apps, UI packages, synced `contracts/`, FE docs |

Contract source of truth lives under `backend/`. Frontend refreshes copies with `pnpm -C frontend contracts:sync`.
```

- [ ] **Step 2: Patch `frontend/CLAUDE.md`**

Replace long-name freeze + sync lines with:

```markdown
- Canonical **what AI may code now** gate (sibling backend):
  `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md` — **PASS
  (2026-07-22)**. Follow `backend/docs/readiness/ENTERPRISE_DOC_GATE.md`: kickoff **BE-IDN-001**, then FE F01
  MSW/READY-MOCK; no phase jumping. Mirror: `docs/enterprise-freeze/FE_FREEZE_CHECKLIST.md`.
  Sync contracts with `pnpm contracts:sync` (resolves sibling `../backend`; override with
  `BACKEND_CONTRACTS_ROOT` only in CI).
```

- [ ] **Step 3: Patch freeze docs**

In `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`, replace the FE sync bullet with:

```markdown
- FE `pnpm contracts:sync` + `contracts:validate` pass (sibling `backend/`; CI may set `BACKEND_CONTRACTS_ROOT`)
```

In `backend/docs/enterprise-freeze/waves/W6_fe_design_specs.md`, replace the tool path with:

```markdown
- Tool: `frontend/tools/w6-freeze-design-specs.mjs`
```

- [ ] **Step 4: Patch W6 script inventory path**

In `frontend/tools/w6-freeze-design-specs.mjs`, change:

```javascript
const beInventory = path.resolve(
  root,
  "../backend/docs/enterprise-freeze/inventory/fe_screen_inventory.csv",
);
```

- [ ] **Step 5: Grep for leftover long names**

Run:

```powershell
rg -n "backend_phan_mem_ban_hang_online|frontend_phan_mem_ban_hang_online" --glob "!**/node_modules/**" --glob "!**/.git/**"
```

Expected: no matches in tracked source/docs (spec/plan may mention old names historically — if they do only inside “was …” prose, leave or update to past tense; zero live path references).

---

### Task 4: Delete stray file + verify success criteria

**Files:**
- Delete: `backend/console.error(e))` (if present)

- [ ] **Step 1: Delete junk file**

Run:

```powershell
if (Test-Path ".\backend\console.error(e))") { git rm -- ".\backend\console.error(e))" } else { Write-Host "already absent" }
```

Expected: removed or already absent.

- [ ] **Step 2: Run FE contracts sync**

Run:

```powershell
pnpm -C frontend contracts:sync
```

Expected: exit 0; writes under `frontend/contracts/`.

- [ ] **Step 3: Run BE contracts validate**

Run:

```powershell
pnpm -C backend contracts:validate
```

Expected: exit 0.

- [ ] **Step 4: Final layout check**

Run:

```powershell
Get-ChildItem -Name | Sort-Object
```

Expected to include `backend`, `frontend`, `README.md`, `.gitignore` — and **not** `backend_phan_mem_ban_hang_online` / `frontend_phan_mem_ban_hang_online`.

- [ ] **Step 5: Success criteria checklist**

Confirm all true:

- [ ] Disk: `backend/` and `frontend/` exist
- [ ] Long-named folders gone
- [ ] `pnpm -C frontend contracts:sync` works without `BACKEND_CONTRACTS_ROOT`
- [ ] README documents 1 repo + 2 short workspaces
- [ ] `backend/console.error(e))` gone

- [ ] **Step 6: Commit only if Human Owner asks**

If asked, stage rename + path fixes + deletion, then commit with message:

```text
chore: rename workspaces to backend/ and frontend/

Align umbrella layout with docs and fix contracts:sync sibling resolution.
```

Do **not** push unless explicitly requested.

---

## Spec coverage (self-review)

| Spec section | Task |
|--------------|------|
| §2 Topology + short names | Task 1 |
| §2 Approach 1 / no root package.json / no split remotes | Global Constraints |
| §3 Target layout + invariants | Task 1 + verify (no code moves) |
| §4 steps 1–2 git mv | Task 1 |
| §4 step 3 sync resolver | Task 2 |
| §4 step 4 long-name updates | Task 3 |
| §4 step 5 delete junk | Task 4 |
| §4 step 6 verify | Task 4 |
| §5 Out of scope | Global Constraints (explicit non-goals) |
| §7 Success criteria | Task 4 Step 5 |

No placeholders remaining. Resolver signatures consistent across Task 2 steps.
