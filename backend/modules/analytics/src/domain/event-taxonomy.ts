/**
 * BE-DAT-001 — Business event taxonomy (frozen AsyncAPI/outbox event types).
 */

export const BUSINESS_EVENT_TYPES = [
  "order.created",
  "order.confirmed",
  "order.cancelled",
  "payment.recorded",
  "payment.confirmed",
  "conversation.message.received",
  "conversation.sla.breached",
  "conversation.converted",
  "channel.message.sent",
  "ai.suggestion.created",
  "ai.suggestion.sent",
  "inventory.reservation.created",
  "inventory.reservation.converted"
] as const;

export type BusinessEventType = (typeof BUSINESS_EVENT_TYPES)[number];

export const PROJECTION_NAMES = [
  "order_revenue_facts",
  "order_profit_facts",
  "conversation_conversion_facts",
  "daily_channel_metrics",
  "daily_sales_agent_metrics",
  "daily_product_metrics",
  "ai_quality_facts"
] as const;

export type ProjectionName = (typeof PROJECTION_NAMES)[number];

export function isKnownBusinessEventType(value: string): value is BusinessEventType {
  return (BUSINESS_EVENT_TYPES as readonly string[]).includes(value);
}

export function classifyEventAggregate(eventType: BusinessEventType): string {
  if (eventType.startsWith("order.")) return "order";
  if (eventType.startsWith("payment.")) return "payment";
  if (eventType.startsWith("conversation.")) return "conversation";
  if (eventType.startsWith("channel.")) return "channel";
  if (eventType.startsWith("ai.")) return "ai";
  if (eventType.startsWith("inventory.")) return "inventory";
  return "unknown";
}
