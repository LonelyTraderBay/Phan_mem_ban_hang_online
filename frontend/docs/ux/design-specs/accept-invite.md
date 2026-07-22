# Design spec: `/accept-invite` — Chấp nhận lời mời

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/accept-invite`
**Required permission(s):** public (token-gated). After accept, session bootstraps as member.

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | Centered column ~480px: tenant summary card-like panel (border only if needed for grouping — prefer flat), then accept CTA / optional password. |
| `1440×900` standard | Same. |
| `1920×1080+` large | Same centered. |
| `1024×720` Windows compact | Stack summary + form; full-width Button. |

## Layout — happy state

```text
Brand
Headline: [DRAFT COPY] Tham gia không gian làm việc
Support:  [DRAFT COPY] Bạn được mời vào nhóm bên dưới.

Tenant summary (read-only):
  - [DRAFT COPY] Không gian: {tenant name}
  - [DRAFT COPY] Vai trò dự kiến: {role labels from server — never invent}
  - [DRAFT COPY] Email lời mời: {masked email if provided}

Optional (if contract requires local password / profile):
  FormField + Input: Mật khẩu (AcceptInvitationRequest.password nullable)
  FormField + Input: Xác nhận mật khẩu

Primary path preference (ADR-FE-013):
  Button primary: [DRAFT COPY] Tiếp tục với IdP để chấp nhận lời mời
  Secondary / pending: password complete-profile block marked pending strategy

Button primary (credential path): [DRAFT COPY] Chấp nhận lời mời
Link: [DRAFT COPY] Đã có tài khoản? Đăng nhập → /login
```

## States

### Happy

- Token validates (or client shows optimistic summary then server confirms on submit).
- Domain: invite `pending` → `accepted` (F01.4).
- Success → bootstrap → `/onboarding` or `/dashboard` per server/onboarding flag.

### Empty

- No token in query: ErrorPanel `[DRAFT COPY] Thiếu mã lời mời. Mở lại liên kết trong email.`

### Loading

- On mount: `Skeleton` for summary block while preview/validate if an endpoint exists; else Skeleton until first paint after parse.
- On submit: Button busy.

### Error

| Code | Copy `[DRAFT COPY]` |
|---|---|
| `INVITATION_TOKEN_INVALID` | Lời mời không hợp lệ hoặc đã hết hạn. Nhờ quản trị viên gửi lại. |
| `VALIDATION_FAILED` | Kiểm tra mật khẩu / thông tin đã nhập. |
| `RATE_LIMITED` | Thử lại sau. |
| `TENANT_INACTIVE` | Không gian làm việc hiện không hoạt động. |

**CONTRACT GAP (spec F01.6):** `INVITE_EXPIRED`, `INVITE_REVOKED`, `INVITE_ALREADY_ACCEPTED` are **not** in `error-catalog.yaml`. Only `INVITATION_TOKEN_INVALID` exists (enumeration-safe). Until Backend splits codes, map all bad-token outcomes to `INVITATION_TOKEN_INVALID` copy; do not invent FE-only codes. Prefer distinct UX only after catalog freeze:
- expired / revoked / already accepted → still same catalog code today.

### Forbidden

- N/A pre-accept. Post-accept `INSUFFICIENT_PERMISSION` would be app-shell issue, not this screen.

### Conflict

- Already accepted / race: surface as `INVITATION_TOKEN_INVALID` (or future specific code) + CTA login.
- Copy if already member path emerges: `[DRAFT COPY] Lời mời đã được dùng. Hãy đăng nhập.`

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Summary block | layout + typography | `color.surface.base`, `color.border.default`, `spacing.4` |
| Password fields | `FormField` + `Input` | `color.border.*` |
| Accept / IdP CTA | `Button` `primary` | `color.action.primary` |
| Errors | `ErrorPanel` | `color.danger.*` |
| Loading | `Skeleton` | `color.background.muted` |
| Status (pending strategy) | `StatusBadge` | `color.warning.*` |

## Accessibility notes (spec §7.4)

- Focus: primary CTA or first password field.
- Keyboard: complete form order; Enter submits.
- `aria-live` for token errors.
- Masked email announced as text, not as focusable secret.

## Interaction notes

1. Read invite token from query; keep in memory for `AcceptInvitationRequest.token`.
2. Submit → accept-invitation operation (OpenAPI path under `/members/invitations` accept — confirm operationId on freeze; request schema `AcceptInvitationRequest`).
3. IdP-primary: CTA may start OIDC with invite hint if Backend supports — **CONTRACT GAP** if not specified.
4. Success → session cookie + `GET /me` bootstrap → redirect.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Token | Required (query) | Min 16 / max 256 per schema | Thiếu hoặc sai mã lời mời. |
| Password | Optional (nullable in schema) | If present: min 8 / max 256 | Mật khẩu phải có ít nhất 8 ký tự. |
| Confirm | Required if password provided | Match | Xác nhận mật khẩu chưa khớp. |

## Open gaps found while drafting

- Finer invite error codes (`INVITE_*`) missing — OUTBOX.
- Invite preview GET (tenant/role summary without accepting) may be missing — if absent, show minimal copy and accept-only.
- IdP bind-on-invite flow not in ADR detail — Human Owner / Backend.
