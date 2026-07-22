# Table Classification Seed

Use this file to evolve the P0 ERD and data dictionary. Every table must be classified before implementation.

> **Superseded by the full index**: [`ERD.md`](ERD.md) (diagrams) and [`data-dictionary.md`](data-dictionary.md)
> (per-table classification checklist covering every table in blueprint §7) now carry the complete
> P1–P2 classification. This file's rule summary below stays as the quick-reference definition of
> each class; use the other two files to look up or update a specific table's status.

| Class | Rule | Initial examples |
|---|---|---|
| GLOBAL | No `tenant_id`; system-owned catalog only. | permissions, plan catalog, provider catalog |
| TENANT_OWNED | Requires `tenant_id`, RLS, tenant-scoped indexes, composite FK where related. | products, customers, orders, conversations |
| TENANT_OVERRIDE | Global key plus tenant-specific override. | feature flag override, plan override |
| SYSTEM_INTERNAL | Not exposed through user APIs; restricted DB role. | migration history, outbox lease |

P1/P2 gate: no tenant-owned table can ship without RLS, tenant transaction tests, and negative IDOR coverage.
