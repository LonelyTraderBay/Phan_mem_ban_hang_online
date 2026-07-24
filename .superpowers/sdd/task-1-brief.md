### Task 1: Audit BE-FND-006 against backlog deliverable

**Files:**
- Read: `backend/packages/database/src/index.ts`
- Read: `backend/packages/database/src/with-tenant-transaction.test.ts`
- Read: `backend/docs/tickets/BE-FND-006.md`
- Read: `backend/backend_doc/matrices/implementation_backlog.csv` (row `BE-FND-006`)

**Done when:** Written gap list is empty OR Task 2 implements the only missing pieces. Expected deliverable from backlog: Kysely/pg pool, transaction runner, statement timeout — already present as `createDatabase` (`statement_timeout: 10_000`) and `withTenantTransaction`.

- [ ] **Step 1:** Confirm exports exist

Run from `backend/`:

```powershell
Select-String -Path packages/database/src/index.ts -Pattern "createDatabase|statement_timeout|withTenantTransaction|assertTenantSecurityContext"
```

Expected: matches for all four.

- [ ] **Step 2:** Run unit tests (no DB required for `with-tenant-transaction.test.ts`)

```powershell
cd backend
pnpm --filter @ai-sales/database exec vitest run src/with-tenant-transaction.test.ts src/migration-files.test.ts
```

Expected: PASS (or note any real failure as a gap for Task 2).

- [ ] **Step 3:** If no code gaps, skip Task 2 and go to Task 3. If a gap exists (e.g. missing timeout config docs in ticket only), list it in one bullet in the ticket Completion manifest under Known risks / Tests.

---

