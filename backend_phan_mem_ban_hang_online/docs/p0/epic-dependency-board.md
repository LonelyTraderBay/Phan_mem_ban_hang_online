# BE-P0-011 Epic Decomposition and Dependency Board

Status: implementation-ready backlog board created from `backend_doc/matrices/implementation_backlog.csv`.

## Phase Dependency Map

```text
P0 baseline
  -> P1 foundation/walking skeleton
    -> P2 identity/tenant/RBAC
      -> P3 customer/catalog/import
      -> P4 inventory/knowledge/RAG
        -> P7 order/payment/fulfillment
      -> P5 channel/webhook/outbound
        -> P6 conversation/realtime
          -> P8 AI copilot/tool calling
    -> P9 analytics/reporting
    -> P10 billing/operations/desktop
      -> P11 production hardening
        -> P12 commercial release
```

## P0 Exit Dependencies

| Task | Deliverable | Blocks | Status |
|---|---|---|---|
| BE-P0-001 | Capacity/SLO/cost assumptions sign-off | P1 infra sizing, load tests, staging plan | Sign-off pending |
| BE-P0-002 | ADR-001 to ADR-010 | All P1+ implementation | Done |
| BE-P0-003 | Context/data flow/trust boundary seed | Threat modeling, security tests | Done |
| BE-P0-004 | ERD/table classification seed | P1 migrations, P2 schema | Done |
| BE-P0-005 | Permission matrix/default roles baseline | P2 RBAC, API authorization | Done |
| BE-P0-006 | State machine transition matrices/test outline | P3-P8 domain tests | Done |
| BE-P0-007 | Contract skeleton and validation | API/event work | Done |
| BE-P0-008 | Error/idempotency/audit/event catalogs | P1 middleware/components | Done |
| BE-P0-009 | Environment/topology/release strategy | P1 CI/CD, staging plan | Done |
| BE-P0-010 | Security/AI threat model seed | P1/P2 security, P8 AI | Done |
| BE-P0-011 | Epic decomposition/dependency board | Delivery planning | Done |

## P1 Foundation Board

| Task | Depends on | Start when | Done evidence |
|---|---|---|---|
| BE-FND-001 Monorepo/bootstrap | BE-P0-002, BE-P0-011 | P0 approved | `pnpm verify:all`, boundary lint |
| BE-FND-002 Local stack | BE-P0-001, BE-P0-009 | Platform owner assigned | Docker Compose starts PostgreSQL/Redis/object/OTel |
| BE-FND-003 Config package | BE-FND-001 | Workspace ready | typed config tests, secret redaction |
| BE-FND-004 HTTP baseline | BE-FND-001, BE-FND-003 | API skeleton ready | `/health`, correlation ID, RFC9457 errors |
| BE-FND-005 OpenAPI pipeline | BE-P0-007 | contract package exists | lint, generated client/types/mock |
| BE-FND-006 Database package | BE-FND-003 | DB URL/config ready | Kysely/pg pool, statement timeout |
| BE-FND-007 Migration framework | BE-FND-006, BE-P0-004 | DB package ready | fresh/upgrade migration tests |
| BE-FND-008 Tenant transaction/RLS test harness | BE-FND-006, BE-FND-007 | runtime role exists | deny-default RLS tests |
| BE-FND-009 Idempotency component | BE-P0-008, BE-FND-006 | DB migration framework ready | replay tests |
| BE-FND-010 Outbox/inbox component | BE-P0-008, BE-FND-006 | DB migration framework ready | producer/consumer/DLQ tests |
| BE-FND-011 Queue/scheduler skeleton | BE-FND-002, BE-FND-003 | Redis local stack ready | BullMQ queue lifecycle tests |
| BE-FND-012 Audit append port | BE-P0-008, BE-FND-006 | DB package ready | transaction-aware audit tests |
| BE-FND-013 Observability | BE-P0-001, BE-FND-004 | service baseline ready | OTel logs/traces/metrics visible |
| BE-FND-014 CI/CD | BE-FND-001, BE-FND-005 | workspace gates exist | PR pipeline with scans/SBOM placeholders |
| BE-FND-015 Staging infra | BE-P0-001, BE-P0-009, BE-FND-014 | P1 gates passing | managed dependency plan |
| BE-FND-016 Walking skeleton | BE-FND-004 through BE-FND-013 | foundation controls ready | API -> transaction -> audit -> outbox -> worker trace |

## First Sprint Recommendation After P0 Approval

1. BE-FND-001 Monorepo/bootstrap hardening.
2. BE-FND-003 Config package.
3. BE-FND-004 HTTP baseline.
4. BE-FND-005 OpenAPI pipeline.
5. BE-FND-006 Database package.
6. BE-FND-007 Migration framework.
7. BE-FND-008 Tenant transaction/RLS test harness.

Do not start BE-FND-016 walking skeleton until tenant transaction, audit, idempotency, and outbox foundations have enough test coverage to prove the path.
