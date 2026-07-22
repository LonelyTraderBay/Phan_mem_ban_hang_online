---
ticket_id: BE-INV-008
title: High-contention/concurrency/property tests
owner: Backend AI Agent
phase: P4
risk: high
status: done
---

# Completion manifest

- Tests/evidence: `modules/inventory/src/application/inventory.concurrency.test.ts`
- Parallel reservation attempts cannot drive `available_to_sell` below zero
- Idempotency replay covered for warehouse create (sequential)
