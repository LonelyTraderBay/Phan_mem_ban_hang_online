# Task 1 Report — Audit BE-FND-006 against backlog deliverable

**Date:** 2026-07-24  
**Plan:** `backend/docs/superpowers/plans/2026-07-24-doc-gate-code-complete-to-100.md` (Wave 1, Task 1)  
**Scope:** Read-only audit of `@ai-sales/database` vs backlog row `BE-FND-006`  
**Commits:** none (by instruction)

---

## What was audited

Backlog deliverable for **BE-FND-006** (`implementation_backlog.csv`):

> Kysely/pg pool, transaction runner, statement timeout

Expected implementation surface (per plan):

| Deliverable | Expected symbol / behavior |
|-------------|---------------------------|
| Kysely + pg pool | `createDatabase()` → `Kysely` + `PostgresDialect` + `pg.Pool` |
| Transaction runner | `withTenantTransaction()` |
| Statement timeout | `statement_timeout: 10_000` on pool |
| Tenant context guard | `assertTenantSecurityContext()` (supporting export) |

Primary file: `backend/packages/database/src/index.ts`

---

## Step 1 — Confirm exports exist

**Command (from `backend/`):**

```powershell
Select-String -Path packages/database/src/index.ts -Pattern "createDatabase|statement_timeout|withTenantTransaction|assertTenantSecurityContext"
```

**Result:** PASS — all four patterns matched.

```
packages\database\src\index.ts:91:export function assertTenantSecurityContext(ctx: RequestSecurityContext): void {
packages\database\src\index.ts:97:export function createDatabase(databaseUrl: string): AppDatabase {
packages\database\src\index.ts:102:        statement_timeout: 10_000
packages\database\src\index.ts:111:export async function withTenantTransaction<T>(
packages\database\src\index.ts:116:  assertTenantSecurityContext(ctx);
```

**Code evidence:**

- `createDatabase` builds `Kysely<Database>` with `PostgresDialect({ pool: new Pool({ connectionString, statement_timeout: 10_000 }) })`.
- `withTenantTransaction` opens `db.transaction().execute`, sets `app.tenant_id`, `app.actor_id`, `app.correlation_id` via `set_config`, then runs the callback.
- `assertTenantSecurityContext` validates non-empty `tenantId`, `actorId`, `correlationId`.

---

## Step 2 — Run unit tests

**Command (verbatim from brief/plan):**

```powershell
cd backend
pnpm --filter @ai-sales/database exec vitest run src/with-tenant-transaction.test.ts src/migration-files.test.ts
```

**Result:** FAIL (exit code 1) — **not a code/test failure**; vitest cwd/config mismatch.

```
No test files found, exiting with code 1
filter: src/with-tenant-transaction.test.ts, src/migration-files.test.ts
include: apps/**/*.spec.ts, packages/**/*.test.ts, modules/**/*.test.ts
```

**Cause:** `pnpm --filter @ai-sales/database exec vitest` runs vitest with CWD `packages/database/`, but `backend/vitest.config.ts` `include` globs are relative to `backend/` root (`packages/**/*.test.ts`). Paths `src/...` from the filtered package CWD do not resolve.

**Equivalent command (from `backend/` root):**

```powershell
pnpm exec vitest run packages/database/src/with-tenant-transaction.test.ts packages/database/src/migration-files.test.ts
```

**Result:** PASS

```
Test Files  2 passed (2)
     Tests  3 passed (3)
  Duration  434ms
```

**Tests covered:**

| File | Tests |
|------|-------|
| `with-tenant-transaction.test.ts` | `assertTenantSecurityContext` accepts valid ctx; rejects empty tenantId/actorId/correlationId |
| `migration-files.test.ts` | Migration filenames ordered `000NNN_*.sql` without sort gaps |

**Integration coverage (requires `DATABASE_URL`, skip otherwise):**

- `rls.integration.test.ts` — `withTenantTransaction` validation + cross-tenant RLS on `audit_events`
- Domain RLS suites (`catalog`, `channel`, `customer`, `identity`, `inventory`, `knowledge`, etc.) exercise `createDatabase` + `withTenantTransaction` against live Postgres when `DATABASE_URL` is set.

No unit test asserts `statement_timeout: 10_000` on the Pool config; deliverable is present in source, not separately unit-tested.

---

## Step 3 — Gap assessment

### Code gaps (Task 2 scope)

**Empty.** All three backlog deliverables are implemented in `packages/database/src/index.ts`. Task 2 should be **skipped**.

### Documentation / process gaps (Task 3 scope — not Task 2)

1. **Ticket status:** `backend/docs/tickets/BE-FND-006.md` frontmatter still `status: doc-frozen`; Completion manifest fields empty.
2. **Backlog CSV:** `implementation_backlog.csv` row `BE-FND-006` still `In Progress` (expected Done after Task 3).
3. **Plan verification command:** prescribed `pnpm --filter @ai-sales/database exec vitest run src/...` fails; Task 3 completion manifest should record working command: `pnpm exec vitest run packages/database/src/with-tenant-transaction.test.ts packages/database/src/migration-files.test.ts` from `backend/`.
4. **Known risk (for Task 3 manifest):** live RLS integration suites skip without `DATABASE_URL` — env blocker, not package code gap (consistent with `P1_F01_READINESS.md`).

---

## Files read (not changed)

| Path | Purpose |
|------|---------|
| `.superpowers/sdd/task-1-brief.md` | Task instructions |
| `backend/docs/superpowers/plans/2026-07-24-doc-gate-code-complete-to-100.md` | Plan context |
| `backend/packages/database/src/index.ts` | Primary deliverable surface |
| `backend/packages/database/src/with-tenant-transaction.test.ts` | Unit tests |
| `backend/packages/database/src/migration-files.test.ts` | Migration naming tests |
| `backend/packages/database/package.json` | Package metadata |
| `backend/vitest.config.ts` | Test include paths (explains Step 2 command failure) |
| `backend/docs/tickets/BE-FND-006.md` | Ticket status + acceptance criteria |
| `backend/backend_doc/matrices/implementation_backlog.csv` | Backlog row BE-FND-006 |
| `backend/packages/database/src/rls.integration.test.ts` | Integration skip pattern |
| `backend/docs/readiness/P1_F01_READINESS.md` | Prior RLS skip note |

---

## Concerns

1. **Runbook command mismatch:** Plan/brief Step 2 command will always fail until vitest is invoked from `backend/` with full `packages/database/src/...` paths (or a package-local vitest config is added). Recommend fixing in Task 3 completion manifest / plan, not code.
2. **No dedicated unit test for `statement_timeout`:** Low risk; value is hard-coded and visible in `createDatabase`. Optional hardening only.
3. **RLS integration tests env-dependent:** Expected; document in Task 3 Known risks.

---

## Recommendation

- **Task 2:** Skip (no code gaps).
- **Task 3:** Mark BE-FND-006 Done; sync CSVs; fill Completion manifest with corrected test command and RLS skip note.

---

## Self-review

- [x] Read brief and plan Task 1 steps verbatim
- [x] Ran Step 1 command — PASS
- [x] Ran Step 2 plan command — documented failure + root cause + working alternative — tests PASS via alternative
- [x] Assessed deliverable vs backlog — all three items present
- [x] Gap list for Task 2 is empty
- [x] No code or ticket file modifications (report only)
- [x] No commits
