# Design: Full-Product Enterprise Doc Freeze (Up-Front)

**Date:** 2026-07-22  
**Status:** Approved by Human Owner (chat) — Approach A, hard rules §1, wave tree §2  
**Owner:** Backend AI Agent (canonical) · Design AI Agent (W6) · Frontend AI Agent (FE mirror)

## 1. Goal

Produce a complete, reviewable documentation freeze for **every product module** so AI coding agents implement Enterprise-Grade behavior **without inventing** money, tax, permissions, contracts, or UX.

**Hard rule:** No domain feature code (including BE-IDN-001 and FE F01 beyond already-scaffolded placeholders) until `docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md` = **PASS**.

## 2. Decisions locked

| Decision | Choice |
|----------|--------|
| Scope | Full product (all modules / all phases P2–P12 backlog) |
| Freeze style | Up-front complete before any further feature coding |
| HO business defaults | Accepted defaults in `docs/business/HO_DEFAULTS_v1.md` → SIGNOFF Resolved |
| Delivery method | Wave factory (Approach A) |

## 3. Hard rules

1. Feature code blocked until `FULL_PRODUCT_DOC_FREEZE=PASS`.
2. No implementable OpenAPI operation may keep `GenericCommandRequest` / `GenericDataResponse`.
3. Every Web Admin / Super Admin screen in the route map has a design-spec at `READY-MOCK`.
4. Every backlog `task_id` not already Done has `docs/tickets/<ID>.md` with full preflight (`ready` or `doc-frozen`).
5. HO defaults (VAT, plans, over-limit) live in `HO_DEFAULTS_v1.md` and are treated as Resolved.

## 4. Artefact tree

```text
backend/docs/enterprise-freeze/
  README.md
  FULL_PRODUCT_DOC_FREEZE.md
  waves/W0…W7_*.md
  inventory/{backlog_coverage,openapi_generic_debt,fe_screen_inventory}.csv

backend/docs/business/HO_DEFAULTS_v1.md

frontend/docs/enterprise-freeze/
  README.md
  FE_FREEZE_CHECKLIST.md
```

Canonical gate: backend `FULL_PRODUCT_DOC_FREEZE.md`.  
`docs/readiness/ENTERPRISE_DOC_GATE.md` must say feature coding is **RED** until freeze PASS, then reopen by phase order.

## 5. Waves (strict order)

| Wave | Deliverable | Exit |
|------|-------------|------|
| W0 | HO defaults + SIGNOFF resolve | Defaults file + tracker |
| W1 | OpenAPI typed (all domain ops) | 0 Generic on implementable ops; validate pass |
| W2 | AsyncAPI domain events | Events versioned for backlog domains |
| W3 | Permissions + errors (+ GAP-001/002/003) | All gaps Closed; x-permission resolvable |
| W4 | ERD / data-dictionary / RLS | No Needs confirmation on P2–P10 in-scope tables |
| W5 | BE tickets from backlog | Coverage CSV 100% for Not Started / In Progress |
| W6 | FE design-specs all routes | Handoff 100% READY-MOCK |
| W7 | Gate sync | FREEZE=PASS; DOC_GATE updated; coding order published |

## 6. Roles

- **Backend AI Agent:** W0–W5, W7, inventories, contracts, tickets.
- **Design AI Agent:** W6 design-specs (copy uses HO defaults / F01 precedent).
- **Frontend AI Agent:** FE checklist, `contracts:sync` after W1/W3, no feature UI until PASS.
- **Human Owner:** Approved defaults policy (2026-07-22). Staging spend and production go-live remain separate Pending items (not part of doc freeze content).

## 7. Out of scope for this freeze

- Writing production feature implementation.
- Provisioning paid staging/cloud (still HO spend Pending).
- Changing blueprint constitution except via ADR.

## 8. Success criteria

`FULL_PRODUCT_DOC_FREEZE.md` checklist all checked, inventories show zero blockers, `pnpm contracts:validate` green on both repos after sync, agents may then execute **only** in published phase order starting at BE-IDN-001.
