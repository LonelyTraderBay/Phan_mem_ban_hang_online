# W6 — Frontend design-specs (all screens)

**Status:** Done  
**Completed:** 2026-07-22  
**Depends on:** W0 (copy defaults); W1/W3 for accurate field/error names

## Goal

Every product route in FE handoff / spec §8.1 has a design-spec at READY-MOCK.

## Exit criteria

- [x] `inventory/fe_screen_inventory.csv` complete
- [x] `frontend/docs/ux/handoff-checklist.md` 100% READY-MOCK for product screens
- [x] Specs follow `design-specs/_TEMPLATE.md` (6 states, tokens, validation)
- [x] `frontend/docs/enterprise-freeze/FE_FREEZE_CHECKLIST.md` checked

## Evidence

- Tool: `frontend/tools/w6-freeze-design-specs.mjs`
- New specs: **20** (tenant + super-admin non-F01 routes)
- Kept F01 READY-MOCK (Human Owner 2026-07-21): login, forgot/reset, MFA, invite, settings×4
- N/A: `/auth/callback` (no persistent UI)
- Inventory: [`../inventory/fe_screen_inventory.csv`](../inventory/fe_screen_inventory.csv)
- HO money screens cite VAT 10% inclusive + plans (orders, products, billing, reports, ai)

## Owner note

Design AI Agent drafts; Human Owner **policy C** (2026-07-22) allows READY-MOCK when pack complete for freeze purposes (production legal/security acceptance remains a later gate).
