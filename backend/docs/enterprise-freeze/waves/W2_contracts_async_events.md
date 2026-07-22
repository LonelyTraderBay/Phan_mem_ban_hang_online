# W2 — AsyncAPI (events)

**Status:** Done  
**Completed:** 2026-07-22  
**Depends on:** W1 Done

## Exit criteria

- [x] Tenant domain events cover blueprint §9.8 catalog with **typed `data` payloads** (no open `additionalProperties: true` on event data)
- [x] `ops-events` no longer an empty stub — 10 ops-scoped events in `channels.opsEvents`
- [x] AsyncAPI validate pass (BE `pnpm contracts:validate` + FE sync/validate)

## Evidence

- Tool: `tools/w2-freeze-asyncapi.mjs`
- Inventory: `docs/enterprise-freeze/inventory/asyncapi_event_coverage.csv`
- BE channels: `domainEvents` (34), `realtimeEvents` (+ `system.resync_required`), `opsEvents` (10)
- Schemas: `EventEnvelopeBase` + per-event `*Data` / `*Event` (orderConfirmed embeds HO VAT 10% inclusive)
- FE: `contracts:sync` writes real `ops-events.yaml`; `contracts:validate` asserts non-empty ops messages
- Sync script: `frontend/tooling/scripts/sync-backend-contracts.mjs` `syncAsyncApi()` updated

## Ops event types (frozen)

- `com.aisales.ops.alert.raised.v1` / `.acknowledged.v1`
- `com.aisales.ops.support_access.granted.v1` / `.revoked.v1`
- `com.aisales.ops.tenant_ai.disabled.v1`
- `com.aisales.ops.feature_flag.changed.v1`
- `com.aisales.ops.dlq.reprocess_requested.v1`
- `com.aisales.ops.ai.kill_switch.activated.v1`
- `com.aisales.ops.channel.health_critical.v1`
- `com.aisales.ops.entitlement.limit_exceeded.v1`
