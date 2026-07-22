/**
 * BE-CON-010 — SSE authorization / fan-out / replay / resync stubs.
 */

export interface SseSubscriptionScope {
  readonly tenantId: string;
  readonly memberId: string;
  readonly conversationIds: readonly string[];
}

export interface SseEventEnvelope {
  readonly id: string;
  readonly type: string;
  readonly tenantId: string;
  readonly conversationId: string | null;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: string;
}

export function authorizeSseStreamStub(options: {
  readonly tenantId: string;
  readonly memberId: string;
  readonly permissions: readonly string[];
}): SseSubscriptionScope | null {
  if (!options.permissions.includes("conversation.read")) return null;
  return {
    tenantId: options.tenantId,
    memberId: options.memberId,
    conversationIds: []
  };
}

export function fanOutConversationEventStub(
  scope: SseSubscriptionScope,
  event: SseEventEnvelope
): readonly SseEventEnvelope[] {
  if (event.tenantId !== scope.tenantId) return [];
  if (scope.conversationIds.length === 0) return [event];
  if (event.conversationId && scope.conversationIds.includes(event.conversationId)) {
    return [event];
  }
  return [];
}

export function replayEventsSinceStub(
  events: readonly SseEventEnvelope[],
  lastEventId: string | null
): readonly SseEventEnvelope[] {
  if (!lastEventId) return events;
  const idx = events.findIndex((e) => e.id === lastEventId);
  if (idx < 0) return events;
  return events.slice(idx + 1);
}
