---
ticket_id: BE-IDN-013
title: Audit list/export with permission/redaction
owner: Backend AI Agent
phase: P2
risk: medium
status: blocked
---

# Business outcome

List/export audit with permission checks and PII redaction.

# Actor and use case

Identity / tenant admin actors and unauthenticated auth flows as defined in blueprint ?5 and FE F01.

# In scope / Out of scope

In scope: Audit list/export with permission/redaction.

Out of scope: unrelated modules; FE UI work (FE sync after BE contract freeze).

# Dependencies

Blocked on **BE-IDN-001** and audit append baseline (BE-FND-012).

See also: `docs/data/identity-migration-design.md`, `docs/tickets/BE-IDN-test-matrix.md`, `docs/collaboration/gap-003-f01-slice.md`.

# Domain invariants and state transitions

- Server establishes tenant context; never trust client `tenant_id` for authorization.
- Money N/A; sessions/tokens store hashes only.
- No hard-delete of audit/session ledger rows ? revoke via status flags.

# Contract

- OpenAPI operation/schema: Auth / Members / Roles / Sessions tags as applicable (slice with `pnpm agent:contract-slice`).
- AsyncAPI events: session revoke / membership events when this ticket owns them.
- Error codes: per `backend_doc/matrices/error_catalog.csv` and BE-IDN-test-matrix mapping notes.
- Realtime event: session revoke hooks where BE-IDN-006 applies.

# Authorization and data classification

- Required permission: per operation `x-permission` (`authenticated` = session gate, not a permission string; role mutations use `role.manage`).
- Tenant/RLS behavior: per data-dictionary; `user_sessions` nullable-tenant policy in identity-migration-design.
- Field-level restrictions: BE-IDN-012.
- Data classification: credentials/MFA secrets = restricted; PII redacted in logs.

# Persistence and migration

- Tables/columns/constraints/indexes/RLS: BE-IDN-001 owns `000005_identity_schema.sql`; later tickets are additive.
- Backfill: none for greenfield.
- Rolling-deploy compatibility: expand/contract only.

# Transaction, concurrency and idempotency

- Transaction boundary: auth mutations that touch session + refresh + audit share one tenant/actor transaction where applicable.
- Lock order/isolation: unique constraints for invite/refresh family.
- Idempotency scope/TTL: critical member/role/provision commands per OpenAPI `x-idempotency`.
- Retry behavior: refresh reuse is fail-closed (revoke family).

# Audit, telemetry and operations

- Audit action: login success/failure (no password), logout, revoke, invite, role change, support grant.
- Logs/traces/metrics: redacted; correlation IDs required.
- Alert/runbook impact: refresh reuse spike; invite abuse rate limits.
- Feature flag/rollout: MFA optional per tenant entitlement when billing exists.
- Rollback: disable route / feature flag; no hard-delete.

# Acceptance criteria

- Permission deny
- Redaction on export
- No raw secrets in logs
- [ ] Permission/tenant isolation tests per BE-IDN-test-matrix
- [ ] Contract/generated client note for FE sync
- [ ] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-013`.

# Completion manifest

- Contracts changed:
- Migration:
- Tests/evidence:
- Known risks:
