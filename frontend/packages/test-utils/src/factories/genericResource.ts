let counter = 0;

/** Builder for the generic placeholder resource shape (spec's `GenericResource` schema) — see
 * FIXTURE_RESOURCE in generate-msw-fixtures.mjs for why this stays honest/generic rather than
 * inventing per-domain fields. */
export function buildGenericResource(overrides: Partial<Record<string, unknown>> = {}) {
  counter += 1;
  return {
    id: `fixture_${counter}`,
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function resetGenericResourceCounter(): void {
  counter = 0;
}
