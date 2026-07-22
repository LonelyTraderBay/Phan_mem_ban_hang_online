# ADR-FE-005: Real-time architecture

**Status:** Accepted

## Context

Conversations, inventory, order, and AI-suggestion state must update live across open tabs/devices
without every client polling. WebSockets add bidirectional complexity (reconnect/backpressure on
both ends) that is not needed here — the client never needs to push arbitrary messages over the
realtime channel, only to react to server-originated events.

## Decision

REST for all commands/queries; a single Server-Sent Events (SSE) stream (`GET /realtime/stream`)
for server-to-client events. WebSockets are disallowed by default, addable only via a future ADR.

## Consequences

- One connection lifecycle to manage per app (`packages/realtime`'s `createSseClient`), not two
  transports.
- Native browser `EventSource` cannot set custom request headers — confirmed during F00 scaffolding.
  Spec 12.4's "gửi Last-Event-ID header" is approximated via a `lastEventId` query parameter
  instead; a fetch-based SSE client would be needed to send the literal header. Flagged in
  `packages/realtime/src/sseClient.ts` for reconsideration before real integration.
- The realtime event envelope actually shipped by the backend (`contracts/asyncapi/tenant-events.yaml`'s
  CloudEvents-shaped `EventEnvelope`: `specversion/id/source/type/time/datacontenttype/tenantid/
  correlationid/data`) differs from spec section 12.2's illustrative example envelope
  (`schema_version/aggregate_id/aggregate_version/sequence/payload`) — the real AsyncAPI contract
  was treated as authoritative per spec section 28's own rule, not the illustrative example.
- Real event `type` values are reverse-DNS strings (`com.aisales.order.confirmed.v1`), not the
  dot-notation names in spec 12.3's illustrative catalog (`order.confirmed`) — `packages/realtime`'s
  `EVENT_CATALOG` uses the confirmed real values.
