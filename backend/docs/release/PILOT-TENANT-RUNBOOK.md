# Pilot tenant onboarding — staging (BE-HRD-009 / Phase E)

**Ticket:** [`BE-HRD-009`](../tickets/BE-HRD-009.md)  
**Gate:** Phase A PASS; Phases C–D recommended complete (pentest + DR) before external pilot data.  
**Agent pack status:** **READY** — execution **BLOCKED-HO** until HO supplies pilot email + flag policy.  
**Do not** mark `BE-HRD-009` Done until onboarding evidence is filed (ticket stays `doc-frozen`).

## Purpose

Onboard one **pilot tenant** on managed staging using the same invite → accept → session patterns proven in Phase A smoke, with feature-flag and capacity guardrails.

## HO provides (before agent executes)

| Input | HO fills |
|---|---|
| Pilot owner email | _____________ (real inbox for Auth0 + invite) |
| Pilot tenant display name | _____________ |
| Pilot allowed features | per flag policy below |
| Capacity ack | max concurrent users / orders for pilot window |
| Data classification | no production PII unless HO approves |

Record in [`HO-GATES-HRD.md`](./HO-GATES-HRD.md) Phase E **HO provides** column.

## Prerequisites

- [ ] Phase A cutover PASS ([`staging-cutover.md`](./staging-cutover.md))
- [ ] Staging API + Web Admin HTTPS live
- [ ] Auth0 user exists or will be created on first OIDC login for pilot email
- [ ] `backend/.env.staging` on executor machine (gitignored; no secrets in git)

## Onboarding procedure

### 1) Create tenant + invite (API or Super Admin)

Use staging Super Admin or authenticated ops flow:

```text
POST /api/v1/super-admin/tenants          → create tenant (record tenant_id)
POST /api/v1/.../invitations              → invite pilot owner email to tenant
```

**Or** mirror local smoke with staging `DATABASE_URL`:

```powershell
cd backend
# Load .env.staging into env (same pattern as staging-cutover.md)
$env:PILOT_OWNER_EMAIL = "HO_SUPPLIED_EMAIL"
$env:SMOKE_MIGRATE = "0"
node tools/smoke-invite-accept.mjs
```

Adapt smoke env vars if script supports custom email (`SMOKE_*` — set per runbook in ticket evidence).

### 2) Pilot accepts invite

1. Pilot opens invite link from email (or HO-forwarded staging link).
2. Complete accept flow → membership active.
3. Verify `GET /api/v1/me` returns correct `tenant_id` and permissions.

### 3) OIDC login (Web Admin)

1. Pilot visits staging Web Admin HTTPS URL.
2. `GET /api/v1/auth/oidc/start` → Auth0 login with **pilot email**.
3. Callback → dashboard loads with pilot tenant context.

### 4) Feature flags

Tenant overrides via Super Admin API (OpenAPI: `POST /super-admin/tenants/{tenant_id}/feature-flags/{flag_key}` · permission `ops.feature_flag`).

| Flag key (examples) | Pilot default | HO override |
|---|---|---|
| `order.confirm.v1` | off until HO enables | |
| `ai.assistant.v1` | off | |
| `channel.*` | per channel readiness | |

**Policy notes:**

- Flags gate **tenant-visible behaviour**; they do not disable RLS, authz, or audit.
- Document each flag set for pilot in evidence table.
- Rollback = disable flag via same API; no schema rollback required.

### 5) Capacity guard

Align with [`docs/p0/capacity-slo-cost-assumptions.md`](../p0/capacity-slo-cost-assumptions.md) staging tier:

| Guard | Staging pilot limit (suggested — HO adjusts) |
|---|---|
| Max pilot users | 5 |
| Max API rate (soft) | monitor; alert HO if sustained > 10 rps |
| Storage / import jobs | single small catalog import; no bulk prod dump |
| AI orchestration | disabled unless flag + HO ack |

If limits exceeded: HO decides scale-up (within $25/mo cap) or throttle pilot.

### 6) Smoke verification (pilot-specific)

| Step | Expected |
|---|---|
| Invite sent | 201 + invitation id |
| Accept | 200; `perms` > 0 |
| OIDC → `/me` | 200; tenant matches pilot |
| Cross-tenant probe | pilot user cannot read other tenant resources (403/404) |
| Flag off | disabled feature returns catalog error or hidden UI |

## Evidence template

| Field | Value |
|---|---|
| Onboard date (UTC) | |
| Pilot tenant_id | |
| Pilot owner email (redacted in git: `p***@domain`) | |
| Invite / accept | PASS / FAIL |
| OIDC login | PASS / FAIL |
| Flags set | list keys + values |
| Capacity guard ack | HO date |
| Issues / defects | link to tracker |

**HO sign-off:** _____________ **Date:** _____________

## How HO unlocks Phase E

1. Fill pilot email + flag policy on [`HO-GATES-HRD.md`](./HO-GATES-HRD.md) Phase E.
2. Message agent: *"execute BE-HRD-009"* with email (not in public chat if policy requires — use secure channel).
3. Agent executes runbook, fills evidence, OUTBOX one-liner.

## Related

- [`BE-B0-staging-smoke.md`](../tickets/BE-B0-staging-smoke.md) — invite/accept pattern
- [`ASVS-PENTEST-SCOPE.md`](./ASVS-PENTEST-SCOPE.md) — use pilot tenant for IDOR negative testing in Phase C
- [`PROD-READINESS-DEFECT-CLOSURE.md`](./PROD-READINESS-DEFECT-CLOSURE.md) — pilot defects roll into Phase F
