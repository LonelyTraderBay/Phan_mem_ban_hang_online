# W3 — Permissions, errors, gap close

**Status:** Not started  
**Depends on:** W1 (permissions must match OpenAPI `x-permission`)

## Goal

Close GAP-001, GAP-002, GAP-003; ensure every operation permission and error code is catalogued.

## Exit criteria

- [ ] `permission_matrix.csv` covers catalog publish split, ops.* keys, remaining GAP-003 keys
- [ ] `error_catalog.csv` includes entitlement/VAT-related codes used by defaults (`ENTITLEMENT_LIMIT_EXCEEDED`, etc.)
- [ ] `contract-gap-board.md` GAP-001/002/003 → Closed with dates
- [ ] FE permission YAML syncable

## Notes

Do not find-replace permission keys blindly — each key needs CSV row + OpenAPI update.
