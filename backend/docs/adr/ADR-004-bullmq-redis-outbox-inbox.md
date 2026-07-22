---
adr_id: ADR-004
title: BullMQ/Redis with transactional outbox and inbox
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: false
---

# Context

Critical writes must not dual-write to the database and queue/event bus in a way that can lose or duplicate business effects.

# Decision

Use Redis/BullMQ for async processing and a transactional outbox/inbox pattern for business events, retries, dedupe, DLQ, and replay.

# Consequences

Positive: database commit and event intent are atomic.

Trade-off: workers need publisher/consumer infrastructure and reconciliation.

Operational impact: queue metrics, oldest age, DLQ, retry, and replay runbooks are mandatory.

Security/privacy impact: event payloads must be minimized and redacted.

# Verification

- Outbox record created in same transaction as critical mutation.
- Inbox dedupe tests.
- Reprocess tests prove no duplicate external effect.
