# ADR-014 — Redis on staging v1

**Status:** Accepted (agent default 2026-07-24; HO may supersede)  
**Context:** `preflight-staging-env.mjs` warns when `REDIS_URL` unset/local. Staging Auth0 + API health do not require Redis today.

## Decision

**Staging v1:** Redis is **optional / N/A**.

- API OIDC BFF, migrate, and `/health` run without Redis.
- Worker/scheduler/BullMQ remain **best-effort** when `REDIS_URL` is unset — do not claim multi-instance queue durability on Free staging.
- Preflight **warn** (not fail) is expected and acceptable for v1.

## Consequences

- Positive: stays inside cloud cap; no blocked cutover on Redis spend.
- Negative: no shared SSE fan-out / durable jobs across instances until HO sets managed Redis.
- Upgrade path: HO provides managed Redis URL → set Fly secret `REDIS_URL` → re-preflight → document PASS.

## Supersede

HO reply *“Redis staging = &lt;URL&gt;”* or *“Redis required before prod”* replaces this ADR.
