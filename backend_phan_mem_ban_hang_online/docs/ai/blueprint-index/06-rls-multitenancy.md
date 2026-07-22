# Blueprint §6 — RLS and multitenancy

**Source:** §6.1–6.6 (search `# 6.`)

- Table classification: tenant-owned, global, system.
- DB roles `app_runtime`, `app_worker` with NOBYPASSRLS.
- `withTenantTransaction` sets `app.tenant_id`, `app.actor_id`, `app.correlation_id`.
- Composite tenant FKs; deny-default RLS test suite required.
- Related ADR: ADR-002.
