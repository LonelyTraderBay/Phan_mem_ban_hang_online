---
ticket_id: BE-FND-008
title: Tenant transaction/RLS test harness — shared context setter + deny-default tests
owner: Backend Platform (assign)
phase: P1
risk: critical
status: done
---

# Business outcome

Every module built after this ticket enforces tenant isolation through one shared, tested
mechanism instead of ad-hoc per-controller code. Today `modules/audit`'s
`WalkingSkeletonController` parses the security context from raw headers by hand — the only
existing example. If the remaining 15 modules copy that pattern, the ad-hoc-parsing anti-pattern
compounds 15x and there is no single place to fix a tenant-isolation bug. This ticket promotes
the pattern to a package-level, documented, tested contract before more modules get built.

# Actor and use case

Internal: every backend engineer/AI agent implementing a tenant-owned resource. Indirectly every
tenant end user — isolation must hold even when application code has a bug.

# In scope / Out of scope

In scope:
- Harden `withTenantTransaction` in `packages/database` as the *only* sanctioned way to touch a
  tenant-owned table (session vars set `local=true` inside the transaction per blueprint §6.3;
  auto-clear/rollback on exception so a pooled connection never leaks stale tenant context).
- A shared NestJS provider/guard that derives `RequestSecurityContext`
  (`tenantId`, `actorId`, `permissions[]`, `correlationId`) from the validated auth context and
  is the only source `withTenantTransaction` callers read from — replaces the raw-header parsing
  in `modules/audit`'s controller.
- Deny-default test harness: prove the `app_runtime` DB role (not the table owner) cannot bypass
  RLS, and that missing/invalid tenant context defaults to deny, not allow.
- Document the RLS policy template (blueprint §6.4: `ENABLE`+`FORCE ROW LEVEL SECURITY`,
  `USING`/`WITH CHECK` on `current_setting('app.tenant_id', true)`) and the composite-FK pattern
  (§6.5: `UNIQUE (tenant_id, id)` + tenant-qualified FK) so `/new-module` scaffolding can point
  to it directly.

Out of scope:
- JWT verification/issuance itself (ADR-008, belongs to a BE-IDN-* identity ticket).
- Writing RLS migrations for modules 2–16 — each module's own ticket adds its own tables using
  this harness, this ticket only proves the harness works end-to-end on the existing audit
  tables.

# Dependencies

- `packages/database` (exists, partial — In Progress per backlog).
- `infra/migrations/000001_bootstrap_roles.sql` (roles `app_runtime`/`app_worker` already exist,
  `NOBYPASSRLS`).
- `infra/migrations/000002_walking_skeleton.sql` (existing, working RLS example to generalize
  from).
- ADR-002 (PostgreSQL RLS multi-tenancy).

# Domain invariants and state transitions

- Server derives tenant context; a client-supplied `tenant_id` is never used for authorization
  (repo non-negotiable, see `.cursor/rules/00-global-invariants.mdc`).
- Missing or invalid context → deny by default. No table is allowed to be tenant-owned without
  RLS `ENABLE`+`FORCE` and a passing isolation test (blueprint §6.6 release-gate rule).

# Contract

- OpenAPI operation/schema: none — internal package/framework contract only.
- AsyncAPI events: n/a.
- Error codes: n/a for this ticket (context-derivation failures surface via the consuming
  endpoint's existing error contract).
- Realtime event: n/a.

# Authorization and data classification

- This ticket **is** the authorization foundation, not a consumer of it. Defines the
  `RequestSecurityContext` shape every controller in every future module reads from.
- No new data classification — no new tables.

# Persistence and migration

- No new tables. Verifies the existing RLS pattern from `000002_walking_skeleton.sql`
  generalizes to a reusable harness rather than one-off SQL per table.

# Transaction, concurrency and idempotency

- Transaction boundary: session vars (`app.tenant_id`, `app.actor_id`, `app.correlation_id`)
  must be set with `local=true` (transaction-scoped) — never `SET` outside a transaction, since
  the connection pool can reuse the connection for a different tenant.
- Wrapper must roll back/clear context automatically on both success and exception paths.

# Audit, telemetry and operations

- Denied/failed tenant-context derivations must be logged (not silently dropped) — this is a
  security signal, not a normal validation error.
- Rollback: none needed (additive, no schema change, no behavior change until callers adopt it).

# Acceptance criteria

- [ ] Cross-tenant read/write is rejected at the RLS layer even if application code has a bug
      (test bypasses the application filter deliberately).
- [ ] `app_runtime` role cannot bypass RLS — test runs as the runtime role, not the table owner.
- [ ] Missing/invalid tenant context defaults to deny, not allow.
- [ ] `withTenantTransaction` clears session vars on both the happy path and the exception path.
- [ ] `modules/audit`'s controller is migrated off raw-header parsing onto the shared context
      provider (proves the harness works on a real consumer, not just in isolation).
- [ ] Pattern is documented (README or `.claude/commands/new-module.md` cross-reference) so
      future modules don't reinvent it.

# Test cases

Per blueprint §6.6 tenant isolation test suite — for at least one existing tenant-owned table:

1. Create tenant A/B with an object sharing the same business key.
2. Actor A attempts list/get/update/delete on tenant B's object.
3. Verify `404`/empty per policy — no existence leak.
4. Repeat through nested relation, filter, export, search, aggregate, and file-URL paths if
   applicable to the target table.
5. Attempt a queue job carrying a forged `tenant_id`.
6. Attempt a new raw SQL/repository method that skips the wrapper — must still be denied by RLS.
7. All of the above run against the `app_runtime` role.

# Completion manifest

- Contracts changed: none (internal harness)
- Migration: none (verifies `000002` pattern)
- Tests/evidence: `packages/database/src/with-tenant-transaction.test.ts`, `packages/database/src/rls.integration.test.ts` (skips without `DATABASE_URL`), `packages/security/src/security-context-from-headers.test.ts`; audit controller uses `securityContextFromHeaders`
- Known risks: full `app_runtime`-role CI proof still needs a DATABASE_URL job; walking-skeleton headers remain a temporary auth stand-in until BE-IDN-*

