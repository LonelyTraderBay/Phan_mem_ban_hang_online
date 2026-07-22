# Design spec: `/inbox` — Hộp thư / Chi tiết hội thoại

**Status:** READY-MOCK — HO defaults policy C (enterprise freeze W6) 2026-07-22
**Version:** v1 — 2026-07-22
**Author:** Design AI Agent
**Route:** `/inbox, /inbox/:conversationId`
**Required permission(s):** conversation.read; send: conversation.reply (or matrix equivalent)
**App:** web-admin
**Freeze:** enterprise W6 2026-07-22

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | App shell + primary content; collapse secondary panels. |
| `1440×900` standard | Full master-detail / filters + main as sketched. |
| `1920×1080+` large | Cap content max-width; do not stretch forms/tables edge-to-edge. |
| `1024×720` Windows compact | Collapse nav to icons/top tabs; stack detail under list. |

## Layout — happy state

```text
List+detail (master-detail):
LEFT: conversation list (filters: open/pending/all) — MISSING Table/List
RIGHT (/inbox/:id): message thread + composer
  StatusBadge: conversation states
  Button: Gửi / Gán / Đóng (PermissionGate)
Empty list vs empty thread distinguished
```

## States

### Happy

- Realtime/SSE when contract provides; otherwise poll. Never invent channel payloads.
- Sample chrome: `[DRAFT COPY]` titles as in layout sketch.

### Empty

- EmptyState: [DRAFT COPY] Chưa có hội thoại. Kết nối kênh để bắt đầu nhận tin.

### Loading

- Skeleton for primary regions; keep chrome visible. No full-page blank flash.

### Error

Map by **code** from `contracts/errors/error-catalog.yaml` (never by raw `detail`):

| Code (catalog) | Copy `[DRAFT COPY]` |
|---|---|
| `RESOURCE_NOT_FOUND` | Không tìm thấy hội thoại. |
| `VALIDATION_FAILED` | Không gửi được tin nhắn. Kiểm tra nội dung. |
| `RATE_LIMITED` | Gửi quá nhanh. Thử lại sau. |
| `ENTITLEMENT_LIMIT_EXCEEDED` | Đã hết hạn mức kênh/AI. Nâng gói hoặc thử lại sau kỳ. |
| `INTERNAL_ERROR` | Có lỗi hệ thống. Thử lại; nếu vẫn lỗi hãy báo hỗ trợ. |

Load failure: ErrorPanel + retry Button.

### Forbidden

- Missing **conversation.read**: full-page ForbiddenState via PermissionGate.
- Copy: `[DRAFT COPY] Bạn không có quyền xem hộp thư.`

### Conflict

- RESOURCE_VERSION_MISMATCH on assign/close → reload thread + Toast.

## Component / token mapping

| Screen element | `packages/ui` component | Key design tokens |
|---|---|---|
| Permission wrapper | PermissionGate | — |
| Feature flag (if any) | FeatureFlagGate | — |
| Primary / secondary actions | Button | `color.action.primary` / `secondary` |
| Fields | FormField + Input | `color.border.*`, `spacing.3` |
| Status | StatusBadge | `color.status.*` |
| Empty | EmptyState | `color.text.secondary` |
| Error | ErrorPanel | `color.danger.*` |
| Forbidden | ForbiddenState | `color.text.secondary` |
| Offline | OfflineState | `color.warning.*` |
| Loading | Skeleton | `color.background.muted` |
| Confirm dialogs | Modal | `spacing.4`, `color.background.surface` |
| Success/info | Toast | `color.success.*` |
| Virtualized list | **MISSING COMPONENT** | — |
| Message composer | **MISSING COMPONENT** | — |
| Conversation filters | **MISSING COMPONENT** | — |

## Accessibility notes (spec §7.4)

- Keyboard: tab order follows visual order; Modal traps focus and returns on close.
- Initial focus: first actionable control or page title heading.
- `aria-live`: Toast + async list refresh announcements.
- Tables (when built): header scope + sortable button names.

## Interaction notes

1. Select row → load detail. 2. Composer send with idempotency. 3. Assign/close via Modal confirm.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Nội dung tin | Required | non-empty, max per contract | Nhập nội dung tin nhắn. |

## Open gaps found while drafting

- Contract field-level detail: bind only to frozen OpenAPI after `pnpm contracts:sync` — do not invent properties.
- Missing `packages/ui` components flagged above — build before polish, or compose from existing primitives.
- Production legal/security copy acceptance remains a later Human Owner gate; freeze uses HO policy C READY-MOCK.
