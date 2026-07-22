# Design spec: `/settings/users` — Thành viên & lời mời

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/settings/users`
**Required permission(s):** `member.read` (route). Actions: `member.invite`, `member.update`, `member.revoke` as gated controls.

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | List + filters; row actions in overflow. Invite opens `Modal`. |
| `1440×900` standard | More columns visible (email, role, status, last active if provided). |
| `1920×1080+` large | Same; list max-width within settings content. |
| `1024×720` Windows compact | Horizontal scroll or stacked cards per row; filters collapse. |

## Layout — happy state

```text
Title: [DRAFT COPY] Thành viên
Support: [DRAFT COPY] Mời và quản lý người trong không gian này.

Toolbar:
  Input search (debounce)
  Status filter (active / invited / suspended — values from API only)
  Button primary (member.invite): [DRAFT COPY] Mời thành viên

List (GET /members) — **MISSING COMPONENT: Table**:
  Until Table exists: stacked rows with typography + StatusBadge + action Buttons
  Columns intent: Tên / Email / Vai trò / Trạng thái / Actions

Pending invitations section (GET invitations) if separate:
  Resend / revoke actions per permission

Invite Modal:
  FormField email, role select (options from GET /roles + role.read)
  Button [DRAFT COPY] Gửi lời mời
```

## States

### Happy

- Non-empty member list; badges for membership states (`invited` / `active` / `suspended` per F01.4).

### Empty

- `EmptyState`: `[DRAFT COPY] Chưa có thành viên nào khớp bộ lọc.`
- With invite permission, action Button `[DRAFT COPY] Mời thành viên đầu tiên`.

### Loading

- `Skeleton` rows (5).

### Error

| Code | Copy `[DRAFT COPY]` |
|---|---|
| `RESOURCE_NOT_FOUND` | Rare on list — show retry. |
| `RATE_LIMITED` | Thử lại sau. |
| `VALIDATION_FAILED` | Email/role không hợp lệ. |
| `IDEMPOTENCY_*` | Toast xử lý trùng lời mời. |

Load error: `ErrorPanel` + retry.

### Forbidden

- No `member.read`: `ForbiddenState` `[DRAFT COPY] Bạn không có quyền xem danh sách thành viên.`
- Action buttons hidden via `PermissionGate` for invite/update/revoke — do not rely on hiding alone for security (server enforces).

### Conflict

- Suspend/revoke races: show server message.
- **CONTRACT GAP:** `USER_LAST_OWNER` not in catalog. Spec F01.6 requires it for last-owner remove. Until added, show generic `VALIDATION_FAILED` / Problem Details detail mapped by code only when present; UI copy placeholder: `[DRAFT COPY] Không thể gỡ chủ sở hữu cuối cùng.` only when code exists — otherwise `[DRAFT COPY] Không thể hoàn tất. Máy chủ từ chối thao tác.` + log gap.
- `RESOURCE_VERSION_MISMATCH` if membership update uses ETag.

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Search | `Input` | `color.border.*` |
| Invite / row actions | `Button` | `color.action.*`, `danger` for revoke |
| Status | `StatusBadge` | `color.success` / `warning` / `danger` |
| Invite dialog | `Modal` | `zIndex.modal`, `color.surface.overlay` |
| Empty | `EmptyState` | `color.text.secondary` |
| Forbidden | `ForbiddenState` + `PermissionGate` | — |
| Error | `ErrorPanel` | `color.danger.*` |
| Loading | `Skeleton` | `color.background.muted` |
| Toast | `Toast` | `zIndex.toast` |
| Member table | **MISSING COMPONENT: Table** | — |

## Accessibility notes (spec §7.4)

- Modal: focus trap; return focus to Invite button on close (spec §7.4).
- List: row actions keyboard reachable; confirm dialogs before revoke/suspend.
- `aria-live` for invite success and conflict errors.

## Interaction notes

1. List members (cursor/page per OpenAPI `page_info`).
2. Invite Modal → `POST /members/invitations` with idempotency key.
3. Resend → resend operation; Revoke invite / member → confirm Modal.
4. Suspend/activate → `member.update` gated.
5. Never client-decide last-owner — server error only.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Email (invite) | Required | Email format | Vui lòng nhập email hợp lệ. |
| Role | Required | Must be from server role list | Vui lòng chọn vai trò. |

## Open gaps found while drafting

- `USER_LAST_OWNER` missing from error catalog — OUTBOX.
- Table component missing — use stacked list interim.
- PII masking rules depend on permission/classification — follow server payload; don’t invent masked fields client-side.
