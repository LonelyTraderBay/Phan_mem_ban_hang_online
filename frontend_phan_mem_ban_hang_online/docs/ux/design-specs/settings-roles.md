# Design spec: `/settings/roles` — Vai trò & quyền

**Status:** READY-MOCK — Human Owner approved 2026-07-21
**Version:** v1 — 2026-07-21
**Author:** Design AI Agent
**Route:** `/settings/roles`
**Required permission(s):** `role.read` to view; **`role.manage`** to create/edit/save (not `role.write` — that key does not exist in `permission-matrix.yaml`).

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | Master-detail: role list left (~280px) + permission editor right. |
| `1440×900` standard | Wider permission groups. |
| `1920×1080+` large | Editor max-width; groups in two columns if space. |
| `1024×720` Windows compact | Stack: role list full width → navigate to editor view. |

## Layout — happy state

```text
Title: [DRAFT COPY] Vai trò
Support: [DRAFT COPY] Gán quyền theo nhóm. Máy chủ là nguồn quyết định cuối.

Toolbar (role.manage): Button [DRAFT COPY] Tạo vai trò

Left: role list (GET /roles)
Right: role detail (GET /roles/{role_id})
  Name FormField
  Permission groups with checkboxes (mixed state per F01.5)
  Impacted user count if API provides
  Button primary Save (role.manage) with If-Match / version
  Optional audit reason FormField if policy requires
```

Permission grouping metadata: **CONTRACT GAP** if matrix YAML has no group labels — show flat list grouped by permission prefix as interim, flag for Backend metadata.

## States

### Happy

- Roles loaded; selecting one shows editor. System roles may be read-only (server flag — don’t invent; if absent, allow edit attempts and handle 403).

### Empty

- No custom roles: `EmptyState` `[DRAFT COPY] Chưa có vai trò tùy chỉnh.` + CTA tạo nếu `role.manage`.

### Loading

- Skeleton list + skeleton checkbox groups.

### Error

| Code | Copy `[DRAFT COPY]` |
|---|---|
| `VALIDATION_FAILED` | Tên hoặc quyền không hợp lệ. |
| `INSUFFICIENT_PERMISSION` | Forbidden UX. |
| `RATE_LIMITED` | Thử lại sau. |

**CONTRACT GAP:** `ROLE_VERSION_CONFLICT`, `ROLE_WOULD_REMOVE_LAST_ADMIN` (F01.6) not in catalog. Use `RESOURCE_VERSION_MISMATCH` for version conflict copy: `[DRAFT COPY] Vai trò đã được người khác cập nhật. Tải lại rồi lưu lại.` For last-admin self-lockout: until code exists, generic server rejection copy — do not invent `ROLE_WOULD_REMOVE_LAST_ADMIN` in client.

### Forbidden

- No `role.read`: `ForbiddenState` `[DRAFT COPY] Bạn không có quyền xem vai trò.`
- No `role.manage`: read-only editor; Save hidden.

### Conflict

- `RESOURCE_VERSION_MISMATCH`: reload CTA as above.
- Concurrent checkbox edits: last save wins only after reload acknowledgment.

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Create / Save | `Button` | `color.action.primary` |
| Name field | `FormField` + `Input` | `color.border.*` |
| Permission gates | `PermissionGate` | — |
| Forbidden | `ForbiddenState` | — |
| Empty | `EmptyState` | — |
| Error | `ErrorPanel` | `color.danger.*` |
| Loading | `Skeleton` | `color.background.muted` |
| Toast | `Toast` | `zIndex.toast` |
| Confirm dangerous save | `Modal` | `zIndex.modal` |
| Checkbox group / mixed | **MISSING COMPONENT: Checkbox / CheckboxGroup** | — |
| Role table/list | **MISSING COMPONENT: Table** (list OK as buttons) | — |

## Accessibility notes (spec §7.4)

- Keyboard: role list arrow/tab; checkboxes space to toggle; mixed state announced.
- Focus trap in create/confirm Modal.
- `aria-live` for conflict and save errors.

## Interaction notes

1. Load roles; select → load detail with ETag.
2. Toggle permissions; Save sends full set or patch per OpenAPI.
3. Warn before save if removing own admin rights — still server-enforced.
4. Spec F01.2 typo `role.write` → implement **`role.manage`** only.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Tên vai trò | Required | Non-empty, max per schema | Vui lòng nhập tên vai trò. |
| Audit reason | Optional/Required per policy | Non-empty when required | Vui lòng nhập lý do. |

## Open gaps found while drafting

- Permission grouping metadata not in FE contracts — OUTBOX.
- `ROLE_*` specific errors missing — use `RESOURCE_VERSION_MISMATCH` + gaps.
- CheckboxGroup missing in `packages/ui`.
