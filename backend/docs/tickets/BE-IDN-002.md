---
ticket_id: BE-IDN-002
title: Tenant provisioning/default roles/owner invitation
owner: Backend AI Agent
phase: P2
risk: high
status: done
---

# Business outcome

Provision tenant, clone system roles to tenant customs, create owner membership, send owner invitation.

# Actor and use case

Identity / tenant admin actors and unauthenticated auth flows as defined in blueprint §5 and FE F01.

# In scope / Out of scope

In scope: Tenant provisioning/default roles/owner invitation.

Out of scope: unrelated modules; FE UI work (FE sync after BE contract freeze); OIDC session establishment (BE-IDN-003).

# Dependencies

Blocked on **BE-IDN-001** — unblocked (001 done).

See also: `docs/data/identity-migration-design.md`, `docs/tickets/BE-IDN-test-matrix.md`, `docs/collaboration/gap-003-f01-slice.md`.

# Domain invariants and state transitions

- Server establishes tenant context; never trust client `tenant_id` for authorization.
- Money N/A; sessions/tokens store hashes only.
- No hard-delete of audit/session ledger rows — revoke via status flags.

# Contract

- OpenAPI: `POST /tenants` `operationId: provisionTenant` (`ProvisionTenantRequest/Data/Response`); `x-permission: authenticated`, `x-idempotency: required`.
- AsyncAPI: outbox `com.aisales.tenant.activated.v1` on provision.
- Error codes: `VALIDATION_FAILED` / `CONFLICT` / `INACTIVE_PLAN` → 422/409.

# Authorization and data classification

- Required permission: `authenticated` (session gate); controller currently accepts internal `x-actor-id` until BE-IDN-003 BFF.
- Tenant/RLS: deterministic tenant UUID from actor+Idempotency-Key so retries share idempotency scope; no client `x-tenant-id`.
- Field-level restrictions: invite plaintext returned once; DB stores `token_hash`.
- Data classification: invite token sensitive; credentials/MFA secrets = restricted; PII redacted in logs.

# Persistence and migration

- Tables/columns/constraints/indexes/RLS: BE-IDN-001 owns `000005_identity_schema.sql`; this ticket is application-layer only.
- Backfill: none for greenfield.
- Rolling-deploy compatibility: expand/contract only.

# Transaction, concurrency and idempotency

- Transaction boundary: tenant + roles + role_permissions + invitation + audit + outbox in one tenant transaction.
- Lock order/isolation: unique `tenants.code` → CONFLICT on 23505.
- Idempotency scope/TTL: `tenant.provision`, 24h, required Idempotency-Key.
- Retry behavior: same key+hash → replay 201 body; conflict/validation → fail-final.

# Audit, telemetry and operations

- Audit action: `tenant.provision`.
- Logs/traces/metrics: redacted; correlation IDs required.
- Alert/runbook impact: invite abuse rate limits (later).
- Feature flag/rollout: N/A.
- Rollback: disable route; no hard-delete.

# Acceptance criteria

- Happy path provision
- Idempotent provision key
- Default roles present (Owner/Admin/Staff/ReadOnly clones)
- Owner invite issued (pending + token once)
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix (unit; live Postgres deferred)
- [x] Contract/generated client note for FE sync — OpenAPI `provisionTenant` added; FE `contracts:sync` with `BACKEND_CONTRACTS_ROOT`
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-002`.

Evidence: `modules/tenant/src/application/provision-tenant.test.ts` — 6 passed.

# Completion manifest

- Contracts changed: OpenAPI `POST /tenants` (`provisionTenant`) + `ProvisionTenant*` schemas; synced to `packages/contracts-http` + `backend_doc/contracts`
- Migration: none (uses 000005)
- Tests/evidence: `pnpm exec vitest run modules/tenant` — 6 passed
- Known risks: HTTP actor via `x-actor-id` until OIDC BFF (BE-IDN-003); live Postgres provision proof deferred (no Docker on this machine); invite-accept SECURITY DEFINER still BE-IDN-010
