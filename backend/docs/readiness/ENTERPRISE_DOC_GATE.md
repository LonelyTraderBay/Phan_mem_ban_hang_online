# Enterprise Doc Gate — trước khi AI code rộng

**Owner:** Backend AI Agent (canonical) · Frontend đọc và tuân theo  
**Last updated:** 2026-07-22  
**Purpose:** Một nguồn trạng thái duy nhất — AI agent **được phép** code gì / **cấm** code gì.

> **2026-07-22 — FULL PRODUCT DOC FREEZE = PASS.**  
> Canonical: [`../enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`](../enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md)  
> Playbook: [`../enterprise-freeze/README.md`](../enterprise-freeze/README.md)  
> Feature coding **được phép theo phase order** bên dưới. Không nhảy pha (ORD/PAY/…) chỉ vì docs đã đủ.

## Verdict hiện tại

| Phạm vi | Gate | AI được phép |
|---------|------|--------------|
| **Doc freeze W0–W7** | **PASS** | Chỉ chỉnh contract/ticket/spec khi có gap thật — không re-open freeze lung tung |
| **BE-IDN-001** | **GREEN (done)** | Schema + RLS Identity — ticket `docs/tickets/BE-IDN-001.md` (`done`) |
| **BE-IDN-002** | **GREEN (done)** | Tenant provision + default roles + owner invite — `docs/tickets/BE-IDN-002.md` (`done`) |
| **BE-IDN-003** | **GREEN (done)** | OIDC BFF + session/CSRF cookies + minimal `/me` — `docs/tickets/BE-IDN-003.md` (`done`) |
| **BE-IDN-004** | **GREEN (done)** | Access JWT ES256 + kid dual-accept — `docs/tickets/BE-IDN-004.md` (`done`) |
| **BE-IDN-005** | **GREEN (done)** | Refresh family rotate + reuse revoke — `docs/tickets/BE-IDN-005.md` (`done`) |
| **BE-IDN-006** | **GREEN (done)** | Logout / session / device revoke + event hook — `docs/tickets/BE-IDN-006.md` (`done`) |
| **BE-IDN-007** | **GREEN (done)** | Password forgot/reset single-use — `docs/tickets/BE-IDN-007.md` (`done`) |
| **BE-IDN-008** | **GREEN (done)** | TOTP MFA verify + step-up — `docs/tickets/BE-IDN-008.md` (`done`) |
| **BE-IDN-009** | **GREEN (done)** | Switch tenant + `/me` context — `docs/tickets/BE-IDN-009.md` (`done`) |
| **BE-IDN-010** | **GREEN (done)** | Members invite/accept/suspend/revoke — `docs/tickets/BE-IDN-010.md` (`done`) |
| **BE-IDN-011** | **GREEN (done)** | Roles/permissions + version/cache — `docs/tickets/BE-IDN-011.md` (`done`) |
| **BE-IDN-012** | **GREEN (done)** | Field-level auth helpers — `docs/tickets/BE-IDN-012.md` (`done`) |
| **BE-IDN-013** | **GREEN (done)** | Audit list/export + redaction — `docs/tickets/BE-IDN-013.md` (`done`) |
| **BE-IDN-014** | **GREEN (done)** | Support access grant — `docs/tickets/BE-IDN-014.md` (`done`) |
| **BE-IDN-015** | **GREEN (done)** | Identity security suite — `docs/tickets/BE-IDN-015.md` (`done`) |
| **Post-Identity** | **IN PROGRESS** | FE-F01 READY-MOCK; CUS-001/002 + CAT-001/002 done; CUS-003+/CAT-003+ next |
| **FE-F01** Auth/Settings UI | **GREEN (READY-MOCK)** | FE-F01-001…006 MSW screens + auth bootstrap/guards (2026-07-22) |
| **BE-CUS-001** | **GREEN (done)** | Customer/CDP schema + RLS (`000011`) — `docs/tickets/BE-CUS-001.md` (`done`) |
| **BE-CUS-002** | **GREEN (done)** | Customer CRUD + PII masking — `docs/tickets/BE-CUS-002.md` (`done`) |
| **BE-CUS-003** | **GREEN (done)** | Identity attach/dedupe — `docs/tickets/BE-CUS-003.md` (`done`) |
| **BE-CAT-001** | **GREEN (done)** | Catalog schema + RLS (`000012`) — `docs/tickets/BE-CAT-001.md` (`done`) |
| **BE-CAT-002** | **GREEN (done)** | Catalog CRUD + ETag — `docs/tickets/BE-CAT-002.md` (`done`) |
| **BE-CUS / BE-CAT / BE-IMP** | **P3 CODE EXIT (in-memory)** | CUS/CAT/IMP application Done; FE sync + Postgres adapters follow |
| **BE-INV-001…008** | **GREEN (done)** | Inventory schema (`000015`) + in-memory application + HTTP controller — `docs/tickets/BE-INV-*.md` (`done`) |
| **Orders / Payments / F02+** | **RED until phase** | Chỉ khi phase hiện tại Done + artefacts còn consistent |

## Kickoff order (bắt buộc)

```text
1. BE-IDN-001  identity schema + RLS (000005) — done
2. BE-IDN-002  tenant provision + default roles + owner invite — done
3. BE-IDN-003  OIDC BFF + session cookie + CSRF — done
4. BE-IDN-004  access JWT (iss/aud/exp + kid rotation) — done
5. BE-IDN-005  refresh family rotation + reuse detection — done
6. BE-IDN-006  logout / session / device revoke — done
7. FE-F01-001  bootstrap/guards (MSW) — parallel OK after contracts synced for the slice
8. BE-IDN-007 password reset — done
9. BE-IDN-008 MFA TOTP / step-up — done
10. BE-IDN-009 switch tenant — done
11. BE-IDN-010 members invite/accept/revoke — done
12. BE-IDN-011 roles/permissions — done
13. BE-IDN-012 field auth — done
14. BE-IDN-013 audit list/export — done
15. BE-IDN-014 support grant — done
16. BE-IDN-015 security suite — done (Identity phase exit)
17. BE-CUS-001 customer/CDP schema + RLS (`000011`) — done
18. BE-CAT-001 catalog schema + RLS (`000012`) — done
19. BE-CUS-002 customer CRUD + PII masking — done
20. BE-CAT-002 catalog CRUD + ETag — done
21. BE-CUS-003 identity attach/dedupe — done
22. BE-CUS-004 merge preview/transaction — Done
23. BE-CAT-003 cost/price permission + audit — Done
24. BE-CAT-004 private media upload/scan/signed URL — Done
25. BE-IMP-001…005 import pipeline — Done (in-memory + migration 000014)
26. FE P3 slices + `contracts:sync` — next (Wave 2)
27. BE-INV-001…008 inventory schema + in-memory application — Done (`000015`)
28. P5 Channel only after Inventory exit criteria acknowledged
```

Money/tax/billing: luôn cite [`../business/HO_DEFAULTS_v1.md`](../business/HO_DEFAULTS_v1.md).

## Checklist trước khi mở mỗi ticket domain

Agent **không** bắt đầu ticket cho đến khi:

1. [x] `FULL_PRODUCT_DOC_FREEZE=PASS`
2. [ ] OpenAPI operations của module **không** còn Generic trên path sẽ implement
3. [ ] `docs/tickets/<ID>.md` tồn tại với preflight đầy đủ (`ready` hoặc unblocked)
4. [ ] FE: design-spec `READY-MOCK` trên `handoff-checklist.md` cho mọi screen ticket chạm
5. [ ] Permission keys trong matrix; error codes trong catalog
6. [ ] Money/tax/billing cite `HO_DEFAULTS_v1.md` — không invent

## Sync rules

| Artefact | Role |
|----------|------|
| **`enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`** | Global freeze PASS/FAIL |
| **This file** | What AI may code *after* freeze (phase gate) |
| `P1_F01_READINESS.md` | Historical prep evidence |
| `docs/tickets/*.md` | Per-ticket ready/blocked/done/doc-frozen |
| FE `ARTEFACT_STATUS.md` / enterprise-freeze checklist | FE inventory |

## Historical note

Prep sprint (2026-07-21) and up-front freeze (2026-07-22) are complete. Do not use historical RED
revocation text to block BE-IDN-001 — that revocation ended when FREEZE=PASS.
