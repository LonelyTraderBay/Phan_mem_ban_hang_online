# Full-Product Enterprise Doc Freeze — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze contracts, matrices, data model, BE tickets, and FE design-specs for the entire product before any further domain feature coding.

**Architecture:** Wave factory under `docs/enterprise-freeze/`; single PASS/FAIL gate; HO defaults in `docs/business/HO_DEFAULTS_v1.md`.

**Tech Stack:** Markdown/CSV inventories, OpenAPI/AsyncAPI YAML, existing `backend_ticket_template.md` + FE `_TEMPLATE.md`, `pnpm contracts:validate`.

## Global Constraints

- No domain feature code until `FULL_PRODUCT_DOC_FREEZE=PASS`.
- Do not invent permissions/errors/money rules outside `HO_DEFAULTS_v1.md` + catalogs.
- Replace Generic OpenAPI bodies before marking W1 done.
- Prefer surgical edits; do not rewrite the full blueprint.
- Staging spend stays Pending in SIGNOFF (not required for doc freeze PASS).

---

### Task 1: Scaffold freeze tree + lock DOC_GATE

**Files:**
- Create: `docs/enterprise-freeze/README.md`
- Create: `docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`
- Create: `docs/enterprise-freeze/waves/W0_ho_defaults.md` … `W7_gate_sync.md`
- Create: empty inventory CSV headers
- Create: `frontend/docs/enterprise-freeze/README.md`, `FE_FREEZE_CHECKLIST.md`
- Modify: `docs/readiness/ENTERPRISE_DOC_GATE.md` — all feature scopes RED until freeze PASS

- [ ] Write scaffold files
- [ ] Set FREEZE status = IN_PROGRESS / FAIL
- [ ] DOC_GATE: explicit ban on BE-IDN / FE F01 feature work until PASS
- [ ] Verify paths exist and README points to wave order

---

### Task 2: W0 — HO defaults

**Files:**
- Create: `docs/business/HO_DEFAULTS_v1.md`
- Modify: `docs/collaboration/SIGNOFF_TRACKER.md` (VAT + billing → Resolved)
- Modify: `docs/domain/order-calculation.md` (tax_rate_bps = 1000, tax-inclusive)
- Modify: `docs/enterprise-freeze/waves/W0_ho_defaults.md` → Done

- [ ] Document VAT 10% inclusive, 3 plan stubs, over-limit policy
- [ ] Mark SIGNOFF billing/VAT rows Resolved with date 2026-07-22 + link to defaults file
- [ ] Align order-calculation STEP 3 with inclusive 10%
- [ ] Mark W0 Done in freeze README checklist

---

### Task 3: W1 — OpenAPI typed

**Files:**
- Modify: `backend_doc/contracts/openapi.yaml` (and package sync sources)
- Create/update: `docs/enterprise-freeze/inventory/openapi_generic_debt.csv`
- Modify: `waves/W1_contracts_http.md`

- [ ] Inventory all Generic* usages by operationId
- [ ] Replace Generics domain-by-domain (Identity already partly done → Customer → Catalog → … → Ops)
- [ ] Run `pnpm contracts:validate`
- [ ] Debt CSV = 0 remaining for implementable ops
- [ ] Mark W1 Done

---

### Task 4: W2 — AsyncAPI events

**Files:**
- Modify: AsyncAPI tenant/ops contracts
- Modify: `waves/W2_contracts_async_events.md`

- [ ] Map backlog domains → required events
- [ ] Fill ops-events stub beyond empty
- [ ] Validate AsyncAPI
- [ ] Mark W2 Done

---

### Task 5: W3 — Matrices + close gaps

**Files:**
- Modify: `permission_matrix.csv`, `error_catalog.csv`
- Modify: `docs/collaboration/contract-gap-board.md` (GAP-001/002/003 → Closed)
- Modify: `waves/W3_matrices_permissions_errors.md`

- [ ] Add missing permissions for catalog publish, ops.*, and GAP-003 keys
- [ ] Add missing error codes referenced by OpenAPI
- [ ] Close gap board rows with evidence links
- [ ] Mark W3 Done

---

### Task 6: W4 — Data model / RLS

**Files:**
- Modify: `docs/data/ERD.md`, `data-dictionary.md`, `table-classification-seed.md`
- Modify: `waves/W4_data_model_rls.md`

- [x] Resolve all `Needs confirmation` for in-scope P2–P10 tables
- [x] Mark classification Done/Not started consistently for freeze scope
- [x] Cross-link identity-migration-design patterns for later modules
- [x] Mark W4 Done

---

### Task 7: W5 — BE tickets for full backlog

**Files:**
- Create: `docs/tickets/BE-*.md` for each Not Started / In Progress backlog id lacking a ticket
- Create: `inventory/backlog_coverage.csv`
- Modify: `waves/W5_be_tickets.md`

- [x] Generate coverage CSV from `implementation_backlog.csv`
- [x] For each missing ticket: fill from `backend_ticket_template.md` + HO_DEFAULTS + contract slice
- [x] status `doc-frozen` until implementation sprint; first kickoff ticket may be `ready` after PASS
- [x] Coverage 100% → Mark W5 Done

---

### Task 8: W6 — FE design-specs

**Files:**
- Create: `frontend/docs/ux/design-specs/*.md` for every non-READY-MOCK route
- Modify: `frontend/docs/ux/handoff-checklist.md`
- Modify: `frontend/docs/enterprise-freeze/FE_FREEZE_CHECKLIST.md`
- Modify: `inventory/fe_screen_inventory.csv`
- Modify: `waves/W6_fe_design_specs.md`

- [x] Inventory all routes from handoff + FE spec §8.1
- [x] Design AI Agent fills specs from `_TEMPLATE.md` using HO defaults / F01 tone
- [x] HO policy C: treat pack as READY-MOCK when checklist complete (note: production legal review still later)
- [x] Mark W6 Done

---

### Task 9: W7 — Gate PASS + reopen coding order

**Files:**
- Modify: `FULL_PRODUCT_DOC_FREEZE.md` → PASS
- Modify: `ENTERPRISE_DOC_GATE.md` — publish allowed kickoff order starting BE-IDN-001
- Modify: `waves/W7_gate_sync.md`
- FE: `contracts:sync` + codegen clean

- [x] All waves Done
- [x] Inventories clean
- [x] Both repos `contracts:validate` pass
- [x] FREEZE=PASS
- [x] Announce coding may start in phase order only

---

## Execution note

Tasks 1–2 are the immediate kickoff. Tasks 3–9 are large; execute one wave at a time with evidence in the wave file before opening the next.
