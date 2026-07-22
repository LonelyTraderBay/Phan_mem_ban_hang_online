---
name: ai-sales-backend
description: Enterprise Backend workflow for the AI Sales Operating System. Use when implementing, reviewing, planning, refactoring, debugging, or creating tickets for this project's backend, including NestJS api/worker/scheduler, FastAPI ai-service, PostgreSQL/RLS, OpenAPI/AsyncAPI contracts, idempotency, outbox/inbox, security, observability, CI/CD, AI tool governance, or any task under backend_doc.
---

# AI Sales Backend

## Prime Directive

Treat `backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` as the project constitution. Priority order:

1. Approved ADRs in `docs/adr/`
2. Frozen OpenAPI/AsyncAPI contracts for the sprint
3. Blueprint v2.0
4. `backend_doc/matrices/*.csv` and templates
5. Ticket text in `docs/tickets/`
6. Existing code

Never bypass tenant isolation, RLS, authorization, idempotency, transaction safety, audit, outbox/inbox, telemetry, secret/PII redaction, or AI approval/eval gates.

## Start Every Task

```bash
pnpm agent:context <TASK_ID>
```

Then read only the returned read set. Always start with:

- `backend_doc/START_HERE.md`
- `docs/ai/CONTEXT_MAP.md`
- `.cursor/rules/` (auto-loaded)

For API work: slice contracts with `pnpm agent:contract-slice --tag <Tag>` — never load full OpenAPI.

See `references/read-order.md` and `references/phase-gates.md`.

## Task Routing

| Prefix | Module / area | Primary paths |
|--------|---------------|---------------|
| BE-P0-* | Documentation baseline | `backend_doc/`, `docs/p0/`, `docs/adr/` |
| BE-FND-* | Foundation | `apps/`, `packages/`, `infra/`, `tools/` |
| BE-IDN-* | Identity/auth | `modules/identity/`, `modules/tenant/` |
| BE-CUS-* | Customer CDP | `modules/customer/` |
| BE-CAT-* | Catalog | `modules/catalog/` |
| BE-INV-* | Inventory | `modules/inventory/` |
| BE-KNW-* | Knowledge | `modules/knowledge/` |
| BE-CHN-* | Channel | `modules/channel/` |
| BE-CON-* | Conversation | `modules/conversation/` |
| BE-ORD-* | Order | `modules/order/` |
| BE-PAY-* | Payment | `modules/payment/` |
| BE-FUL-* / BE-RET-* | Fulfillment | `modules/fulfillment/` |
| BE-AI-* | AI orchestration | `modules/ai-orchestration/`, `apps/ai-service/` |
| BE-DAT-* | Analytics | `modules/analytics/` |
| BE-BIL-* | Billing | `modules/billing/` |
| BE-OPS-* / BE-DSK-* | Operations | `modules/operations/` |
| BE-HRD-* | Hardening | `docs/`, CI, load tests |

OpenAPI tag → module map: `docs/ai/openapi-module-map.yaml`.

## Ticket Workflow

1. Preflight — domain, phase, contracts, tenant class, permissions, idempotency, audit, events, telemetry, rollback.
2. Contract first — update OpenAPI/AsyncAPI/error/permission catalogs.
3. Test design — unit, integration, tenant negative, permission negative, idempotency, concurrency.
4. Data change — immutable migrations, RLS, composite tenant FKs.
5. Domain/application — keep domain framework-free.
6. Cross-cutting — authorization, idempotency, audit, outbox, telemetry, correlation IDs.
7. Verification — `pnpm verify` (+ `pnpm test:py` if ai-service touched).
8. Completion manifest in ticket file.

## Hard Stops

- Client-provided `tenant_id` for authorization
- AI writing business tables directly
- Skipping RLS on tenant-owned data
- Floating point for money
- Hard-delete ledger/order/payment/audit/event records
- Logging PII, secrets, raw prompts, provider tokens
- Endpoint without OpenAPI + permission + error catalog entry
- Provider/webhook/payment/order/inventory mutation without idempotency
- Production prompt/model without eval, approval, rollback, kill switch

## Golden Path Reference

Walking skeleton (BE-FND-016): `modules/audit/` — auth context → tenant transaction → audit append → outbox append. Study before implementing similar flows.

## Review Bias

1. Tenant isolation, auth/RBAC, AI privilege boundaries
2. Transaction correctness, idempotency, outbox/inbox, concurrency
3. Contract compatibility
4. Migrations, RLS, rollback safety
5. Observability and SLOs
6. Test gaps
7. Simplicity (ponytail) without removing required controls

## Skill routing (on-demand)

Load one skill at a time from `.cursor/skills/`. See `agent-stack-router` for full map.

| Prefix / task | Skill |
|---------------|-------|
| BE-FND-005, OpenAPI, DTOs | `api-and-interface-design` |
| BE-IDN-*, BE-PAY-*, auth, RLS, webhooks | `security-and-hardening` |
| Implement / fix behavior | `test-driven-development` |
| BE-ORD-*, BE-PAY-*, migrations, irreversible | `doubt-driven-development` |
| CI fail, flaky test, bug | `debugging-and-error-recovery` |

## Exploration (token savings)

Before bulk grep across modules:

1. `pnpm agent:context <TASK_ID>`
2. GitNexus MCP — `impact`, `context`, `query` for call chains and blast radius
3. Targeted reads only

Re-index after large merges: `pnpm agent:gitnexus-reindex`

## Post-implementation

- Diff >100 LOC: review for over-engineering (ponytail ladder); do not remove enterprise controls
- Payment/order/idempotency changes: run doubt-driven checklist before claiming done
