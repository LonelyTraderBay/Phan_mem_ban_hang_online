import type { RequestSecurityContext } from "@ai-sales/auth-context";
import type { AppDatabase, AppTransaction } from "@ai-sales/database";
import { withTenantTransaction } from "@ai-sales/database";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import { redactValue } from "@ai-sales/observability";
import { PostgresOutboxWriter, type OutboxEnvelope, type OutboxWriter } from "@ai-sales/outbox";
import type { AuditWriter, WalkingSkeletonTraceResult, WalkingSkeletonTracer } from "../../application/ports/audit-writer.port.js";

export { PostgresOutboxWriter };
export type { OutboxEnvelope, OutboxWriter };

export class PostgresAuditWriter implements AuditWriter {
  constructor(private readonly db: AppDatabase) {}

  async append(ctx: RequestSecurityContext, input: { action: string; payload: Record<string, unknown> }, auditId: UuidV7): Promise<void> {
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await this.insertAudit(trx, ctx, auditId, input.action, input.payload);
    });
  }

  async insertAudit(
    trx: AppTransaction,
    ctx: RequestSecurityContext,
    auditId: UuidV7,
    action: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const redacted = redactValue(payload) as Record<string, unknown>;
    await trx
      .insertInto("app.audit_events")
      .values({
        id: auditId,
        tenant_id: ctx.tenantId,
        action,
        actor_id: ctx.actorId,
        correlation_id: ctx.correlationId,
        payload: redacted
      })
      .execute();
  }
}

export class PostgresWalkingSkeletonTracer implements WalkingSkeletonTracer {
  constructor(
    private readonly db: AppDatabase,
    private readonly auditWriter: PostgresAuditWriter,
    private readonly outboxWriter: PostgresOutboxWriter
  ) {}

  async trace(
    ctx: RequestSecurityContext,
    message: string,
    ids: { auditId: UuidV7; outboxId: UuidV7; aggregateId: UuidV7 }
  ): Promise<WalkingSkeletonTraceResult> {
    const action = "walking_skeleton.trace";

    await withTenantTransaction(this.db, ctx, async (trx) => {
      await this.auditWriter.insertAudit(trx, ctx, ids.auditId, action, { message });
      await this.outboxWriter.appendInTransaction(trx, ctx, {
        event: {
          id: ids.outboxId,
          type: "walking_skeleton.traced",
          version: 1,
          occurredAt: new Date(),
          tenantId: ctx.tenantId,
          payload: { message, auditId: ids.auditId }
        },
        aggregateType: "walking_skeleton",
        aggregateId: ids.aggregateId,
        correlationId: ctx.correlationId
      });
    });

    return {
      auditId: ids.auditId,
      outboxEventId: ids.outboxId,
      correlationId: ctx.correlationId,
      action
    };
  }
}
