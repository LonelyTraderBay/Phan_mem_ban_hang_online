# Audit module

## Purpose

Append-only audit log and walking skeleton golden path (BE-FND-012, BE-FND-016).

## Golden path (BE-FND-016)

End-to-end trace: **request security context → tenant transaction → audit append → outbox append**.

```
POST /api/v1/_internal/walking-skeleton/trace
Headers:
  X-Correlation-Id: <uuid>
  X-Tenant-Id: <uuidv7>
  X-Actor-Id: <uuidv7>
  X-Permissions: audit.read
Body: { "message": "hello" }
```

Requires `WALKING_SKELETON_ENABLED=true` and `DATABASE_URL` set. Migration: `infra/migrations/000002_walking_skeleton.sql`.

## Owned data

- `app.audit_events`
- `app.outbox_events` (walking skeleton publisher stub)

## OpenAPI tags

Audit

## Task IDs

BE-FND-012, BE-FND-016, BE-IDN-013

## Agent read order

1. This README
2. `docs/tickets/BE-FND-016.md`
3. `pnpm agent:context BE-FND-016`
4. Code: `src/infrastructure/persistence/walking-skeleton.persistence.ts`
