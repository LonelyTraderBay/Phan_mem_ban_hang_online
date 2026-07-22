---
adr_id: ADR-002
title: Shared-schema PostgreSQL multi-tenancy with RLS
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: true # foundational tenant-isolation security posture
---

# Context

The system serves many tenants with shared infrastructure. Tenant isolation must not rely only on application filters.

# Decision

Use shared-schema multi-tenancy. Tenant-owned tables must have `tenant_id`, tenant-scoped indexes, RLS policies, and composite tenant foreign keys where related. Runtime roles must be `NOBYPASSRLS`.

# Consequences

Positive: defense-in-depth against IDOR and cross-tenant joins.

Trade-off: migrations, tests, and repository code must carry tenant context explicitly.

Operational impact: every tenant transaction sets scoped PostgreSQL settings inside the transaction.

Security/privacy impact: missing tenant context denies by default.

# Verification

- RLS tests using runtime role.
- Cross-tenant negative tests for each tenant-owned table.
- Migration review checks table classification.
