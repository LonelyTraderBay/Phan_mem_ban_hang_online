/**
 * BE-CHN-009 — Per-account/provider rate limiting + circuit breaker stubs.
 */

export interface RateLimitBucket {
  readonly tokens: number;
  readonly capacity: number;
  readonly resetAt: string;
}

export interface CircuitBreakerState {
  readonly failures: number;
  readonly state: "closed" | "open" | "half_open";
  readonly openedAt: string | null;
}

export function consumeRateLimitToken(
  bucket: RateLimitBucket,
  cost = 1
): { readonly allowed: boolean; readonly bucket: RateLimitBucket } {
  if (bucket.tokens < cost) {
    return { allowed: false, bucket };
  }
  return {
    allowed: true,
    bucket: { ...bucket, tokens: bucket.tokens - cost }
  };
}

export function recordCircuitFailure(
  state: CircuitBreakerState,
  threshold = 5
): CircuitBreakerState {
  const failures = state.failures + 1;
  if (failures >= threshold) {
    return { failures, state: "open", openedAt: new Date().toISOString() };
  }
  return { ...state, failures };
}

export function circuitAllowsRequest(state: CircuitBreakerState, cooldownMs = 30_000): boolean {
  if (state.state === "closed" || state.state === "half_open") return true;
  if (!state.openedAt) return false;
  return Date.now() - new Date(state.openedAt).getTime() >= cooldownMs;
}
