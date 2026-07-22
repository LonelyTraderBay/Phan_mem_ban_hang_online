# Enterprise Freeze Playbook

**Read this before any domain feature work.**

Canonical design: [`../superpowers/specs/2026-07-22-enterprise-doc-freeze-design.md`](../superpowers/specs/2026-07-22-enterprise-doc-freeze-design.md)  
Implementation plan: [`../superpowers/plans/2026-07-22-enterprise-doc-freeze.md`](../superpowers/plans/2026-07-22-enterprise-doc-freeze.md)  
Gate: [`FULL_PRODUCT_DOC_FREEZE.md`](FULL_PRODUCT_DOC_FREEZE.md)

## Rule

Until the gate is **PASS**, AI agents must **not** implement domain features.  
**Current gate: PASS (2026-07-22).** Feature coding allowed in phase order only — see
[`../readiness/ENTERPRISE_DOC_GATE.md`](../readiness/ENTERPRISE_DOC_GATE.md) (IDN-001…006 done; next BE per deps — IDN-007/008/009 or FE-F01).

Do not re-open a completed freeze wave without an ADR / gap board entry.

## Wave order (do not skip)

| # | File | Status |
|---|------|--------|
| W0 | [waves/W0_ho_defaults.md](waves/W0_ho_defaults.md) | Done |
| W1 | [waves/W1_contracts_http.md](waves/W1_contracts_http.md) | Done |
| W2 | [waves/W2_contracts_async_events.md](waves/W2_contracts_async_events.md) | Done |
| W3 | [waves/W3_matrices_permissions_errors.md](waves/W3_matrices_permissions_errors.md) | Done |
| W4 | [waves/W4_data_model_rls.md](waves/W4_data_model_rls.md) | Done |
| W5 | [waves/W5_be_tickets.md](waves/W5_be_tickets.md) | Done |
| W6 | [waves/W6_fe_design_specs.md](waves/W6_fe_design_specs.md) | Done |
| W7 | [waves/W7_gate_sync.md](waves/W7_gate_sync.md) | Done |

## Inventories

- [`inventory/backlog_coverage.csv`](inventory/backlog_coverage.csv)
- [`inventory/openapi_generic_debt.csv`](inventory/openapi_generic_debt.csv)
- [`inventory/asyncapi_event_coverage.csv`](inventory/asyncapi_event_coverage.csv)
- [`inventory/data_dictionary_coverage.csv`](inventory/data_dictionary_coverage.csv)
- [`inventory/fe_screen_inventory.csv`](inventory/fe_screen_inventory.csv)

## HO defaults

[`../business/HO_DEFAULTS_v1.md`](../business/HO_DEFAULTS_v1.md) — VAT 10% inclusive, 3 plans, over-limit policy.
