# Staging deploy workflow (BE-FND-014)

**Status:** Workflow wired for **manual** migrate + health — **does not** auto-deploy Fly or touch production.  
Requires Phase A confirmation input + GitHub Environment `staging` secrets after HO fills them.

> **Legacy Fly apps** `ai-sales-*-staging` were **destroyed**. Canonical staging hostnames are in [`NAMING-PHAN-MEM-BAN-HANG-ONLINE.md`](./NAMING-PHAN-MEM-BAN-HANG-ONLINE.md).

## Canonical Fly staging URLs

| Role | App | Base URL |
|---|---|---|
| API | `phan-mem-ban-hang-online-api` | `https://phan-mem-ban-hang-online-api.fly.dev` |
| Web Admin | `phan-mem-ban-hang-online-web` | `https://phan-mem-ban-hang-online-web.fly.dev` |
| Super Admin | `phan-mem-ban-hang-online-ops` | `https://phan-mem-ban-hang-online-ops.fly.dev` |
| IdP interim | `phan-mem-ban-hang-online-oidc` | `https://phan-mem-ban-hang-online-oidc.fly.dev` |

## Required GitHub Environment `staging` secrets

| Secret | Purpose |
|---|---|
| `STAGING_DATABASE_URL` | Migrate |
| `STAGING_API_BASE_URL` | Health check (`/health`) — e.g. `https://phan-mem-ban-hang-online-api.fly.dev` |
| `OIDC_CLIENT_SECRET` | Reserved for future OIDC smoke job — never echo in logs |

## Optional secrets

| Secret | Purpose |
|---|---|
| `FLY_API_TOKEN` | Fly deploy from CI — **not required today**. When absent, the workflow **skips** automated deploy and prints `deploy_note` only (manual deploy per [`staging-fly-deploy.md`](./staging-fly-deploy.md)). Add this secret when HO wants CI-driven `fly deploy`. |

## Required variables (optional)

| Variable | Example |
|---|---|
| `STAGING_WEB_ADMIN_URL` | `https://phan-mem-ban-hang-online-web.fly.dev` |

## Workflow

See [`.github/workflows/staging-preflight.yml`](../../../.github/workflows/staging-preflight.yml):

- `workflow_dispatch` only (no auto prod).
- Input `confirm_phase_a` must be `PASS` (after checklist mục 4).
- Jobs: gate → migrate (`node tools/migrate.mjs`) → `GET /health`.
- **Deploy:** optional `deploy` job when workflow input `run_fly_deploy=true` and `secrets.FLY_API_TOKEN` is set on Environment `staging` (skips with exit 0 when token absent); otherwise manual per [`staging-fly-deploy.md`](./staging-fly-deploy.md).

## After Phase A PASS

1. HO creates GitHub Environment `staging` + secrets.
2. Run workflow once with `confirm_phase_a=PASS`.
3. Evidence in OUTBOX (no secrets); propose `BE-FND-014` Done + HO ack.

## Related tickets

- `BE-FND-015` staging infra (migrate already PASS on Supabase; full cutover still needs secrets/HTTPS)
- `BE-FND-014` CI/CD
- [`staging-cutover.md`](./staging-cutover.md)
- [`A-TO-F-EXECUTION-STATUS.md`](./A-TO-F-EXECUTION-STATUS.md)
