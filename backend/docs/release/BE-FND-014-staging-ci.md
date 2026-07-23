# Staging deploy workflow (BE-FND-014)

**Status:** Workflow wired for **manual** migrate + health — **does not** auto-deploy Fly or touch production.  
Requires Phase A confirmation input + GitHub Environment `staging` secrets after HO fills them.

## Required GitHub Environment `staging` secrets

| Secret | Purpose |
|---|---|
| `STAGING_DATABASE_URL` | Migrate |
| `STAGING_API_BASE_URL` | Health check (`/health`) |
| `OIDC_CLIENT_SECRET` | Reserved for future OIDC smoke job — never echo in logs |

## Required variables (optional)

| Variable | Example |
|---|---|
| `STAGING_WEB_ADMIN_URL` | `https://app.staging.example.com` |

## Workflow

See [`.github/workflows/staging-preflight.yml`](../../../.github/workflows/staging-preflight.yml):

- `workflow_dispatch` only (no auto prod).
- Input `confirm_phase_a` must be `PASS` (after checklist mục 4).
- Jobs: gate → migrate (`node tools/migrate.mjs`) → `GET /health`.
- Fly deploy remains **manual** — [`staging-fly-deploy.md`](./staging-fly-deploy.md). Add `FLY_API_TOKEN` job later when HO provides token.

## After Phase A PASS

1. HO creates GitHub Environment `staging` + secrets.
2. Run workflow once with `confirm_phase_a=PASS`.
3. Evidence in OUTBOX (no secrets); propose `BE-FND-014` Done + HO ack.

## Related tickets

- `BE-FND-015` staging infra (migrate already PASS on Supabase; full cutover still needs secrets/HTTPS)
- `BE-FND-014` CI/CD
- [`staging-cutover.md`](./staging-cutover.md)
- [`A-TO-F-EXECUTION-STATUS.md`](./A-TO-F-EXECUTION-STATUS.md)
