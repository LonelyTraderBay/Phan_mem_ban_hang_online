import { QueryClient, type DefaultOptions } from "@tanstack/react-query";
import type { Environment } from "@ai-sales/config";

const RETRYABLE_NETWORK_STATUSES = new Set([0, 502, 503, 504]);

function isScreenActive(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function extractStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}

function extractRetryAfterMs(error: unknown): number | undefined {
  if (error && typeof error === "object" && "retryAfterMs" in error) {
    return (error as { retryAfterMs?: number }).retryAfterMs;
  }
  return undefined;
}

/**
 * Implements the GET retry table from spec 11.10: network/502/503/504 retry up to 2 times
 * (spec says "2-3 lần") only while the tab is visible; 429 is handled via retryDelay honoring
 * `Retry-After` rather than blind repeated retries; everything else does not retry here.
 */
function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = extractStatus(error);
  if (status === 429) return failureCount < 1;
  if (status !== undefined && RETRYABLE_NETWORK_STATUSES.has(status)) {
    return failureCount < 2 && isScreenActive();
  }
  return false;
}

function queryRetryDelay(attemptIndex: number, error: unknown): number {
  const retryAfterMs = extractRetryAfterMs(error);
  if (retryAfterMs !== undefined) return retryAfterMs;
  // Spec 11.10 says "retry with jitter" but does not specify the exact algorithm/cap — this
  // full-jitter exponential backoff (200ms base, 2s cap) is a documented default, not a spec
  // requirement. Revisit if Performance/Product specify a concrete value later (spec 13.3).
  const base = Math.min(2000, 200 * 2 ** attemptIndex);
  return Math.random() * base;
}

/**
 * QueryClient factory (FE-F00-005). Mutations never auto-retry here — a write only retries
 * when it is idempotent AND the server marked the error retryable (spec 11.10), which is the
 * calling feature's explicit responsibility, not a blanket default.
 */
export function createQueryClient(environment: Environment): QueryClient {
  const defaultOptions: DefaultOptions = {
    queries: {
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      refetchOnWindowFocus: environment !== "local",
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  };

  return new QueryClient({ defaultOptions });
}
