# Design spec: `/knowledge` — Kho tri thức

**Status:** READY-MOCK — HO defaults policy C (enterprise freeze W6) 2026-07-22
**Version:** v1 — 2026-07-22
**Author:** Design AI Agent
**Route:** `/knowledge`
**Required permission(s):** knowledge.read; knowledge.publish as gated
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
Source list + version status badges
Actions: Upload / Review / Publish / Archive (gated)
Test search panel (published-only retrieval)
```

## States

### Happy

- Only published versions affect retrieval; drafts never leak cross-tenant.
- Sample chrome: `[DRAFT COPY]` titles as in layout sketch.

### Empty

- EmptyState: [DRAFT COPY] Chưa có nguồn tri thức. Tải tài liệu để AI trả lời chính xác hơn.

### Loading

- Skeleton for primary regions; keep chrome visible. No full-page blank flash.

### Error

Map by **code** from `contracts/errors/error-catalog.yaml` (never by raw `detail`):

| Code (catalog) | Copy `[DRAFT COPY]` |
|---|---|
| `VALIDATION_FAILED` | Không xử lý được tệp. |
| `RATE_LIMITED` | Thử lại sau. |
| `INTERNAL_ERROR` | Ingestion thất bại. Thử lại hoặc xem trạng thái job. |
| `INTERNAL_ERROR` | Có lỗi hệ thống. Thử lại; nếu vẫn lỗi hãy báo hỗ trợ. |

Load failure: ErrorPanel + retry Button.

### Forbidden

- Missing **knowledge.read**: full-page ForbiddenState via PermissionGate.
- Copy: `[DRAFT COPY] Bạn không có quyền xem kho tri thức.`

### Conflict

- Publish race → reload versions.

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
| File upload | **MISSING COMPONENT** | — |
| Version timeline | **MISSING COMPONENT** | — |

## Accessibility notes (spec §7.4)

- Keyboard: tab order follows visual order; Modal traps focus and returns on close.
- Initial focus: first actionable control or page title heading.
- `aria-live`: Toast + async list refresh announcements.
- Tables (when built): header scope + sortable button names.

## Interaction notes

Upload → processing StatusBadge → review → publish confirm Modal.

## Field validation (forms only — delete this section if not a form screen)

_Not a primary form screen — validation lives on Modal actions where noted._

## Open gaps found while drafting

- Contract field-level detail: bind only to frozen OpenAPI after `pnpm contracts:sync` — do not invent properties.
- Missing `packages/ui` components flagged above — build before polish, or compose from existing primitives.
- Production legal/security copy acceptance remains a later Human Owner gate; freeze uses HO policy C READY-MOCK.
