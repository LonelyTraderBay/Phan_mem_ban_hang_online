# Task 5 Report — Optional Fly deploy job in staging-preflight

**Date:** 2026-07-24  
**Status:** PASS (Steps 1–4)  
**Commits:** none (per brief)

## Summary

Added optional `run_fly_deploy` workflow input (default `false`) and a `deploy` job after `health` that deploys `phan-mem-ban-hang-online-api` via `flyctl deploy --remote-only` when enabled. Missing `secrets.FLY_API_TOKEN` prints a skip message and exits 0. Updated `deploy_note` to document the optional job.

## Steps completed

### Step 1 — Workflow input

Added `run_fly_deploy` boolean input (`default: false`) under `workflow_dispatch.inputs`.

### Step 2 — `deploy` job

| Requirement | Implementation |
|-------------|----------------|
| `needs: [gate, health]` | Yes |
| `if: inputs.run_fly_deploy` | Yes |
| `environment: staging` | Yes |
| Empty token → skip exit 0 | Yes |
| flyctl + deploy from `backend/` | `setup-flyctl` action; `working-directory: backend`; `-a phan-mem-ban-hang-online-api` |

### Step 3 — `deploy_note` update

`needs` now includes `deploy`; echo text references `run_fly_deploy`, `FLY_API_TOKEN`, canonical app name, and `staging-fly-deploy.md`.

### Step 4 — Local validation

```powershell
Select-String -Path .github/workflows/staging-preflight.yml -Pattern "phan-mem-ban-hang-online-api|run_fly_deploy|FLY_API_TOKEN"
```

Exit 0 — all three patterns matched (multiple lines each).

### Step 5 — HO Actions smoke

**Deferred.** HO Actions run deferred — secrets/token not available in agent session.

HO checklist (when ready):

1. Ensure GitHub Environment `staging` has migrate/health secrets.
2. Optionally add `FLY_API_TOKEN`.
3. Run workflow with `confirm_phase_a=PASS`, `run_fly_deploy=false`.
4. Re-run with `run_fly_deploy=true` if token exists.
5. Paste run URL into `HARDENING-H5-EVIDENCE.md` (no secrets).

## Files modified

1. `.github/workflows/staging-preflight.yml`

## Concerns

- `deploy` needs `health`; if `run_health=false`, deploy is skipped even when `run_fly_deploy=true` (GitHub Actions skip propagation). Default inputs avoid this.
- `superfly/flyctl-actions/setup-flyctl@master` is unpinned; pin to a release tag if org policy requires it.
- No production deploy path added; workflow remains `workflow_dispatch` only.

## Review fix (Task 5 — Important finding)

**Issue:** `flyctl auth token` in the `deploy` job can echo the token into CI logs.

**Change:** Removed `flyctl auth token`; `flyctl deploy` still uses `FLY_API_TOKEN` from job env (flyctl reads it automatically). Updated one sentence each in `BE-FND-014-staging-ci.md` and `staging-fly-deploy.md` to reflect optional CI deploy when `run_fly_deploy=true` and token present.

**Files modified (this fix):**

1. `.github/workflows/staging-preflight.yml` — drop `flyctl auth token`
2. `backend/docs/release/BE-FND-014-staging-ci.md` — deploy bullet
3. `backend/docs/release/staging-fly-deploy.md` — CI deploy bullet

**Command checks:**

```powershell
Select-String -Path .github/workflows/staging-preflight.yml -Pattern "flyctl auth token"
# (no matches — PASS)

Select-String -Path .github/workflows/staging-preflight.yml -Pattern "FLY_API_TOKEN|flyctl deploy"
# Exit 0 — FLY_API_TOKEN env + flyctl deploy present; auth token line absent
```
