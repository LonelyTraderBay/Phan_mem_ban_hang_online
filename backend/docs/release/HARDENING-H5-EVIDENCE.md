# Hardening H5 — CI staging-preflight evidence

**Date:** 2026-07-23  
**Workflow:** [`.github/workflows/staging-preflight.yml`](../../../.github/workflows/staging-preflight.yml)  
**Run:** https://github.com/LonelyTraderBay/Phan_mem_ban_hang_online/actions/runs/30022549558

> **Current API host (2026-07-24):** `https://phan-mem-ban-hang-online-api.fly.dev` — legacy `ai-sales-api-staging` Fly app was destroyed. Set `STAGING_API_BASE_URL` to the canonical URL for new runs.

| Job | Result |
|---|---|
| gate (`confirm_phase_a=PASS`) | **PASS** |
| migrate (`STAGING_DATABASE_URL`) | **PASS** |
| health (`STAGING_API_BASE_URL` = Fly) | **PASS** — `https://ai-sales-api-staging.fly.dev/health` *(historical run URL; legacy app since destroyed)* |
| deploy_note | **PASS** |

**Ticket:** `BE-FND-014` — CI path green; attach run URL above.
