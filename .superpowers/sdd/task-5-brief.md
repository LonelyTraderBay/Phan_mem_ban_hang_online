### Task 5: Add optional Fly deploy job to staging-preflight

**Files:**
- Modify: `.github/workflows/staging-preflight.yml`

- [ ] **Step 1:** Add workflow input:

```yaml
      run_fly_deploy:
        description: "Deploy Fly API if FLY_API_TOKEN is set"
        type: boolean
        default: false
```

- [ ] **Step 2:** After `health` job, add `deploy` job that:
  1. `needs: [gate, health]`
  2. Runs only if `inputs.run_fly_deploy == true`
  3. Uses `environment: staging`
  4. If `secrets.FLY_API_TOKEN` empty → print skip message and `exit 0`
  5. Else install flyctl, `flyctl auth token` via env `FLY_API_TOKEN`, then from `backend/`:

```bash
flyctl deploy --remote-only -a phan-mem-ban-hang-online-api
```

- [ ] **Step 3:** Update `deploy_note` job text to mention the new optional `deploy` job.

- [ ] **Step 4:** Validate YAML locally (no secret required)

```powershell
# From repo root — syntax sanity
Select-String -Path .github/workflows/staging-preflight.yml -Pattern "phan-mem-ban-hang-online-api|run_fly_deploy|FLY_API_TOKEN"
```

Expected: matches present.

- [ ] **Step 5:** HO (or agent with access): ensure GH Environment `staging` has migrate/health secrets. Optional: add `FLY_API_TOKEN`. Run Actions once with `confirm_phase_a=PASS`, `run_fly_deploy=false` first; then `true` if token exists. Paste run URL into `HARDENING-H5-EVIDENCE.md` or OUTBOX (no secrets).

**Wave 2 exit:** Docs use new names; workflow has optional deploy; at least one migrate+health PASS on current URLs (or documented blocker if secrets missing).

---

## Wave 3 — Auth0 Free

