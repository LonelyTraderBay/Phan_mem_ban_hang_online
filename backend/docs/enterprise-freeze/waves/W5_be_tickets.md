# W5 — Backend tickets (full backlog)

**Status:** Done  
**Completed:** 2026-07-22  
**Depends on:** W1–W4 preferably Done (tickets must cite frozen contracts)

## Goal

Every open row in `backend_doc/matrices/implementation_backlog.csv` has `docs/tickets/<task_id>.md` filled from the backend ticket template.

## Exit criteria

- [x] `inventory/backlog_coverage.csv` complete
- [x] Missing tickets created with status `doc-frozen` (hand-authored Identity tickets kept; BE-IDN-001 remains `ready`)
- [x] Tickets cite `HO_DEFAULTS_v1.md` where money/billing/tax apply

## Evidence

- Tool: `tools/w5-freeze-be-tickets.mjs`
- Coverage: [`../inventory/backlog_coverage.csv`](../inventory/backlog_coverage.csv) — **157/157** rows with ticket paths
- Backlog: 26 Done · 2 In Progress · 129 Not Started
- Open needing tickets: **131** — **0 missing**
- Regenerated W5 stubs: 139 (Done stubs + open gaps); kept hand tickets: 18 (Identity/FND authored)
- Also fixed UTF-8 mojibake in `implementation_backlog.csv` Vietnamese P0 titles

## Notes

Feature coding still forbidden until FREEZE=PASS. `doc-frozen` ≠ implementable; kickoff coding starts at BE-IDN-001 after W7.
