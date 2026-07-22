import type { BusinessEventType, ProjectionName } from "./event-taxonomy.js";

/**
 * BE-DAT-002 — Projection consumer watermark + inbox apply stub.
 */

export interface ProjectionWatermark {
  readonly tenantId: string;
  readonly projectionName: ProjectionName;
  readonly lastEventId: string | null;
  readonly lastOccurredAt: string | null;
  readonly updatedAt: string;
}

export interface BusinessEventRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly eventType: BusinessEventType;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
  readonly sourceEventId: string | null;
}

export interface ProjectionApplyResult {
  readonly applied: boolean;
  readonly watermark: ProjectionWatermark;
}

export function shouldApplyEvent(
  watermark: ProjectionWatermark | null,
  event: BusinessEventRecord
): boolean {
  if (!watermark?.lastOccurredAt) return true;
  return event.occurredAt >= watermark.lastOccurredAt;
}

export function nextWatermark(
  watermark: ProjectionWatermark | null,
  event: BusinessEventRecord,
  projectionName: ProjectionName,
  now: Date
): ProjectionWatermark {
  return {
    tenantId: event.tenantId,
    projectionName,
    lastEventId: event.id,
    lastOccurredAt: event.occurredAt,
    updatedAt: now.toISOString()
  };
}
