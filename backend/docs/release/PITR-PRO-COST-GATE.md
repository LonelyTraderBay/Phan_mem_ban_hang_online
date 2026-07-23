# PITR / Pro — cost gate vs $25 hard cap (2026-07-24)

**HO requested:** Auth0 + PITR Pro + vendor pentest.  
**Org:** `jokerse7en7` (`odizmpbhtejteniuzpvq`) — plan currently **free**.  
**Project:** `ai-sales-staging` / `lrcsbrmqlyvkxxspbezi`

## Cost reality (do not enable blindly)

| Option | Approx cost | Fits $25/mo cap? | What you get |
|---|---|---|---|
| Stay Free + waiver | $0 | Yes | Daily backup undocumented; no branch drill |
| **Supabase Pro** (org) | **$25/mo** | **At cap** (Fly already separate) | Daily backups 7d; branching available |
| Pro + **PITR add-on** 7d | **~$100/mo** PITR alone | **No — exceeds cap** | Second-level restore granularity |
| Branch hour (after Pro) | ~$0.01344/hr | Small if short-lived | Restore-style drill via `create_branch` |

**Agent recommendation:** Upgrade org to **Pro ($25)** for daily backups + run **branching drill** (Option A in [`PITR-RESTORE-DRILL.md`](./PITR-RESTORE-DRILL.md)).  
**Do not** enable the PITR add-on under the current $25 hard cap.

Fly API/FE already bill separately — Pro alone fills the documented Supabase/cloud staging budget.

## HO action to unlock Pro drill

1. Dashboard → Organization → **Upgrade to Pro**: https://supabase.com/dashboard/org/odizmpbhtejteniuzpvq/billing  
2. Confirm card / stay within your overall spend comfort (Fly + Pro).  
3. Reply: *“Supabase Pro enabled — run PITR branch drill”*  
4. Agent then: marker → `create_branch` → verify → measure RPO/RTO → delete branch → fill evidence table.

## Until then

Free waiver in [`PITR-RESTORE-DRILL.md`](./PITR-RESTORE-DRILL.md) §4 remains in force — agent will **not** fake a Pro drill.
