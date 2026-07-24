### Task 8: Close FND-015 and HRD tickets on docs + CSV

**Files:**
- Modify: `backend/docs/tickets/BE-FND-015.md`
- Modify: `backend/docs/tickets/BE-HRD-001.md`
- Modify: `backend/docs/tickets/BE-HRD-004.md`
- Modify: `backend/docs/tickets/BE-HRD-009.md`
- Modify: `backend/docs/tickets/BE-HRD-010.md`
- Modify: `backend/backend_doc/matrices/implementation_backlog.csv`
- Modify: `backend/docs/enterprise-freeze/inventory/backlog_coverage.csv`

- [ ] **Step 1:** Set each ticket frontmatter `status: Done` and add a short Completion / Notes block:

| Ticket | Required note |
|--------|----------------|
| BE-FND-015 | Staging Fly+Supabase live; cite A-TO-F URLs; Auth0 status from W3; Supabase display rename still HO housekeeping |
| BE-HRD-001 | Self-check Done; vendor pentest optional before prod |
| BE-HRD-004 | Done waived Free — no Pro PITR within cap |
| BE-HRD-009 | Pilot evidence Done — cite `PILOT-TENANT-EVIDENCE.md` |
| BE-HRD-010 | Readiness Done — **NOT** authorize production go-live |

- [ ] **Step 2:** Set CSV statuses for those five task_ids to `Done` in both backlog files.

- [ ] **Step 3:** Recount

```powershell
cd backend
node -e "const fs=require('fs');const t=fs.readFileSync('backend_doc/matrices/implementation_backlog.csv','utf8');const rows=t.trim().split(/\r?\n/).slice(1).filter(Boolean);const c={};for(const r of rows){const s=r.split(',')[4];c[s]=(c[s]||0)+1;} console.log(c, 'total', rows.length);"
```

Expected: `{ Done: 157 }`, total `157`.

---

