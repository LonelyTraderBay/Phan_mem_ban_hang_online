# AI Sales OS — Frontend monorepo

`@ai-sales/*` workspace: pnpm 11.9.0 + Node 24.18.0 (pinned in `.nvmrc`/`engines`, enforced by
`pnpm check:node`) + Turborepo 2.3.3 + TypeScript 6, building the Web Admin, Windows desktop
client, and Super Admin Portal for an AI-driven sales platform.

**This repo is at F00 (scaffolding) stage.** Most business features (F01+) don't exist yet —
don't assume a screen, hook, or doc exists just because the spec describes it. Check
`docs/ARTEFACT_STATUS.md` before claiming something is done or missing.

## Read this first

- Canonical **what AI may code now** gate (sibling backend):
  `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md` — until **PASS**, no feature UI
  implementation; then follow `backend/docs/readiness/ENTERPRISE_DOC_GATE.md` (Identity/F01 first).
  Mirror checklist: `docs/enterprise-freeze/FE_FREEZE_CHECKLIST.md`.
- `frontend_doc/00_FRONTEND_IMPLEMENTATION_SPEC_ENTERPRISE_GRADE_v2.0.md` is the spec of record
 (Vietnamese, 30 sections, ~5600 lines). Per its own §1.4: read §2–6 for ground rules, §9–19 for
 any task touching API/auth/data/release, the module's own §21 subsection, then §22
 (Definition of Ready/Done) before starting and §26 (ticket template).
- `docs/adr/ADR-FE-001` through `018` record locked architecture decisions (monorepo strategy, web
 framework, desktop client, Super Admin deployment, realtime architecture, REST/event contract
 source, server/client state, form validation, UI primitives/styling, table/list rendering, web
 auth, desktop auth, PDF generation, offline writes, feature flags, error format). Check the
 relevant ADR before changing anything architectural.
- **Missing contract → raise a Contract Gap, never invent a field/status/permission** (spec §1.4).
 Frontend is not the source of truth for tenant isolation, authorization decisions, pricing,
 inventory reservation, or payment confirmation (spec §1.3) — it only renders backend-confirmed
 state.
- `CLAUDE.local.md` (gitignored) is for your own personal preferences; it loads alongside this file.

## Layout

| Path | Purpose | Details |
|---|---|---|
| `apps/web-admin` | Tenant-facing web admin (spec 8.1), :5173 | `apps/web-admin/CLAUDE.md` |
| `apps/super-admin` | Ops portal, separate app/origin/session (ADR-FE-004), :5174 | `apps/super-admin/CLAUDE.md` |
| `apps/windows-client` | Tauri 2 desktop shell (ADR-FE-003/014), :5175 | `apps/windows-client/CLAUDE.md` |
| `packages/ui` | Shared design-system components | `packages/ui/CLAUDE.md` |
| `packages/design-tokens` | Semantic design tokens (provisional palette) | `packages/design-tokens/CLAUDE.md` |
| `packages/domain` | Pure Money/ISO-datetime primitives, zero deps | `packages/domain/CLAUDE.md` |
| `packages/api-generated` | Generated OpenAPI types, zero runtime code | `packages/api-generated/CLAUDE.md` |
| `packages/api-client` | Typed transport, Problem Details, idempotency/concurrency | `packages/api-client/CLAUDE.md` |
| `packages/auth` | Session bootstrap, auth state machine, tenant switching | `packages/auth/CLAUDE.md` |
| `packages/permissions` | Typed permission registry + gating hooks | `packages/permissions/CLAUDE.md` |
| `packages/feature-flags` | Typed feature-flag registry + evaluation hook | `packages/feature-flags/CLAUDE.md` |
| `packages/config` | Runtime config loader/validator | `packages/config/CLAUDE.md` |
| `packages/i18n` | Locale, ICU messages, date/number/currency formatting | `packages/i18n/CLAUDE.md` |
| `packages/forms` | React Hook Form + Zod wrapper, common validators | `packages/forms/CLAUDE.md` |
| `packages/state` | TanStack Query foundation, cache/persistence | `packages/state/CLAUDE.md` |
| `packages/realtime` | SSE client, event envelope/router, reconnect | `packages/realtime/CLAUDE.md` |
| `packages/telemetry` | Provider-neutral telemetry + PII redaction | `packages/telemetry/CLAUDE.md` |
| `packages/platform` | Storage/notification/print/vault adapter interfaces | `packages/platform/CLAUDE.md` |
| `packages/printing` | PDF preview/download/native-print adapter | `packages/printing/CLAUDE.md` |
| `packages/test-utils` | Contract-generated MSW handlers + test factories | `packages/test-utils/CLAUDE.md` |
| `contracts/` | OpenAPI/AsyncAPI/permissions/errors/flags — source of truth, synced from backend | see `.claude/rules/contracts-codegen.md` |
| `tooling/` | Shared eslint-config, tsconfig, and CI scripts (`tooling/scripts/*.mjs`) | — |
| `docs/` | ADRs, runbooks, threat-model/UX stubs, artefact status | — |

## Setup and day-to-day commands

@docs/runbooks/local-setup.md

## Before calling work done

`pnpm verify` runs `check:node && contracts:validate && lint && typecheck && test && build` — this
is **not** the full CI gate. Before opening a PR, also run what `verify` skips:

```sh
pnpm codegen:check-clean
pnpm bundle:budget
pnpm --filter @ai-sales/web-admin run test:e2e   # requires: pnpm exec playwright install chromium
```

The real gate is `.github/workflows/pr.yml`'s 16 steps, in order: checkout → install (frozen
lockfile) → secret scan → dependency audit → contracts validate → codegen drift check → lint →
typecheck → test+coverage → build → Storybook a11y (continue-on-error, known gap) → bundle budget
→ Playwright e2e smoke → evidence upload → CodeQL SAST. For failures, read
`docs/runbooks/ci-troubleshooting.md` first — it documents the known/expected ones (lockfile
drift, ESLint boundary violations, the `test-storybook` `__test is not defined` gap, coverage
threshold, bundle budget) rather than re-litigating them from scratch.

## Non-negotiable conventions (ESLint-enforced, see `tooling/eslint-config/index.mjs`)

- No TypeScript runtime `enum` — use a string union with `as const` instead (spec 4.4).
- `@typescript-eslint/consistent-type-imports` and `no-explicit-any` are errors, repo-wide.
- `dangerouslySetInnerHTML` requires an explanatory `// dangerouslySetInnerHTML: <reason>` comment
  directly above it, plus security review.
- Inside `apps/*/src/features/**`, import another feature only through its public `index.ts` —
  never reach into `features/*/{api,components,domain,hooks,routes,schemas,state,tests}/**`
  directly (spec 4.3). This is hand-rolled `no-restricted-imports`, not `eslint-plugin-boundaries`
  — that plugin was tried and rejected (it throws under ESLint 10's flat-config-only runtime).

## Contracts and codegen

See `.claude/rules/contracts-codegen.md` (loads automatically when you touch `contracts/**` or any
package's `src/generated/**`). Never hand-edit generated code; regenerate via `pnpm contracts:sync`
+ the relevant `codegen` script and commit the diff.

## Cross-cutting architecture rules (verified in source, not aspirational)

- Features and apps never import `@ai-sales/api-generated` directly — only `@ai-sales/api-client`,
  which owns the mandatory DTO→view-model mapping step (spec 3.4). `api-generated` was deliberately
  built with `openapi-typescript` (types only) rather than `orval` (which could skip this step by
  generating hooks directly).
- Money arithmetic goes through `@ai-sales/domain`'s `Money` type only — never raw floats (spec 4.4).
  Dates are stored as ISO UTC strings; formatting happens only at the display boundary.
- Permissions and feature flags both **fail closed**: an unrecognized/stale key resolves to
  denied/disabled, never throws, never defaults to allowed.
- `packages/ui` may only import `@ai-sales/design-tokens` and `@ai-sales/i18n` (type-only) — never
  `api-client`, `auth`, `realtime`, or app/feature code (spec 4.3). Gate components
  (`PermissionGate`, `FeatureFlagGate`) receive their allowed/enabled decision as a prop; the
  decision itself is computed upstream via `usePermission`/`useFeatureFlag`.
- Platform-specific code (browser vs Tauri/Windows) only goes through `@ai-sales/platform`'s
  adapter interfaces — never `window`/`navigator`/`@tauri-apps/*` directly from features or `ui`.
- Each app (web-admin, super-admin, windows-client) creates its own auth session store instance —
  sessions are never shared across apps (ADR-FE-004).

## Build team model — read before assuming a human role exists

This project's build team is **Backend AI Agent** + **Frontend AI Agent** (you) + **Design AI
Agent** + one **Human Owner** — not a human org. Don't invent or defer to "Product Owner", "UX
Lead", "Security Lead", "QA Lead", etc. — see `backend/docs/domain/glossary.md`'s "Vai trò / Roles"
table for the full mapping. Only the Human Owner can accept real business/security/legal risk or
approve an irreversible action (staging/production go-live, real infra spend) — see
`backend/docs/collaboration/SIGNOFF_TRACKER.md`. You and the Backend AI Agent coordinate
asynchronously via files in `docs/collaboration/` (both repos) — there is no live chat between the
two agents; see `docs/collaboration/CONTRACT_WORKFLOW.md`. Each repo's coordination files
(`OUTBOX.md`, etc.) have a single designated writer — never edit a file another agent owns; see
`backend/docs/collaboration/OUTBOX.md` for the full single-writer rationale.

**Running multiple ticket instances concurrently in this repo**: if more than one Frontend AI Agent
instance is active against `frontend/` at once, each MUST work in its own `git worktree`
(`git worktree add ../frontend-<ticket-id> -b ticket/<ticket-id>`) — never share one working tree
across simultaneously-active tickets, or uncommitted edits will silently clobber each other.

## Docs that are intentionally incomplete

F00 is scaffolding, not feature work — `docs/architecture/`, `docs/release/`, and `docs/quality/`
are mostly stub/not-started by design (full breakdown in `docs/ARTEFACT_STATUS.md`); don't
fabricate their contents if asked to write them. `docs/ux/README.md`: there is no human designer in
this project — the Design AI Agent (`.claude/agents/design-spec-writer.md`) produces a text-based
design-spec document per screen instead of a Figma handoff (see `docs/ux/handoff-checklist.md`); no
design-spec exists yet for any screen, so don't treat any current screen's spacing/color/copy as
approved UX — it only proves the technical layering works.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **frontend** (1869 symbols, 2371 relationships, 25 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/frontend/context` | Codebase overview, check index freshness |
| `gitnexus://repo/frontend/clusters` | All functional areas |
| `gitnexus://repo/frontend/processes` | All execution flows |
| `gitnexus://repo/frontend/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
