# Mandatory artefact status (spec section 29)

Section 29's full list is a **pre-production** checklist for the whole project lifecycle, not an
F00-scaffolding requirement — most business-feature artefacts below don't exist yet because their
owning module doesn't exist yet. Tracked here so "artefact exists" isn't confused with "F00 is
done" or vice versa.

## `contracts/`

| Artefact | Status |
|---|---|
| `openapi/tenant-api.yaml`, `openapi/ops-api.yaml` | ✅ Present — synced from backend |
| `asyncapi/tenant-events.yaml` | ✅ Present — synced from backend (typed payloads W2) |
| `asyncapi/ops-events.yaml` | ✅ Present — synced from backend `channels.opsEvents` (W2 freeze 2026-07-22; no longer stub) |
| `permissions/permission-matrix.yaml` | ✅ Present — synced from backend (59 rows) |
| `errors/error-catalog.yaml` | ✅ Present — synced from backend (F01 INVITE_*/last-owner/device codes included; see BACKEND_REF.lock) |
| `metrics/metric-catalog.yaml` | ❌ Not started — needed by F09 (Dashboard), which doesn't exist yet |
| `fixtures/<domain>/*.json` | Partial — `packages/test-utils`'s generated MSW handler descriptors cover this role today; per-domain fixture files aren't split out separately |
| `feature-flags.yaml` (not in spec's list, but exists) | ✅ Present — frontend-owned, hand-maintained |

## `docs/adr/`

✅ All 18 present (`ADR-FE-001` through `ADR-FE-018`).

## `docs/architecture/`

| Artefact | Status |
|---|---|
| `auth-sequence.md` | Current (2026-07-21) — OIDC BFF login + bootstrap / refresh / tenant-switch / 403-no-refresh (GAP-009) |
| `frontend-context.md` | ❌ Not started |
| `realtime-sequence.md` | ❌ Not started |
| `order-state-machines.md` | ❌ Not started — pending F08 |
| `platform-adapters.md` | ❌ Not started |

## `docs/threat-model/`, `docs/security/`

- `threat-model/README.md` — ✅ stub present, explicitly flagged as needing a Security-led pass.
- `security/data-classification.md`, `security/telemetry-redaction.md` — ❌ not started as
  standalone docs, though `packages/telemetry/src/redact.ts`'s doc comments cover the redaction
  behavior in code.

## `docs/ux/`

This project has no human designer — the Design AI Agent (`.claude/agents/design-spec-writer.md`)
produces text-based design-spec documents instead of a Figma file (see `ux/README.md`).

- `ux/README.md` — ✅ present, describes the Design AI Agent process.
- `ux/handoff-checklist.md` — ✅ present; **all product screens READY-MOCK** (F01 HO 2026-07-21;
  remaining via HO policy C / enterprise freeze W6 2026-07-22). `/auth/callback` = N/A.
- `ux/design-specs/_TEMPLATE.md` — ✅ present.
- F01 design-specs (**READY-MOCK**):
  `login.md`, `forgot-password.md`, `reset-password.md`, `mfa-challenge.md`, `accept-invite.md`,
  `settings-tenant.md`, `settings-users.md`, `settings-roles.md`, `settings-devices.md`.
- W6 design-specs (**READY-MOCK**, policy C): onboarding, dashboard, inbox, orders, products,
  inventory, knowledge, channels, ai, reports, settings-audit-logs, settings-notifications, billing,
  tenants, feature-flags, alerts, support-access, ai-health, channel-health, audit-logs.
- `ux/screen-state-matrix.md`, `ux/content-glossary.md` — ❌ not started; fill alongside READY-MOCK
  implementation, not from draft specs alone.

## `docs/quality/`

- `test-strategy.md` — ✅ present: synthesizes the real test infrastructure (Vitest, MSW via
  `packages/test-utils`, Playwright smoke, Storybook a11y, bundle budget, CodeQL) into layers,
  ownership per layer, and tracked known gaps.
- `performance-plan.md` — ❌ not started. Explicitly gated on Performance/Product sign-off per spec
  17.1 — not written unilaterally.

## `docs/collaboration/` (not in spec's list, added for BE↔FE coordination)

| Artefact | Status |
|---|---|
| `CONTRACT_WORKFLOW.md` | ✅ Present — FE-side summary; canonical version lives in `backend/docs/collaboration/CONTRACT_WORKFLOW.md` |

See also `backend/docs/collaboration/contract-gap-board.md` (contract gap tracking) and
`backend/docs/collaboration/SIGNOFF_TRACKER.md` (cross-project pending sign-offs) — both canonical
on the backend side since BE owns contracts and most of the pending sign-offs are BE-side, but
relevant to FE release readiness.

## `docs/domain/`

- `glossary.md` (not in spec's list, added for shared BE/FE terminology) — ✅ present, FE-specific
  addendum; canonical version lives in `backend/docs/domain/glossary.md`.

## `docs/release/`

❌ Not started: `web-release-runbook.md`, `windows-release-runbook.md`. `.github/workflows/pr.yml`
implements the PR pipeline (spec 19.1) for real; the main/staging (19.2) and desktop (19.3)
pipelines are not yet implemented or documented — no staging environment exists yet to deploy to.

## `docs/runbooks/`

| Runbook | Status |
|---|---|
| `local-setup.md` | ✅ Present |
| `ci-troubleshooting.md` (not in spec's list, added because F00.6 requires it) | ✅ Present |
| `backend-integration.md` (not in spec's list, added to unblock FE↔BE environment questions) | ✅ Present — FE-side summary; canonical version + current environment reality (only `local`/`ci` exist, no seed data yet) lives in `backend/docs/release/fe-integration-environment.md` |
| `auth-session.md` | DRAFT (2026-07-21) — local MSW auth debugging for F01 |
| `realtime.md` | Partial — `packages/realtime`'s README/code comments cover the mechanism; no standalone runbook |
| `channel-health.md` | ❌ Pending F05 |
| `message-delivery.md` | ❌ Pending F06 |
| `order-reservation.md` | ❌ Pending F08 |
| `printing.md` | ❌ Pending F08/F10 |
| `desktop-update.md` | ❌ Pending F10 |

## `docs/tickets/` (FE)

| Artefact | Status |
|---|---|
| `F01-preflight.md` | ✅ Present — FE-F01-001…006 DoR; contracts synced; MSW READY-MOCK in progress (2026-07-22) |

## Project management artefacts

RACI and Risk register are defined in the spec itself (sections 24–25) but not yet mirrored into
a live project tracker. Contract gap board, release evidence checklist, dependency/waiver
register, browser/OS/printer test matrix, feature-flag inventory, and client/API compatibility
matrix are all ❌ not started — these are process artefacts owned by Product/Engineering
leadership, not something to fabricate as part of a code scaffold.

## Active waivers (P1 → F01 prep — 2026-07-21)

Canonical tracker: `backend/docs/collaboration/SIGNOFF_TRACKER.md` and
`backend/docs/readiness/P1_F01_READINESS.md`.

| Waiver | Meaning for Frontend | Expires when |
|---|---|---|
| F00.6 staging / vertical shell | F01 prep uses **MSW + local** as the integration mode. Do not block F00 exit on missing `dev`/`staging`. | BE Identity + one read-only endpoint E2E on provisioned `dev`, then add cross-repo Playwright-against-API job |
| Storybook publish / F00.10 preview | Local Storybook + PR pipeline is enough; no hosted Storybook required for F00 exit | First screen reaches `READY-MOCK` or Human Owner requests hosting |
| Auth strategy | **Resolved** — ADR-FE-013 OIDC + BFF cookie (HO 2026-07-21). Internal-credentials login UI out of scope for Web Admin. BE GAP-009 Closed. | Contracts synced; FE-F01 READY-MOCK |
