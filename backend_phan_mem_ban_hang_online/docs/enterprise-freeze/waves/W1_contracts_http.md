# W1 — OpenAPI (HTTP contracts)

**Status:** Done  
**Completed:** 2026-07-22  
**Depends on:** W0 Done

## Exit criteria

- [x] `inventory/openapi_generic_debt.csv` generated and driven to **0 open rows** for implementable ops
- [x] `pnpm contracts:validate` pass (source ↔ packages/contracts-http identical)
- [x] No implementable operation references `GenericCommandRequest` / `GenericDataResponse` / `GenericListResponse` / `GenericResource`

## Evidence

- Tooling: `tools/w1-freeze-openapi-generics.mjs` (re-runnable), `tools/inventory-openapi-generics.mjs`
- Schemas: 32 → **244** components (tag resources + per-operation Request/Response)
- `OrderResource.tax_rate_bps` const **1000**, `prices_tax_inclusive` const **true** (HO_DEFAULTS_v1)
- Spot-check: `createProduct`, `createOrderDraft`, `confirmOrder`, `createCustomer`, `inviteMember` use typed request + response refs
- Generic* schemas retained as **deprecated** only (must not be referenced)

## Notes / follow-ups (do not reopen Generic)

- Some command ops correctly use `EmptyCommandRequest` (activate/archive/confirm-style).
- Resource schemas are **freeze-minimum** field sets; W3/W5 may add properties without renaming away from typed schemas.
- FE must `pnpm contracts:sync` in W7 (or after this commit when coding resumes).
