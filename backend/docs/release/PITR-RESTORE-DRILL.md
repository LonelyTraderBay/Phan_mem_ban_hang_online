# PITR restore drill — staging (BE-HRD-004 / Phase D)

**Ticket:** [`BE-HRD-004`](../tickets/BE-HRD-004.md)  
**Gate:** Phase A PASS; drill runs against managed staging Postgres.  
**Agent pack status:** **READY** — execution **BLOCKED-HO** until PITR enabled (if required).  
**Do not** mark `BE-HRD-004` Done until measured RPO/RTO evidence is recorded below.

## Target project

| Item | Value |
|---|---|
| Provider | Supabase |
| Project name | `ai-sales-staging` |
| Project ref | `lrcsbrmqlyvkxxspbezi` |
| Region | `ap-southeast-1` |
| Postgres | 17.6 |
| DB host | `db.lrcsbrmqlyvkxxspbezi.supabase.co` |
| Dashboard | `https://supabase.com/dashboard/project/lrcsbrmqlyvkxxspbezi` |

## Free tier note (HO decision)

Supabase **Free** projects may **not** include Point-in-Time Recovery (PITR). Daily backups may exist; PITR typically requires **Pro** or higher.

**2026-07-23 probe:** `create_branch` (restore-style drill) → `PaymentRequiredException: Branching is supported only on the Pro plan or above`. Confirming Free cannot run branch restore drill until HO upgrades (within $25/mo hard cap) or waives strict PITR.

| Scenario | Action |
|---|---|
| PITR already enabled | Proceed to drill §2 |
| PITR not available on Free | HO ack **upgrade within $25/mo cap** (see [`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md) mục 0) → enable PITR → then drill |
| HO declines upgrade | Document fallback: latest daily backup restore only; record **wider RPO** in evidence; Phase D remains blocked for strict PITR gate until HO waives in writing |

Agent **does not** change billing tier without HO ack.

## 1) Enable PITR (HO or Agent after HO ack)

1. Supabase Dashboard → **Project Settings** → **Database** → **Backups**.
2. Confirm **Point in Time Recovery** = enabled; note retention window (e.g. 7 days).
3. Record enablement timestamp (UTC): _____________

If not available: stop and request HO upgrade ack before continuing.

## 2) Drill procedure

**Goal:** Restore to a **branch** or **temporary project** — never destructive restore onto live staging during drill.

### Option A — Supabase branching (preferred if available on plan)

1. Note **T0** = current time (UTC) before intentional marker.
2. Apply a **marker** on staging (safe, reversible):
   - Insert a row into a drill-only table or `app.audit_events` with `action = 'pitr_drill_marker'` and known `id` / timestamp; **or**
   - Run read-only `SELECT now()` and record migration version from `app.schema_migrations`.
3. Wait **≥ 5 minutes** (exercises PITR granularity).
4. Dashboard → **Branches** → create branch from **point in time** = T0 − 2 min (before marker).
5. Connect to branch DB; verify marker **absent** (proves restore point).
6. Measure times:
   - **RPO** = T_marker − T_restore_point (wall clock)
   - **RTO** = branch ready − drill start

### Option B — New temporary project / restore

1. Export or use Supabase **restore to new project** (per dashboard workflow at drill time).
2. Point `DATABASE_URL` at restored instance (gitignored env only).
3. Run `node tools/migrate.mjs` — expect no pending or document drift.
4. Run `node tools/smoke-invite-accept.mjs` with `SMOKE_MIGRATE=0` against restored DB (API may be stopped).
5. Tear down temp project after evidence captured.

### Option C — Daily backup only (fallback if no PITR)

1. Restore latest daily backup to temp instance.
2. Record **RPO** = time since last backup (may be up to 24h).
3. HO must ack waiver in [`HO-GATES-HRD.md`](./HO-GATES-HRD.md) Phase D notes.

## 3) Verification checklist

- [ ] Restored DB accepts connection with app role
- [ ] Schema at or before marker state (migrations consistent)
- [ ] `smoke-invite-accept.mjs` PASS on restored DB (or documented skip if no seed)
- [ ] Live staging project **unchanged** (no in-place overwrite)
- [ ] Temp branch/project deleted after drill

## 4) Evidence table (fill on execution)

| Field | Value |
|---|---|
| Drill date (UTC) | 2026-07-23 (waiver — no drill) |
| Executor | Agent (HO-delegated) |
| PITR enabled? | **No** (Free tier) |
| HO upgrade ack (if applicable) | **Declined / deferred** — keep Free within $25/mo; Pro not enabled |
| Restore method | N/A — Free cannot `create_branch` (PaymentRequired) |
| T_restore_point (UTC) | n/a |
| T_marker (UTC) | n/a |
| T_restore_ready (UTC) | n/a |
| **Measured RPO** | **Waiver:** daily backup only — RPO up to ~24h (unknown exact) |
| **Measured RTO** | **Waiver:** not measured on Free |
| Migrations on restored DB | n/a |
| Smoke result | n/a |
| Temp resources cleaned up? | n/a |

**HO sign-off:** Agent-delegated Free PITR waiver (H6 keep) **Date:** 2026-07-23

## 5) How HO unlocks Phase D

1. Confirm PITR or ack upgrade / waiver on [`HO-GATES-HRD.md`](./HO-GATES-HRD.md) Phase D.
2. Tell agent: *"execute BE-HRD-004"* during a agreed maintenance window.
3. Agent runs drill, fills evidence table, appends OUTBOX summary (no connection strings).

## Related

- [`staging-cutover.md`](./staging-cutover.md) — live staging must not be overwritten by drill
- [`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md) — Supabase project refs
- [`PROD-READINESS-DEFECT-CLOSURE.md`](./PROD-READINESS-DEFECT-CLOSURE.md) — Phase F includes DR evidence
