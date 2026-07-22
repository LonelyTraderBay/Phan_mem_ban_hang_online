import type { ApiClient, ApiResult, RequestOptions } from "@ai-sales/api-client";
import { createRequestWithRefresh, createSingleFlightRefresh } from "./refresh";

export interface AuthenticatedClientDeps {
  base: ApiClient;
  /** POST /auth/refresh — cookie session; must throw or reject on failure. */
  refreshSession: () => Promise<void>;
  /** Called when refresh fails after a 401 (session dead). */
  onRefreshFailure: () => void | Promise<void>;
}

/**
 * Wraps an ApiClient so 401 responses trigger a single-flight refresh + one retry.
 * 403 never refreshes (createRequestWithRefresh only reacts to 401).
 */
export function createAuthenticatedApiClient(deps: AuthenticatedClientDeps): ApiClient {
  const refresh = createSingleFlightRefresh(async () => {
    try {
      await deps.refreshSession();
    } catch (error) {
      await deps.onRefreshFailure();
      throw error;
    }
  });
  const withRefresh = createRequestWithRefresh(refresh);

  return {
    async request<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
      // Skip refresh loop for the refresh endpoint itself.
      if (path === "/auth/refresh" || path.endsWith("/auth/refresh")) {
        return deps.base.request<T>(path, options);
      }

      const outcome = await withRefresh(async () => {
        const result = await deps.base.request<T>(path, options);
        return { status: result.ok ? 200 : result.status, result };
      });

      if (!outcome.result.ok && outcome.status === 401) {
        // Second 401 after refresh attempt — session is dead.
        await deps.onRefreshFailure();
      }

      return outcome.result;
    },
  };
}
