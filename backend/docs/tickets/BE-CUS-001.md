---
ticket_id: BE-CUS-001
title: Customer/identity/address/tag/consent/note schema + encryption/blind index
owner: Backend AI Agent
phase: P3
risk: high
status: done
---

# Business outcome

Land `infra/migrations/000011_customer_schema.sql`: `customers`, `customer_identities`,
`customer_addresses`, `customer_tags`, `customer_tag_links`, `customer_consents`,
`customer_notes`, `customer_merge_history` — all TENANT_OWNED with FORCE RLS. PII
(phone/email/receiver name/address) stored as ciphertext (`BYTEA`) with separate blind-index
search columns per blueprint §12.4; envelope encryption/KMS and actual encrypt/decrypt code are
application concerns deferred to BE-CUS-002+ (out of scope here — schema only).

Deliverable / details from backlog: (none — expand from blueprint + contracts before coding).

Primary paths: `modules/customer/`, `infra/migrations/000011_customer_schema.sql`.

# Actor and use case

Actors and flows for domain **CUS** as defined in the enterprise blueprint and frozen OpenAPI/AsyncAPI contracts for this phase (P3).

# In scope / Out of scope

In scope:
- Customer/identity/address/tag/consent/note schema + encryption/blind index
- Align with frozen contracts, permission/error matrices, and data-dictionary classes (W1–W4).
- Tests required by acceptance criteria below.

Out of scope:
- Unrelated modules
- FE UI (FE consumes contracts after sync)
- Inventing permissions, money rules, or schema classes not in freeze docs

# Dependencies

- Enterprise freeze gate: feature coding forbidden until `FULL_PRODUCT_DOC_FREEZE.md` = PASS (except freeze-wave doc work).
- Prefer prior phase tickets Done; consult `docs/p0/epic-dependency-board.md`.
- Cite related `docs/tickets/BE-*.md` siblings in the same domain when implementing.

Money N/A for this ticket unless a later scope change adds priced entities — then cite HO_DEFAULTS_v1.

# Domain invariants and state transitions

- Never trust client `tenant_id` for authorization; set tenant context server-side.
- Apply state machines from `docs/domain/state-machine-transition-matrices.md` where this ticket owns transitions.
- Ledger / append-only tables: no hard DELETE; compensating rows only.
- Follow `docs/data/data-dictionary.md` + `rls-intent-catalog.md` for any table this ticket creates/touches.

# Contract

- OpenAPI operation/schema: slice with `pnpm agent:contract-slice` for CUS; implement only operations this ticket owns.
- AsyncAPI events: emit/consume only events listed for this deliverable in `backend_doc/contracts/asyncapi.yaml`.
- Error codes: `backend_doc/matrices/error_catalog.csv` only — no ad-hoc codes.
- Realtime event: only if AsyncAPI / ops channel lists one for this work.

# Authorization and data classification

- Required permission: every public operation must have `x-permission` resolving to `permission_matrix.csv`.
- Tenant/RLS behavior: per table class in data-dictionary; FORCE RLS for tenant-scoped tables.
- Field-level restrictions: blueprint §5.5 / cost fields where applicable.
- Data classification: secrets hashed/encrypted; PII redacted in logs/audit.

# Persistence and migration

- Tables/columns/constraints/indexes/RLS: only those required by this deliverable; class must already be frozen (no `Needs confirmation`).
- Backfill: document if any; default none for greenfield.
- Rolling-deploy compatibility: expand/contract only.

# Transaction, concurrency and idempotency

- Transaction boundary: business mutation + outbox/audit/idempotency in one tenant transaction where required.
- Lock order/isolation: follow module invariants; avoid cross-aggregate deadlocks.
- Idempotency scope/TTL: required on critical mutators per OpenAPI `x-idempotency` / blueprint §8.7.
- Retry behavior: fail-closed on non-retryable; DLQ for workers.

# Audit, telemetry and operations

- Audit action: record security/business-significant mutations via audit port.
- Logs/traces/metrics: correlation IDs; no secrets in clear text.
- Alert/runbook impact: note new alerts if this ticket adds SLO-sensitive paths.
- Feature flag/rollout: prefer flag when changing tenant-visible behavior.
- Rollback: disable route/flag; no destructive down-migrations of ledger data.

# Acceptance criteria

- [x] Happy path matches contract + backlog deliverable — schema-only deliverable; no HTTP contract owned by this ticket
- [N/A] Validation / business conflict codes from error catalog — no endpoint in this ticket (CUS-002+)
- [x] Permission + tenant isolation tests (deny cross-tenant) — structural artefact test + DB-gated RLS integration test
- [N/A] Idempotency / retry where mutator is critical — no mutator endpoint in this ticket
- [N/A] Transaction rollback / concurrency when applicable — no application transaction in this ticket
- [N/A] Audit / outbox / domain events as required — no mutation path in this ticket
- [x] Contract / generated client note for FE sync — no OpenAPI change required for schema-only; FE sync unchanged
- [ ] Staging smoke checklist item when phase reaches staging

# Test cases

- Structural: migration text defines all 8 tables, FORCE RLS, PII ciphertext + blind-index
  columns, and composite tenant FKs (always runs, no DB required).
- Integration (skipped without `DATABASE_URL`): tenant B cannot read tenant A's `customers` /
  `customer_notes` rows; cross-tenant FK substitution (`customer_notes.customer_id` pointing at
  another tenant's customer) is rejected.

Evidence: `packages/database/src/customer-rls.integration.test.ts`.

# Completion manifest

- Contracts changed: none (schema-only; no OpenAPI/AsyncAPI/permission/error catalog changes —
  `customer.*` permission keys already existed from `000001_bootstrap_roles.sql`)
- Migration: `infra/migrations/000011_customer_schema.sql`
- Tests/evidence: `packages/database/src/customer-rls.integration.test.ts` (structural test always
  runs; live RLS/FK cases skip without `DATABASE_URL`)
- Known risks / open questions (deferred to BE-CUS-002+, not this ticket):
  - `customers.status` and `categories.status`-equivalent lifecycle enum is not yet frozen
    anywhere (blueprint/ERD/dictionary give no value list) — column is unconstrained
    `TEXT NOT NULL DEFAULT 'active'` with no `CHECK`; add the `CHECK` once the state machine
    is decided, rather than inventing values now.
  - `email_blind_index` / `phone_blind_index` are plain (non-unique) lookup columns — actual
    keyed-HMAC computation and KMS envelope encrypt/decrypt live in the application layer.
  - `customer_addresses.address_line_encrypted` extends `ERD.md`'s customer diagram (which
    omits it) to match blueprint §7.6.3 prose ("encrypted receiver name/phone/address lines");
    flagging in case the ERD omission was intentional rather than a diagram simplification.

# Freeze provenance

- Generated/updated: 2026-07-22 (enterprise freeze W5)
- Backlog status at freeze: Not Started
- Source: `backend_doc/matrices/implementation_backlog.csv`
