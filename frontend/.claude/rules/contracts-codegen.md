---
paths:
  - "contracts/**"
  - "packages/api-generated/**"
  - "packages/api-client/src/generated/**"
  - "packages/permissions/src/generated/**"
  - "packages/feature-flags/src/generated/**"
  - "packages/test-utils/src/msw/generated/**"
---

# Contracts & codegen

Everything under a `src/generated/**` (or `src/msw/generated/**`) folder is generated — never
hand-edit it. `contracts/` (OpenAPI/AsyncAPI/permission-matrix/error-catalog/feature-flags.yaml)
is the source of truth, synced from backend.

After editing anything under `contracts/`, or if backend contracts changed upstream, regenerate
and commit the diff:

```sh
pnpm contracts:sync && pnpm codegen:api
pnpm --filter @ai-sales/feature-flags run codegen
pnpm --filter @ai-sales/test-utils run codegen
```

CI (`pnpm codegen:check-clean`) re-runs `sync-backend-contracts.mjs` and
`@ai-sales/api-generated`'s `codegen`, then fails the build if `git status --porcelain` shows any
diff under `contracts/`, `packages/api-generated/src/generated/`, or
`packages/api-client/src/generated/` — so an uncommitted regen surfaces in review, it doesn't
silently pass. (`packages/permissions/src/generated/` and
`packages/test-utils/src/msw/generated/` follow the same "regenerate and commit" convention but
aren't in that specific CI script's tracked-paths list today — treat them the same way anyway.)

`tooling/scripts/sync-backend-contracts.mjs` also writes
`packages/permissions/src/generated/permissionKeys.ts` and
`packages/api-client/src/generated/errorCodes.ts` directly from the backend's
`backend_doc/matrices/{permission_matrix,error_catalog}.csv` — there's no separate codegen script
for those two files; `contracts:sync` alone regenerates them.

**Known environment gotcha**: `sync-backend-contracts.mjs` resolves the backend checkout as
`../../../backend` *relative to the script file itself*, i.e. it expects a sibling `backend/`
folder next to `frontend/` (confirmed present at this machine's
`Phan_mem_ban_hang_online/{frontend,backend}`). Running from inside a **git worktree** (e.g.
`frontend/.claude/worktrees/<name>/`) breaks this — the relative path resolves three directories
too deep and `backend/` won't be found. Run `contracts:sync` from a normal clone, not a worktree,
until this is made worktree-safe.
