# ADR-FE-007: Event contract source

**Status:** Accepted

## Context

The SSE realtime stream (ADR-FE-005) needs a machine-readable contract for event payload/version/
replay semantics, same rationale as ADR-FE-006 for REST.

## Decision

AsyncAPI 3.1 is the source of truth for realtime events, synced into
`contracts/asyncapi/tenant-events.yaml` from the backend's `backend_doc/contracts/asyncapi.yaml`.

## Consequences

- No ops-scoped (`Super Admin`) async events exist in the backend contract yet — confirmed at
  scaffold time. `contracts/asyncapi/ops-events.yaml` is a deliberate stub (`channels: {}`) rather
  than a fabricated split, documented in the file itself; revisit when backend adds ops events.
- 29 real tenant event types exist today (`packages/realtime`'s `EVENT_CATALOG`), covering
  tenant/membership/customer/catalog/inventory/knowledge/channel/message/conversation/AI/order/
  payment/shipment/return domains — the router mechanism ships in F00 with zero registered
  handlers; feature modules (F01+) register their own.
- `EventEnvelope`'s exact shape (CloudEvents-style) is described in ADR-FE-005's consequences —
  duplicated here only by reference to avoid drift between the two documents.
