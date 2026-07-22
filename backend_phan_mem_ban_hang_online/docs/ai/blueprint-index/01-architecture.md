# Blueprint §1 — Target architecture

**Source:** §1.1–1.4 (search `# 1.`)

- Modular monolith: NestJS API + BullMQ worker + scheduler + FastAPI AI service.
- PostgreSQL 18 with RLS, Redis 8, object storage, OTel observability.
- Required ADRs ADR-001…010 committed before domain work.
