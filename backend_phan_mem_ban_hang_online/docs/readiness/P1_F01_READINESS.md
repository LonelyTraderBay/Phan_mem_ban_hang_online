# P1 → Identity/F01 Readiness Manifest

Living checklist for the prep sprint that closes Backend P1 foundation and Frontend F00
gates needed before Identity/Auth feature implementation. Updated as gates pass.

**Scope:** prep only — no login/MFA/member/role/device business feature implementation until
the final gate below is green.

**Started:** 2026-07-21  
**Last updated:** 2026-07-21 (100% prep gate — evidence below)

## 0. Decisions and waivers

| Item | Status | Notes |
|---|---|---|
| Web auth strategy | **Resolved — HO 2026-07-21** | OIDC Authorization Code + BFF `HttpOnly` cookie (ADR-FE-013). Internal email/password out of scope for Web Admin. ADR-008 signed. |
| BE-FND-015 staging waiver | Active | Local + CI only until Human Owner approves spend. |
| F00.6 staging/MSW waiver | Active | Documented in FE `ARTEFACT_STATUS.md`. |
| Storybook publish waiver | Active | Local Storybook sufficient until first READY-MOCK merge. |
| VAT / billing plans / F09 metrics | Deferred | Not on Identity/F01 critical path. |

## 1. Backend P1 exit gate

| Gate | Status | Evidence |
|---|---|---|
| Migration runner + fresh/upgrade | Done | `tools/migrate.mjs`, `pnpm migrate`; static order test in `packages/database/src/migration-files.test.ts` |
| RLS deny-default harness (BE-FND-008) | Done | Hardened `withTenantTransaction`; walking-skeleton header helper lives in `modules/audit` only (not `@ai-sales/security`); live RLS integration **skips** without `DATABASE_URL` (Docker absent on this machine — env blocker, not code gap) |
| Invariant test helpers (BE-FND-018) | Done | `packages/test-utils` tenant/idempotency/money helpers + unit tests |
| Idempotency (BE-FND-009) | Done (Nest interceptor deferred) | 4-state store + migration `000003_idempotency_records.sql` |
| Outbox/inbox (BE-FND-010) | Done | Postgres outbox writer, inbox consume, migration `000004_inbox_and_worker_publisher.sql` |
| Worker/scheduler (BE-FND-011) | Done | BullMQ §9.6 queues + §9.7 retry/lease + graceful shutdown (`apps/worker/src/queueing.ts`); scheduler job-scheduler when `REDIS_URL` set; outbox SKIP LOCKED publisher retained |
| HTTP Problem Details / request ID (BE-FND-004) | Done | `ProblemDetailsFilter` + request/correlation ID middleware |
| Observability / PII redact (BE-FND-013) | Done | `redactValue`, HTTP access log, health; OTLP `startTracing` + `sanitizeSpanAttributes` wired in api/worker |
| Audit + reference tests (BE-FND-012/017) | Done | Walking-skeleton 5-category suite (tenant isolation, permission negative, idempotency, txn rollback, contract) |
| Walking skeleton (BE-FND-016) | Done | Security context helper; `docs/runbooks/walking-skeleton.md` |
| `pnpm contracts:validate` + typecheck + test | Pass (2026-07-21) | OpenAPI/AsyncAPI ok; **48 passed / 1 skipped** (RLS needs `DATABASE_URL`) |
| Full `pnpm verify` | Pass (2026-07-21) | Node engines aligned to `24.18.0`; check:node + contracts + lint + typecheck + test green |
| Staging (BE-FND-015) | Waived | See SIGNOFF_TRACKER |

## 2. Frontend F00 gate

| Gate | Status | Evidence |
|---|---|---|
| MSW auth overrides | Done | `packages/test-utils/src/msw/authHandlers.ts` (honest SessionBootstrap; generator skips non-generic schemas) |
| AuthProvider + sessionStore | Done | `apps/web-admin/src/app/AuthProvider.tsx` wired in `App.tsx` |
| Auth route skeleton | Done | `/login`, `/auth/callback`, `/2fa`, `/forgot-password`, `/reset-password`, `/accept-invite` placeholders |
| Unit tests (auth / test-utils / web-admin) | Pass | Full FE `pnpm test` green |
| `pnpm contracts:validate` | Pass | tenant/ops OpenAPI + events + permissions + errors |
| Contract sync idempotent | Pass | `BACKEND_REF.lock` = `5a84962…`; re-sync hash-stable |
| `pnpm codegen:check-clean` | Pending commit | Fails vs **committed** HEAD until this working tree is committed (expected); content idempotent after sync |
| `pnpm bundle:budget` | Pass | web-admin 0.44MB / super-admin 0.42MB / windows-client 0.18MB (budget 2.00MB) |
| Playwright smoke | Pass | **18 passed** (chromium + msedge) after `playwright install chromium` |
| Full `pnpm verify` | Pass (2026-07-21) | check:node + contracts + lint + typecheck + test + build |
| Storybook publish / staging deploy | Waived | See §0 |

## 3. Identity/Auth contracts freeze

| Gate | Status | Notes |
|---|---|---|
| `GET /me` → `SessionBootstrapResponse` | Done | GAP-004 Closed; FE synced |
| Auth 2xx `AuthResponse` + MFA request | Done | GAP-008 Closed — `MfaVerifyRequest` `{ challenge_id, code }` |
| F01 error codes | Done | GAP-005 Closed; plus `CSRF_TOKEN_INVALID` |
| GAP-003 F01 slice (`role.write`→`role.manage`) | Done | `gap-003-f01-slice.md`; non-F01 drift still Open (out of F01 prep scope) |
| CSRF cookie/header contract | Done | GAP-006 Closed — `X-CSRF-Token` + `x-csrf-protection: cookie-session-required` |
| Permission grouping metadata | Done | GAP-007 Closed — matrix `group_id` / `group_label_vi` / `display_order` synced to FE |
| **OIDC BFF Web Admin channel** | Done | GAP-009 Closed — `startOidcLogin` / `completeOidcLogin`; `POST /auth/login` deprecated; BE-IDN-003 rewritten; Auth slice Generic removed on refresh/logout/password/switch-tenant |
| OIDC error codes | Done | `AUTH_OIDC_STATE_INVALID` / `EXCHANGE_FAILED` / `PROVIDER_ERROR` |
| FE `contracts:sync` + codegen | Pending FE | After BE commit of GAP-009; FE must re-sync `BACKEND_REF.lock` |
| P0 Identity/F01 contract gaps | Done | GAP-004/005/006/007/008/**009** Closed; GAP-001/002/003-non-F01 remain out of this prep scope |

## 4. Identity prep artefacts

| Gate | Status | Notes |
|---|---|---|
| BE-IDN-001…015 tickets + preflight | Done | `docs/tickets/BE-IDN-001.md` … `015.md` (001 `ready`) |
| Identity security test matrix | Done | `docs/tickets/BE-IDN-test-matrix.md` |
| `user_sessions` nullable-tenant RLS | Done | Confirmed in `docs/data/data-dictionary.md` |
| Identity migration design | Done | `docs/data/identity-migration-design.md` → propose `000005_identity_schema.sql` |

## 5. F01 UX prep

| Gate | Status | Notes |
|---|---|---|
| Design-specs (9 screens) | **READY-MOCK** | Human Owner approved 2026-07-21; `handoff-checklist.md` + each design-spec status updated |
| FE-F01-001…006 preflights | Done | `frontend/docs/tickets/F01-preflight.md` |
| auth-sequence.md + auth-session.md | Done | Drafts from frozen contract shapes |

## Review / change detection (pre-commit)

| Check | Result |
|---|---|
| FE architecture review | No invariant violations (AuthProvider local session store; generated artifacts tooling-produced) |
| BE GitNexus `detect_changes` | Unavailable (LadybugDB version mismatch on this machine) — re-run after `pnpm agent:gitnexus-reindex` before commit |
| Live RLS with `DATABASE_URL` | Blocked by environment — Docker binary not on PATH; `localhost:5432` closed |

## Final gate — allow Identity/F01 feature code

- [x] Sections 1–2 green (staging/Storybook waived; live RLS env-blocked but harness + skip-test remain honest)
- [x] Section 3: F01 P0/P1 contract gaps Closed (CSRF, MFA request, permission grouping)
- [x] Section 4 tickets + RLS/test matrix + migration design exist
- [x] Section 5 design-specs **READY-MOCK** (Human Owner 2026-07-21)
- [x] Auth strategy **OIDC+BFF** confirmed **and reflected in OpenAPI/ticket** (GAP-009)
- [x] Canonical gate: `docs/readiness/ENTERPRISE_DOC_GATE.md`
- [x] This manifest updated with command evidence (2026-07-21)

**Allowed now:** Identity/F01 feature implementation starting with **BE-IDN-001** (schema) and FE READY-MOCK screens (MSW). **BE-IDN-003** implements OIDC BFF — not password login.

**Still waived / env-only:** staging spend, Storybook publish, live Postgres RLS proof on this machine (install Docker Desktop or provide `DATABASE_URL`).

**Expiry condition for staging/MSW waiver:** when BE Identity + one read-only authenticated endpoint run end-to-end, add a cross-repo integration job — do not keep forever.
