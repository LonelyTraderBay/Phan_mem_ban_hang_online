# W7 — Gate sync

**Status:** Not started  
**Depends on:** W0–W6 Done

## Goal

Flip `FULL_PRODUCT_DOC_FREEZE` to PASS and republish coding permissions.

## Exit criteria

- [ ] All wave files Status=Done
- [ ] Inventories clean
- [ ] BE + FE `pnpm contracts:validate` pass; FE `contracts:sync` after final contract commit
- [ ] `FULL_PRODUCT_DOC_FREEZE.md` → PASS
- [ ] `ENTERPRISE_DOC_GATE.md` lists allowed kickoff order (BE-IDN-001 first)
- [ ] AGENTS.md / START_HERE point at freeze playbook

## After PASS

Feature coding may begin **in phase order only**.
