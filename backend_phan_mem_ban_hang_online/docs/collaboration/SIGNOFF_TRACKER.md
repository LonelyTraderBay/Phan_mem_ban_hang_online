# Human Owner Decision Queue (formerly "Sign-Off Tracker")

This is Backend AI Agent's curated inbox for everything in this project that genuinely requires the
Human Owner (the one human in this project — no AI agent may self-approve these) — not just formal
sign-offs, but any escalation either AI agent raises because it hit a decision it isn't authorized
to make on its own.

**Ownership: only Backend AI Agent writes to this file** (same single-writer rule as
[`contract-gap-board.md`](contract-gap-board.md), for the same reason — see
[`OUTBOX.md`](OUTBOX.md) for the full rationale). Frontend AI Agent logs its own escalations to
[`frontend/docs/collaboration/OUTBOX.md`](../../../frontend/docs/collaboration/OUTBOX.md); Backend
AI Agent transcribes anything from there that needs Human Owner into this file when it next reads
that outbox. **Human Owner: for the fastest, most authoritative view, read both `OUTBOX.md` files
directly** (`backend/docs/collaboration/OUTBOX.md` and `frontend/docs/collaboration/OUTBOX.md`) —
this file is a convenience summary, not the primary source, and may lag behind by however long it's
been since Backend AI Agent last processed Frontend AI Agent's outbox.

## Business decisions (real, currently blocking — added 2026-07-21 from a full-repo readiness audit)

### Billing plans/pricing — blocks BE-BIL-001/002/003

`backend_doc/01_BACKEND_ENTERPRISE_IMPLEMENTATION_BLUEPRINT_v2.0.md` §7.12.3 names the `plans`/
`subscriptions`/`usage_meters` tables but defines **zero** actual tiers, prices, metered-event→meter
mapping, billing-period boundary, or over-limit behavior — this is commercial/pricing policy, not
something Backend AI Agent may invent. Needed before `BE-BIL-*` enters a sprint: a minimal plan
table (tier names, price, feature/quota limits per tier, at least for a v1 launch set) and the
over-limit behavior (hard block vs. soft warn vs. auto-upgrade prompt) per feature.

| Item | Status |
|---|---|
| v1 plan tiers, pricing, and per-tier limits | **Resolved — Human Owner, 2026-07-22** — see [`../business/HO_DEFAULTS_v1.md`](../business/HO_DEFAULTS_v1.md) (Free / Pro / Business stubs) |
| Behavior when a tenant exceeds a metered limit | **Resolved — Human Owner, 2026-07-22** — soft_warn then hard_block; no auto-upgrade (`HO_DEFAULTS_v1.md` §3) |

### Order tax/discount computation

`BE-ORD-002` calculation order lives in `docs/domain/order-calculation.md`. VAT rate / inclusive
storage was the remaining business input:

| Item | Status |
|---|---|
| Actual VAT rate(s) and whether prices are stored tax-inclusive or tax-exclusive | **Resolved — Human Owner, 2026-07-22** — **10% VAT, tax-inclusive catalog prices** (`tax_rate_bps = 1000`); see [`../business/HO_DEFAULTS_v1.md`](../business/HO_DEFAULTS_v1.md) §1 and updated `order-calculation.md` |

## Why an AI agent can't just decide these itself

Both AI agents can and should self-certify routine technical work (following the blueprint's
invariants, passing tests, following an already-approved ADR). What they cannot self-certify:
**real business risk, legal/compliance exposure, irreversible actions, or spend of real money** —
these require a human who bears the actual consequence. This mirrors the same principle this
assistant follows generally: destructive or hard-to-reverse actions always get a human checkpoint,
regardless of how confident the executor is.

## Open items requiring Human Owner action

### Role-specific approval (blocks staging/production, not P1 foundation)

Source: [`../p0/capacity-slo-cost-assumptions.md`](../p0/capacity-slo-cost-assumptions.md#role-specific-approval-tracking)
— that file's table used to list 6 separate human roles (Product Owner, Business Owner, Backend
Lead, Platform/SRE Lead, Security Lead, AI Owner). All 6 collapse to one signer now:

| Decision | Status |
|---|---|
| Business baseline and pilot scope accepted | Pending — Human Owner |
| Retention, audit, and SLO trade-offs accepted | Pending — Human Owner |
| Architecture can meet baseline (technical confirmation) | Backend AI Agent can self-certify via load-test evidence once available — flag here only if evidence contradicts the baseline |
| Infra/observability plan can meet SLOs | Backend AI Agent self-certifies technically; **spend commitment** for that infra is Human Owner |
| Isolation/retention/AI controls acceptable | Pending — Human Owner (security risk acceptance) |
| AI budget/concurrency/eval controls acceptable | Pending — Human Owner (real money + risk exposure) |

### Threat model — Backend

Source: [`../threat-model/p0-threat-model.md`](../threat-model/p0-threat-model.md)

| Item | Status |
|---|---|
| STRIDE mapped per trust boundary | Backend AI Agent can draft this; Human Owner reviews before it's treated as final |
| Risk owners assigned | Every High/Critical risk needs an owner — default to whichever AI Agent implements the mitigation, but Human Owner accepts residual risk |
| Mitigations linked to tests/CI gates | Backend AI Agent self-certifies (this is verifiable, not judgment) |
| AI-specific eval/red-team cases | Pending — Human Owner should review before P8 AI implementation, given real customer/financial exposure |

### Threat model — Frontend

Source: [`../../../frontend/docs/threat-model/README.md`](../../../frontend/docs/threat-model/README.md)

| Item | Status |
|---|---|
| Session/cookie handling (ADR-FE-013) | Frontend AI Agent self-certifies against the ADR; Human Owner reviews once real auth ships |
| Cross-tenant isolation in query cache (spec §13.2, risk R02) | Frontend AI Agent self-certifies via its own test suite |
| PII field masking (spec §10.3) | Frontend AI Agent self-certifies; Human Owner spot-checks before any screen handling real customer PII goes to real users |
| Desktop credential vault (ADR-FE-014) | Blocked on ADR-FE-014 implementation itself |

**Gate**: per FE spec §1.5, no module reaching `READY-INTEGRATION` that touches PII or payment
data may proceed to real users until Human Owner has reviewed the corresponding item above at
least once.

### Design/copy approval (new — Design AI Agent introduces drafts, not final copy)

The Design AI Agent (see `frontend/.claude/agents/design-spec-writer.md`) drafts screen copy and
visual direction as part of each design-spec document. Copy/brand voice is subjective — the Human
Owner should glance at it at least once before it's treated as final, even though the Design AI
Agent's draft can unblock Frontend AI Agent's implementation immediately (don't let this become a
blocking gate by default — see `frontend/docs/ux/handoff-checklist.md`'s process).

| Item | Status |
|---|---|
| F01 design pack: login, forgot/reset password, MFA, accept invite, tenant/users/roles/devices settings | **Approved — Human Owner, 2026-07-21**. All 9 specs may move to `READY-MOCK`; approval covers draft copy/layout for mock implementation, not production legal/security acceptance. |

### Environment/infrastructure

| Item | Status | Detail |
|---|---|---|
| Staging environment provisioning (real spend) | Pending — Human Owner | [`../release/fe-integration-environment.md`](../release/fe-integration-environment.md) |
| `dev`/`staging`/`pilot` environment naming — **resolved, no longer pending** | Resolved: adopted the frontend spec's 5-tier model (`local, dev, staging, pilot, production`) as canonical for both repos — see `../release/environment-topology.md`. This was a low-risk documentation/taxonomy choice, not a business decision, so it didn't need to wait in this queue. |

### Auth strategy for web login (blocks polished F01 login UX)

Raised 2026-07-21 during P1→Identity/F01 readiness prep.

| Item | Status | Detail |
|---|---|---|
| Confirm web login is **OIDC/IdP via BFF** (ADR-FE-013) vs **internal email/password credentials** | **Resolved — Human Owner, 2026-07-21: OIDC Authorization Code + BFF** | Same-origin `HttpOnly`, `Secure`, `SameSite=Lax`-or-stricter session cookie; JavaScript never receives access/refresh tokens. Internal email/password login is out of scope for Web Admin. ADR-FE-013 remains authoritative; ADR-008 governs server-side JWT/refresh rotation. **Contract reflection Closed 2026-07-21 (GAP-009):** OpenAPI `startOidcLogin` / `completeOidcLogin`; `BE-IDN-003` rewritten; see `gap-009-oidc-bff-contract.md` + `ENTERPRISE_DOC_GATE.md`. |

### Time-bounded waivers (prep sprint — agents may self-apply; Human Owner may revoke)

| Waiver | Expires when | Status |
|---|---|---|
| **BE-FND-015 staging skip** — P1 exit gate may complete without cloud staging; local docker + CI ephemeral DB are the evidence | Human Owner approves staging spend **or** Identity + one read-only endpoint run E2E on a provisioned `dev` | Active — 2026-07-21 |
| **F00.6 vertical shell on staging** — FE treats MSW + local as integration mode for F01 prep | Same expiry as BE-FND-015 waiver; when Identity ships, add cross-repo Playwright-against-API job | Active — 2026-07-21 |
| **Storybook publish / F00.10 preview deploy** — local Storybook + PR `continue-on-error` a11y is enough for F00 exit | First `READY-MOCK` screen merges **or** Human Owner asks for hosted Storybook | Active — 2026-07-21 |

VAT rates and billing plans were **Resolved 2026-07-22** via `HO_DEFAULTS_v1.md` (enterprise
doc-freeze W0). Staging spend and production go-live items above remain Pending and are **not**
required for `FULL_PRODUCT_DOC_FREEZE` PASS.

## How an AI agent adds an item here

```text
| <what needs deciding, as a concrete question, not a vague topic> | <Which agent/context raised it> | <Why this needs Human Owner and not a default rule> | Pending |
```

Don't add routine technical choices here — only things that are genuinely irreversible, carry real
business/legal/financial risk, or where the two AI agents have a real disagreement that no
existing rule resolves. If you (an AI agent reading this) are unsure whether something belongs
here or should just be a default rule you apply yourself, prefer applying a documented default and
noting it in the relevant ADR — only escalate here when a wrong unilateral call would be costly or
hard to undo.

## Process

- Human Owner reviews this file directly (it's the front door — no separate meeting or tracker
  needed for a single-human decision-maker).
- An item only leaves "Pending" when Human Owner has actually made the call — an AI agent must
  never mark its own escalation as resolved.
