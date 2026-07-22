---
ticket_id: BE-IDN-014
title: Support access grant model/API baseline
owner: Backend AI Agent
phase: P2
risk: high
status: done
---

# Business outcome

Break-glass support grants with reason/expiry/scope; over-scope + expired deny; audit trail.

# In scope

`POST /super-admin/tenants/{tenant_id}/support-access`; `assertUsable` for scope/expiry; audit create/use.

# Dependencies

Blocked on **BE-IDN-001** — unblocked.

# Acceptance criteria

- Grant create/expire
- Over-scope deny
- Audit of grant use
- [x] Tests + completion manifest

# Completion manifest

- Contracts changed: none
- Migration: deferred (table in `000005`; in-memory store)
- Tests/evidence: `modules/tenant/src/application/support-grant.test.ts`
- Known risks: Postgres adapter follow-up; `support.access` permission for ops actors
