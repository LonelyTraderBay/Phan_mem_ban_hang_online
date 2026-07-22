---
ticket_id: BE-IDN-011
title: Role/permission APIs/cache/version invalidation
owner: Backend AI Agent
phase: P2
risk: high
status: done
---

# Business outcome

CRUD roles/permissions assignment; version/ETag conflict; permission cache generation bump.

# Actor and use case

Tenant admins with `role.manage` / `role.read`.

# In scope / Out of scope

In scope: `listRoles`, `createRole`, `updateRole`, `archiveRole`, `listPermissions`, `replaceMemberRoles`, `role.manage` enforcement, `ROLE_WOULD_REMOVE_LAST_ADMIN`, `RESOURCE_VERSION_MISMATCH`, permission cache generation.

Out of scope: distributed cache (Redis); Postgres SECURITY DEFINER adapter (same as IDN-010 follow-up).

# Dependencies

Blocked on **BE-IDN-001** — unblocked. Permission key is `role.manage`.

# Acceptance criteria

- role.manage enforced
- ROLE_WOULD_REMOVE_LAST_ADMIN
- RESOURCE_VERSION_MISMATCH on stale expected_version
- Permission cache invalidated (generation bump)
- [x] Permission/tenant isolation tests per BE-IDN-test-matrix
- [x] Contract/generated client note — OpenAPI unchanged; FE sync not required
- [x] Completion manifest filled

# Test cases

See `docs/tickets/BE-IDN-test-matrix.md` row `BE-IDN-011`.

Evidence: `modules/tenant/src/application/members-roles.test.ts` — suite 44 passed.

# Completion manifest

- Contracts changed: none (OpenAPI frozen)
- Migration: deferred (in-memory; schema in `000005`)
- Tests/evidence: vitest tenant+identity — 44 passed; typecheck OK
- Known risks: `ListPermissionsListResponse` still typed as `RoleResource[]` in OpenAPI (catalog workaround); Postgres persistence follow-up
