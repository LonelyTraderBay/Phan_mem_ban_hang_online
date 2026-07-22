---
ticket_id: BE-IDN-012
title: Field-level authorization policy utilities
owner: Backend AI Agent
phase: P2
risk: medium
status: done
---

# Business outcome

Shared field-level auth helpers for cost/PII fields — omit without permission.

# In scope

`@ai-sales/security` field policies: `applyFieldPolicies`, `assertCanReadField`, `redactSecretsDeep`.

# Dependencies

Blocked on **BE-IDN-011** — unblocked.

# Acceptance criteria

- Field omitted without permission
- Unit tests for policy helpers
- [x] Permission/tenant isolation tests
- [x] Contract note — no OpenAPI change (library utility)
- [x] Completion manifest filled

# Completion manifest

- Contracts changed: none
- Migration: none
- Tests/evidence: `packages/security/src/field-policy.test.ts`; suite green
- Known risks: domain modules must call helpers at response mapping time
