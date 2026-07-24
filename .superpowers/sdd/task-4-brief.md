### Task 4: Refresh staging CI/deploy docs to new Fly names

**Files:**
- Modify: `backend/docs/release/BE-FND-014-staging-ci.md`
- Modify: `backend/docs/release/staging-fly-deploy.md`
- Modify: `backend/docs/release/HARDENING-H5-EVIDENCE.md` (add note that API host is now `phan-mem-ban-hang-online-api.fly.dev`; keep historical run URL)

- [ ] **Step 1:** Replace source-of-truth mentions of `ai-sales-api-staging` / `ai-sales-*-staging` with `phan-mem-ban-hang-online-api` (and sibling web/ops/oidc names) in the three files above. Keep a one-line “legacy destroyed” note where helpful.

- [ ] **Step 2:** In `BE-FND-014-staging-ci.md`, document optional secret `FLY_API_TOKEN` and that deploy job skips when absent.

- [ ] **Step 3:** Grep check

```powershell
cd backend
Select-String -Path docs/release/BE-FND-014-staging-ci.md,docs/release/staging-fly-deploy.md -Pattern "ai-sales-api-staging" 
```

Expected: no remaining *instructional* uses (historical evidence lines OK if labeled historical).

---

