# FE-W2-W3 — Onboarding, Inventory, Knowledge, Inbox, Channels shells

**Status:** READY-MOCK  
**Date:** 2026-07-23  
**Scope:** Wave 2+3 feature folders for `@ai-sales/web-admin`

## Delivered

### Wave 2

- [x] `features/onboarding/` — `OnboardingRoute`: wizard UI (workspace → channel → product → done), local state only (no onboarding API in contract)
- [x] `features/inventory/` — `InventoryRoute` (`GET /inventory/balances`), `MovementsRoute` (`GET /inventory/movements`), `PermissionGate` `inventory.read`
- [x] `features/knowledge/` — `KnowledgeRoute` (`GET /knowledge/sources`), `PermissionGate` `knowledge.read`

### Wave 3

- [x] `features/inbox/` — `InboxRoute`: list + `:conversationId` detail panel (`GET /conversations`, `GET /conversations/:id`)
- [x] `features/channels/` — `ChannelsRoute` (`GET /channels/accounts`), account-resource health detail at `/channels/:channelId/health`

### Wiring

- [x] `routeManifest.tsx` imports real feature routes (not `placeholders/*`)
- [x] MSW overrides: `inventoryHandlers`, `knowledgeHandlers`, `channelHandlers`, `conversationHandlers` in `@ai-sales/test-utils`
- [x] Session bootstrap fixture adds `inventory.read`, `knowledge.read`, `channel.read`, `conversation.read`

## Contract paths used

| Feature | OpenAPI path | Permission |
| --------- | ------------ | ---------- |
| Inventory balances | `GET /inventory/balances` | `inventory.read` |
| Inventory movements | `GET /inventory/movements` | `inventory.read` |
| Knowledge | `GET /knowledge/sources` | `knowledge.read` |
| Inbox | `GET /conversations`, `GET /conversations/{id}` | `conversation.read` |
| Channels | `GET /channels/accounts` | `channel.read` |
| Channel health | `GET /channels/accounts/{account_id}` | `channel.read` |
| Onboarding | — (UI-only wizard) | authenticated |

## Verify locally

```sh
pnpm --filter @ai-sales/web-admin typecheck
```

With MSW: `VITE_PUBLIC_ENABLE_MSW=true pnpm dev:web-admin`

## Not in scope

- Onboarding persistence / tenant bootstrap API
- Inventory adjustments, reservations, reconciliation flows
- Knowledge create/edit/review/publish
- Inbox reply, assign, AI suggestions
- Channel connect OAuth and `refresh-health` POST
