# BE-P0-001 Capacity, SLO, and Cost Assumptions

Status: P0 working approval recorded for opening P1 foundation work.

Source: `backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` sections 2.1-2.3.

## Capacity Baseline

| Metric | Production baseline | Pilot minimum proof |
|---|---:|---:|
| Active tenants | 2,000 | 600 |
| Total SKU | 5,000,000 | 1,500,000 |
| Average messages/day | 500,000 | 150,000 |
| Webhook burst | 500 req/s for 5 min | 150 req/s for 5 min |
| Order confirm burst | 100 commands/s | 30 commands/s |
| Concurrent API users | 5,000 | 1,500 |
| Concurrent SSE connections | 20,000 | 6,000 |
| Concurrent AI suggestions | 200 | 60 |
| Hot raw webhook retention | 30 days | 30 days |
| Minimum audit retention | 365 days or legal policy | 365 days or legal policy |

Pilot proof follows the blueprint rule: at least 30% of production baseline plus a scale-out plan to full baseline.

## SLO Targets

| Journey | SLI | Monthly SLO |
|---|---|---:|
| Core API availability | Valid requests without 5xx | 99.9% |
| Order confirm availability | Valid confirm preconditions succeed | 99.95% |
| API read latency | p95, excluding external provider | <= 300 ms |
| API write latency | p95, excluding AI/provider | <= 500 ms |
| Order confirm latency | p95 | <= 1,000 ms |
| Webhook acknowledgment | p95 | <= 1,000 ms |
| Webhook to normalized message | p95 | <= 10 s |
| Normalized message to SSE | p95 | <= 2 s |
| AI suggestion | p95 | <= 12 s, hard timeout 20 s |
| Queue success | Job succeeds before DLQ | >= 99.9% |
| Backup | RPO | <= 5 min |
| Disaster recovery | RTO for core API | <= 60 min |

## Data Correctness Assumptions

- Inventory must not become negative from race conditions.
- 100% confirmed orders must have status history, audit, and outbox event.
- 100% payment callbacks must have a dedupe key and reconciliation state.
- Closed-day revenue/order facts reconcile to source transactions with zero unexplained mismatch.
- 100% AI business mutations must have tool log, actor, prompt/model version, policy decision, and correlation ID.

## Cost Assumptions

| Cost area | Baseline assumption | Control before production |
|---|---|---|
| API/worker/scheduler compute | Horizontal scaling by process role, not premature microservices | p95 latency and CPU/memory dashboards |
| PostgreSQL | Source of truth; RLS and transactional correctness take priority over premature read splitting | index review, query budget, backup/PITR cost owner |
| Redis/BullMQ | Queue, replay buffer, cache, and scheduler coordination | queue age, DLQ, memory, and retry budget alerts |
| Object storage | Private bucket, short-lived signed URLs, lifecycle delete | retention policy, malware state, export TTL |
| AI model/embedding | Budgeted per tenant/user/feature with kill switches | cost dashboard, concurrency limit, fallback policy |
| Telemetry | Logs/metrics/traces required, with redaction | retention and cardinality controls |

No exact vendor spend is approved in P0. Pricing depends on selected cloud, model provider, observability backend, object storage, and managed database tier. P1 must add a vendor-specific cost model before staging infrastructure approval.

## Load-Test Acceptance

- Synthetic workload covers API read/write, webhook ingress, order confirm, queue worker, SSE reconnect, and AI suggestion concurrency.
- Load tests report p50/p95/p99, error rate, queue age, DB pool wait, lock/deadlock count, Redis saturation, and OTel ingestion health.
- Pilot release may proceed only if it proves the pilot minimum proof targets and documents the path to full baseline.

## Sign-Off

### P0 Working Approval

| Field | Value |
|---|---|
| Approval date | 2026-06-27 |
| Approval source | Project requester instruction in Codex session |
| Approved scope | Start P1 `BE-FND-*` foundation work using the baseline capacity, SLO, and cost assumptions in this document |
| Not approved by this record | Vendor-specific spend, staging capacity purchase, production launch, relaxed SLOs, or removal of security/AI/tenant controls |
| Required before staging/production | Human Owner decisions below plus vendor-specific cost model and load-test evidence |

This approval unblocks foundation implementation only. It does not replace Human Owner approval for
staging and production gates — this project's build team is 2 AI agents (Backend AI Agent,
Frontend AI Agent) plus one human (Human Owner), not a multi-role human org; see
`docs/domain/glossary.md`'s roles table.

### Decision Tracking (live copy: `docs/collaboration/SIGNOFF_TRACKER.md`)

The 6 role-specific approvals originally tracked here (Product Owner, Business Owner, Backend
Lead, Platform/SRE Lead, Security Lead, AI Owner) collapse to 2 actors in this project:

| Decision | Owner now | Status |
|---|---|---|
| Business baseline and pilot scope accepted | Human Owner | Pending before staging |
| Retention, audit, and SLO trade-offs accepted | Human Owner | Pending before staging |
| Architecture can meet baseline | Backend AI Agent (self-certifies via load-test evidence) | Pending — needs evidence |
| Infra and observability plan can meet SLOs | Backend AI Agent (technical); real spend commitment is Human Owner | Pending before staging |
| Isolation, retention, and AI controls acceptable (risk acceptance) | Human Owner | Pending before staging |
| AI budget/concurrency/eval controls acceptable (real spend + risk) | Human Owner | Pending before staging |

P1 foundation may begin with the P0 working approval above. Staging and production remain blocked
until the Human Owner items above are resolved — see
[`../collaboration/SIGNOFF_TRACKER.md`](../collaboration/SIGNOFF_TRACKER.md) for the live queue.
