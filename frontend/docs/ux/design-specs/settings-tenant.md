# Design spec: `/settings/tenant` — Cài đặt không gian làm việc

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/settings/tenant`
**Required permission(s):** `tenant.update` to edit; view-only if only `tenant.read` (spec §8.1 allows update-or-read variant). Gate destructive/save behind `tenant.update`.

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | Settings shell: left nav (settings sections) + main form column (~560px). |
| `1440×900` standard | Wider main column; labels left / fields right optional single column still OK. |
| `1920×1080+` large | Main column max-width ~640px; do not stretch inputs full viewport. |
| `1024×720` Windows compact | Collapse settings nav to top select/tabs; form full width. |

## Layout — happy state

```text
Settings shell header: [DRAFT COPY] Cài đặt
Subnav: Không gian | Thành viên | Vai trò | Thiết bị | …

Page title: [DRAFT COPY] Không gian làm việc
Support: [DRAFT COPY] Tên và thông tin hiển thị cho thành viên trong tenant này.

Form (GET /tenants/current → PATCH/PUT when contract frozen):
  FormField + Input: Tên không gian
  FormField + Input: Mã / timezone / currency — only fields present in contract (do not invent)
  Button primary: [DRAFT COPY] Lưu thay đổi   (PermissionGate tenant.update)
  Button secondary: [DRAFT COPY] Hủy
```

## States

### Happy

- Form hydrated from `GET /tenants/current`. Save enabled when dirty + `tenant.update`.

### Empty

- Unlikely for current tenant. If resource missing: `EmptyState` `[DRAFT COPY] Không tải được thông tin không gian.` + retry.

### Loading

- `Skeleton` for title + 3 field rows.

### Error

| Code | Copy `[DRAFT COPY]` |
|---|---|
| `VALIDATION_FAILED` | Kiểm tra lại các trường đã nhập. |
| `RESOURCE_NOT_FOUND` | Không tìm thấy không gian làm việc. |
| `RATE_LIMITED` | Thử lại sau. |
| `INSUFFICIENT_PERMISSION` | Handled as Forbidden (below). |

Load failure: `ErrorPanel` with retry.

### Forbidden

- Missing `tenant.read` and `tenant.update`: full-page `ForbiddenState` via `PermissionGate`.
- Copy: `[DRAFT COPY] Bạn không có quyền xem cài đặt không gian làm việc.`
- Has `tenant.read` only: show read-only fields; hide Save; caption `[DRAFT COPY] Bạn chỉ có quyền xem.`

### Conflict

- `RESOURCE_VERSION_MISMATCH` (ETag/If-Match): `[DRAFT COPY] Ai đó vừa cập nhật không gian này. Tải lại để xem bản mới, rồi thử lưu lại.`
- Actions: Button `[DRAFT COPY] Tải lại` discards local draft.

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Permission wrapper | `PermissionGate` | — |
| Fields | `FormField` + `Input` | `color.border.*`, `spacing.3` |
| Save / Cancel | `Button` primary / secondary | `color.action.primary` / `secondary` |
| Forbidden | `ForbiddenState` | `color.text.secondary` |
| Error | `ErrorPanel` | `color.danger.*` |
| Loading | `Skeleton` | `color.background.muted` |
| Toast on save OK | `Toast` | `color.success.*` |

**MISSING COMPONENT:** Settings page shell / subnav — not in `packages/ui`. App layout may own this; flag if shared shell needed.

## Accessibility notes (spec §7.4)

- Focus first field on load (when allowed).
- Announce save success via Toast `aria-live`.
- Conflict reload returns focus to title.

## Interaction notes

1. Load tenant current.
2. Edit → dirty state.
3. Save with `If-Match` / version if contract requires.
4. Cancel resets to last loaded.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Tên không gian | Required (if in schema) | Non-empty, max per OpenAPI | Vui lòng nhập tên không gian. |
| Other fields | Per OpenAPI only | Per OpenAPI | Per server `VALIDATION_FAILED` field errors |

## Open gaps found while drafting

- Exact updatable field list depends on frozen `/tenants/current` schema (may still be generic).
- No inventing timezone/currency widgets until contract lists them.
