---
ticket_id: BE-IDN-015
title: Auth/RBAC/tenant isolation security suite
owner: Backend AI Agent
phase: P2
risk: critical
status: done
---

# Business outcome

Aggregate Identity security suite from BE-IDN-test-matrix — tenant isolation, permission negatives, field auth, refresh reuse, invite accept race.

# Dependencies

Blocked on **BE-IDN-001…014** — unblocked (all prior done).

# Acceptance criteria

- All matrix rows green (owning tickets done + this aggregate)
- Tenant isolation + permission negative for F01 identity endpoints
- [x] Tests + completion manifest

# Completion manifest

- Contracts changed: none
- Migration: none
- Tests/evidence: `modules/identity/src/application/security-suite.test.ts` + full identity/tenant/audit/security vitest — 78 passed
- Known risks: live Postgres/IdP isolation still deferred; suite is in-memory application-level
