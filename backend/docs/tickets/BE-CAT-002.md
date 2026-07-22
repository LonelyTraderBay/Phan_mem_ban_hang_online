---
ticket_id: BE-CAT-002
title: Product/category/variant CRUD + ETag
owner: Backend AI Agent
phase: P3
risk: medium
status: done
---

# Business outcome

Product/category/variant CRUD + ETag.

Deliverable / details from backlog: (none — expand from blueprint + contracts before coding).

Primary paths: `modules/catalog/`.

# Actor and use case

Actors and flows for domain **CAT** as defined in the enterprise blueprint and frozen OpenAPI/AsyncAPI contracts for this phase (P3).

# In scope / Out of scope

In scope:
- Product/category/variant CRUD + ETag
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

- [x] Happy path matches contract + backlog deliverable
- [x] Validation / business conflict codes from error catalog
- [x] Permission + tenant isolation tests (deny cross-tenant)
- [x] Idempotency / retry where mutator is critical
- [ ] Transaction rollback / concurrency when applicable — N/A: process-local in-memory repo, no DB transaction yet (see Known risks)
- [ ] Audit / outbox / domain events as required — not in this ticket's deliverable list (CRUD + ETag only); no AsyncAPI catalog event listed for this slice
- [x] Contract / generated client note for FE sync — OpenAPI unchanged (endpoints/schemas were already frozen); no FE contract diff
- [ ] Staging smoke checklist item when phase reaches staging — deferred until staging deploy

# Test cases

Derive from BE domain test matrices / blueprint §13 where present; otherwise write permission-negative + happy-path + isolation cases before coding.

Implemented in `modules/catalog/src/application/catalog.test.ts` (15 tests): happy path create
category/product/variant, `catalog.write`/`catalog.read` permission deny, cross-tenant isolation
(product from tenant A invisible to tenant B, both by direct get and by list), stale
`expected_version` → `RESOURCE_VERSION_MISMATCH`, SKU duplicate → `SKU_DUPLICATE`, category parent
cycle → `CATEGORY_CYCLE`, archived product blocks update/create-variant → `PRODUCT_ARCHIVED`,
category archive + re-archive → `RESOURCE_NOT_FOUND`, variant update→archive lifecycle (SKU freed
for reuse after archive), negative `unit_price_minor` → `VALIDATION_FAILED`, missing
`Idempotency-Key` → `IDEMPOTENCY_KEY_REQUIRED`, and idempotency replay returning the same resource.

Evidence: `pnpm exec vitest run modules/catalog` — 15 passed. Full suite
`pnpm test` — 35 files / 130 passed, 4 skipped (unchanged skip count from before this ticket).
`pnpm typecheck` — clean.

# Completion manifest

- Contracts changed: none (`backend_doc/contracts/openapi.yaml` Catalog paths/schemas were
  already frozen — `listCategories`, `createCategory`, `updateCategory`, `archiveCategory`,
  `listProducts`, `createProduct`, `getProduct`, `updateProduct`, `archiveProduct`,
  `listVariants`, `createVariant`, `updateVariant`, `archiveVariant`. Permissions
  (`catalog.read`, `catalog.write`) and errors (`VALIDATION_FAILED`, `INSUFFICIENT_PERMISSION`,
  `RESOURCE_NOT_FOUND`, `RESOURCE_VERSION_MISMATCH`, `SKU_DUPLICATE`, `BARCODE_DUPLICATE`,
  `CATEGORY_CYCLE`, `PRODUCT_ARCHIVED`, `IDEMPOTENCY_KEY_REQUIRED`) already existed in
  `permission_matrix.csv` / `error_catalog.csv` — this ticket only implements against them.
- Migration: none — `InMemoryCatalogRepository` (process-local), mirroring
  `InMemoryMembersRolesRepository` in `modules/tenant`. A Postgres SECURITY DEFINER adapter is a
  follow-up, same as the tenant/members precedent.
- Tests/evidence: see Test cases above.
- Known risks / follow-ups:
  - Process-local in-memory store — no persistence across restarts, no multi-instance
    consistency; matches the existing tenant/members/audit precedent until Postgres adapters land.
  - `CatalogResource` (frozen W1 schema) has no field for a variant's owning product, and no
    `parent_id` field for categories — categories reuse `category_id` to carry their parent id;
    variants map their `sku` onto `name` and never expose `unit_price_minor`, `currency`,
    `cost_minor`, or `barcode` (stored internally only, per ticket instructions; not invented on
    the response). CAT-003 will decide how/whether to expose cost via
    `applyFieldPolicies`/`catalog.cost.read`.
  - `barcode`/`cost_minor` have no input field on the frozen `CreateVariantRequest`/
    `UpdateVariantRequest` — repository-level dedup (`BARCODE_DUPLICATE`) and storage exist for
    forward-compat but are not reachable over HTTP yet.
  - ETag/If-Match: `getProduct` sets `ETag: "v{version}"`. PATCH (`updateCategory`/
    `updateProduct`/`updateVariant`) accepts either the `If-Match` header or body
    `expected_version` (contract lists both as required parameters; this ticket accepts either,
    per ticket instructions) — no dedicated HTTP-level test for this (only the underlying
    `RESOURCE_VERSION_MISMATCH` application-layer behavior is unit-tested). Archive endpoints
    check `If-Match` only if the caller sends it (contract does not require it there).
  - Idempotency is a simple in-memory tenant+key → last-resource map (per ticket instructions),
    not the Postgres request-hash store in `@ai-sales/idempotency`.
  - `pnpm lint` currently fails repo-wide (183 files, including untouched files like
    `vitest.config.ts`) because of a pre-existing, gitignored `.claude/worktrees/*` directory
    that confuses typescript-eslint's `tsconfigRootDir` auto-detection. Confirmed pre-existing
    and out of scope for this ticket (not caused by these changes); `pnpm typecheck` and
    `pnpm test` both pass cleanly.

# Freeze provenance

- Generated/updated: 2026-07-22 (enterprise freeze W5)
- Backlog status at freeze: Not Started
- Source: `backend_doc/matrices/implementation_backlog.csv`
