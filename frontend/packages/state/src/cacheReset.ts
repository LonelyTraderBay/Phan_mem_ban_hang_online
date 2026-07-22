import type { QueryClient } from "@tanstack/react-query";

/**
 * Logout/tenant-switch cache reset (spec 9.8, 13.6): cancels in-flight requests before clearing
 * so no stale response can repopulate the cache after the reset.
 */
export async function clearAllCaches(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
}
