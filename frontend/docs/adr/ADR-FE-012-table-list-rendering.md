# ADR-FE-012: Table/list rendering

**Status:** Accepted

## Context

Several screens (order lists, conversation lists, inventory, audit logs) need large, filterable,
sortable tables/lists that must stay performant with real tenant data volumes.

## Decision

TanStack Table (headless) + TanStack Virtual (windowed rendering) for any table/list past a data
threshold, rather than a fully-styled table component library.

## Consequences

- `packages/ui` depends on both (`@tanstack/react-table`, `@tanstack/react-virtual`) as of F00,
  even though no feature module uses them yet — the F00 sample feature (`product-catalog`)
  intentionally renders a plain unordered list, since its dataset (the generic-placeholder
  `/products` response) has no real pagination/sort semantics to exercise yet.
- Real usage (row selection, column sort, virtualized scrolling) lands with the first
  business-feature module that needs it (F03 Catalog is the natural first consumer) — F00 only
  proves the dependency resolves and typechecks cleanly.
