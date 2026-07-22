# W4 — Data model / RLS classification

**Status:** Done  
**Completed:** 2026-07-22  
**Depends on:** W0 (money/tax defaults); preferably after W1 shapes settle

## Goal

Eliminate blocking ambiguity in ERD/data-dictionary for all tables needed by P2–P10 backlog.

## Exit criteria

- [x] Zero `Needs confirmation` on in-scope freeze tables
- [x] Each table has class GLOBAL / TENANT_OWNED / … and RLS intent
- [x] Cross-links to module migration design notes where helpful

## Evidence

- Dictionary: [`../../data/data-dictionary.md`](../../data/data-dictionary.md) — **90** tables, **0** Needs confirmation
- Classes: [`../../data/table-classification-seed.md`](../../data/table-classification-seed.md) (incl. TENANT_ROOT, HYBRID)
- RLS templates: [`../../data/rls-intent-catalog.md`](../../data/rls-intent-catalog.md) (A–G + HO money columns)
- ERD: [`../../data/ERD.md`](../../data/ERD.md) — foundation §0, HO tax fields on orders/plans
- Inventory: [`../inventory/data_dictionary_coverage.csv`](../inventory/data_dictionary_coverage.csv)

## Notes

“Not started” migration status is OK; “Needs confirmation” is not. Foundation P1 tables
(`audit_events`, `outbox_events`, `idempotency_records`, `inbox_events`) already have RLS Done;
domain tables remain Not started until their migrations ship.
