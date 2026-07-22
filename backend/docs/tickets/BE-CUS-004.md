---
ticket_id: BE-CUS-004
title: Merge preview/merge transaction/history
owner: Backend AI Agent
phase: P3
risk: medium
status: done
---

# Business outcome

Merge preview/merge transaction/history.

Primary paths: `modules/customer/`.

# Actor and use case

Actors with `customer.merge` preview a merge set (no mutation), then confirm with a deterministic
`confirmation_token` checksum + `Idempotency-Key` to execute an atomic merge: sources marked
`merged`, identities reassigned to survivor, field resolution (survivor wins then first source),
`customer_merge_history` append, outbox `com.aisales.customer.merged.v1`.

# In scope / Out of scope

In scope:
- `POST /customers/merge-preview` (`previewCustomerMerge`)
- `POST /customers/merge` (`mergeCustomers`) with idempotency
- Merge history + outbox event (in-memory until Postgres adapter)
- Error `CUSTOMER_MERGE_CONFLICT`
- Permission `customer.merge`

Out of scope:
- FE UI
- Rewriting immutable historical order/conversation snapshots (repoint only when adapters exist)
- Inventing OpenAPI fields beyond freeze (token is computed client-side; Meta is sealed)

# Dependencies

- BE-CUS-002 / BE-CUS-003 Done
- Schema `customer_merge_history` + `merged_into_customer_id` from `000011`

# Domain invariants and state transitions

- Never trust client `tenant_id` for authorization; set tenant context server-side.
- Lock survivor + sources by ID order inside `executeMerge`.
- Sources/survivor must be `active`; no self-merge; merge_ids unique.
- No hard DELETE of source customers.
- Same Idempotency-Key returns same survivor result.

# Contract

- OpenAPI: `previewCustomerMerge`, `mergeCustomers` (frozen)
- AsyncAPI: `com.aisales.customer.merged.v1`
- Error: `CUSTOMER_MERGE_CONFLICT` (+ existing validation/not-found/idempotency codes)
- Permission: `customer.merge`

# Authorization and data classification

- Required permission: `customer.merge`
- Tenant isolation on all lookups
- PII field masking via existing `toCustomerResponseData` / `customer.pii.read`

# Persistence and migration

- Tables: existing `app.customers.merged_into_customer_id`, `app.customer_merge_history` (`000011`)
- Migration: none for this ticket
- In-memory adapter implements history + outbox until Postgres merge adapter

# Transaction, concurrency and idempotency

- Preview: no mutation
- Merge: single `executeMerge` transaction boundary; Idempotency-Key required
- `confirmation_token` = `sha256("v1|{survivor}|{sorted merge_ids}").hex[:32]` via `computeMergeConfirmationToken`

# Audit, telemetry and operations

- Merge history row per source (actor, correlation, field_resolution)
- Outbox event `com.aisales.customer.merged.v1` with `source_ids` + `target_id`

# Acceptance criteria

- [x] Happy path matches contract + backlog deliverable
- [x] Validation / business conflict codes from error catalog
- [x] Permission + tenant isolation tests (deny cross-tenant)
- [x] Idempotency / retry where mutator is critical
- [x] Transaction rollback / concurrency when applicable (in-memory atomic executeMerge)
- [x] Audit / outbox / domain events as required
- [x] Contract / generated client note for FE sync
- [ ] Staging smoke checklist item when phase reaches staging

# Test cases

- preview does not mutate
- merge fills survivor blanks + tags; marks source merged; history + outbox
- idempotent replay
- bad confirmation_token → VALIDATION_FAILED
- already-merged source → CUSTOMER_MERGE_CONFLICT
- no customer.merge → INSUFFICIENT_PERMISSION
- cross-tenant merge_id → RESOURCE_NOT_FOUND

# Preflight (2026-07-22)

| Item | Value |
|------|--------|
| Domain | CUS / P3 |
| Operations | `previewCustomerMerge`, `mergeCustomers` |
| Permission | `customer.merge` |
| Idempotency | merge required; preview not-required |
| Migration | none (uses 000011) |
| Error added | `CUSTOMER_MERGE_CONFLICT` |
| Rollback | route off; keep history rows |

# Completion manifest

- Contracts changed: `error_catalog.csv` (+`CUSTOMER_MERGE_CONFLICT`); OpenAPI/AsyncAPI unchanged
- Migration: none
- Tests/evidence:
  - `pnpm exec vitest run modules/customer` — 20/20 pass
- Known risks: in-memory merge only; FE must use `computeMergeConfirmationToken` algorithm (or shared util after contracts sync); Postgres adapter still TODO
