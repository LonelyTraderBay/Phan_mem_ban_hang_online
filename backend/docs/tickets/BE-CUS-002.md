---
ticket_id: BE-CUS-002
title: Customer CRUD/search/PII field masking
owner: Backend AI Agent
phase: P3
risk: medium
status: done
---

# Business outcome

Customer CRUD/search/PII field masking.

Primary paths: `modules/customer/`.

# In scope / Out of scope

In scope:
- `listCustomers`, `createCustomer`, `getCustomer`, `updateCustomer`
- PII field omit via `applyFieldPolicies` / `customer.pii.read`
- ETag on get/create/update; If-Match or `expected_version` on update
- Idempotency-Key on create (in-memory replay)

Out of scope:
- Identities/addresses/tags/notes (CUS-003+)
- Merge / privacy export / anonymize (CUS-004 / HRD)
- Postgres adapter / KMS envelope encryption (deferred; in-memory plaintext for READY-MOCK)

# Acceptance criteria

- [x] Happy path matches contract + backlog deliverable
- [x] Validation / business conflict codes from error catalog
- [x] Permission + tenant isolation tests (deny cross-tenant)
- [x] Idempotency / retry where mutator is critical
- [x] Transaction rollback / concurrency when applicable (version mismatch → 412)
- [ ] Audit / outbox / domain events as required (deferred with Postgres)
- [x] Contract / generated client note for FE sync (no contract change)
- [ ] Staging smoke checklist item when phase reaches staging

# Completion manifest

- Contracts changed: none
- Migration: none (uses 000011 schema when Postgres adapter lands)
- Tests/evidence: `modules/customer/src/application/customers.test.ts`
- Known risks: in-memory store; PII not encrypted at rest in process memory; blind-index search not in frozen listCustomers query params

# Freeze provenance

- Generated/updated: 2026-07-22 (enterprise freeze W5); implemented 2026-07-22
- Backlog status: Done
- Source: `backend_doc/matrices/implementation_backlog.csv`
