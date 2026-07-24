# Task 4 Report — Refresh staging CI/deploy docs to new Fly names

**Date:** 2026-07-24  
**Status:** PASS  
**Commits:** none (per brief)

## Summary

Wave 2 DOC_GATE scope C: replaced legacy `ai-sales-*-staging` instructional Fly names with canonical `phan-mem-ban-hang-online-*` hostnames in three release docs; documented optional `FLY_API_TOKEN` and deploy skip behavior in BE-FND-014 CI doc; added current-host note to H5 evidence while preserving historical run URL.

## Steps completed

### Step 1 — Replace source-of-truth Fly names

| File | Changes |
|------|---------|
| `backend/docs/release/BE-FND-014-staging-ci.md` | Canonical URL table (api/web/ops/oidc); `STAGING_API_BASE_URL` / `STAGING_WEB_ADMIN_URL` examples updated; legacy destroyed callout |
| `backend/docs/release/staging-fly-deploy.md` | App name, create/deploy/health commands → `phan-mem-ban-hang-online-api`; sibling apps table; OIDC redirect example; legacy destroyed callout |
| `backend/docs/release/HARDENING-H5-EVIDENCE.md` | Current API host note (`phan-mem-ban-hang-online-api.fly.dev`); historical health URL kept with *(historical)* label |

### Step 2 — `FLY_API_TOKEN` documentation

Added **Optional secrets** table in `BE-FND-014-staging-ci.md`: when `FLY_API_TOKEN` is absent, workflow skips automated deploy and runs `deploy_note` only; manual deploy per `staging-fly-deploy.md`.

### Step 3 — Grep check

```powershell
Select-String -Path docs/release/BE-FND-014-staging-ci.md,docs/release/staging-fly-deploy.md -Pattern "ai-sales-api-staging"
```

| Match | Context | Instructional? |
|-------|---------|----------------|
| `staging-fly-deploy.md:6` | Legacy destroyed callout | No — labeled destroyed |

`BE-FND-014-staging-ci.md`: zero matches for `ai-sales-api-staging`.  
Both files: only `ai-sales-*-staging` in legacy-destroyed notes (acceptable).

## Files modified

1. `backend/docs/release/BE-FND-014-staging-ci.md`
2. `backend/docs/release/staging-fly-deploy.md`
3. `backend/docs/release/HARDENING-H5-EVIDENCE.md`

## Concerns

- Other release docs (`ASVS-PENTEST-SCOPE.md`, `HARDENING-H2/H3/H4`, `A1-SECRETS-FILL-GUIDE.md`, etc.) still reference legacy Fly names — out of Task 4 scope; follow-up wave if needed.
- Workflow YAML unchanged (Task 5); `deploy_note` job text still says manual deploy until token added — docs now aligned.
