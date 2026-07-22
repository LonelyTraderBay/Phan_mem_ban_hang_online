# Design Handoff Checklist (Design AI Agent, replaces Figma handoff)

Operationalizes spec §7.7's "Figma handoff gate" — the rule that **no screen may be coded past
`READY-MOCK` without a real design handoff**. This project has no human designer, so the gate's
artifact is a text/markdown **design-spec document** produced by the **Design AI Agent**
(`.claude/agents/design-spec-writer.md`) instead of a Figma file. The requirement itself
(completeness, all 6 states, validation rules, etc.) is unchanged — only the artifact format is.

## Per-screen requirements (adapted from spec §7.7 — do not relax)

Every screen needs a design-spec document (see `design-specs/_TEMPLATE.md`) containing all of the
following before it can be marked `READY-MOCK`:

- [ ] Path to the design-spec markdown document (this project's substitute for "Link Figma/version")
- [ ] Desktop standard + minimum viewport documented (spec §7.3's exact breakpoints)
- [ ] All 6 states described in text: happy, empty, loading, error, forbidden, conflict
- [ ] Component/token mapping (which `packages/ui` component + which `design-tokens` each element uses)
- [ ] Copy drafted by Design AI Agent **and reviewed at least once by Human Owner** (see the
      process section below — draft alone isn't enough, same as draft code alone isn't "done")
- [ ] Interaction notes
- [ ] Field validation rules and required/optional marking
- [ ] Responsive/collapse behavior

A screen missing even one item is not `READY-MOCK` — per spec §1.5's readiness scale, code work on
that screen's real UI should not start (scaffolding/technical-layering proof, like today's
placeholder screens, is fine; that's explicitly not "approved UX" per this folder's `README.md`).

## Screen inventory (from route map, spec §8.1)

Status values: `Not started` → `Drafted — pending Human Owner copy review` (Design AI Agent wrote
the spec) → `READY-MOCK` (Human Owner has glanced at the copy at least once). Only Human Owner
review can move a row into `READY-MOCK` — the Design AI Agent stops at `Drafted`.

### Public/Auth

| Route | Screen | Design-spec path | Status |
|---|---|---|---|
| `/login` | Login | `docs/ux/design-specs/login.md` | READY-MOCK — Human Owner approved 2026-07-21 |
| `/auth/callback` | Auth callback (no UI / transient) | — | N/A — no persistent UI |
| `/forgot-password` | Forgot password | `docs/ux/design-specs/forgot-password.md` | READY-MOCK — Human Owner approved 2026-07-21 |
| `/reset-password` | Reset password | `docs/ux/design-specs/reset-password.md` | READY-MOCK — Human Owner approved 2026-07-21 |
| `/2fa` | MFA challenge | `docs/ux/design-specs/mfa-challenge.md` | READY-MOCK — Human Owner approved 2026-07-21 |
| `/accept-invite` | Accept invite | `docs/ux/design-specs/accept-invite.md` | READY-MOCK — Human Owner approved 2026-07-21 |

### Tenant app (Web Admin)

| Route | Screen | Design-spec path | Status |
|---|---|---|---|
| `/onboarding` | Onboarding | — | Not started |
| `/dashboard` | Dashboard | — | Not started |
| `/inbox`, `/inbox/:conversationId` | Inbox / conversation detail | — | Not started |
| `/orders`, `/orders/:orderId` | Order list / detail | — | Not started |
| `/products`, `/products/import`, `/products/:productId` | Product list / import / detail | — | Not started |
| `/inventory`, `/inventory/movements` | Inventory / movement log | — | Not started |
| `/knowledge` | Knowledge base | — | Not started |
| `/channels`, `/channels/:channelId/health` | Channels / channel health | — | Not started |
| `/ai/settings`, `/ai/logs`, `/ai/blocked` | AI settings / logs / blocked outputs | — | Not started |
| `/reports` | Reports | — | Not started |
| `/settings/tenant` | Settings — tenant | `docs/ux/design-specs/settings-tenant.md` | READY-MOCK — Human Owner approved 2026-07-21 |
| `/settings/users` | Settings — users | `docs/ux/design-specs/settings-users.md` | READY-MOCK — Human Owner approved 2026-07-21 |
| `/settings/roles` | Settings — roles | `docs/ux/design-specs/settings-roles.md` | READY-MOCK — Human Owner approved 2026-07-21 |
| `/settings/devices` | Settings — devices | `docs/ux/design-specs/settings-devices.md` | READY-MOCK — Human Owner approved 2026-07-21 |
| `/settings/audit-logs`, `/settings/notifications` | Settings — audit / notifications | — | Not started |
| `/billing` | Billing | — | Not started |

### Super Admin (separate app)

| Route | Screen | Design-spec path | Status |
|---|---|---|---|
| `/tenants`, `/tenants/:tenantId`, `/tenants/:tenantId/health` | Tenant list / detail / health | — | Not started |
| `/feature-flags` | Feature flags | — | Not started |
| `/alerts` | Alerts | — | Not started |
| `/support-access` | Support access (break-glass) | — | Not started |
| `/ai-health`, `/channel-health` | AI health / channel health | — | Not started |
| `/audit-logs` | Audit logs | — | Not started |

## Process

**Mechanical trigger:** `/ticket-start <TASK_ID>` (`.claude/commands/ticket-start.md`) checks this
table for any screen the ticket touches and stops before implementation if it's still
`Not started` — this is the actual enforcement point. Without running that command, this gate
relies purely on the Frontend AI Agent remembering to check this file, which is not reliable
enough on its own — always start a UI-touching ticket via `/ticket-start`.

1. Before a ticket implements a screen's real UI, run the Design AI Agent for that screen (if its
   row above is still `Not started`). It reads spec §7 + §8, the route's real permission/error
   contracts, and `packages/ui`'s existing components, then writes
   `design-specs/<route-slug>.md` and updates this table's Status to `Drafted — pending Human
   Owner copy review`.
2. Human Owner reviews the draft copy at least once (this can happen async — it doesn't block the
   Frontend AI Agent from starting the *structural* implementation, since layout/components/states
   are already fully specified; only ship real user-facing copy after this review lands). Once
   reviewed, flip Status to `READY-MOCK` and prioritize by whichever F0x module is next in the
   backlog — don't design F08 (Order) screens before F01 (Auth) if F01 is what's being implemented
   next.
3. Frontend AI Agent implements the screen from the design-spec document — not from its own
   judgment of "what the screen should look like."
4. Update `docs/ux/screen-state-matrix.md` and `docs/ux/content-glossary.md` alongside the module
   that implements each screen (per `ARTEFACT_STATUS.md` — these are correctly deferred, not
   written speculatively for screens that don't exist yet).
5. `packages/design-tokens`' provisional palette gets replaced with real brand values only when
   Human Owner provides them — the Design AI Agent works with the provisional palette until then;
   see that package's README for the swap procedure.

## What NOT to do while a screen's gate is unmet

- Don't treat any current screen's spacing/color/copy as final before its design-spec exists and
  has had a Human Owner copy review (this folder's `README.md` already says this — repeating it
  here because it's the single most common way this gate gets silently bypassed: someone "just
  polishes" a scaffold screen and it quietly becomes de facto UX).
- Don't let a feature module's ticket move past Definition of Ready (spec §22) for its UI portion
  without a checked-off row here.
- Design AI Agent: don't mark your own draft `READY-MOCK` — see the process above.
