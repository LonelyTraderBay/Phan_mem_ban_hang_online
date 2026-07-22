---
ticket_id: BE-INV-001
title: Warehouse/balance/movement/reservation schema + constraints/RLS
owner: Backend AI Agent
phase: P4
risk: critical
status: done
---

# Business outcome

Land `infra/migrations/000015_inventory_schema.sql`: `warehouses`, `inventory_balances`,
`inventory_movements`, `inventory_reservations`, `inventory_reservation_items`,
`inventory_adjustments` — all TENANT_OWNED with FORCE RLS (template A).
`inventory_movements` is append-only (no `UPDATE`/`DELETE` grant). Quantities use
`NUMERIC(18,6)` per blueprint §7.8 — never floating point.

Primary paths: `modules/inventory/`, `infra/migrations/000015_inventory_schema.sql`.

# Acceptance criteria

- [x] Happy path matches contract + backlog deliverable — schema-only deliverable
- [N/A] Validation / business conflict codes — no endpoint in this ticket
- [x] Permission + tenant isolation tests — structural artefact + DB-gated RLS integration
- [N/A] Idempotency / retry — no mutator endpoint in this ticket
- [N/A] Transaction rollback / concurrency — no application transaction in this ticket
- [N/A] Audit / outbox / domain events — no mutation path in this ticket
- [x] Contract / generated client note — no OpenAPI change required for schema-only
- [ ] Staging smoke checklist item when phase reaches staging

# Completion manifest

- Contracts changed: none (schema-only)
- Migration: `infra/migrations/000015_inventory_schema.sql`
- Tests/evidence: `packages/database/src/inventory-rls.integration.test.ts` (structural always runs;
  live RLS/uniqueness cases skip without `DATABASE_URL`)
- Known risks: Postgres adapter deferred to follow-up; worker scheduler for expiry is in-memory helper only
