# Design spec: `/forgot-password` — Quên mật khẩu

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/forgot-password`
**Required permission(s):** public (anonymous)

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | Centered column ~420px; single FormField + primary Button. |
| `1440×900` standard | Same; more top padding (`spacing.10`). |
| `1920×1080+` large | Same centered column. |
| `1024×720` Windows compact | Tighter padding (`spacing.6`); full-width controls. |

## Layout — happy state

```text
[Back link] ← [DRAFT COPY] Quay lại đăng nhập   → /login

Brand (smaller than login hero)
Headline: [DRAFT COPY] Đặt lại mật khẩu
Support:  [DRAFT COPY] Nhập email — nếu tài khoản tồn tại, chúng tôi sẽ gửi hướng dẫn.

FormField + Input: Email
Button primary: [DRAFT COPY] Gửi hướng dẫn

Note (muted): [DRAFT COPY] Vì bảo mật, thông báo thành công giống nhau dù email có tồn tại hay không.
```

**Auth note:** Under ADR-FE-013 IdP-primary, this screen may be IdP-hosted later. Keep FE route as recovery entry; copy marks enumeration-safe behavior. Pending Human Owner auth strategy if password recovery stays in-app.

## States

### Happy

- Form ready. After successful submit: replace form with confirmation panel (not EmptyState of “no data”).
- Copy: `[DRAFT COPY] Nếu email khớp một tài khoản, hướng dẫn đặt lại đã được gửi. Kiểm tra hộp thư (và thư rác).`

### Empty

- Pre-submit empty email field is normal — not an empty-state component.
- Post-submit confirmation is the “done” state (no list to empty).

### Loading

- Primary Button disabled + label `[DRAFT COPY] Đang gửi…`; Input disabled; optional `Skeleton` flash on submit area.

### Error

| Code | Copy `[DRAFT COPY]` |
|---|---|
| `VALIDATION_FAILED` | Vui lòng nhập email hợp lệ. |
| `RATE_LIMITED` | Bạn thao tác quá nhanh. Vui lòng thử lại sau. |
| Network / 5xx | Dùng `ErrorPanel`: Không gửi được yêu cầu. Thử lại. |

Do **not** use a distinct “email not found” message (enumeration). Catalog has no `PASSWORD_RESET_*` codes — do not invent; generic success covers miss.

**CONTRACT GAP:** No dedicated `PASSWORD_RESET_*` error codes in catalog. Rely on `VALIDATION_FAILED` / `RATE_LIMITED` / Problem Details until Backend adds recovery-specific codes if needed.

### Forbidden

- N/A for anonymous. If authenticated user opens this route: still allow (recover another account is rare) **or** redirect to settings — prefer allow + back link to app; no `ForbiddenState`.

### Conflict

- Double-submit / `IDEMPOTENCY_IN_PROGRESS`: Toast `[DRAFT COPY] Yêu cầu tương tự đang được xử lý.`
- Prefer client disable button after first submit to avoid conflict UX.

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Back link | (link) | `color.action.primary`, `typography.fontSize.sm` |
| Headline | (typography) | `color.text.primary`, `typography.fontSize.xl` |
| Email | `FormField` + `Input` | `color.border.*`, `color.text.primary` |
| Submit | `Button` `primary` | `color.action.primary` |
| Success confirmation | `EmptyState` (reuse for “done” message) **or** static panel | `color.success.subtle`, `color.success.text` |
| Errors | `ErrorPanel` / `Toast` | `color.danger.*` |
| Loading | `Skeleton` | `color.background.muted` |

## Accessibility notes (spec §7.4)

- Keyboard: Back link → email → submit.
- Focus: Initial focus on email Input; after success, move focus to confirmation heading.
- `aria-live`: Success and error messages announced politely.
- Labels required on email; `autocomplete="username"`.

## Interaction notes

1. Submit → `POST /auth/password/forgot` (operation in tenant OpenAPI).
2. Always show same success confirmation (enumeration-safe), matching catalog philosophy for `AUTH_INVALID_CREDENTIALS`.
3. Back → `/login`.
4. Deep link from login “Quên mật khẩu?”.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Email | Required | Non-empty email format | Vui lòng nhập email hợp lệ. |

## Open gaps found while drafting

- Whether recovery stays first-party vs IdP-hosted depends on Human Owner auth strategy.
- No password-reset-specific error codes in catalog (noted above).
