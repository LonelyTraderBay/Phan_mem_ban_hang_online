# Walking skeleton runbook (BE-FND-016)

Golden path: **security context → tenant transaction → audit append → outbox append**.

## Prerequisites

1. PostgreSQL reachable via `DATABASE_URL`
2. Apply migrations: `pnpm migrate`
3. API env:
   - `WALKING_SKELETON_ENABLED=true`
   - `DATABASE_URL=postgres://...`

## Trace request

```http
POST /api/v1/_internal/walking-skeleton/trace
X-Correlation-Id: 00000000-0000-4000-8000-000000000001
X-Tenant-Id: 018f65fd-7c6b-7c2a-9c8f-46e0f7a1f0a1
X-Actor-Id: 018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a
X-Permissions: audit.read
Content-Type: application/json

{"message":"hello"}
```

Expect `200` with `{ "data": { "auditId", "outboxEventId", "correlationId", "action" } }`.

Missing headers or missing `audit.read` → RFC 9457 `application/problem+json` (`403`).

## Outbox publish

Worker (`pnpm dev:worker`) polls unpublished `app.outbox_events` with `FOR UPDATE SKIP LOCKED` and sets `published_at`. Prefer connecting as `app_worker` (see `000004_inbox_and_worker_publisher.sql`).

## Related tickets

BE-FND-008 (tenant harness), BE-FND-010/011 (outbox/worker), BE-FND-012 (audit redact), BE-FND-004 (problem details).
