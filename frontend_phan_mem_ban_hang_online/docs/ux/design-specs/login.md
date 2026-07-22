# Design spec: `/login` — Đăng nhập

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/login`
**Required permission(s):** public (anonymous). Redirect to `/dashboard` (or safe return URL) if session already bootstrapped.

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | Single centered column (max ~420px). Brand + primary IdP CTA + optional credential block stacked. No side illustration. |
| `1440×900` standard | Same centered column; more vertical breathing room (`spacing.10` above brand). |
| `1920×1080+` large | Same; content stays centered — do not stretch form to full width. |
| `1024×720` Windows compact | Reduce top padding to `spacing.6`; brand text `typography.fontSize.xl`; keep IdP CTA full-width of column. |

## Layout — happy state

```text
[Page background: color.background.subtle]

        ┌─────────────────────────────────────┐
        │  Brand wordmark / product name      │  ← hero-level brand (not nav-only)
        │  AI Sales OS                       │
        │                                     │
        │  [DRAFT COPY] Đăng nhập để tiếp tục │  headline (secondary to brand)
        │  [DRAFT COPY] Một câu hỗ trợ ngắn.  │
        │                                     │
        │  ┌───────────────────────────────┐  │
        │  │ Button primary (full width)   │  │  IdP / OIDC — PRIMARY path
        │  │ [DRAFT COPY] Tiếp tục với IdP │  │  (ADR-FE-013)
        │  └───────────────────────────────┘  │
        │                                     │
        │  ─── [DRAFT COPY] hoặc ───          │  divider (muted)
        │                                     │
        │  FormField + Input: Email           │  OPTIONAL / PENDING Human Owner
        │  FormField + Input: Mật khẩu        │  auth strategy decision
        │  [DRAFT COPY badge] Sắp có          │  StatusBadge or muted caption
        │  Button secondary: Đăng nhập        │  disabled or soft-secondary until
        │                                     │  strategy confirmed
        │  Link: Quên mật khẩu?               │  → /forgot-password
        │                                     │
        │  Link: Có lời mời? Chấp nhận lời mời│  → /accept-invite
        └─────────────────────────────────────┘

Footer microcopy (muted): [DRAFT COPY] Phiên đăng nhập dùng cookie bảo mật (HttpOnly).
```

**Auth assumption (locked):** OIDC Authorization Code via BFF + HttpOnly cookie per ADR-FE-013 /
GAP-009. **Primary CTA = IdP only.** Email/password fields are **out of scope** for Web Admin
(do not enable). Local-credential recovery screens (`/forgot-password`, `/reset-password`) exist
only for `credential_type=password` edge cases — not for OIDC users.

## States

### Happy

- Unauthenticated visitor sees brand, IdP primary CTA, optional credential block marked pending, links to forgot-password and accept-invite.
- Sample: `[DRAFT COPY] Đăng nhập để tiếp tục làm việc với không gian của bạn.`
- On successful IdP return (via `/auth/callback` — not this screen) or successful credential login (if enabled), client bootstraps `GET /me` then navigates to safe return URL.

### Empty

- N/A for data lists. Treat “no prior session” as the default happy path.
- If return URL query is missing: land on `/dashboard` after auth (no empty-state UI on this route).

### Loading

- After IdP CTA click: primary Button shows busy (disabled + “Đang chuyển hướng…” `[DRAFT COPY]`); page may show `Skeleton` bars in the form column while waiting for redirect.
- After credential submit (if enabled): Button disabled; inline form locked; no full-page spinner — keep fields visible.

### Error

Map by **code**, never by `detail` text (spec §11.3):

| Code (catalog) | Copy `[DRAFT COPY]` |
|---|---|
| `AUTH_INVALID_CREDENTIALS` | Email hoặc mật khẩu không đúng. Vui lòng thử lại. |
| `RATE_LIMITED` | Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại. |
| `TENANT_INACTIVE` | Không gian làm việc hiện không hoạt động. Liên hệ quản trị viên. |
| `AUTH_SESSION_REVOKED` | Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại. |
| `VALIDATION_FAILED` | Kiểm tra lại email và mật khẩu. |

Show via `ErrorPanel` above the form (or Toast for transient network). Do **not** reveal whether the email exists.

**CONTRACT GAP:** Spec F01.6 lists `AUTH_SESSION_EXPIRED` — not in `error-catalog.yaml`. Use `AUTH_TOKEN_EXPIRED` (“Phiên truy cập đã hết hạn.”) until Backend adds an alias or dedicated code.

### Forbidden

- Public route: no permission gate.
- If already authenticated user hits `/login`: redirect away (no ForbiddenState).
- If `MEMBERSHIP_INACTIVE` after bootstrap attempt: `ForbiddenState` / ErrorPanel — `[DRAFT COPY] Tài khoản không còn hoạt động trong không gian này.`

### Conflict

- Concurrent login + another tab already sessioned: prefer existing session; redirect; optional Toast `[DRAFT COPY] Bạn đã đăng nhập trên tab khác.`
- Idempotency conflicts (`IDEMPOTENCY_*`) are not expected on public login; if returned, Toast + `[DRAFT COPY] Yêu cầu đang được xử lý. Vui lòng đợi.`

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Page background | (layout) | `color.background.subtle` |
| Brand / product name | (typography) | `color.text.primary`, `typography.fontSize.2xl`, `typography.fontWeight.bold` |
| Headline / support | (typography) | `color.text.secondary`, `typography.fontSize.md` |
| IdP CTA | `Button` `variant="primary"` | `color.action.primary`, `radius.md`, `spacing.3` |
| Email / password fields | `FormField` + `Input` | `color.border.default`, `color.border.focus`, `color.text.primary` |
| Pending strategy caption | `StatusBadge` or muted text | `color.warning.*` / `color.text.muted` |
| Credential submit | `Button` `variant="secondary"` | `color.action.secondary` |
| Inline / form error | `ErrorPanel` | `color.danger.*` |
| Loading placeholders | `Skeleton` | `color.background.muted` |
| Success/rate Toast | `Toast` | `zIndex.toast`, `color.success` / `color.warning` |

## Accessibility notes (spec §7.4)

- Keyboard flow: Tab order = IdP CTA → email → password → credential submit → forgot-password link → accept-invite link. Enter submits focused form.
- Focus behavior: Initial focus on IdP primary Button (preferred) or email if Human Owner enables credentials-first.
- `aria-live`: ErrorPanel / Toast messages in a polite live region; rate-limit countdown if shown.
- Other: Inputs have associated labels via `FormField`; password `autocomplete="current-password"`; email `autocomplete="username"`; do not put tokens in URL.

## Interaction notes

1. Click IdP CTA → navigate to `GET /auth/oidc/start` (`startOidcLogin`); show loading on button.
2. After BFF callback (`completeOidcLogin`) lands on `/auth/callback`, client bootstraps `GET /me` then navigates to safe return URL.
3. **Do not** call deprecated `POST /auth/login` for Web Admin.
4. If MFA required after callback → navigate to `/2fa` with challenge id from contract (do not invent fields).
5. “Quên mật khẩu?” only for local-credential edge cases → `/forgot-password` (OIDC users use IdP recovery).
6. Safe return URL: only same-origin relative paths; reject open redirects (F01.7).

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Email | Required **if** credential path enabled | Non-empty, email format (max 320 per `LoginRequest`) | Vui lòng nhập email hợp lệ. |
| Password | Required **if** credential path enabled | Non-empty, min 8 / max 256 per contract | Vui lòng nhập mật khẩu. |
| IdP CTA | Required (primary path) | N/A — navigation | — |

## Open gaps found while drafting

- Human Owner must confirm whether credential fields stay (placeholder) or are removed entirely in favor of IdP-only (Auth strategy waiver).
- `GET /me` still returns `GenericDataResponse` — SessionBootstrap shape not frozen (blocks post-login bootstrap fidelity). Log in OUTBOX.
- CSRF cookie/header contract for credential POST not documented in FE contracts — OUTBOX.
- Prefer IdP-primary; do not implement polished credential UX beyond placeholder until strategy decision.
