# Design spec: `/reset-password` — Đặt lại mật khẩu

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/reset-password` (token via query — never log token; never put in localStorage)
**Required permission(s):** public (anonymous, token-gated by server)

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | Centered ~420px column; two password fields stacked. |
| `1440×900` standard | Same. |
| `1920×1080+` large | Same centered. |
| `1024×720` Windows compact | Full-width inputs; reduced vertical padding. |

## Layout — happy state

```text
Brand
Headline: [DRAFT COPY] Tạo mật khẩu mới
Support:  [DRAFT COPY] Chọn mật khẩu mạnh cho tài khoản của bạn.

FormField + Input: Mật khẩu mới (password)
FormField + Input: Xác nhận mật khẩu (password)
Button primary: [DRAFT COPY] Lưu mật khẩu mới

Link: [DRAFT COPY] Quay lại đăng nhập → /login
```

Token read from query once into memory for the POST body; strip from history when possible after submit.

## States

### Happy

- Valid token present (client cannot fully validate — server decides). Form enabled.
- On success: `[DRAFT COPY] Đã cập nhật mật khẩu. Bạn có thể đăng nhập.` + Button to `/login`. Prefer IdP redirect if strategy is IdP-only.

### Empty

- Missing token query: show `ErrorPanel` / blocking message — not a data EmptyState.
- Copy: `[DRAFT COPY] Liên kết đặt lại không hợp lệ hoặc đã hết hạn. Yêu cầu liên kết mới.`

### Loading

- On mount optional lightweight `Skeleton` while parsing query.
- On submit: Button busy `[DRAFT COPY] Đang lưu…`.

### Error

| Code | Copy `[DRAFT COPY]` |
|---|---|
| `VALIDATION_FAILED` | Mật khẩu chưa đạt yêu cầu. Kiểm tra độ dài và xác nhận khớp. |
| `RATE_LIMITED` | Bạn thao tác quá nhanh. Vui lòng thử lại sau. |
| `AUTH_INVALID_CREDENTIALS` | Chỉ if server reuses — prefer not; treat as invalid link messaging. |
| Invalid/expired token | Catalog has **no** `PASSWORD_RESET_TOKEN_*`. Closest existing: treat as generic invalid link via Problem Details / `VALIDATION_FAILED`. **CONTRACT GAP** if Backend needs a dedicated code. |

Also show match error client-side before submit when confirm ≠ password.

### Forbidden

- N/A permission. Token failure is Error, not ForbiddenState.

### Conflict

- Token already used: same invalid-link message (do not invent `INVITE_*`-style codes for password).
- `IDEMPOTENCY_KEY_REUSED` / `IN_PROGRESS` if applicable: Toast wait/retry copy.

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Password fields | `FormField` + `Input` `type="password"` | `color.border.*`, `color.text.primary` |
| Submit | `Button` `primary` | `color.action.primary` |
| Errors | `ErrorPanel` | `color.danger.*` |
| Success | `EmptyState` or success panel | `color.success.*` |
| Loading | `Skeleton` | `color.background.muted` |

## Accessibility notes (spec §7.4)

- Tab: new password → confirm → submit → login link.
- Focus: new password on load; on success, focus success heading.
- `aria-live` for validation and server errors.
- `autocomplete="new-password"` on both fields.

## Interaction notes

1. Read `token` from query (name per OpenAPI when frozen — do not invent alternate names in client).
2. Submit → `POST /auth/password/reset`.
3. On success → CTA to `/login` (IdP-primary: copy may say “Tiếp tục đăng nhập với IdP”).
4. Never echo token in Toast/telemetry (PII/secret redaction).

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Mật khẩu mới | Required | Min 8 / max 256 (align OpenAPI reset body when complete) | Mật khẩu phải có ít nhất 8 ký tự. |
| Xác nhận | Required | Must equal new password | Xác nhận mật khẩu chưa khớp. |

## Open gaps found while drafting

- Reset request/response schemas may still be generic stubs — confirm field names on contract freeze.
- No dedicated reset-token error codes in catalog (CONTRACT GAP if product wants distinct expired vs used).
- Auth strategy may move this entirely to IdP — mark UI as contingent.
