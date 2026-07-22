---
adr_id: ADR-011
title: Conversation SSE buffer remains process-local for v1
status: accepted
created_date: 2026-07-23
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: false
---

# Context

Plan `2026-07-23-remain-to-100-percent.md` P3.c asked whether conversation SSE fan-out/replay should move to Redis pub/sub or a durable `conversation_sse_buffer` table so multi-instance API nodes share Last-Event-ID resume buffers.

ADR-005 already chose SSE for realtime v1 with auth, event IDs, resume, and REST resync. Redis is in the stack for BullMQ/outbox (ADR-004) but is not yet wired as an SSE fan-out bus. A new buffer table would add migration + retention + purge work without changing the client contract.

# Decision

Keep the conversation SSE event buffer **process-local** (in-memory Map on the conversation repository adapter) for v1.

- Do **not** introduce Redis pub/sub for SSE in this phase.
- Do **not** add `conversation_sse_buffer` (or equivalent) until multi-instance SSE resume is a measured product requirement.
- Clients must continue to rely on REST resync when Last-Event-ID resume cannot be served from the connected instance (already part of ADR-005).

This closes the P3.c gap as an intentional wontfix for the “remain to 100%” DB/adapter plan scope and does **not** block that plan’s 100% acceptance criteria.

# Consequences

Positive: no new schema or Redis SSE topology; remaining Map is documented rather than treated as unfinished persistence debt.

Trade-off: SSE replay/fan-out is not shared across API replicas; sticky sessions or REST resync are required under horizontal scale-out.

Operational impact: document that conversation SSE is single-instance coherent until a follow-up ADR chooses Redis or a durable buffer.

Security/privacy impact: unchanged from ADR-005 — streams still enforce tenant and permission checks at connection time; process-local storage must not leak across tenants (Map keyed by tenant_id).

# Verification

- Conversation SSE stub tests (auth / tenant isolation / replay within process) remain green.
- Gaps plan marks P3.c as ADR-accepted (process-local OK for v1).
- Follow-up ADR required before claiming multi-instance SSE resume without REST resync.
