# W3 — Permissions, errors, gap close

**Status:** Done  
**Completed:** 2026-07-22  
**Depends on:** W1 Done

## Exit criteria

- [x] `permission_matrix.csv` covers catalog publish/import split, ops.* keys, remaining GAP-003 keys
- [x] `error_catalog.csv` includes entitlement/tax codes (`ENTITLEMENT_LIMIT_EXCEEDED`, `ENTITLEMENT_WARNING`, `TAX_RATE_MISMATCH`)
- [x] `contract-gap-board.md` GAP-001/002/003 → Closed with dates
- [x] FE permission YAML syncable (`pnpm contracts:sync` + `contracts:validate` pass)

## Evidence

- Tool: `tools/w3-freeze-matrices.mjs`
- Resolution: `docs/collaboration/gap-003-remaining-resolution.md`
- Matrix rows: 64 → **75** (+11)
- Error codes: +3 entitlement/tax
- OpenAPI `x-permission` rewires: **12** operations
- Every non-special OpenAPI `x-permission` resolves to a matrix row (0 missing)

## Added permissions (summary)

`catalog.import`, `catalog.publish`, `ops.alert.acknowledge`, `ops.ai.disable`, `ops.channel.manage`, `customer.export`, `ai.sandbox.test`, `report.revenue.read`, `report.sla.read`, `report.ai_quality.read`, `packing_slip.print`
