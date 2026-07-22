---
ticket_id: BE-INV-002
title: Balance query/read DTO/indexes
owner: Backend AI Agent
phase: P4
risk: high
status: done
---

# Completion manifest

- Contracts changed: none (frozen OpenAPI InventoryResource reused; balance fields exposed as extensions)
- Migration: indexes in `000015_inventory_schema.sql`
- Tests/evidence: `modules/inventory/src/application/inventory.test.ts` (BE-INV-002 balances)
- Application: `listBalances` with `available_to_sell` derived per blueprint §7.8.2
