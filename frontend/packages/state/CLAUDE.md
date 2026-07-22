# @ai-sales/state

TanStack Query foundation: client factory, query key conventions, persistence, cache reset
(spec 13.x, FE-F00-005).

- Query keys must be built from primitives only (never a mutable object reference) and always
  tenant/session-scoped (spec 13.2).
- Persistence (wraps `@ai-sales/platform`'s `StorageAdapter`) **never stores a token** — callers
  are responsible for only persisting fields whose PII classification allows it (spec 13.6: prefer
  not persisting PII at all).
- Retry policy implements the GET retry table from spec 11.10: retry network/502/503/504 up to 2
  times.
- **Known stopgap**: `persistence.ts` wraps a synchronous, `localStorage`-shaped `StorageAdapter`
  for the F00 baseline. Spec 13.6 calls for IndexedDB with schema version/migration/cleanup for
  larger drafts — revisit when a feature needs more than small key/value entries; don't extend the
  current adapter to do more than that without addressing this first.
- No README; constraints live as inline comments in `persistence.ts` and `queryClientFactory.ts`.
