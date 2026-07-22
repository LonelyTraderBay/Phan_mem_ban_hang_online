# ADR-FE-008: Server state management

**Status:** Accepted

## Context

Every screen needs caching, request de-duplication, background refetch, cancellation, and retry
for server data — reimplementing this per feature would be inconsistent and error-prone.

## Decision

TanStack Query owns all server-entity/list state (spec 13.1). Zustand (ADR-FE-009) is explicitly
disallowed from duplicating server data "for convenience."

## Consequences

- `packages/state`'s `createQueryClient` implements spec 11.10's retry table exactly: GET
  network/502/503/504 retries up to 2 times only while the tab is visible; 429 respects
  `Retry-After` (falls back to a documented full-jitter exponential default, since the spec
  doesn't give an exact algorithm); everything else does not retry; mutations never auto-retry.
- Query keys always carry tenant scope and canonicalized filters (spec 13.2) via
  `createResourceQueryKeys` — verified with the F00 sample feature's `product-catalog` query keys.
- `staleTime`/`gcTime` per query are provisional defaults (spec 13.3 explicitly requires
  Performance/Product sign-off on final values) — `product-catalog`'s 60s `staleTime` is
  documented as such in its README, not treated as final.
