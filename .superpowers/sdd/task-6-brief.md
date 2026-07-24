### Task 6: Fix wire-auth0 Fly app hint + HO console handoff

**Files:**
- Modify: `backend/tools/wire-auth0-staging.mjs`
- Read: `backend/docs/release/HARDENING-H1-AUTH0.md`

- [ ] **Step 1:** Change the final console hint from `-a ai-sales-api-staging` to `-a phan-mem-ban-hang-online-api`.

```javascript
console.log("Then: Get-Content .env.staging | flyctl secrets import -a phan-mem-ban-hang-online-api");
```

- [ ] **Step 2:** Confirm `HARDENING-H1-AUTH0.md` callback URLs already use `phan-mem-ban-hang-online-web`. If any legacy host remains, fix it.

- [ ] **Step 3:** Stop for HO. Ask Human Owner to complete Auth0 Free steps and create gitignored `backend/.auth0-staging.env` with:

```env
AUTH0_DOMAIN=YOUR_TENANT.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
```

Do not proceed to Task 7 until HO confirms the file exists locally.

---

