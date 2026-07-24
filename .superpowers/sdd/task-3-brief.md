### Task 3: Mark BE-FND-006 Done + sync both CSVs for FND-006 and FND-014

**Files:**
- Modify: `backend/docs/tickets/BE-FND-006.md`
- Modify: `backend/backend_doc/matrices/implementation_backlog.csv`
- Modify: `backend/docs/enterprise-freeze/inventory/backlog_coverage.csv`
- Modify: `.superpowers/sdd/autonomous-progress.md` (W1 note)

- [ ] **Step 1:** In `BE-FND-006.md`, set frontmatter `status: Done`. Fill Completion manifest:

```markdown
# Completion manifest

- Contracts changed: none
- Migration: none (package only)
- Tests/evidence: `pnpm --filter @ai-sales/database exec vitest run src/with-tenant-transaction.test.ts src/migration-files.test.ts` PASS; deliverable = createDatabase + statement_timeout 10s + withTenantTransaction
- Known risks: none for package surface; live RLS suites still skip without DATABASE_URL
```

Tick acceptance criteria that apply (happy path deliverable, tenant context assertion); mark N/A with note for OpenAPI/idempotency items that do not apply to a library package.

- [ ] **Step 2:** In `implementation_backlog.csv`, set status column to `Done` for `BE-FND-006` and `BE-FND-014` (FND-014 ticket already Done with H5 evidence).

- [ ] **Step 3:** In `backlog_coverage.csv`, set `backlog_status` to `Done` for the same two task_ids.

- [ ] **Step 4:** Verify counts

```powershell
cd backend
node -e "const fs=require('fs');const t=fs.readFileSync('backend_doc/matrices/implementation_backlog.csv','utf8');const rows=t.trim().split(/\r?\n/).slice(1).filter(Boolean);const c={};for(const r of rows){const s=r.split(',')[4];c[s]=(c[s]||0)+1;} console.log(c);"
```

Expected after W1: `Done` ≥ 152, `In Progress` = 0, `Blocked-HO` = 5.

- [ ] **Step 5:** Append one line to `.superpowers/sdd/autonomous-progress.md`: `W1 PASS — FND-006/014 CSV Done (date)`.

**Wave 1 exit:** In Progress = 0 on CSV.

---

## Wave 2 — Staging CI optional Fly deploy + URL refresh

