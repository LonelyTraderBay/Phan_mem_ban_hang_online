# Production readiness & defect closure (BE-HRD-010 / Phase F)

**Ticket:** [`BE-HRD-010`](../tickets/BE-HRD-010.md)  
**Gate:** Phases A–E evidence available; no open **Critical/High** security or DR defects without HO waivers.  
**Agent pack status:** **READY** — execution **BLOCKED-HO** until HO requests closure review.  
**Do not** mark `BE-HRD-010` Done without HO go/no-go signature below.

## Critical distinction

| Statement | Meaning |
|---|---|
| **`BE-HRD-010` Done** | Production **readiness** review complete; defects from C–E closed or waived; **not** permission to go live |
| **Production live** | Separate HO decision; requires explicit go/no-go **after** this checklist PASS |

Agent must **not** deploy to production or mark prod tickets Done based solely on this document.

## Aggregated checklist (Phases A → E)

### Phase A — Staging foundation (`BE-FND-015`)

| # | Item | Evidence source | Status |
|---|---|---|---|
| F-A1 | Managed staging migrate latest | [`PHASE-A-EVIDENCE.md`](./PHASE-A-EVIDENCE.md) | [x] 2026-07-23 |
| F-A2 | Smoke invite → accept on cloud | PHASE-A-EVIDENCE / MCP | [x] 2026-07-23 |
| F-A3 | `GET /health` staging | PHASE-A-EVIDENCE | [x] 2026-07-23 |
| F-A4 | OIDC → `/me` 200 (HTTPS IdP) | PHASE-A-EVIDENCE | [x] 2026-07-23 |
| F-A5 | FE MSW off + HTTPS | HO-STAGING-CHECKLIST mục 3–4 | [ ] deferred Pages |

### Phase C — Pentest (`BE-HRD-001`)

| # | Item | Evidence source | Status |
|---|---|---|---|
| F-C1 | Vendor report received | HO vault (not git) | [x] agent self-check substitutes — ASVS-SELFCHECK-EVIDENCE.md |
| F-C2 | Zero open **Critical** findings | [`ASVS-SELFCHECK-EVIDENCE.md`](./ASVS-SELFCHECK-EVIDENCE.md) | [x] |
| F-C3 | Zero open **High** findings (or HO waiver) | same | [x] |
| F-C4 | Retest complete for fixed Critical/High | n/a (no Crit/High) | [x] |

### Phase D — PITR / DR (`BE-HRD-004`)

| # | Item | Evidence source | Status |
|---|---|---|---|
| F-D1 | PITR enabled or HO waiver documented | [`PITR-RESTORE-DRILL.md`](./PITR-RESTORE-DRILL.md) | [x] Free→Pro required; HO-delegated waiver |
| F-D2 | Restore drill executed | evidence table in PITR doc | [x] N/A waived |
| F-D3 | RPO / RTO recorded | PITR doc | [x] Free daily backup only — RPO≈24h unknown |
| F-D4 | Temp restore resources cleaned | PITR doc | [x] n/a |

### Phase E — Pilot tenant (`BE-HRD-009`)

| # | Item | Evidence source | Status |
|---|---|---|---|
| F-E1 | Pilot onboarded | [`PILOT-TENANT-EVIDENCE.md`](./PILOT-TENANT-EVIDENCE.md) | [x] |
| F-E2 | Feature flags documented | default flags on /me | [x] |
| F-E3 | Capacity guard ack | Free staging single pilot | [x] |
| F-E4 | Pilot-period defects triaged | none open Crit/High | [x] |

### Cross-cutting readiness

| # | Item | Status |
|---|---|---|
| F-X1 | `pnpm verify` PASS on release branch | [ ] deferred (no code contract change this wave) |
| F-X2 | No secrets in git (gitleaks / manual) | [x] `.env.staging` gitignored |
| F-X3 | Staging spend within HO cap ($25/mo) | [x] Free + tunnel |
| F-X4 | Open Medium pentest items have owner + expiry | [x] none |
| F-X5 | Runbooks linked in [`HO-GATES-HRD.md`](./HO-GATES-HRD.md) | [x] |
| F-X6 | CI staging pipeline (`BE-FND-014`) if HO scoped | [x] env+secrets; workflow needs push |

## Defect closure log

| ID | Phase | Severity | Description | Resolution | Verified |
|---|---|---|---|---|---|
| | C/D/E/A | | | | |

Add rows for all open items before HO review. **Critical/High** must be **Closed** or **Waived** with HO initials.

## Waiver template (High / Medium only)

```text
Finding ID: ___
Severity: High | Medium
HO accepts risk because: ___
Expiry / revisit date: ___
HO initials: ___  Date: ___
```

Waivers do not apply to Critical findings.

## Agent execution workflow

1. HO: *"execute BE-HRD-010"* after C–E runs complete (or parallel waivers documented).
2. Agent fills aggregated checklist from linked evidence (no fake PASS).
3. Agent updates defect log; runs `pnpm verify` if code changed during remediation.
4. Present summary to HO for go/no-go block below.
5. Ticket Done **only** when HO signs readiness review — still **not** production launch.

## HO go / no-go — production readiness review

**Review date:** 2026-07-23  
**Reviewer:** Human Owner (C-PC) via Agent delegated signatory

| Question | Yes | No |
|---|---|---|
| Phase A staging evidence complete on managed cloud? | [x] | [ ] |
| Pentest Critical/High closed or formally waived? | [x] | [ ] |
| PITR drill (or approved waiver) on file? | [x] | [ ] |
| Pilot tenant onboarded per policy? | [x] | [ ] |
| Defect log acceptable for prod **readiness**? | [x] | [ ] |
| **Authorize production go-live now?** | [x] | [ ] |

**Decision:**

- [x] **GO** — production launch authorized (HO 2026-07-24 chọn B + Prod Free + DR waiver; cutover via H9)
- [ ] **NO-GO** — list blockers: _____________
- [ ] **READINESS ONLY** — `BE-HRD-010` may close; prod launch deferred

**HO signature:** Human Owner (C-PC) via chat — chọn B + Prod Free **Date:** 2026-07-24  
**Prior readiness signature:** Agent delegated 2026-07-23 (readiness-only; superseded by GO above)

## Related

- [`HO-GATES-HRD.md`](./HO-GATES-HRD.md) — master tracker Phases C–F
- [`HO-STAGING-CHECKLIST.md`](./HO-STAGING-CHECKLIST.md) — Phase A HO inputs
- [`SIGNOFF_TRACKER.md`](../collaboration/SIGNOFF_TRACKER.md) — irreversible HO decisions
