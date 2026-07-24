---
adr_id: ADR-013
title: Payment provider event Map is a v1 cache over durable attempt dedupe
status: accepted
created_date: 2026-07-23
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: false
---

# Context

Provider callbacks must be replay-safe by tenant and provider event ID. The in-memory payment
repository uses a `providerEvents` `Map` for tests and local fallback. The Postgres adapter also
keeps this map as a read-through cache, while `app.payment_attempts` stores provider event IDs and
enforces a unique `(tenant_id, provider_event_id)` index.

# Decision

Keep `providerEvents` as a **process-local cache/fallback for v1**. The durable Postgres source of
truth is `app.payment_attempts` and its tenant-scoped unique provider-event index.

- Always key the map with both `tenant_id` and `provider_event_id`.
- Treat a process restart or cache miss as normal; consult the durable attempt records in the
  Postgres adapter.
- Do not introduce a second `provider_events` table while `payment_attempts` provides the required
  dedupe record.
- Keep callback amount, currency, payment-state, signature, and idempotency checks unchanged.

# Alternatives considered

| Alternative | Benefits | Costs/Risks | Rejection reason |
|---|---|---|---|
| Remove the map everywhere | One source in application code | In-memory tests and hot-path replay lose their simple store | No benefit while the adapter contract supports the cache |
| Add a separate provider-events table | Explicit webhook record lifecycle | Duplicate source, migration, retention, and reconciliation paths | `payment_attempts` already owns provider event dedupe |
| Map only, without durable index | Minimal code | Duplicate callbacks can cross process boundaries | Violates replay safety under scale-out |

# Consequences

## Positive

The v1 implementation stays small while Postgres provides cross-process replay protection and the
existing in-memory tests remain deterministic.

## Negative / trade-offs

The cache is not durable and can be stale until the payment record is reloaded. Callback handling
must continue to rely on the database uniqueness boundary rather than a map-only pre-check.

## Operational impact

Monitor provider callback duplicate/replay and unique-constraint failures. Reassess if callback
throughput or provider evidence retention requires a dedicated event store.

## Security/privacy impact

The key includes tenant identity, and provider event payloads must not be logged or exposed through
the cache. Existing signature verification, amount/currency checks, and payment permissions remain
mandatory.

## Migration and rollback

No migration is required for this decision; the existing `payment_attempts` index is the durable
boundary. Roll back by removing only the cache optimization after measuring its impact.

# Verification

- Payment callback tests cover duplicate provider event replay and amount/currency mismatch.
- Postgres migration tests verify the unique tenant/provider-event index.
- In-memory tests continue to exercise the `providerEvents` map with tenant-qualified keys.
