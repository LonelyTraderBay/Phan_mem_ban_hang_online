import type { RequestSecurityContext } from "@ai-sales/auth-context";
import type { AppDatabase, AppTransaction } from "@ai-sales/database";
import { withTenantTransaction } from "@ai-sales/database";
import type { DomainEvent, UuidV7 } from "@ai-sales/domain-kernel";

export interface OutboxEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly event: DomainEvent<TPayload>;
  readonly aggregateType: string;
  readonly aggregateId: UuidV7;
  readonly correlationId: string;
}

export interface OutboxWriter {
  append(ctx: RequestSecurityContext, envelope: OutboxEnvelope): Promise<void>;
}

export interface InboxConsumer {
  consume(eventId: UuidV7, handler: () => Promise<void>): Promise<"processed" | "duplicate">;
}

export class PostgresOutboxWriter implements OutboxWriter {
  constructor(private readonly db: AppDatabase) {}

  async append(ctx: RequestSecurityContext, envelope: OutboxEnvelope): Promise<void> {
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await this.appendInTransaction(trx, ctx, envelope);
    });
  }

  async appendInTransaction(
    trx: AppTransaction,
    ctx: RequestSecurityContext,
    envelope: OutboxEnvelope
  ): Promise<void> {
    await trx
      .insertInto("app.outbox_events")
      .values({
        id: envelope.event.id,
        tenant_id: ctx.tenantId,
        event_type: envelope.event.type,
        aggregate_type: envelope.aggregateType,
        aggregate_id: envelope.aggregateId,
        payload: envelope.event.payload,
        correlation_id: envelope.correlationId,
        published_at: null
      })
      .execute();
  }
}

export class MemoryOutboxWriter implements OutboxWriter {
  readonly events: OutboxEnvelope[] = [];

  async append(_ctx: RequestSecurityContext, envelope: OutboxEnvelope): Promise<void> {
    this.events.push(envelope);
  }
}

export class MemoryInboxConsumer implements InboxConsumer {
  private readonly seen = new Set<string>();

  constructor(private readonly consumerName: string) {}

  async consume(eventId: UuidV7, handler: () => Promise<void>): Promise<"processed" | "duplicate"> {
    const key = `${this.consumerName}:${eventId}`;
    if (this.seen.has(key)) {
      return "duplicate";
    }
    this.seen.add(key);
    await handler();
    return "processed";
  }
}

/** Postgres inbox dedupe helper — call inside an open tenant transaction. */
export async function consumeInboxEvent(
  trx: AppTransaction,
  ctx: RequestSecurityContext,
  consumerName: string,
  eventId: UuidV7,
  handler: () => Promise<void>
): Promise<"processed" | "duplicate"> {
  const existing = await trx
    .selectFrom("app.inbox_events")
    .select(["status"])
    .where("consumer_name", "=", consumerName)
    .where("event_id", "=", eventId)
    .executeTakeFirst();
  if (existing) {
    return "duplicate";
  }
  await trx
    .insertInto("app.inbox_events")
    .values({
      consumer_name: consumerName,
      event_id: eventId,
      tenant_id: ctx.tenantId,
      status: "processing",
      payload_hash: null,
      error: null,
      processed_at: null
    })
    .execute();
  try {
    await handler();
    await trx
      .updateTable("app.inbox_events")
      .set({ status: "processed", processed_at: new Date() })
      .where("consumer_name", "=", consumerName)
      .where("event_id", "=", eventId)
      .execute();
    return "processed";
  } catch (error) {
    await trx
      .updateTable("app.inbox_events")
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "unknown"
      })
      .where("consumer_name", "=", consumerName)
      .where("event_id", "=", eventId)
      .execute();
    throw error;
  }
}

export interface UnpublishedOutboxRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly event_type: string;
  readonly payload: Record<string, unknown>;
  readonly correlation_id: string;
}

/** Claim unpublished outbox rows with SKIP LOCKED and mark published_at. Prefer app_worker role. */
export async function claimAndMarkOutboxPublished(
  db: AppDatabase,
  limit = 50
): Promise<UnpublishedOutboxRow[]> {
  return db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom("app.outbox_events")
      .select(["id", "tenant_id", "event_type", "payload", "correlation_id"])
      .where("published_at", "is", null)
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .limit(limit)
      .execute();
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((r) => r.id);
    await trx
      .updateTable("app.outbox_events")
      .set({ published_at: new Date() })
      .where("id", "in", ids)
      .execute();
    return rows;
  });
}
