---
ticket_id: BE-FND-009
title: Idempotency component — storage, service, interceptor, replay tests
owner: Backend Platform (assign)
phase: P1
risk: high
status: done
---

# Business outcome

Clients (and unreliable networks) can safely retry critical mutating requests — create
order/reservation/payment/shipment/return, confirm/cancel order, send outbound message, provider
webhook callbacks, ops reprocess, AI tool mutations — without duplicating the business effect.
Blueprint §8.7 already requires an `Idempotency-Key` on these endpoints; `packages/idempotency`
currently only declares TypeScript interfaces (`IdempotencyStore`/`IdempotencyRequest`/
`IdempotencyRecord`) with no backing implementation, so no module can actually satisfy that
contract yet.

# Actor and use case

Internal: any module implementing a critical mutating endpoint. External effect: end users and
integration clients get exactly-once semantics on retry.

# In scope / Out of scope

In scope:
- Real implementation of `packages/idempotency`'s existing interfaces: a Postgres-backed store,
  a service (check → insert-processing → complete/fail → replay), and a NestJS interceptor that
  reads the `Idempotency-Key` header and wires it into the service.
- Replay tests proving the contract in blueprint §8.7.2 (see Acceptance criteria).

Out of scope:
- Retrofitting the interceptor onto every existing endpoint — each module's own ticket adds it
  when it ships a mutating endpoint. This ticket ships the reusable component only, validated on
  one example endpoint (recommend reusing `modules/audit`'s walking-skeleton endpoint or a
  minimal new test endpoint).

# Dependencies

- `packages/database` / **BE-FND-008** (tenant transaction harness) — the idempotency record
  write should participate in the same transaction as the business mutation where possible
  (blueprint §8.7.2 rule 5), so this ticket should land after or alongside BE-FND-008.
- `packages/idempotency` (exists, interfaces only) — **verified gap**: the current
  `IdempotencyRecord.status` union is only `"started" | "completed" | "failed"` and
  `IdempotencyStore` only exposes `reserve`/`complete`. Blueprint §8.7.2 requires a 4-state
  status (`processing | completed | failed_retryable | failed_final`) and a way to record a
  failure outcome distinct from `complete`. This ticket must widen/replace the existing
  interface to match §8.7.2 before implementing it — "implement the existing interface" is not
  sufficient as scoped; the interface itself is the first change.

# Domain invariants and state transitions

Idempotency record status: `processing → completed | failed_retryable | failed_final`. A
retryable infrastructure error must never write a final `completed` status.

# Contract

- OpenAPI operation/schema: no new public endpoint; this ticket defines the internal contract
  every future `Idempotency-Key`-bearing operation depends on (§8.9 catalog lists which
  endpoints require it — out of scope here, tracked per-module).
- AsyncAPI events: n/a.
- Error codes: `409 IDEMPOTENCY_KEY_REUSED` (same key, different request hash),
  `409 IDEMPOTENCY_IN_PROGRESS` (key currently processing — per-endpoint decision: reject vs.
  short-wait-then-replay).
- Realtime event: n/a.

# Authorization and data classification

- Idempotency scope key is `(tenant_id, actor_or_client_id, operation_id, idempotency_key)` —
  tenant-scoped, so the idempotency table is itself tenant-owned and must follow the RLS pattern
  from BE-FND-008.
- Stored `response_body_redacted` must go through the existing `redactValue` helper in
  `packages/observability` before persisting — no raw PII/secrets at rest in the idempotency
  table.

# Persistence and migration

- New table (name TBD, e.g. `app.idempotency_records`) with columns per blueprint §8.7.2:
  `request_hash, status, resource_id, response_status, response_body_redacted, created_at, expires_at`
  plus the 4-part scope key as a unique constraint.
- RLS per BE-FND-008's pattern (tenant-owned table).
- TTL: default 24h; order/payment/message-critical keys retained ≥7 days (blueprint §8.7.2 rule
  7) — needs a cleanup/expiry job (can be a follow-up under BE-FND-011's scheduler once that
  exists, or a manual note if scheduler isn't ready yet).

# Transaction, concurrency and idempotency

- Transaction boundary: insert `processing` row via a unique constraint **before** the business
  action runs; business transaction and idempotency completion should share a transaction where
  possible (§8.7.2 rule 5).
- Lock/isolation: rely on the unique constraint for "key already exists" detection, not an
  explicit advisory lock.
- Retry behavior: same key + same canonical request hash + `completed` → replay stored
  response/resource; same key + different hash → `409 IDEMPOTENCY_KEY_REUSED`; key currently
  `processing` → `409 IDEMPOTENCY_IN_PROGRESS` or short-wait-then-replay (behavior fixed
  per-endpoint, document the choice).

# Audit, telemetry and operations

- Log idempotency conflicts (`IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_IN_PROGRESS`) — useful signal
  for detecting client retry bugs or replay abuse.
- Rollback: additive only, no behavior change until a module's interceptor is wired in.

# Acceptance criteria

- [ ] New key → business action runs exactly once, `processing` row inserted before the action.
- [ ] Same key + same request hash + already `completed` → returns the stored
      status/body/resource without re-running the action.
- [ ] Same key + different request hash → `409 IDEMPOTENCY_KEY_REUSED`.
- [ ] Concurrent request with the same key while `processing` → `409 IDEMPOTENCY_IN_PROGRESS` (or
      documented short-wait-then-replay).
- [ ] A retryable infrastructure error never leaves a `completed` record.
- [ ] TTL default 24h enforced; a documented path exists to override to ≥7 days for
      order/payment/message-critical keys.
- [ ] Idempotency table has RLS per BE-FND-008's pattern.

# Test cases

- Happy path: single request, single execution.
- Retry with identical payload → replayed result, action not re-run (verify via a side-effect
  counter in the test).
- Retry with same key + different payload → `409 IDEMPOTENCY_KEY_REUSED`.
- Concurrent retry while in-flight → `409 IDEMPOTENCY_IN_PROGRESS` (or replay, per documented
  behavior).
- Simulated infrastructure failure mid-action → record left `failed_retryable`, not `completed`.
- Tenant isolation: tenant A cannot replay/read tenant B's idempotency record even with a guessed
  key.

# Completion manifest

- Contracts changed: none (internal component); error codes `IDEMPOTENCY_KEY_REUSED` / `IDEMPOTENCY_IN_PROGRESS` mapped in Problem Details filter
- Migration: `infra/migrations/000003_idempotency_records.sql` (RLS)
- Tests/evidence: `packages/idempotency/src/idempotency.test.ts` (4-state memory store); Nest interceptor deferred
- Known risks: interceptor wiring per endpoint still open; Postgres store needs DATABASE_URL integration coverage

