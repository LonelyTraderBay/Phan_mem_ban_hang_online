# Backend AI Agent — Outbox

**Ownership rule: only the Backend AI Agent ever writes to this file.** No other party (Frontend AI
Agent, Human Owner) edits it — that's what makes it safe to append to without a locking mechanism,
even if two Backend AI Agent ticket sessions happen to run close together (last-write-wins on a
single-writer file is fine; the risk only exists with *concurrent* writers).

## Why this file exists (read this before editing `contract-gap-board.md` or `SIGNOFF_TRACKER.md`)

An earlier version of this project's coordination layer had Frontend AI Agent write directly into
`contract-gap-board.md` and `SIGNOFF_TRACKER.md` — both physically located only in this repo
(`backend/`). Two problems with that, found by an audit:

1. **Topology risk**: if Frontend AI Agent's session/sandbox doesn't have `backend/` checked out as
   a filesystem sibling (a real, confirmed case — this repo's own CI checks backend out to a
   subdirectory, not a sibling, for gitleaks reasons), the relative path to those files is simply
   wrong, and an escalation write silently fails or goes nowhere.
2. **Race risk**: two agents editing the same shared markdown table concurrently (the explicit,
   stated goal — both agents running "song song") can clobber each other's edit with no merge.

**Fix**: each repo now owns an append-only outbox that only it writes to. Frontend AI Agent's
mirror is [`frontend/docs/collaboration/OUTBOX.md`](../../../frontend/docs/collaboration/OUTBOX.md)
— it never touches this file or any other file in `backend/`. This file never touches anything in
`frontend/`. Cross-repo visibility is **pull-based, not push-based**:

- Backend AI Agent reads `frontend/docs/collaboration/OUTBOX.md` (best-effort — only if the sibling
  is actually mounted in its session) at the start of a work session that touches contracts, and
  transcribes relevant new entries into [`contract-gap-board.md`](contract-gap-board.md) (which
  Backend AI Agent alone now owns/writes) and, if the entry needs a real human decision, into
  [`SIGNOFF_TRACKER.md`](SIGNOFF_TRACKER.md).
- **Human Owner has both repos checked out and can read both outboxes directly at any time** —
  don't wait for the pull-based transcription above if you need the fastest, most authoritative
  view; the two `OUTBOX.md` files are the actual source of truth, `contract-gap-board.md` and
  `SIGNOFF_TRACKER.md` are Backend AI Agent's curated summary of them.
- If the sibling repo genuinely isn't mounted (some sandboxes only clone one repo), that agent's
  outbox simply isn't visible to the other agent until Human Owner (or a future consolidation
  script) bridges it — a known, documented degraded mode, not a silent failure.

## Entries

Append only — never edit or delete a prior entry, only add a `Resolution` note below it once
handled.

```text
### <YYYY-MM-DD> — <one-line title>
Raised because: <what triggered this>
Detail: <concrete example — request/response/state, not a vague description>
Needs: Frontend AI Agent action | Human Owner decision | informational only
Resolution: <filled in later, once acted on>
```

### 2026-07-21 — Restore SessionBootstrap contracts + Identity/F01 prep artefacts
Raised because: BE working tree was reset; previous SessionBootstrap OpenAPI, BE-IDN tickets, and identity-migration-design were lost while FE still held synced schemas/design-specs.
Detail: Re-landed `SessionBootstrapResponse` on `GET /me`, `AuthResponse` on `POST /auth/mfa/verify` 200, F01 error catalog rows, gap board GAP-003 F01 slice / GAP-004 / GAP-005 Closed + GAP-006..008 Open, BE-IDN-001..015 tickets (001 ready), `user_sessions` nullable-tenant RLS definitive policy, `docs/data/identity-migration-design.md` (`000005`), test matrix, module README ticket order, P1_F01_READINESS §3–4.
Needs: Frontend AI Agent action — run `contracts:sync` + codegen from restored BE OpenAPI/error catalog (BE source of truth). CSRF (GAP-006) and MFA verify request body (GAP-008) remain Open on BE.
Resolution: 2026-07-21 — GAP-006/007/008 Closed in later prep; FE sync still required after each BE contract commit.

### 2026-07-21 — GAP-009 OIDC BFF contract + Auth slice freeze + Enterprise Doc Gate
Raised because: HO locked Web Admin to OIDC+BFF but OpenAPI/`BE-IDN-003` still described password login — agents would implement the wrong channel.
Detail: Added `startOidcLogin` / `completeOidcLogin`; deprecated `POST /auth/login` for Web Admin; froze Auth Generic on refresh/logout/password/switch-tenant; added `AUTH_OIDC_*` errors; rewrote BE-IDN-003 + test matrix; published `docs/readiness/ENTERPRISE_DOC_GATE.md` and `gap-003-remaining-ledger.md`.
Needs: Frontend AI Agent action — `pnpm contracts:sync` + codegen; update F01-preflight / auth-sequence / ARTEFACT_STATUS to OIDC ops + READY-MOCK; do not implement credential login as primary CTA.
Resolution: BE contract/docs Closed 2026-07-21; FE sync pending.

### 2026-07-23 — HO unlock Phases A→F agent packs delivered
Raised because: HO unlock requires agent-side runbooks for Phases C–F before HO books vendor, PITR, pilot, and prod readiness review; tickets stay doc-frozen.
Detail: Added `docs/release/ASVS-PENTEST-SCOPE.md` (BE-HRD-001), `PITR-RESTORE-DRILL.md` (BE-HRD-004, Supabase `ai-sales-staging` / `lrcsbrmqlyvkxxspbezi`), `PILOT-TENANT-RUNBOOK.md` (BE-HRD-009), `PROD-READINESS-DEFECT-CLOSURE.md` (BE-HRD-010); updated `HO-GATES-HRD.md` with READY agent packs (execution still BLOCKED-HO). Phase A infra provisioned; cutover NOT STARTED — blocked on `.env.staging` secrets (DB password, Auth0 client, HTTPS hosts).
Needs: Human Owner decision — fill secrets per `HO-ACTION-STAGING.md`, then unblock Phase A cutover; later book vendor/PITR/pilot per `HO-GATES-HRD.md`.
Resolution: Superseded same-day by A→F execution wave (migrate + scaffolds) — see next entry.

### 2026-07-23 — A→F execution wave: migrate PASS + scaffolds (cutover remainder BLOCKED-HO)
Raised because: Intermediate status before full cutover.
Detail: Superseded by Phase A PASS entry below.
Needs: informational only
Resolution: Superseded 2026-07-23.

### 2026-07-23 — BE-FND-015 Phase A PASS (staging cutover)
Raised because: HO delegated agent to self-complete A→F; cutover verified on managed Supabase.
Detail: Preflight OK; migrate thru 000034; invite/accept perms=75; `GET /health` 200; OIDC start→callback→`GET /me` 200 (Staging Tenant). HTTPS via Cloudflare quick tunnels + `tools/staging-oidc-server.mjs` (Auth0/Fly long-lived deferred). Secrets only in gitignored `.env.staging`. Ticket `BE-FND-015` → Done.
Needs: informational only — FE Pages deploy + Auth0 swap + Fly token optional hardening; then BE-FND-014 secrets + HRD C–F.
Resolution: Closed 2026-07-23 — Phase A Done with evidence in `PHASE-A-EVIDENCE.md`.

### 2026-07-23 — Fly staging API+OIDC LIVE (H2/H4 permanent hosts)
Raised because: HO completed Fly billing; agent deployed from `backend/` (not `fly launch` at repo root).
Detail: `ai-sales-api-staging.fly.dev` health 200 + checks passing; interim IdP `ai-sales-oidc-staging.fly.dev`; OIDC→/me PASS (Staging Tenant, perms=75). CI re-run against Fly URL PASS (#30022549558). Destroyed empty mistaken app `phan-mem-ban-hang-online`. Dockerfile boot fixed (`node --import tsx`, 512MB).
Needs: Human Owner — `vercel login` for H3 FE HTTPS; Auth0 Free swap optional; H9 only with authorize production go-live.
Resolution: H2+H4 closed 2026-07-23 on permanent Fly hosts.

### 2026-07-24 — FE staging HTTPS on Fly (H3) + BFF smoke PASS
Raised because: Completion wave W1–W5; no VERCEL_TOKEN — deployed Web Admin + Super Admin as Fly nginx static apps.
Detail: `ai-sales-web-admin-staging.fly.dev` + `ai-sales-ops-staging.fly.dev` 200; `OIDC_REDIRECT_URI` → Web Admin `/api/auth/oidc/callback`; probe OIDC→/me via FE BFF PASS (perms=75). Plan: `docs/superpowers/plans/2026-07-24-staging-hardening-completion.md`. H9 not run.
Needs: informational — Auth0 Free optional; prod only on authorize production go-live.
Resolution: H3 closed 2026-07-24 (Fly static, not Vercel).

