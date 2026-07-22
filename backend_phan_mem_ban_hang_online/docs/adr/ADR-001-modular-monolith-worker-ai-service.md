---
adr_id: ADR-001
title: Modular monolith with worker and AI service
status: accepted
created_date: 2026-06-27
owners: [Backend AI Agent]
reviewers: [Backend AI Agent]
human_signoff_required: false
---

# Context

Order and inventory need strong local transactions. Splitting services too early would add saga and distributed transaction complexity before the product has proven scaling pressure.

# Decision

Use a modular monolith for `api`, `worker`, and `scheduler`, with clear domain boundaries, shared packages, PostgreSQL as source of truth, Redis/BullMQ for async work, and a separately deployed FastAPI `ai-service`.

# Consequences

Positive: simpler transactions, fewer operational failure modes, and easier contract enforcement during MVP.

Trade-off: deploy cadence is shared for core backend units until a bounded context earns service extraction through measured triggers.

Operational impact: each deployable has independent process scaling and OTel signals.

Security/privacy impact: AI service has no direct business database access.

# Verification

- Module dependency checks.
- API/worker/scheduler health endpoints.
- AI service integration only through policy-enforced internal APIs.
