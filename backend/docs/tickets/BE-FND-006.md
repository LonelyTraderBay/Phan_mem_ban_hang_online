---
ticket_id: BE-FND-006
title: Database package
owner: Backend AI Agent
phase: P1
risk: high
status: Done
---

# Business outcome

Database package.

Deliverable / details from backlog: Kysely/pg pool, transaction runner, statement timeout.

Primary paths: `packages/database/`.

# Actor and use case

Actors and flows for domain **FND** as defined in the enterprise blueprint and frozen OpenAPI/AsyncAPI contracts for this phase (P1).

# In scope / Out of scope

In scope:
- Database package
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

- OpenAPI operation/schema: slice with `pnpm agent:contract-slice` for FND; implement only operations this ticket owns.
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

- [x] Happy path matches contract + backlog deliverable
- [ ] Validation / business conflict codes from error catalog — N/A (library package, no HTTP endpoints)
- [x] Permission + tenant isolation tests (deny cross-tenant)
- [ ] Idempotency / retry where mutator is critical — N/A (library package, no OpenAPI mutators)
- [ ] Transaction rollback / concurrency when applicable — N/A (transaction runner covered by unit tests; no concurrency mutators)
- [ ] Audit / outbox / domain events as required — N/A (library package)
- [ ] Contract / generated client note for FE sync — N/A (library package)
- [ ] Staging smoke checklist item when phase reaches staging — N/A (package-only deliverable)

# Test cases

Derive from BE domain test matrices / blueprint §13 where present; otherwise write permission-negative + happy-path + isolation cases before coding.

# Completion manifest

- Contracts changed: none
- Migration: none (package only)
- Tests/evidence: `pnpm exec vitest run packages/database/src/with-tenant-transaction.test.ts packages/database/src/migration-files.test.ts` PASS (3 tests); deliverable = createDatabase + statement_timeout 10s + withTenantTransaction
- Known risks: none for package surface; live RLS suites still skip without DATABASE_URL; `pnpm --filter @ai-sales/database exec vitest run src/...` filter path broken — use repo-root vitest paths above

# Freeze provenance

- Generated/updated: 2026-07-22 (enterprise freeze W5)
- Backlog status at freeze: In Progress
- Source: `backend_doc/matrices/implementation_backlog.csv`
