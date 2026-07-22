# ADR-FE-016: Offline writes

**Status:** Accepted

## Context

Queuing writes made while offline (e.g. "send this message when back online") is tempting for UX
but dangerous for money/inventory/order operations: a queued write can double-send, act on stale
price/inventory, or conflict silently with a change made elsewhere while offline.

## Decision

No generic offline write queue at MVP. Reads may show cached data with a staleness badge (spec
13.5); confirm/reserve/payment/shipment/AI-send/permission-change/support-elevation/feature-flag
writes are explicitly disallowed offline (spec 13.5's "Disallowed offline" list) — the UI must
block these actions rather than queue them.

## Consequences

- `packages/state`'s `createPersistenceAdapter` only persists namespaced, TTL'd, non-PII data
  (drafts, UI preferences) — there is no write-queue/outbox primitive in F00.
- Spec 13.7 defines the exact preconditions (client operation ID, idempotency key, server
  duplicate detection, payload expiry, revalidation rule, user-visible pending/cancel/retry state,
  ordering rule, conflict rule, tested against network-loss/crash/restart) a feature must satisfy
  before it's allowed to add an outbox for one specific write — "if any one is missing, only save
  a draft, do not queue a send" (spec 13.7). No feature has met this bar yet.
