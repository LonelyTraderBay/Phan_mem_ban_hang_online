# Enterprise Doc Gate — trước khi AI code rộng

**Owner:** Backend AI Agent (canonical) · Frontend đọc và tuân theo  
**Last updated:** 2026-07-22  
**Purpose:** Một nguồn trạng thái duy nhất — AI agent **được phép** code gì / **cấm** code gì.

> **2026-07-22 — FULL PRODUCT DOC FREEZE đang chạy.**  
> Canonical: [`../enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`](../enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md)  
> Playbook: [`../enterprise-freeze/README.md`](../enterprise-freeze/README.md)  
> Cho đến khi gate đó = **PASS**, mọi feature domain (kể cả BE-IDN-001 / FE F01 READY-MOCK implement) đều **FORBIDDEN**. Chỉ được làm việc thuộc waves W1–W7 (contract, matrix, ticket, design-spec).

## Verdict hiện tại

| Phạm vi | Gate | AI được phép |
|---------|------|--------------|
| **Doc freeze waves W1–W7** | **IN_PROGRESS** | Viết/đóng contract, matrices, tickets, design-specs theo playbook |
| **BE-IDN-*** Identity feature code | **RED** | Chờ `FULL_PRODUCT_DOC_FREEZE=PASS` |
| **FE F01** Auth/Settings feature UI | **RED** | Chờ freeze PASS (placeholders/scaffold giữ nguyên) |
| **Orders / Payments / Catalog / F02+** | **RED** | Chờ freeze PASS + phase order |
| **W0 HO defaults** | **Done** | `docs/business/HO_DEFAULTS_v1.md` |

## Sau khi FREEZE=PASS (dự kiến)

Khôi phục kickoff order (không nhảy pha):

```text
1. BE-IDN-001  schema + RLS
2. FE-F01-001  bootstrap/guards (MSW) — parallel OK after contracts synced
3. BE-IDN-003  OIDC BFF
4. Remaining Identity / F01 per dependency board
5. Later phases only when that phase's frozen artefacts remain consistent
```

## Checklist trước khi mở module khi code (sau PASS)

Agent **không** bắt đầu ticket domain cho đến khi:

1. [ ] `FULL_PRODUCT_DOC_FREEZE=PASS`
2. [ ] OpenAPI operations của module **không** còn Generic trên path sẽ implement
3. [ ] `docs/tickets/<ID>.md` tồn tại với preflight đầy đủ
4. [ ] FE: design-spec `READY-MOCK` trên `handoff-checklist.md` cho mọi screen ticket chạm
5. [ ] Permission keys trong matrix; error codes trong catalog
6. [ ] Money/tax/billing cite `HO_DEFAULTS_v1.md` — không invent

## Sync rules

| Artefact | Role |
|----------|------|
| **`enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`** | Global freeze PASS/FAIL |
| **This file** | What AI may code *after* freeze (phase gate) |
| `P1_F01_READINESS.md` | Historical prep evidence (superseded for coding permission by freeze) |
| `docs/tickets/*.md` | Per-ticket ready/blocked/done/doc-frozen |
| FE `ARTEFACT_STATUS.md` / enterprise-freeze checklist | FE inventory |

## Historical note (2026-07-21)

Prep sprint previously marked Identity/F01 GREEN for coding. That permission is **revoked** for the
duration of the up-front full-product freeze (Human Owner choice 2026-07-22). Evidence in
`P1_F01_READINESS.md` remains valid as prep history; do not use it to bypass the freeze gate.
