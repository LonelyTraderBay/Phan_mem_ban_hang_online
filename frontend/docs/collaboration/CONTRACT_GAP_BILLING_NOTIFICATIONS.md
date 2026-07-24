# Contract Gaps — Billing and notification preferences

**Status:** Billing **BOUND** (2026-07-24 go-live wave) · Notifications still **OPEN** (no OpenAPI resource)  
**HO unlock:** approved — see [`HO-NEXT-P0-P2.md`](../../../backend/docs/release/HO-NEXT-P0-P2.md)  
**Scope:** `/billing` and `/settings/notifications`

## Billing

Web Admin `/billing` binds frozen ops:

- `GET /billing/plan` — plan, seats, period, usage meters
- `POST /billing/subscription/manual-update` — when actor has `billing.manage` (+ Idempotency-Key)

Do **not** add invoice, price list, or payment-method fields beyond `BillingResource` in OpenAPI.

## Notification preferences

The tenant OpenAPI has no frozen notification-preference resource or update operation. Keep the
route as `EmptyState` and add controls only for fields introduced by a future contract.

When the contract is ready, update the route, generated client/types, permissions, error mapping,
and this document together.
