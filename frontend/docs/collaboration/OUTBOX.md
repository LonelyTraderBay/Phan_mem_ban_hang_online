# Frontend AI Agent — Outbox

**Ownership rule: only the Frontend AI Agent ever writes to this file.** Backend AI Agent and Human
Owner read it; neither edits it. This is the mirror of
[`backend/docs/collaboration/OUTBOX.md`](../../../backend/docs/collaboration/OUTBOX.md) — read that
file's "Why this file exists" section for the full rationale (topology + race-condition risk with
the old shared-file design).

## What goes here

- Contract gaps (per `docs/collaboration/CONTRACT_WORKFLOW.md`'s P0/P1/P2 process) — instead of
  writing directly into `backend/docs/collaboration/contract-gap-board.md`, log it here. Backend AI
  Agent reads this file (best-effort, if `backend/` is mounted as a sibling) and transcribes it into
  the gap board it owns.
- Escalations that need Human Owner (business/security/risk decisions, real disagreements with
  Backend AI Agent that no existing rule resolves) — log here. Human Owner can read this file
  directly (they have both repos checked out) without waiting for any transcription step.
- **P0 gaps** (block auth/order/send/security): still log here first, but also — because a P0 means
  Frontend AI Agent is fully blocked and can't just wait for Backend AI Agent's next unrelated
  session to happen to read this file — treat it as your own responsibility to notify Human Owner
  through whatever channel you're actually running in (e.g. say so plainly in your own session
  output) rather than assuming a background pull will catch it in time.

## Entries

Append only — never edit or delete a prior entry, only add a `Resolution` note below it once
handled (Frontend AI Agent may add its own resolution note once Backend AI Agent's fix lands and
`pnpm contracts:sync` confirms it).

```text
### <YYYY-MM-DD> — <one-line title>
Priority: P0 | P1 | P2
Blocked task: <FE-XXX>
Detail: <concrete example — request/response/state, not a vague description>
Resolution: <filled in later, once acted on>
```

### 2026-07-21 — Catalog bulk-import and publish share `catalog.write`, no dedicated permission
Priority: P2
Blocked task: F03 (Product, Variant/SKU, Category và Import) — routes `/products/import`,
`/products/import/:jobId`, and the product "publish" lifecycle action referenced in F03.2
Detail: `permission_matrix.csv` only has `catalog.read`/`catalog.write` for the catalog domain — no
`catalog.import` or `catalog.publish`. Bulk import (F03.3 requires "Large import limits và async
events" — a much bigger blast radius than a single edit) and publish (making a product visible to
customers/channels) are meaningfully different actions from a routine edit, similar to how
`knowledge.write` vs `knowledge.publish` are already split for the knowledge domain (CSV rows
26/28). Requesting consideration of `catalog.import` and/or `catalog.publish` as distinct
permissions so a tenant can restrict bulk-import/publish rights separately from day-to-day catalog
edit rights. Not blocking — spec 00_FRONTEND_IMPLEMENTATION_SPEC_ENTERPRISE_GRADE_v2.0.md §8.1 and
F03.2 use `catalog.write` for both meanwhile, with an inline note not to silently invent
`catalog.import`/`catalog.publish` client-side.
Resolution:

### 2026-07-21 — F11 Super Admin: no ops-scoped key for alert-acknowledge, AI kill switch, channel manage
Priority: P2
Blocked task: F11 (Super Admin Portal) — FE-F11-006 Emergency actions, and the acknowledge step of
FE-F11-007 Alerts/audit
Detail: F11.3's permission list references three actions with no matching key in
`permission_matrix.csv`: (1) acknowledging/resolving a platform alert — `/alerts` has
`ops.alert.read` for viewing, but no `ops.alert.*` write/acknowledge action; (2) the Super Admin
"disable AI" emergency kill switch — CSV only has tenant-scoped `ai.disable` (row 41, gated by
owner/admin columns), not an ops/platform-scoped equivalent usable from the separate Super Admin
session/audience described in F11.1; (3) Super Admin channel disconnect/reprocess — CSV only has
tenant-scoped `channel.manage` (row 31), same gap. Open question for Backend AI Agent: is the
intended design that `support.access` elevation grants the ops actor the *tenant-scoped* permission
within the elevated session (so `ai.disable`/`channel.manage` get reused during an active elevation,
no separate ops.* key needed), or do these need dedicated ops-scoped keys like the other
`ops.*` rows? Spec currently leaves `ops.alert.acknowledge`/`ops.ai.disable`/`ops.channel.manage`
in place with a note flagging them as unresolved rather than silently mapping them to something
that might be wrong. Not blocking — no other F11 work depends on these three specifically.
Resolution:

### 2026-07-21 — Systemic permission-key drift beyond F01/F03/F09/F11 (needs a dedicated pass)
Priority: P1
Blocked task: every F02/F04-F08/F10 route-guard/PermissionGate wiring ticket
Detail: two rounds of fixing spec↔CSV permission-key mismatches (this session) found the drift is
wider than either round's assigned scope. Full-document diff against the real
`permissionKeys.ts` union (64 keys) surfaced these additional spec-referenced keys with no CSV
match, none yet fixed: `role.write` (should likely be `role.manage`), `category.read`/
`category.write` (no `category.*` namespace exists — catalog categories may need to reuse
`catalog.*` the same way products/variants do, or need dedicated keys — genuine design question,
not just a typo), `report.revenue.read`/`report.sla.read`/`report.ai_quality.read`,
`inventory.read_movements`/`inventory.movement.read`/`inventory.reservation.read`,
`channel.health.read`/`channel.disconnect`/`channel.reauthorize`/`channel.webhook.read`,
`conversation.note.read`/`note.create`/`status.write`, `attachment.read`/`attachment.upload`,
`ai.suggestion.*`/`ai.log.read`/`ai.blocked.read`/`ai.source.read`/`ai.prompt_internal.read`,
`order.write`/`order.discount.apply`/`order.cost.read`, `shipment.create`, `packing_slip.read`/
`packing_slip.print`, `customer.export`, `billing.write`/`billing.usage.read`/`billing.invoice.read`/
`billing.payment_method.write`/`billing.plan.change`/`billing.cancel`, `ai.sandbox.test`. Each is
either (a) a naming variant of a real CSV key — safe to rename mechanically once someone confirms
the mapping, or (b) a genuinely missing permission the CSV needs a new row for (some, like the
category/report/inventory-movement ones, look like real gaps, not typos). This needs the same
methodical read-CSV-first, decide-per-key treatment the two prior rounds used — not a blind
find-replace — so it's logged here as its own unit of work rather than rushed.
Resolution: 2026-07-21 — F01 slice closed by Backend (`role.write` → `role.manage`; see
`backend/docs/collaboration/gap-003-f01-slice.md`). Remaining non-F01 keys still Open on gap board.

### 2026-07-21 — F01 P0: GET /me must return SessionBootstrap (not GenericDataResponse)
Priority: P0
Blocked task: FE-F01-001 Auth bootstrap and guards; all post-login routes
Detail: ADR-FE-013 + `packages/auth` `sessionBootstrapSchema` require `GET /me`
(`getCurrentContext`) to return SessionBootstrap (user, tenant, session, device, permissions[],
feature_flags). Synced OpenAPI still references `GenericDataResponse`; MSW generated fixture
causes `invalid_schema` on bootstrap (documented in `packages/test-utils/README.md`). Need frozen
schema + regenerated contracts before F01 auth E2E is meaningful against contract MSW.
Resolution: 2026-07-21 — Closed. Backend shipped `SessionBootstrapResponse` on `getCurrentContext`;
FE `contracts/openapi/tenant-api.yaml` + `api-generated` regenerated; MSW hand-override remains for
honest fixtures (generator still skips non-generic schemas). Backend gap board GAP-004 Closed.

### 2026-07-21 — F01 P0: AuthResponse / MFA verify completeness
Priority: P0
Blocked task: FE-F01-002 Login/2FA/recovery
Detail: `AuthResponse` exists with partial MFA fields (`mfa_required`, `mfa_challenge_id`) but
`POST /auth/mfa/verify` still returns `GenericDataResponse` and accepts `GenericCommandRequest`.
Need typed MFA verify request/response (challenge id + code → session established) aligned with
BFF cookie session (web must not require reading `access_token`). Confirm AuthResponse required
fields vs desktop-only `access_token` notes remain accurate under ADR-FE-013/014.
Resolution: 2026-07-21 — Closed. `verifyMfa` 2xx is `AuthResponse`; request is strict
`MfaVerifyRequest` (`challenge_id` UUID + six-digit `code`). FE contracts and generated types synced.

### 2026-07-21 — F01 P0/P1: Missing F01 error codes in error-catalog
Priority: P0
Blocked task: FE-F01-002, FE-F01-003, FE-F01-004, FE-F01-005, FE-F01-006
Detail: Spec F01.6 lists codes absent from synced `error-catalog.yaml`: `AUTH_SESSION_EXPIRED`
(closest: `AUTH_TOKEN_EXPIRED`), `INVITE_EXPIRED` / `INVITE_REVOKED` / `INVITE_ALREADY_ACCEPTED`
(closest single code: `INVITATION_TOKEN_INVALID`), `USER_LAST_OWNER`, `ROLE_VERSION_CONFLICT`
(closest: `RESOURCE_VERSION_MISMATCH`), `ROLE_WOULD_REMOVE_LAST_ADMIN`, `DEVICE_ALREADY_REVOKED`.
FE design-specs map to existing codes only and flag CONTRACT GAP — please add catalog rows or
confirm intentional collapse onto the closest codes.
Resolution: 2026-07-21 — Closed. Catalog + FE `errorCodes.ts` include INVITE_*, USER_LAST_OWNER,
ROLE_WOULD_REMOVE_LAST_ADMIN, DEVICE_ALREADY_REVOKED; AUTH_SESSION_EXPIRED maps to
AUTH_TOKEN_EXPIRED; ROLE_VERSION_CONFLICT maps to RESOURCE_VERSION_MISMATCH. Backend GAP-005 Closed.

### 2026-07-21 — F01 P0: CSRF contract for cookie-authenticated mutations
Priority: P0
Blocked task: FE-F01-001 / any credential or BFF cookie mutation (login, logout, switch-tenant,
member/role writes)
Detail: F01.3 requires OIDC/BFF CSRF contract. FE needs documented how double-submit cookie /
header is issued and validated for same-origin cookie sessions so `api-client` can send it.
Absent from current FE-synced contracts.
Resolution: 2026-07-21 — Closed. Synced OpenAPI defines `X-CSRF-Token` double-submit semantics and
marks cookie-authenticated mutations with `x-csrf-protection: cookie-session-required`. Bearer
OAuth/PKCE clients do not send this browser-only header.

### 2026-07-21 — F01 P1: Permission grouping metadata for role editor
Priority: P1
Blocked task: FE-F01-005 Role editor
Detail: F01.3/F01.5 require permission registry grouping metadata for checkbox groups / mixed
state. `permission-matrix.yaml` lists flat permissions only — no group id/label/order. Without
metadata FE can only heuristic-group by prefix (interim). Request Backend-owned grouping export
(or extend matrix) for role UI.
Resolution: 2026-07-21 — Closed. Synced permission entries now include Backend-owned `group.id`,
`group.label_vi`, and `group.display_order`; the role editor no longer needs a prefix heuristic.

### 2026-07-21 — F01 P1: Spec/docs still say role.write — matrix key is role.manage
Priority: P1
Blocked task: FE-F01-005; any FE route guard copying spec F01.2 literally
Detail: `permission-matrix.yaml` / generated keys use `role.manage`. Spec F01.2 still lists
`role.write`. FE design-specs and preflight use `role.manage` only. Please align blueprint/spec
snippets and any BE docs so agents stop reintroducing `role.write`. (Related systemic drift also
noted in prior OUTBOX entry.)
Resolution: 2026-07-21 — Closed for FE prep. Agents must use `role.manage` (gap-003-f01-slice).
Spec prose `role.write` rename is a doc cleanup follow-up, not a contract blocker.

### 2026-07-21 — BE GAP-009 OIDC BFF contract landed — FE must re-sync
Priority: P0
Blocked task: FE-F01-002 Login; FE-F01-001 bootstrap against fresh types
Detail: Backend closed GAP-009 — Web Admin uses `startOidcLogin` / `completeOidcLogin`;
`POST /auth/login` deprecated for Web Admin; Auth slice Generic frozen; `AUTH_OIDC_*` errors added;
canonical gate at `backend/docs/readiness/ENTERPRISE_DOC_GATE.md`. FE docs (F01-preflight,
auth-sequence, ARTEFACT_STATUS, login design-spec) updated in this prep.
Resolution: **Closed 2026-07-22** — `contracts/BACKEND_REF.lock` matches BE HEAD; FE-F01 READY-MOCK in progress.
Do not implement credential login as primary CTA.
