# Contract Gaps — Billing and notification preferences

**Status:** OPEN for UI integration  
**Scope:** `/billing` and `/settings/notifications`

## Billing

The backend exposes frozen billing operations, but this READY-MOCK shell does not bind plan,
usage, or mutation fields until the frontend integration slice is approved and synced. Keep the
route as `EmptyState`; do not add price, meter, invoice, or upgrade fields from the design sketch.

## Notification preferences

The tenant OpenAPI has no frozen notification-preference resource or update operation. Keep the
route as `EmptyState` and add controls only for fields introduced by a future contract.

When the contract is ready, update the route, generated client/types, permissions, error mapping,
and this document together.
