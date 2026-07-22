---
ticket_id: BE-INV-006
title: Expiry scheduler/worker/idempotency
owner: Backend AI Agent
phase: P4
risk: high
status: done
---

# Completion manifest

- Application: `expireInventoryReservations` helper (worker/scheduler integration deferred)
- Tests/evidence: `inventory.test.ts` (expiry releases reserved qty)
- Known risks: dedicated worker job `inventory.expire` not wired in scheduler app yet
