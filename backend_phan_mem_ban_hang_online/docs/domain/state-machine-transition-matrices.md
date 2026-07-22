# BE-P0-006 State Machine Transition Matrices

Status: reviewed spec and test outline ready for implementation.

Source: blueprint sections 4.3, 10.8-10.12, 11, and P1/P2 phase gates.

## Global Rules

- Critical transitions require actor, timestamp, reason where applicable, audit record, and correlation ID.
- Tenant context and authorization are checked before state changes.
- Idempotent replay of the same command must not produce duplicate inventory, order, payment, outbound, webhook, audit, or outbox effects.
- External provider and AI calls must not run inside DB transactions.
- State mutation events are emitted through transactional outbox.

## Tenant Status

| From | Trigger | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| provisioning | activate | active | owner membership and default roles created | `tenant.activated.v1`, audit | happy path, duplicate activation |
| active | suspend | suspended | billing/support/security reason | kill risky mutations, `tenant.suspended.v1`, audit | mutation blocked after suspend |
| suspended | recover | active | recovery reason and permission | audit, channel/AI re-enable as policy allows | support recovery permission |
| active/suspended | close | closed | approved closure policy | disable access, retention workflow | no new tenant mutations |

## Membership and Session

| From | Trigger | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| invited | accept invite | active | invitation valid, email matches | session eligible, audit | expired invite rejected |
| active | revoke | revoked | owner/admin permission | revoke tenant sessions, `membership.changed.v1` | active session invalidated |
| active | suspend member | suspended | owner/admin permission | block tenant actions | permission negative |
| revoked/suspended | reinstate | active | owner/admin permission | permission version increments | cache invalidation SLA |

## Inventory Reservation

| From | Trigger | To | Inventory effect | Preconditions | Required tests |
|---|---|---|---|---|---|
| none | reserve | active | `reserved += quantity` | available_to_sell remains >= 0 | concurrency no negative stock |
| active | extend | active | none | policy max TTL not exceeded | expiry extended only |
| active | release | released | `reserved -= quantity` | owner matches | idempotent release |
| active | expiry job | expired | `reserved -= quantity` | now >= expires_at | retry job no double release |
| active | convert on order confirm | converted | `reserved -= quantity`, `on_hand -= quantity` | reservation active, owner/order matches | atomic with order confirm |
| released/expired/converted | retry same command | same | none | idempotency key matches | replay returns prior result |

## Order Status

| From | Command | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| none | create draft | draft | tenant/customer/source valid | `order.draft_created.v1` | tenant negative |
| draft | request customer confirm | pending_customer_confirmation | quote calculated, required contact fields | audit/history | stale quote rejected |
| draft/pending_customer_confirmation | confirm | confirmed | quote valid, reservation active, permission/approval | inventory conversion, audit, `order.confirmed.v1` | concurrent confirm once |
| draft/pending_customer_confirmation | expire | expired | timeout policy | release reservation if owned | expiry idempotent |
| draft/pending_customer_confirmation/confirmed | cancel | cancelled | cancellation policy | release/restock/refund orchestration as needed | cancel after disallowed fulfillment rejected |
| confirmed | complete | completed | paid/delivered policy or audited override | history/outbox | override permission |

## Payment Status

Order payment status is derived from immutable payment and refund records.

| From | Trigger | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| unpaid | payment intent/record | pending | valid amount/currency | payment attempt record | duplicate attempt dedupe |
| pending/unpaid | payment confirmed | partially_paid/paid | provider/manual evidence | `payment.recorded.v1`, reconciliation state | callback replay |
| pending | payment failed | unpaid | final provider failure | attempt failed, no order total mutation | failure not retried blindly |
| paid/partially_paid | refund | partially_refunded/refunded | refund policy and permission | `payment.refunded.v1` | refund over amount rejected |

## Fulfillment and Shipment

| From | Trigger | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| unfulfilled | allocate | allocated | order confirmed, inventory allocated | shipment draft/event | cannot allocate cancelled order |
| allocated | start picking | picking | warehouse permission | history | permission negative |
| picking | pack | packed | item quantities verified | packing data | quantity mismatch rejected |
| packed | ship | shipped | carrier/manual shipment data | `shipment.status_changed.v1` | idempotent provider callback |
| shipped | deliver | delivered | tracking/provider/manual evidence | order completion candidate | out-of-order callback handled |

## Return Status

| From | Trigger | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| none | request return | requested | order eligible | audit/history | ineligible item rejected |
| requested | approve/reject | approved/rejected | permission and policy | customer notification event | role negative |
| approved | mark in transit | in_transit | carrier/manual evidence | tracking event | duplicate callback |
| in_transit | receive | received | warehouse permission | inspection task | wrong tenant rejected |
| received | inspect | inspected | item condition recorded | restock/refund decision | condition rules |
| inspected | complete | completed | repair commands approved | inventory/payment effects via commands | atomic repair audit |

## Knowledge Source Version

| From | Trigger | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| draft | submit review | in_review | source checksum captured | review task | checksum immutable |
| in_review | approve | approved | reviewer permission | audit | creator/reviewer separation when required |
| approved | publish | published | chunks/embeddings ready | `knowledge.published.v1` | only published retrieval |
| published | archive | archived | replacement/expiry policy | AI retrieval disabled | stale retrieval blocked |

## Prompt Version

| From | Command | To | Gate | Required tests |
|---|---|---|---|---|
| none | create | draft | immutable version ID/checksum | checksum stable |
| draft | run evaluation | evaluating | frozen eval set/model config | eval set exists |
| evaluating | pass | approved | critical cases pass and metrics threshold | failed critical blocks |
| evaluating | fail | draft/failed | cannot activate | activation rejected |
| approved | activate | active | approver != creator when required, canary flag | rollback available |
| active | retire/replace | retired | historical logs retain version | old logs traceable |
| active | emergency rollback | retired/approved previous active | audit/incident reference | kill switch propagation |

## AI Suggestion

| From | Trigger | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| queued | start generation | generating | tenant AI enabled, budget available | trace/cost context | AI disabled rejected |
| generating | model output ready | qc_pending | schema parse candidate | tool/source log | malformed output repaired/bounded |
| qc_pending | pass QC | ready | low-risk or approved policy | `ai.suggestion_created.v1` | source freshness |
| qc_pending | human approval needed | approval_required | risk class requires approval | approval task | cannot auto-send |
| qc_pending | block | blocked | safety/source/policy violation | `ai.output_blocked.v1` | blocked output not sent |
| ready/approval_required | send | sent | conversation version/source still fresh | outbound queued | stale suggestion revalidates |
| any nonterminal | timeout/source stale | expired/failed | TTL/provider timeout | audit/metric | timeout no mutation |

## Import Job

| From | Trigger | To | Preconditions | Side effects | Required tests |
|---|---|---|---|---|---|
| uploaded | parse | parsed | file type/size accepted | staging rows | invalid encoding rejected |
| parsed | validate | validated/validation_failed | mapping known | error report | duplicate SKU cases |
| validated | preview | preview_ready | checksum stable | preview artifact | preview no mutation |
| preview_ready | apply | applying | user confirms same checksum | merge transaction/batches | idempotent apply |
| applying | finish | completed/failed/cancelled | all rows resolved or cancellation | audit/outbox/report | rollback/fatal failure |

## Webhook and Outbound Delivery

| Flow | From | Trigger | To | Preconditions | Required tests |
|---|---|---|---|---|---|
| webhook | received | verify signature | verified/rejected | raw body preserved | forged signature rejected |
| webhook | verified | normalize | normalized/dlq | schema/provider adapter | replay dedupe |
| outbound | queued | send attempt | sending | provider health/rate limit | circuit breaker |
| outbound | sending | provider success | sent | provider message ID | duplicate success idempotent |
| outbound | sending | provider final failure | failed | non-retryable class | DLQ/reprocess permission |

## Test Outline

- For each matrix: one happy path, one invalid transition, one permission negative, one tenant negative, and one idempotent replay.
- For inventory/order/payment: add concurrency tests, transaction rollback tests, and reconciliation assertions.
- For AI/prompt/suggestion: add eval gate, source freshness, approval-required, kill-switch, and blocked-output regression tests.
- For webhook/outbound/outbox: add replay, DLQ, backoff, and no duplicate external effect tests.
