# Schema gates P6–P9 (feature / HO)

**Status:** **DEFERRED (staging v1)** — HO ủy quyền tiêu chuẩn 2026-07-24: accept dictionary **98/101**; do not migrate until an explicit open-gate reply.  
**Dictionary:** 98/101 Done — Not started: `shipping_labels`, `support_tickets`, `job_runs`  
**Related plan:** `docs/superpowers/plans/2026-07-24-db-schema-completion.md` (P6–P9)

| Gate | Table / work | Class | Open with HO reply |
|------|----------------|-------|--------------------|
| P6 | `shipping_labels` | TENANT_OWNED | `Open schema gate shipping_labels` |
| P7 | `job_runs` | SYSTEM_INTERNAL | `Open schema gate job_runs` |
| P8 | pgvector / knowledge chunks | extension + HO spend if needed | `Open schema gate pgvector` |
| P9 | `support_tickets` | TENANT_OWNED | `Open schema gate support_tickets` |

Agent will not add migrations for these until a gate line appears in OUTBOX / HO reply.
