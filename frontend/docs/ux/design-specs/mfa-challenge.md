# Design spec: `/2fa` — Xác thực hai lớp (MFA)

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/2fa`
**Required permission(s):** public / mid-auth (has MFA challenge, not full session). No tenant permission key.

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | Centered ~420px; OTP Input + verify Button; secondary “dùng mã dự phòng” if contract supports. |
| `1440×900` standard | Same. |
| `1920×1080+` large | Same centered. |
| `1024×720` Windows compact | Full-width; large tap targets on OTP. |

## Layout — happy state

```text
Brand
Headline: [DRAFT COPY] Nhập mã xác thực
Support:  [DRAFT COPY] Mở ứng dụng xác thực và nhập mã 6 số.

FormField + Input: Mã xác thực (one-time; inputMode numeric)
Button primary: [DRAFT COPY] Xác nhận

Text button / link: [DRAFT COPY] Gửi lại mã (if SMS/email factor exists — only if contract says so)
Link: [DRAFT COPY] Quay lại đăng nhập → clears mid-auth → /login
```

Challenge id from login/`AuthResponse.mfa_challenge_id` carried in memory/route state — not a user-editable field.

## States

### Happy

- Challenge present; user enters code; on success continue bootstrap (`GET /me`) → destination.
- Copy support as above.

### Empty

- No challenge id in state: ErrorPanel `[DRAFT COPY] Phiên xác thực không còn hiệu lực. Vui lòng đăng nhập lại.` + CTA `/login`.

### Loading

- Verify Button busy; Input disabled.
- Optional `Skeleton` on first paint if challenge metadata loading.

### Error

| Code | Copy `[DRAFT COPY]` |
|---|---|
| `AUTH_MFA_INVALID` | Mã xác thực không đúng hoặc đã dùng. Thử mã mới. |
| `AUTH_MFA_REQUIRED` | (Should not appear on submit success path; if replayed mid-flow keep form.) |
| `RATE_LIMITED` | Bạn nhập sai quá nhiều lần. Đợi rồi thử lại. |
| `AUTH_SESSION_REVOKED` | Phiên đã bị thu hồi. Đăng nhập lại. |
| `VALIDATION_FAILED` | Nhập đủ mã xác thực. |

Use `ErrorPanel` above the field; clear OTP on `AUTH_MFA_INVALID` and refocus Input.

### Forbidden

- No permission key. If user fully authenticated navigates here: redirect to app.
- `AUTH_RECENT_AUTH_REQUIRED` is step-up elsewhere (modal), not this route’s primary story.

### Conflict

- Stale challenge / concurrent verify: show invalid-code or empty-challenge messaging; do not invent conflict codes.
- `IDEMPOTENCY_IN_PROGRESS`: Toast wait copy.

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| OTP field | `FormField` + `Input` | `color.border.focus`, `typography.fontFamily.mono` for digits if styled |
| Verify | `Button` `primary` | `color.action.primary` |
| Errors | `ErrorPanel` | `color.danger.*` |
| Loading | `Skeleton` | `color.background.muted` |
| Toast | `Toast` | `zIndex.toast` |

**MISSING COMPONENT:** Dedicated OTP / PIN input group (segmented 6 boxes) — not in `packages/ui`. Use single `Input` until an OTP component is added; do not invent one-off in feature without FE ticket.

## Accessibility notes (spec §7.4)

- Focus: OTP Input on load.
- Keyboard: digits entry; Enter verifies.
- `aria-live`: announce errors and rate-limit.
- Do not use `autocomplete="off"` in a way that breaks password managers if TOTP field naming is standardized — prefer `autocomplete="one-time-code"`.

## Interaction notes

1. Arrive from login when `AuthResponse.data.mfa_required === true`.
2. Submit → `POST /auth/mfa/verify` (`verifyMfa`) with challenge id + code per frozen schema (today may be `GenericCommandRequest` — **contract freeze needed**).
3. Success → bootstrap session → safe return URL.
4. “Quay lại đăng nhập” abandons challenge.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Mã xác thực | Required | Non-empty; typically 6 digits (confirm length in contract) | Vui lòng nhập mã xác thực. |

## Open gaps found while drafting

- `verifyMfa` response is still `GenericDataResponse` — need real MFA verify result schema.
- Resend-factor UX blocked until contract defines factor type + resend operation.
- AuthResponse MFA fields exist partially (`mfa_required`, `mfa_challenge_id`) — confirm completeness in OUTBOX.
