---
ticket_id: BE-CUS-003
title: Identity attach/dedupe rules
owner: Backend AI Agent
phase: P3
risk: medium
status: done
---

# Business outcome

Attach email/phone/external identities to a customer with tenant-scoped dedupe: the same normalized identity cannot belong to two active customers in one tenant. Conflict surfaces as merge candidates later (BE-CUS-004).

Primary paths: `modules/customer/`, `infra/migrations/000013_customer_identity_dedupe.sql`.

# Actor and use case

- Staff with `customer.write` calls `POST /api/v1/customers/{customer_id}/identities` (`addCustomerIdentity`).
- System normalizes + hashes the value; attaches if free; rejects if owned by another customer.

# In scope / Out of scope

In scope:
- `addCustomerIdentity` application + HTTP + in-memory repo
- Dedupe on `(tenant_id, identity_type, normalized_value_hash)`
- Idempotent replay via Idempotency-Key; same identity on same customer → success
- Error `CUSTOMER_IDENTITY_CONFLICT` (409) in error catalog
- Unique index migration `000013`
- Permission negative + tenant isolation + conflict tests

Out of scope:
- Merge preview/transaction (BE-CUS-004)
- FE UI
- Postgres adapter (in-memory until later)
- Inventing provider/channel fields beyond OpenAPI `type` + `value`

# Dependencies

- FULL_PRODUCT_DOC_FREEZE=PASS
- BE-CUS-001 / BE-CUS-002 done
- OpenAPI: `addCustomerIdentity` frozen (W1)

Money N/A.

# Domain invariants

- Never trust client `tenant_id` for authorization.
- No hard-delete of identities in this ticket (attach only).
- Merged/anonymized customers cannot receive new identities.

# Contract

- OpenAPI: `addCustomerIdentity` — `x-permission: customer.write`, `x-idempotency: required`
- Request: `{ type: email|phone|external, value: string }`
- Response: `CustomerResource` wrapper (existing schemas)
- Error: `CUSTOMER_IDENTITY_CONFLICT` (new), plus existing `RESOURCE_NOT_FOUND`, `VALIDATION_FAILED`, `INSUFFICIENT_PERMISSION`, `IDEMPOTENCY_KEY_REQUIRED`

# Authorization and data classification

- Permission: `customer.write`
- Tenant/RLS: `customer_identities` already FORCE RLS (000011)
- PII: identity values hashed at rest in identity row (`normalized_value_hash`); raw value not logged

# Persistence and migration

- `000013_customer_identity_dedupe.sql` — unique index on `(tenant_id, identity_type, normalized_value_hash)`
- No backfill

# Transaction, concurrency and idempotency

- Idempotency-Key required on attach
- Same key → replay same customer response
- Concurrent attach of same identity to two customers: unique index / repo check → conflict

# Audit, telemetry and operations

- Audit/outbox deferred until shared customer audit port lands (same pattern as CUS-002)
- Rollback: disable route; index is expand-only

# Acceptance criteria

- [x] Happy path attach email/phone/external
- [x] Conflict when identity belongs to another customer
- [x] Same customer re-attach is idempotent success
- [x] Permission + tenant isolation tests
- [x] Idempotency-Key required
- [x] Contract note for FE: re-sync error catalog after merge
- [ ] Staging smoke when phase reaches staging

# Test cases

- attach email → listed under customer
- duplicate hash other customer → CUSTOMER_IDENTITY_CONFLICT
- same customer + same value → 200 idempotent
- no customer.write → INSUFFICIENT_PERMISSION
- wrong tenant customer id → RESOURCE_NOT_FOUND
- missing Idempotency-Key → IDEMPOTENCY_KEY_REQUIRED

# Preflight (2026-07-22)

| Item | Value |
|------|--------|
| Domain | CUS / P3 |
| Operation | `addCustomerIdentity` |
| Permission | `customer.write` |
| Idempotency | required |
| Migration | `000013_customer_identity_dedupe.sql` |
| Error added | `CUSTOMER_IDENTITY_CONFLICT` |
| Rollback | route off; keep index |

# Completion manifest

- Contracts changed: `error_catalog.csv` (+`CUSTOMER_IDENTITY_CONFLICT`); OpenAPI unchanged (op already frozen)
- Migration: `000013_customer_identity_dedupe.sql`
- Tests/evidence:
  - `pnpm exec vitest run modules/customer` — 13/13 pass
  - `pnpm contracts:validate` — pass
  - `pnpm typecheck` — pass
  - `pnpm test` — 143 passed / 4 skipped
  - `pnpm verify` blocked on local Node 24.5.0 ≠ pin 24.18.0; lint has **pre-existing** errors outside customer (identity/tenant/tools)
- Known risks: in-memory only until Postgres identity adapter; FE must sync error catalog for `CUSTOMER_IDENTITY_CONFLICT`
