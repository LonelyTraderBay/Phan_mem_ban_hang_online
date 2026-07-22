---
ticket_id: BE-INV-005
title: Release/extend/expire/convert state machine
owner: Backend AI Agent
phase: P4
risk: high
status: done
---

# Completion manifest

- Application: `releaseInventoryReservation`, `extendInventoryReservation`, `convertInventoryReservation`
- State machine per `docs/domain/state-machine-transition-matrices.md` (active→released/expired/converted)
- Tests/evidence: `inventory.test.ts` (release idempotency, extend, convert, owner mismatch)
- Error codes: `INVENTORY_RESERVATION_*` from error catalog only
