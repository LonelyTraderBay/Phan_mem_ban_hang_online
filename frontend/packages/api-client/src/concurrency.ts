/**
 * Optimistic concurrency for mutable entities with a version/ETag (spec 11.6/11.8): update
 * requests send `If-Match`; the server replies 409/412 on conflict. The client never
 * auto-merges money/inventory/order state — callers must render a conflict UI.
 */

export function ifMatchHeaders(etagOrVersion: string): Record<string, string> {
  return { "If-Match": etagOrVersion };
}

export function isConcurrencyConflictStatus(status: number): status is 409 | 412 {
  return status === 409 || status === 412;
}
