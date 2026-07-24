import type { EventEnvelope } from "./envelope";

/**
 * Real event-type catalog, confirmed against contracts/asyncapi/tenant-events.yaml's
 * `x-event-type` values. Spec section 12.3 lists an illustrative dot-notation catalog
 * that does NOT match these literal strings — the real AsyncAPI contract wins.
 *
 * Router: add createEventRouter when the first SSE handler registers.
 */
export const EVENT_CATALOG = [
  "com.aisales.tenant.activated.v1",
  "com.aisales.tenant.suspended.v1",
  "com.aisales.membership.changed.v1",
  "com.aisales.customer.updated.v1",
  "com.aisales.customer.merged.v1",
  "com.aisales.catalog.variant.updated.v1",
  "com.aisales.inventory.adjusted.v1",
  "com.aisales.inventory.reserved.v1",
  "com.aisales.inventory.reservation-released.v1",
  "com.aisales.inventory.reservation-expired.v1",
  "com.aisales.knowledge.published.v1",
  "com.aisales.knowledge.ingestion-completed.v1",
  "com.aisales.channel.health-changed.v1",
  "com.aisales.message.inbound-normalized.v1",
  "com.aisales.message.outbound-queued.v1",
  "com.aisales.message.outbound-sent.v1",
  "com.aisales.message.outbound-failed.v1",
  "com.aisales.conversation.created.v1",
  "com.aisales.conversation.updated.v1",
  "com.aisales.conversation.sla-breached.v1",
  "com.aisales.ai.suggestion-created.v1",
  "com.aisales.ai.output-blocked.v1",
  "com.aisales.order.draft-created.v1",
  "com.aisales.order.confirmed.v1",
  "com.aisales.order.cancelled.v1",
  "com.aisales.payment.recorded.v1",
  "com.aisales.payment.refunded.v1",
  "com.aisales.shipment.created.v1",
  "com.aisales.shipment.status-changed.v1",
  "com.aisales.return.completed.v1",
] as const;

export type EventType = (typeof EVENT_CATALOG)[number];

// Keep type export for upcoming handlers without shipping an unused router.
export type EventHandler = (envelope: EventEnvelope) => void;
