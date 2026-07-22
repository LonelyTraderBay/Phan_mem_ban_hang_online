# FE Freeze Checklist

**Status:** IN_PROGRESS (blocked on backend waves W1–W5 for field accuracy; W6 may draft structure earlier)

- [ ] All routes in `docs/ux/handoff-checklist.md` have design-specs
- [ ] Non-F01 screens moved to READY-MOCK under HO defaults policy (2026-07-22)
- [ ] Billing/order copy reflects VAT 10% inclusive (`backend/docs/business/HO_DEFAULTS_v1.md`)
- [ ] After final BE contract commit: `pnpm contracts:sync` + codegen clean
- [ ] No feature implementation PRs until backend FREEZE=PASS

Inventory (canonical): `backend/docs/enterprise-freeze/inventory/fe_screen_inventory.csv`
