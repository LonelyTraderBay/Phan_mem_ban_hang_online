import type { RequestSecurityContext } from "@ai-sales/auth-context";
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import { ConversationError } from "./conversation.js";

export const CONVERSATION_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const CONVERSATION_IDEMPOTENCY_HASH = "1";

export function conversationIdempotencyContext(
  tenantId: string,
  actorId: string
): RequestSecurityContext {
  return {
    actorType: "user",
    actorId: parseUuidV7(actorId),
    tenantId: parseUuidV7(tenantId),
    permissions: [],
    tenantTimezone: "UTC",
    correlationId: "conversation-idempotency"
  };
}

export async function runConversationIdempotent<TResult>(options: {
  readonly idempotency: IdempotencyStore | undefined;
  readonly tenantId: string;
  readonly actorId: string;
  readonly scope: string;
  readonly key: string;
  readonly loadCached: () => Promise<TResult | null>;
  readonly rememberCached: (result: TResult) => Promise<void>;
  readonly execute: () => Promise<TResult>;
  readonly resourceId?: (result: TResult) => string | undefined;
  readonly loadByResourceId?: (resourceId: string) => Promise<TResult | null>;
}): Promise<TResult> {
  if (!options.idempotency) {
    const cached = await options.loadCached();
    if (cached !== null && cached !== undefined) return cached;
    const result = await options.execute();
    await options.rememberCached(result);
    return result;
  }

  const ctx = conversationIdempotencyContext(options.tenantId, options.actorId);
  const idemReq = {
    scope: options.scope,
    key: options.key,
    requestHash: CONVERSATION_IDEMPOTENCY_HASH,
    ttlSeconds: CONVERSATION_IDEMPOTENCY_TTL_SECONDS
  };

  let acquired = false;
  try {
    const reserve = await options.idempotency.reserve(ctx, idemReq);
    if (reserve.outcome === "replay") {
      if (reserve.record.responseBody && typeof reserve.record.responseBody === "object") {
        return reserve.record.responseBody as TResult;
      }
      if (options.loadByResourceId && reserve.record.resourceId) {
        const loaded = await options.loadByResourceId(reserve.record.resourceId);
        if (loaded !== null && loaded !== undefined) return loaded;
      }
      throw new ConversationError("Idempotent replay missing result.", "RESOURCE_NOT_FOUND");
    }
    acquired = true;
    const result = await options.execute();
    const resourceId = options.resourceId?.(result);
    await options.idempotency.complete(ctx, idemReq, {
      ...(resourceId !== undefined ? { resourceId } : {}),
      responseStatus: 200,
      responseBody: result
    });
    return result;
  } catch (error) {
    if (error instanceof IdempotencyInProgressError) {
      throw new ConversationError("Idempotency key is still processing.", "VALIDATION_FAILED");
    }
    if (error instanceof IdempotencyKeyReusedError) {
      throw new ConversationError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      );
    }
    if (acquired) {
      const retryable = !(error instanceof ConversationError);
      await options.idempotency.fail(ctx, idemReq, { retryable }).catch(() => undefined);
    }
    throw error;
  }
}
