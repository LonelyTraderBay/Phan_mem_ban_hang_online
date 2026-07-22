# Design spec: `/settings/devices` — Phiên & thiết bị

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/settings/devices`
**Required permission(s):** authenticated only (spec F01.2: no `device.*` keys in permission matrix — self-service). Do **not** invent `device.read` / `device.revoke` client permission checks; server scopes to current user.

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | List of device/session cards/rows; current device highlighted. |
| `1440×900` standard | Show OS / app / last seen / trust columns. |
| `1920×1080+` large | Same max content width. |
| `1024×720` Windows compact | Stacked rows; revoke full-width. |

## Layout — happy state

```text
Title: [DRAFT COPY] Thiết bị đăng nhập
Support: [DRAFT COPY] Quản lý nơi bạn đang đăng nhập. Thu hồi sẽ đăng xuất thiết bị đó.

Section: [DRAFT COPY] Thiết bị hiện tại
  Row: name/OS/app · last seen · StatusBadge “Đang dùng”
  Button danger (optional): [DRAFT COPY] Đăng xuất thiết bị này → logout current

Section: [DRAFT COPY] Thiết bị khác
  Rows from GET /devices and/or GET /sessions (use real ops only)
  Button danger: [DRAFT COPY] Thu hồi

Confirm Modal before revoke.
```

## States

### Happy

- At least current device shown. Others listed with last seen.

### Empty

- Only possible if API returns zero (should include current): `EmptyState` `[DRAFT COPY] Không có phiên nào.` + `[DRAFT COPY] Đăng nhập lại.` CTA → `/login`.

### Loading

- `Skeleton` list rows.

### Error

| Code | Copy `[DRAFT COPY]` |
|---|---|
| `AUTH_SESSION_REVOKED` | Phiên đã bị thu hồi — redirect login. |
| `RATE_LIMITED` | Thử lại sau. |
| `RESOURCE_NOT_FOUND` | Thiết bị không còn tồn tại — refresh list. |

**CONTRACT GAP:** `DEVICE_ALREADY_REVOKED` (F01.6) not in catalog. On double-revoke use `RESOURCE_NOT_FOUND` or generic conflict messaging until code exists; preferred copy when added: `[DRAFT COPY] Thiết bị này đã được thu hồi trước đó.`

### Forbidden

- Unauthenticated: route guard → `/login` (not ForbiddenState).
- No `device.*` permission UI. If server returns `INSUFFICIENT_PERMISSION`: `ForbiddenState` generic.

### Conflict

- Remote revoke while viewing: realtime/poll refresh; Toast `[DRAFT COPY] Một thiết bị vừa bị thu hồi.`
- Revoking current device: confirm → logout cascade (clear query cache, auth machine logged_out).

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Status | `StatusBadge` | `color.success` / `color.text.muted` |
| Revoke | `Button` `danger` | `color.danger.base` |
| Confirm | `Modal` | `zIndex.modal` |
| Empty | `EmptyState` | — |
| Error | `ErrorPanel` | `color.danger.*` |
| Loading | `Skeleton` | `color.background.muted` |
| Toast | `Toast` | `zIndex.toast` |
| Device table | **MISSING COMPONENT: Table** | use stacked rows |

## Accessibility notes (spec §7.4)

- Confirm Modal focus trap; Esc cancels.
- Danger actions require explicit confirm (no single-key revoke).
- Announce list refresh after revoke.

## Interaction notes

1. `GET /devices` and/or `GET /sessions` — map fields only from contract.
2. Revoke → `DELETE`/`POST` revoke on `/devices/{device_id}` or `/sessions/{session_id}` per OpenAPI.
3. Current device revoke → full logout (`POST /auth/logout`) + clear client state.
4. Listen for revoke event / poll fallback (F01.3) when contract provides.

## Open gaps found while drafting

- `DEVICE_ALREADY_REVOKED` missing — OUTBOX.
- Device revoke event name in AsyncAPI — confirm before wiring realtime.
- Sessions vs devices dual list: clarify which is canonical for this screen on contract freeze.
