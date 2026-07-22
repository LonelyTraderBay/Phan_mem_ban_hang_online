---
adr_id: ADR-005
title: Server-Sent Events for realtime v1
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent, Frontend AI Agent]
human_signoff_required: false
---

# Context

Realtime needs are server-to-client updates for inbox, jobs, and notifications. Client commands still go through REST.

# Decision

Use Server-Sent Events for realtime v1 with authorization, event IDs, resume through `Last-Event-ID`, and REST resync.

# Consequences

Positive: simpler operational model than bidirectional sockets for v1.

Trade-off: client-to-server realtime commands are out of scope for v1.

Operational impact: SSE connection metrics and reconnect storm tests are required.

Security/privacy impact: SSE streams must enforce tenant and permission checks.

# Verification

- Reconnect/resume tests.
- Cross-tenant stream negative tests.
- REST resync smoke test.
