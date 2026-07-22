# Agent Context Map

Use `pnpm agent:context <TASK_ID>` for machine-readable output. This file is the human/agent routing reference.

## Task prefix → read set

| Task prefix | Read first | Then | Never load whole |
|-------------|------------|------|------------------|
| BE-P0-* | `docs/p0/P0_CHECKLIST.md` | Relevant ADR in `docs/adr/`; Blueprint §19.2 phase entry/exit | Full blueprint |
| BE-FND-001 | `docs/adr/ADR-001-modular-monolith-worker-ai-service.md` | `pnpm-workspace.yaml`, `eslint.config.mjs` | — |
| BE-FND-002 | `infra/docker/compose.yaml` | `docs/release/environment-topology.md` | — |
| BE-FND-003 | `packages/config/src/index.ts` | ADR-010 | — |
| BE-FND-004 | `apps/api/src/main.ts`, ADR-003 | `backend_doc/matrices/error_catalog.csv`; Blueprint §8.3–8.5 headers/success/error contract | Full openapi |
| BE-FND-005 | ADR-003, `tools/validate-contracts.mjs` | Sliced OpenAPI via `agent:contract-slice`; Blueprint §8.1 contract source rules | Full openapi |
| BE-FND-006 | `packages/database/src/index.ts`, ADR-002 | `infra/migrations/` | — |
| BE-FND-007 | `infra/migrations/000001_bootstrap_roles.sql` | ADR-010 | — |
| BE-FND-008 | ADR-002, blueprint §6 | `packages/database/` | Full blueprint |
| BE-FND-009 | `packages/idempotency/src/index.ts` | Blueprint §8.7 idempotency contract | — |
| BE-FND-010 | `packages/outbox/src/index.ts`, ADR-004 | Blueprint §9.4–9.5 outbox/inbox | — |
| BE-FND-011 | `apps/worker/src/main.ts`, `apps/scheduler/src/main.ts` | ADR-004; Blueprint §9.6–9.7 queue topology/retry | — |
| BE-FND-012 | `modules/audit/README.md` | Walking skeleton in `modules/audit/`; Blueprint §12.9 audit integrity | — |
| BE-FND-013 | `packages/observability/src/index.ts` | `infra/docker/otel-collector.yaml`; Blueprint §15 observability | — |
| BE-FND-014 | `.github/workflows/ci.yml` | Blueprint §16.4 CI pipeline | — |
| BE-FND-016 | `modules/audit/README.md`, `docs/tickets/BE-FND-016.md` | Golden path code; Blueprint §19.3 P1 acceptance | — |
| BE-IDN-* | `docs/ai/blueprint-index/05-identity-auth.md` | `modules/identity/README.md`, `agent:contract-slice --tag Auth`; Blueprint §9.8 identity/membership events, §10.2–10.3 tenant/membership lifecycle, §12.4 crypto/key mgmt, §22.1 error codes | Full blueprint |
| BE-CUS-* | Blueprint §7.6 | `modules/customer/README.md`, tag Customers; Blueprint §8.9.2 endpoints, §11.9 merge transaction, §12.10 privacy lifecycle (export/anonymize) | Full openapi |
| BE-CAT-* | Blueprint §7.7 | `modules/catalog/README.md`, tag Catalog; Blueprint §8.9.3 endpoints, §10.4 import job lifecycle, §22.3 error codes | — |
| BE-IMP-* | Blueprint §7.7.6 import schema | `modules/catalog/README.md`, tag Imports; Blueprint §8.9.3 import endpoints, §10.4 import lifecycle, §11.8 import apply transaction, §22.3 error codes | — |
| BE-INV-* | Blueprint §7.8, state machines | `modules/inventory/README.md`, tag Inventory; Blueprint §8.9.4 endpoints, §10.9 reservation lifecycle, §11.2/§11.10 reservation algorithm + deadlock retry, §21.5 discrepancy runbook, §22.4 error codes | — |
| BE-KNW-* | Blueprint §7.9 | `modules/knowledge/README.md`, tag Knowledge; Blueprint §8.9.5 endpoints, §10.5 knowledge lifecycle, §13.8 RAG ingestion (see `blueprint-index/13-ai-governance.md`) | — |
| BE-CHN-* | Blueprint §7.10 | `modules/channel/README.md`, tags Channels/Webhooks; Blueprint §8.9.6 endpoints, §10.6 channel account health, §9.10 webhook ingress flow, §11.7 normalize/upsert, §21.4 provider incident runbook, §22.5 error codes | — |
| BE-CON-* | Blueprint §7.10 | `modules/conversation/README.md`, tag Conversations; Blueprint §8.9.7 endpoints, §10.8 conversation state model, §9.9 realtime SSE contract, §11.6 outbound message send, §22.5 error codes | — |
| BE-ORD-* | Blueprint §7.11, ADR-006 | `modules/order/README.md`, tag Orders; Blueprint §8.9.9 + §8.10.1–8.10.2 endpoints/examples, §9.8 order events, §10.10.1 order state machine, §11.2–11.5 reservation/confirm/cancel/payment transactions, §12.8 tenant/IDOR controls, §22.4 error codes | — |
| BE-PAY-* | Blueprint §7.11 | `modules/payment/README.md`, tag Payments; Blueprint §8.9.9 endpoints, §9.8 payment events, §10.10.2 payment_status, §11.5 payment callback transaction, §12.4 crypto/key mgmt, §21.6 mismatch runbook, §22.4 error codes | — |
| BE-FUL-* / BE-RET-* | Blueprint §7.11 | `modules/fulfillment/README.md`, tags Shipments/Returns; Blueprint §8.9.9 endpoints, §10.10.3–10.10.4 fulfillment/return state machines, §11.4 cancel-order compensating flow, §22.4 error codes | — |
| BE-AI-* | Blueprint §13, ADR-009 | `modules/ai-orchestration/README.md`, `apps/ai-service/`; Blueprint §8.9.8 AI endpoints, §9.8 AI events, §10.11–10.12 prompt/suggestion lifecycle, §21.7 unsafe-output runbook, §22.6 error codes | — |
| BE-DAT-* | Blueprint §7.12 | `modules/analytics/README.md`, tag Analytics; Blueprint §8.9.10 endpoints, §14 metric dictionary/reconciliation | — |
| BE-BIL-* | Blueprint §7.12 | `modules/billing/README.md`, tag Billing; Blueprint §8.9.10 endpoints, §9.8 `billing.usage_recorded` event, §14.3.2–14.3.3 revenue/profit metrics | — |
| BE-OPS-* | Blueprint §7.12 | `modules/operations/README.md`, tag Operations; Blueprint §8.9.10 super-admin endpoints, §16 infra/CI-CD, §21 runbooks, §25 feature flag catalog | — |
| BE-HRD-* | `docs/p0/P0_CHECKLIST.md` (pilot/hardening readiness) | Blueprint §19.13 P11 hardening tasks/exit gate, §12.14 security test gate, §17.6 load scenarios, §26 production readiness gate | Full blueprint |
| BE-DSK-* | `modules/operations/README.md` (desktop/device support) | Blueprint §19.12 P10 desktop tasks, §9.9 SSE contract, §12.11 object storage security (signed print assets) | — |

## Blueprint section index

| Section | Summary file | Blueprint anchor |
|---------|--------------|------------------|
| §0 Usage | `blueprint-index/00-overview.md` | §0 |
| §1 Architecture | `blueprint-index/01-architecture.md` | §1.1–1.4 |
| §2 NFR/SLO | `blueprint-index/02-nfr-slo.md` | §2.1–2.3 |
| §3 Monorepo | `blueprint-index/03-monorepo.md` | §3.1–3.4 |
| §4 Domain | `blueprint-index/04-domain.md` | §4.1–4.3 |
| §5 Identity/Auth | `blueprint-index/05-identity-auth.md` | §5.1–5.6 |
| §6 RLS/Multitenancy | `blueprint-index/06-rls-multitenancy.md` | §6.1–6.6 |
| §7 Data model | `blueprint-index/07-data-model.md` | §7.1–7.13 |
| §8 HTTP API contract | `blueprint-index/08-contracts-http.md` | §8.1–8.11 |
| §9 Events/queue/realtime | `blueprint-index/09-events.md` | §9.1–9.10 |
| §10 State machines | `blueprint-index/10-state-machines.md` | §10.1–10.12 |
| §11 Transactions/locking | `blueprint-index/11-transactions.md` | §11.1–11.11 |
| §12 Security/privacy | `blueprint-index/12-security.md` | §12.1–12.14 |
| §13 AI | `blueprint-index/13-ai-governance.md` | search `# 13.` |
| §14 Analytics/metrics | `blueprint-index/14-analytics-metrics.md` | §14.1–14.6 |
| §15 Observability/SRE | `blueprint-index/15-observability.md` | §15.1–15.8 |
| §16 Infra/CI-CD/DR | `blueprint-index/16-infra-cicd-dr.md` | §16.1–16.11 |
| §17 Testing strategy | `blueprint-index/17-testing-strategy.md` | §17.1–17.8 |
| §18 Delivery governance | `blueprint-index/18-delivery-governance.md` | §18.1–18.4 |
| §19 Implementation phases | `blueprint-index/19-implementation-phases.md` | §19.1–19.14 |
| §19 Backlog (CSV) | `backend_doc/matrices/implementation_backlog.csv` | §19.2 |
| §20 Agent operating protocol | `blueprint-index/20-agent-protocol.md` | §20.1–20.5 |
| §21 Runbooks | `blueprint-index/21-runbooks.md` | §21.1–21.10 |
| §22 Error catalog | `blueprint-index/22-error-catalog.md` | §22.1–22.6 |
| §23–26 Role/retention/flags/readiness | `blueprint-index/23-26-governance-baselines.md` | §23–§26 |
| §27–28 Standards/conclusion | `blueprint-index/27-28-standards-conclusion.md` | §27–§28 |

Full file: `backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` — use grep/section links, not full read.

## Module map (16 bounded contexts)

| Module | Path | OpenAPI tags | Task prefixes |
|--------|------|--------------|---------------|
| identity | `modules/identity/` | Auth, Sessions | BE-IDN-* |
| tenant | `modules/tenant/` | Tenant | BE-IDN-* |
| customer | `modules/customer/` | Customers | BE-CUS-* |
| catalog | `modules/catalog/` | Catalog, Imports | BE-CAT-*, BE-IMP-* |
| inventory | `modules/inventory/` | Inventory | BE-INV-* |
| knowledge | `modules/knowledge/` | Knowledge | BE-KNW-* |
| channel | `modules/channel/` | Channels, Webhooks | BE-CHN-* |
| conversation | `modules/conversation/` | Conversations, Realtime | BE-CON-* |
| ai-orchestration | `modules/ai-orchestration/` | AI | BE-AI-* |
| order | `modules/order/` | Orders | BE-ORD-* |
| payment | `modules/payment/` | Payments | BE-PAY-* |
| fulfillment | `modules/fulfillment/` | Shipments, Returns | BE-FUL-*, BE-RET-* |
| analytics | `modules/analytics/` | Analytics | BE-DAT-* |
| billing | `modules/billing/` | Billing | BE-BIL-* |
| audit | `modules/audit/` | Audit | BE-FND-012, BE-FND-016, BE-IDN-013 |
| operations | `modules/operations/` | Operations | BE-OPS-* |

Detailed tag mapping: `openapi-module-map.yaml`.

## Verification commands

```bash
pnpm agent:context BE-FND-009
pnpm agent:contract-slice --tag Auth
pnpm verify
pnpm verify:all   # includes Python
```
