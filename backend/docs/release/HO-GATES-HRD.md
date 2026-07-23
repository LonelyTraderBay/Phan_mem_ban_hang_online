# HO gates after staging (Phases C–F)

**Prerequisite:** Phase A (`BE-FND-015`) **Done** on managed staging (2026-07-23).

| Phase | Ticket | Agent pack (READY) | HO provides | Agent when unblocked | Target date | Status |
|-------|--------|-------------------|-------------|----------------------|-------------|--------|
| C | [`BE-HRD-001`](../tickets/BE-HRD-001.md) | [`ASVS-PENTEST-SCOPE.md`](./ASVS-PENTEST-SCOPE.md) | Optional vendor | Agent self-check Done; **vendor still recommended before prod** | 2026-07-23 | **Done** (self-check kept for H7) |
| D | [`BE-HRD-004`](../tickets/BE-HRD-004.md) | [`PITR-RESTORE-DRILL.md`](./PITR-RESTORE-DRILL.md) | Pro upgrade for strict PITR | Free waived; **H6 keeps waiver** (no Pro within cap without HO) | 2026-07-23 | **Done** (waived Free) |
| E | [`BE-HRD-009`](../tickets/BE-HRD-009.md) | [`PILOT-TENANT-RUNBOOK.md`](./PILOT-TENANT-RUNBOOK.md) | — | Pilot live | 2026-07-23 | **Done** |
| F | [`BE-HRD-010`](../tickets/BE-HRD-010.md) | [`PROD-READINESS-DEFECT-CLOSURE.md`](./PROD-READINESS-DEFECT-CLOSURE.md) | Prod go-live separate | Readiness only | 2026-07-23 | **Done** (readiness; no go-live) |

**Agent pack legend:** Tickets advanced under HO delegated “tự làm cho hoàn thiện”. Production **go-live still requires explicit HO command**.

## Parallel (not blocking A)

| Item | Doc | Status |
|------|-----|--------|
| Billing UI bind | [`CONTRACT_GAP_BILLING_NOTIFICATIONS.md`](../../../frontend/docs/collaboration/CONTRACT_GAP_BILLING_NOTIFICATIONS.md) | OPEN — HO approve bind |
| Tauri vault | [`ADR-FE-014`](../../../frontend/docs/adr/ADR-FE-014-desktop-authentication.md) | CTA only — HO approve native |

## Wave 1 agent packs (2026-07-23)

| Phase | Deliverable | Path |
|-------|-------------|------|
| C | ASVS pentest scope + self-check | [`ASVS-PENTEST-SCOPE.md`](./ASVS-PENTEST-SCOPE.md), [`ASVS-SELFCHECK-EVIDENCE.md`](./ASVS-SELFCHECK-EVIDENCE.md) |
| D | PITR restore drill | [`PITR-RESTORE-DRILL.md`](./PITR-RESTORE-DRILL.md) |
| E | Pilot tenant | [`PILOT-TENANT-EVIDENCE.md`](./PILOT-TENANT-EVIDENCE.md) |
| F | Prod readiness | [`PROD-READINESS-DEFECT-CLOSURE.md`](./PROD-READINESS-DEFECT-CLOSURE.md) |
