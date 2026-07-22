---
ticket_id: BE-INV-003
title: Adjustment command/reason/approval/audit
owner: Backend AI Agent
phase: P4
risk: high
status: done
---

# Completion manifest

- Contracts changed: none
- Application: `createInventoryAdjustment`, `getInventoryAdjustment` — appends ledger movement + updates balance
- Tests/evidence: `inventory.test.ts` (adjustment, negative stock, idempotency, audit)
- Known risks: approval threshold / evidence file deferred (schema columns present, app logic minimal)
