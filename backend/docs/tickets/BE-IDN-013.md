---
ticket_id: BE-IDN-013
title: Audit list/export with permission/redaction
owner: Backend AI Agent
phase: P2
risk: medium
status: done
---

# Business outcome

List/export audit with `audit.read` / `audit.export` and PII/secret redaction.

# In scope

`GET /audit-logs`, `POST /audit-exports` (idempotent); in-memory store; secret redaction via `redactSecretsDeep`.

# Dependencies

Blocked on **BE-IDN-001** + audit append baseline — unblocked.

# Acceptance criteria

- Permission deny
- Redaction on export
- No raw secrets in logs/export payload
- [x] Tests + completion manifest

# Completion manifest

- Contracts changed: none (OpenAPI frozen)
- Migration: deferred (in-memory; `audit_events` table exists)
- Tests/evidence: `modules/audit/src/application/list-audit.test.ts`
- Known risks: list items mapped onto AuditExportResource field names (freeze quirk); Postgres adapter follow-up
