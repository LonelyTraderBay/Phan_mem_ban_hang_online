# Contract Gaps — Billing and notification preferences

**Status:** HO-APPROVED bind (2026-07-24) — FE may implement UI bind when scheduling the slice; keep EmptyState until then.  
**HO unlock:** filled via HO ủy quyền tiêu chuẩn — see [`HO-NEXT-P0-P2.md`](../../../backend/docs/release/HO-NEXT-P0-P2.md)  
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
