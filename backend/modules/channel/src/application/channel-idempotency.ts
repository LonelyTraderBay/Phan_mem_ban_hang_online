import {
  runModuleIdempotent,
  type IdempotencyStore
} from "@ai-sales/idempotency";
import { ChannelError } from "./channel.js";

export const CHANNEL_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
export const CHANNEL_IDEMPOTENCY_HASH = "1";

export async function runChannelIdempotent<TResult>(options: {
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
  return runModuleIdempotent({
    ...options,
    requestHash: CHANNEL_IDEMPOTENCY_HASH,
    ttlSeconds: CHANNEL_IDEMPOTENCY_TTL_SECONDS,
    correlationId: "channel-idempotency",
    mapInProgress: () =>
      new ChannelError("Idempotency key is still processing.", "VALIDATION_FAILED"),
    mapKeyReused: () =>
      new ChannelError(
        "Idempotency key already used with a different request.",
        "VALIDATION_FAILED"
      ),
    mapMissingReplay: () =>
      new ChannelError("Idempotent replay missing result.", "RESOURCE_NOT_FOUND"),
    isDomainError: (error) => error instanceof ChannelError
  });
}
