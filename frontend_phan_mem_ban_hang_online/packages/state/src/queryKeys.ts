/**
 * Query key convention (spec 13.2): tenant/session scope is always present, filters are
 * canonicalized to avoid duplicate cache entries, and keys are built from primitives only
 * (never a mutable object reference).
 */

export function canonicalize(filters: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(filters).sort()) {
    if (filters[key] !== undefined) sorted[key] = filters[key];
  }
  return JSON.stringify(sorted);
}

export function createResourceQueryKeys(resource: string) {
  return {
    all: (tenantScope: string) => ["tenant", tenantScope, resource] as const,
    list: (tenantScope: string, filters: Record<string, unknown>) =>
      ["tenant", tenantScope, resource, "list", canonicalize(filters)] as const,
    detail: (tenantScope: string, id: string) =>
      ["tenant", tenantScope, resource, "detail", id] as const,
  };
}
