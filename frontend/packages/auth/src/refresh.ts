/**
 * Refresh/retry rule (spec 9.5): only one refresh request runs at a time; concurrent 401s
 * await the same promise; a request retries at most once after refresh; refresh is never
 * triggered for 403; there is no infinite retry/redirect loop.
 */

export function createSingleFlightRefresh(refreshFn: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return function refresh(): Promise<void> {
    if (!inFlight) {
      inFlight = refreshFn().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

export interface AttemptResult<T> {
  status: number;
  result: T;
}

/**
 * Wraps a request `attempt`: on a 401, awaits the shared refresh, then retries `attempt`
 * exactly once — win or lose, it does not refresh or retry again (no infinite loop). Callers
 * must not invoke this for a 403 response (spec 9.5: "Không refresh cho 403").
 */
export function createRequestWithRefresh(refresh: () => Promise<void>) {
  return async function requestWithRefresh<T>(attempt: () => Promise<AttemptResult<T>>): Promise<AttemptResult<T>> {
    const first = await attempt();
    if (first.status !== 401) return first;
    await refresh();
    return attempt();
  };
}
