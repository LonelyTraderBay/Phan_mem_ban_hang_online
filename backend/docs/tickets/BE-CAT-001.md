---
ticket_id: BE-CAT-001
title: Category/product/variant/media schema + RLS/constraints
owner: Backend AI Agent
phase: P3
risk: critical
status: done
---

# Business outcome

Land `infra/migrations/000012_catalog_schema.sql`: `categories`, `products`,
`product_variants`, `product_media`, `price_history` — all TENANT_OWNED with FORCE RLS.
`price_history` is an append-only ledger (no `UPDATE`/`DELETE` grant). Money fields
(`price_minor`, `cost_minor`, and the four `price_history` snapshot columns) are `bigint`
minor-unit VND per `HO_DEFAULTS_v1` (tax-inclusive), never floating point.
`import_jobs` / `import_job_rows` are listed under Catalog in the data dictionary but are
**not** created here — they are owned by `BE-IMP-001`.

Deliverable / details from backlog: (none — expand from blueprint + contracts before coding).

Primary paths: `modules/catalog/`, `infra/migrations/000012_catalog_schema.sql`.

# Actor and use case

Actors and flows for domain **CAT** as defined in the enterprise blueprint and frozen OpenAPI/AsyncAPI contracts for this phase (P3).

# In scope / Out of scope

In scope:
- Category/product/variant/media schema + RLS/constraints
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

- OpenAPI operation/schema: slice with `pnpm agent:contract-slice` for CAT; implement only operations this ticket owns.
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
- [N/A] Validation / business conflict codes from error catalog — no endpoint in this ticket (CAT-002+)
- [x] Permission + tenant isolation tests (deny cross-tenant) — structural artefact test + DB-gated RLS integration test
- [N/A] Idempotency / retry where mutator is critical — no mutator endpoint in this ticket
- [N/A] Transaction rollback / concurrency when applicable — no application transaction in this ticket
- [N/A] Audit / outbox / domain events as required — no mutation path in this ticket
- [x] Contract / generated client note for FE sync — no OpenAPI change required for schema-only; FE sync unchanged
- [ ] Staging smoke checklist item when phase reaches staging

# Test cases

- Structural: migration text defines all 5 tables, FORCE RLS, bigint money columns, and that
  `price_history` grants stop at `SELECT, INSERT` (no ledger mutation), and that
  `import_jobs`/`import_job_rows` are absent (always runs, no DB required).
- Integration (skipped without `DATABASE_URL`): tenant B cannot read tenant A's `products` /
  `product_variants` rows; the same SKU text is allowed across two different tenants (RLS-scoped
  uniqueness) but rejected twice within one tenant while both rows are `status = 'active'`.

Evidence: `packages/database/src/catalog-rls.integration.test.ts`.

# Completion manifest

- Contracts changed: none (schema-only; no OpenAPI/AsyncAPI/permission/error catalog changes —
  `catalog.*` permission keys already existed from `000001_bootstrap_roles.sql`)
- Migration: `infra/migrations/000012_catalog_schema.sql`
- Tests/evidence: `packages/database/src/catalog-rls.integration.test.ts` (structural test always
  runs; live RLS/FK/uniqueness cases skip without `DATABASE_URL`)
- Known risks / open questions (deferred to BE-CAT-002+, not this ticket):
  - `categories.status` lifecycle enum is not frozen anywhere — column is unconstrained
    `TEXT NOT NULL DEFAULT 'active'` with no `CHECK` (unlike `products`/`product_variants`,
    whose enums ARE frozen in blueprint §7.7.2/§7.7.3 and do have `CHECK` constraints).
  - Category slug uniqueness scope (per-parent vs tenant-wide) is explicitly an open product
    decision per blueprint §7.7.1 — added a lookup index only, no `UNIQUE` constraint yet.
  - `product_variants.barcode` uniqueness is "if business requires it" per blueprint §7.7.3 —
    same treatment (index only, no `UNIQUE` yet).
  - `product_variants.currency` must match the owning tenant's currency at v1 (blueprint
    §7.7.3) — not enforceable via a simple `CHECK` across tables; left as an application-layer
    invariant for BE-CAT-002+.
  - `docs/data/rls-intent-catalog.md`'s money table refers to `product_variants.unit_price_minor`,
    but blueprint §7.7.3 and `ERD.md` §3 both name the column `price_minor` — implemented
    `price_minor` (the two independent field-list sources agree); flagging the naming mismatch
    in `rls-intent-catalog.md` for a future doc pass rather than editing it in this schema ticket.

# Freeze provenance

- Generated/updated: 2026-07-22 (enterprise freeze W5)
- Backlog status at freeze: Not Started
- Source: `backend_doc/matrices/implementation_backlog.csv`
