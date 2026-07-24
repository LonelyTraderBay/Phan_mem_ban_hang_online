# Schema gates P6–P9 (feature / HO)

**Status:** P6+P7 **OPEN** for go-live wave (2026-07-24). P8 **deferred** (Free / no pgvector). P9 **Deferred** (external support tool).  
**Dictionary target after W1:** 100/101 Done (+ job_runs); `support_tickets` Deferred (not Not started).  
**Related plan:** `docs/superpowers/plans/2026-07-24-db-schema-completion.md` (P6–P9)

| Gate | Table / work | Class | Status |
|------|----------------|-------|--------|
| P6 | `shipping_labels` | TENANT_OWNED | **Done** (`000040`) |
| P7 | `job_runs` | SYSTEM_INTERNAL | **Done** (`000041` + worker outbox instrument) |
| P8 | pgvector / knowledge chunks | extension | **DEFERRED** until Supabase Pro / HO |
| P9 | `support_tickets` | TENANT_OWNED | **Deferred** — external tool; no migrate |

P6/P7 applied local + staging in go-live wave (2026-07-24).
