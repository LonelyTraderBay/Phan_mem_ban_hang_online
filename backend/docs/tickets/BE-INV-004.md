---
ticket_id: BE-INV-004
title: Reservation create with deterministic locks
owner: Backend AI Agent
phase: P4
risk: high
status: done
---

# Completion manifest

- Application: `createInventoryReservation` with lock order `(warehouse_id, variant_id)`
- Tests/evidence: `inventory.test.ts` (reserve happy path, insufficient stock)
- In-memory tenant mutex serializes concurrent balance mutations
