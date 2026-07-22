import type { RequestSecurityContext } from "@ai-sales/auth-context";
import type { UuidV7 } from "@ai-sales/domain-kernel";

export interface AuditRecordInput {
  readonly action: string;
  readonly payload: Record<string, unknown>;
}

export interface AuditWriter {
  append(ctx: RequestSecurityContext, input: AuditRecordInput, auditId: UuidV7): Promise<void>;
}

export interface WalkingSkeletonTraceResult {
  readonly auditId: UuidV7;
  readonly outboxEventId: UuidV7;
  readonly correlationId: string;
  readonly action: string;
}

export interface WalkingSkeletonTracer {
  trace(ctx: RequestSecurityContext, message: string, ids: { auditId: UuidV7; outboxId: UuidV7; aggregateId: UuidV7 }): Promise<WalkingSkeletonTraceResult>;
}
