# Hardening H5 — CI staging-preflight evidence

**Date:** 2026-07-24 (latest) · prior: 2026-07-23  
**Workflow:** [`.github/workflows/staging-preflight.yml`](../../../.github/workflows/staging-preflight.yml)

## Latest run (canonical hosts)

**Run:** https://github.com/LonelyTraderBay/Phan_mem_ban_hang_online/actions/runs/30068221660  
**Inputs:** `confirm_phase_a=PASS`, migrate=true, health=true, `run_fly_deploy=false`

| Job | Result |
|---|---|
| gate | **PASS** |
| migrate | **PASS** |
| health | **PASS** (`STAGING_API_BASE_URL` → `phan-mem-ban-hang-online-api`) |
| deploy_note | **PASS** (deploy skipped — input false) |
| deploy | skipped |

**Ticket:** `BE-FND-014` — CI path green on renamed Fly app.

## Historical run (legacy URL)

**Run:** https://github.com/LonelyTraderBay/Phan_mem_ban_hang_online/actions/runs/30022549558  
Health historically hit `ai-sales-api-staging.fly.dev` — app since destroyed. Prefer latest run above.
