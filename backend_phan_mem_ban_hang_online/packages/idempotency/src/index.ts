import type { RequestSecurityContext } from "@ai-sales/auth-context";
import type { AppDatabase, AppTransaction } from "@ai-sales/database";
import { withTenantTransaction } from "@ai-sales/database";
import { redactValue } from "@ai-sales/observability";

export type IdempotencyStatus = "processing" | "completed" | "failed_retryable" | "failed_final";

export interface IdempotencyRequest {
  readonly scope: string;
  readonly key: string;
  readonly requestHash: string;
  readonly ttlSeconds: number;
}

export interface IdempotencyResponsePayload {
  readonly resourceId?: string;
  readonly responseStatus: number;
  readonly responseBody: unknown;
}

export interface IdempotencyRecord {
  readonly status: IdempotencyStatus;
  readonly requestHash: string;
  readonly resourceId?: string;
  readonly responseStatus?: number;
  readonly responseBody?: unknown;
  readonly expiresAt: Date;
}

export class IdempotencyKeyReusedError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REUSED";
  constructor() {
    super("Idempotency key already used with a different request hash.");
    this.name = "IdempotencyKeyReusedError";
  }
}

export class IdempotencyInProgressError extends Error {
  readonly code = "IDEMPOTENCY_IN_PROGRESS";
  constructor() {
    super("Idempotency key is still processing.");
    this.name = "IdempotencyInProgressError";
  }
}

export type ReserveOutcome =
  | { readonly outcome: "acquired" }
  | { readonly outcome: "replay"; readonly record: IdempotencyRecord };

export interface IdempotencyStore {
  reserve(ctx: RequestSecurityContext, request: IdempotencyRequest): Promise<ReserveOutcome>;
  complete(ctx: RequestSecurityContext, request: IdempotencyRequest, response: IdempotencyResponsePayload): Promise<void>;
  fail(
    ctx: RequestSecurityContext,
    request: IdempotencyRequest,
    failure: { readonly retryable: boolean }
  ): Promise<void>;
}

function scopeKey(ctx: RequestSecurityContext, request: IdempotencyRequest) {
  return {
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    operationId: request.scope,
    idempotencyKey: request.key
  };
}

function expiresAtFromTtl(ttlSeconds: number): Date {
  return new Date(Date.now() + ttlSeconds * 1000);
}

function decideReserve(existing: IdempotencyRecord | undefined, requestHash: string): ReserveOutcome | "retry_acquire" {
  if (!existing) {
    return "retry_acquire";
  }
  if (existing.requestHash !== requestHash) {
    throw new IdempotencyKeyReusedError();
  }
  if (existing.status === "processing") {
    throw new IdempotencyInProgressError();
  }
  if (existing.status === "completed") {
    return { outcome: "replay", record: existing };
  }
  if (existing.status === "failed_final") {
    throw new IdempotencyKeyReusedError();
  }
  // failed_retryable + same hash → caller may re-acquire
  return "retry_acquire";
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  private mapKey(ctx: RequestSecurityContext, request: IdempotencyRequest): string {
    const s = scopeKey(ctx, request);
    return `${s.tenantId}|${s.actorId}|${s.operationId}|${s.idempotencyKey}`;
  }

  async reserve(ctx: RequestSecurityContext, request: IdempotencyRequest): Promise<ReserveOutcome> {
    const key = this.mapKey(ctx, request);
    const existing = this.records.get(key);
    const decision = decideReserve(existing, request.requestHash);
    if (decision !== "retry_acquire") {
      return decision;
    }
    const record: IdempotencyRecord = {
      status: "processing",
      requestHash: request.requestHash,
      expiresAt: expiresAtFromTtl(request.ttlSeconds)
    };
    this.records.set(key, record);
    return { outcome: "acquired" };
  }

  async complete(
    ctx: RequestSecurityContext,
    request: IdempotencyRequest,
    response: IdempotencyResponsePayload
  ): Promise<void> {
    const key = this.mapKey(ctx, request);
    const existing = this.records.get(key);
    if (!existing || existing.requestHash !== request.requestHash) {
      throw new Error("Idempotency complete without matching processing record.");
    }
    this.records.set(key, {
      status: "completed",
      requestHash: request.requestHash,
      expiresAt: existing.expiresAt,
      responseStatus: response.responseStatus,
      responseBody: redactValue(response.responseBody),
      ...(response.resourceId !== undefined ? { resourceId: response.resourceId } : {})
    });
  }

  async fail(
    ctx: RequestSecurityContext,
    request: IdempotencyRequest,
    failure: { readonly retryable: boolean }
  ): Promise<void> {
    const key = this.mapKey(ctx, request);
    const existing = this.records.get(key);
    if (!existing || existing.requestHash !== request.requestHash) {
      throw new Error("Idempotency fail without matching processing record.");
    }
    this.records.set(key, {
      status: failure.retryable ? "failed_retryable" : "failed_final",
      requestHash: request.requestHash,
      expiresAt: existing.expiresAt
    });
  }
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: AppDatabase) {}

  private async load(
    trx: AppTransaction,
    ctx: RequestSecurityContext,
    request: IdempotencyRequest
  ): Promise<IdempotencyRecord | undefined> {
    const row = await trx
      .selectFrom("app.idempotency_records")
      .selectAll()
      .where("tenant_id", "=", ctx.tenantId)
      .where("actor_id", "=", ctx.actorId)
      .where("operation_id", "=", request.scope)
      .where("idempotency_key", "=", request.key)
      .executeTakeFirst();
    if (!row) {
      return undefined;
    }
    return {
      status: row.status,
      requestHash: row.request_hash,
      expiresAt: row.expires_at,
      ...(row.resource_id != null ? { resourceId: row.resource_id } : {}),
      ...(row.response_status != null ? { responseStatus: row.response_status } : {}),
      ...(row.response_body_redacted != null ? { responseBody: row.response_body_redacted } : {})
    };
  }

  async reserve(ctx: RequestSecurityContext, request: IdempotencyRequest): Promise<ReserveOutcome> {
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const existing = await this.load(trx, ctx, request);
      const decision = decideReserve(existing, request.requestHash);
      if (decision !== "retry_acquire") {
        return decision;
      }
      if (existing?.status === "failed_retryable") {
        await trx
          .updateTable("app.idempotency_records")
          .set({
            status: "processing",
            request_hash: request.requestHash,
            resource_id: null,
            response_status: null,
            response_body_redacted: null,
            expires_at: expiresAtFromTtl(request.ttlSeconds)
          })
          .where("tenant_id", "=", ctx.tenantId)
          .where("actor_id", "=", ctx.actorId)
          .where("operation_id", "=", request.scope)
          .where("idempotency_key", "=", request.key)
          .execute();
        return { outcome: "acquired" };
      }
      await trx
        .insertInto("app.idempotency_records")
        .values({
          tenant_id: ctx.tenantId,
          actor_id: ctx.actorId,
          operation_id: request.scope,
          idempotency_key: request.key,
          request_hash: request.requestHash,
          status: "processing",
          resource_id: null,
          response_status: null,
          response_body_redacted: null,
          expires_at: expiresAtFromTtl(request.ttlSeconds)
        })
        .execute();
      return { outcome: "acquired" };
    });
  }

  async complete(
    ctx: RequestSecurityContext,
    request: IdempotencyRequest,
    response: IdempotencyResponsePayload
  ): Promise<void> {
    const body = redactValue(response.responseBody) as Record<string, unknown>;
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await trx
        .updateTable("app.idempotency_records")
        .set({
          status: "completed",
          resource_id: response.resourceId ?? null,
          response_status: response.responseStatus,
          response_body_redacted: body
        })
        .where("tenant_id", "=", ctx.tenantId)
        .where("actor_id", "=", ctx.actorId)
        .where("operation_id", "=", request.scope)
        .where("idempotency_key", "=", request.key)
        .where("request_hash", "=", request.requestHash)
        .execute();
    });
  }

  async fail(
    ctx: RequestSecurityContext,
    request: IdempotencyRequest,
    failure: { readonly retryable: boolean }
  ): Promise<void> {
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await trx
        .updateTable("app.idempotency_records")
        .set({
          status: failure.retryable ? "failed_retryable" : "failed_final"
        })
        .where("tenant_id", "=", ctx.tenantId)
        .where("actor_id", "=", ctx.actorId)
        .where("operation_id", "=", request.scope)
        .where("idempotency_key", "=", request.key)
        .where("request_hash", "=", request.requestHash)
        .execute();
    });
  }
}

/** Exported for unit tests of the pure decision table. */
export const __test = { decideReserve };
