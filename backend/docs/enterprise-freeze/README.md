# Enterprise Freeze Playbook

**Read this before any domain feature work.**

Canonical design: [`../superpowers/specs/2026-07-22-enterprise-doc-freeze-design.md`](../superpowers/specs/2026-07-22-enterprise-doc-freeze-design.md)  
Implementation plan: [`../superpowers/plans/2026-07-22-enterprise-doc-freeze.md`](../superpowers/plans/2026-07-22-enterprise-doc-freeze.md)  
Gate: [`FULL_PRODUCT_DOC_FREEZE.md`](FULL_PRODUCT_DOC_FREEZE.md)

## Rule

Until the gate is **PASS**, AI agents must **not** implement domain features (Identity, F01 UI beyond placeholders, Orders, etc.). Only freeze-wave documentation/contract work is allowed.

## Wave order (do not skip)

| # | File | Status |
|---|------|--------|
| W0 | [waves/W0_ho_defaults.md](waves/W0_ho_defaults.md) | Done |
| W1 | [waves/W1_contracts_http.md](waves/W1_contracts_http.md) | Done |
| W2 | [waves/W2_contracts_async_events.md](waves/W2_contracts_async_events.md) | Not started |
| W3 | [waves/W3_matrices_permissions_errors.md](waves/W3_matrices_permissions_errors.md) | Not started |
| W4 | [waves/W4_data_model_rls.md](waves/W4_data_model_rls.md) | Not started |
| W5 | [waves/W5_be_tickets.md](waves/W5_be_tickets.md) | Not started |
| W6 | [waves/W6_fe_design_specs.md](waves/W6_fe_design_specs.md) | Not started |
| W7 | [waves/W7_gate_sync.md](waves/W7_gate_sync.md) | Not started |

## Inventories

- [`inventory/backlog_coverage.csv`](inventory/backlog_coverage.csv)
- [`inventory/openapi_generic_debt.csv`](inventory/openapi_generic_debt.csv)
- [`inventory/fe_screen_inventory.csv`](inventory/fe_screen_inventory.csv)

## HO defaults

[`../business/HO_DEFAULTS_v1.md`](../business/HO_DEFAULTS_v1.md) — VAT 10% inclusive, 3 plans, over-limit policy.
