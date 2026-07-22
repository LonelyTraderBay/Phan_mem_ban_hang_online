---
ticket_id: BE-CAT-003
title: Cost/price permission + history/audit
owner: Backend AI Agent
phase: P3
risk: high
status: done
---

# Business outcome

Cost/price permission + history/audit for catalog variants (HO_DEFAULTS_v1 tax-inclusive prices).

Primary paths: `modules/catalog/`.

# Actor and use case

- Actors with `catalog.write` may change tax-inclusive `unit_price_minor` (existing PATCH).
- Actors need `catalog.cost.write` to set `cost_minor` (`setVariantCost` / create with cost).
- Actors need `catalog.cost.read` to see `cost_minor` on pricing views and cost columns on history.
- Price/cost mutations append `price_history` + audit records (in-memory until Postgres adapter).

# In scope / Out of scope

In scope:
- Field-level cost permission (`COST_PERMISSION_REQUIRED`, `catalog.cost.*`)
- `getVariantPricing` / `listVariantPriceHistory` / `setVariantCost`
- Append-only history + audit on price/cost change
- HO assertion: `prices_tax_inclusive: true`

Out of scope:
- Inventing OpenAPI fields on frozen `CatalogResource` / request bodies for cost
- FE UI
- Postgres SECURITY DEFINER adapter (follow-up)

# Dependencies

- BE-CAT-002 Done
- Schema `price_history` from `000012`
- `applyFieldPolicies` / `DEFAULT_FIELD_POLICIES` (BE-IDN-012)

# Contract

- OpenAPI unchanged (cost not on frozen Catalog resource/request)
- Error: existing `COST_PERMISSION_REQUIRED`
- Permissions: `catalog.cost.read`, `catalog.cost.write`

# Acceptance criteria

- [x] Happy path matches backlog deliverable
- [x] Validation / business conflict codes from error catalog
- [x] Permission + tenant isolation tests
- [x] Audit / price_history as required
- [x] Money/tax assertions match HO_DEFAULTS_v1 (`prices_tax_inclusive`)
- [ ] Staging smoke when phase reaches staging

# Test cases

- omit cost without catalog.cost.read
- create with cost without catalog.cost.write → COST_PERMISSION_REQUIRED
- price update + setVariantCost → history + audit; history masks cost without read
- setVariantCost without cost.write → COST_PERMISSION_REQUIRED

# Preflight (2026-07-22)

| Item | Value |
|------|--------|
| Domain | CAT / P3 |
| Migration | none (uses 000012 price_history) |
| Error | COST_PERMISSION_REQUIRED (existing) |
| Rollback | disable cost write path; keep ledger rows |

# Completion manifest

- Contracts changed: none
- Migration: none
- Tests/evidence: `pnpm exec vitest run modules/catalog` — 19/19; `pnpm typecheck` clean
- Known risks: cost HTTP body not in OpenAPI yet — application `setVariantCost` until contract wave; in-memory history only
