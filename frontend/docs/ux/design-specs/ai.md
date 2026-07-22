# Design spec: `/ai/settings` — AI — Cài đặt / Nhật ký / Đầu ra bị chặn

**Status:** READY-MOCK — HO defaults policy C (enterprise freeze W6) 2026-07-22
**Version:** v1 — 2026-07-22
**Author:** Design AI Agent
**Route:** `/ai/settings, /ai/logs, /ai/blocked`
**Required permission(s):** ai.configure / ai.activate / ai.logs.read / ai.blocked.read as applicable
**App:** web-admin
**Freeze:** enterprise W6 2026-07-22

**Money / entitlement:** Follow backend `docs/business/HO_DEFAULTS_v1.md` (VAT 10% tax-inclusive; plans Free/Pro/Business; over-limit soft_warn → hard_block, no auto-upgrade).

## Viewport and responsive behavior

| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| `1280×720` minimum | App shell + primary content; collapse secondary panels. |
| `1440×900` standard | Full master-detail / filters + main as sketched. |
| `1920×1080+` large | Cap content max-width; do not stretch forms/tables edge-to-edge. |
| `1024×720` Windows compact | Collapse nav to icons/top tabs; stack detail under list. |

## Layout — happy state

```text
Tabs or subnav:
SETTINGS: prompt version activate, feature toggles (FeatureFlagGate)
LOGS: read-only decision traces list
BLOCKED: incident list + reason badges
Meter caption: AI suggestions / day (HO_DEFAULTS plan meters)
```

## States

### Happy

- Do not show raw secrets/PII in logs. Soft_warn/hard_block entitlement copy when limited.
- Sample chrome: `[DRAFT COPY]` titles as in layout sketch.

### Empty

- EmptyState: [DRAFT COPY] Chưa có nhật ký AI trong khoảng đã chọn.

### Loading

- Skeleton for primary regions; keep chrome visible. No full-page blank flash.

### Error

Map by **code** from `contracts/errors/error-catalog.yaml` (never by raw `detail`):

| Code (catalog) | Copy `[DRAFT COPY]` |
|---|---|
| `ENTITLEMENT_WARNING` | Sắp hết hạn mức gợi ý AI trong ngày. |
| `ENTITLEMENT_LIMIT_EXCEEDED` | Đã hết hạn mức gợi ý AI hôm nay. |
| `VALIDATION_FAILED` | Không kích hoạt được phiên bản prompt. |
| `RATE_LIMITED` | Thử lại sau. |
| `INTERNAL_ERROR` | Có lỗi hệ thống. Thử lại; nếu vẫn lỗi hãy báo hỗ trợ. |

Load failure: ErrorPanel + retry Button.

### Forbidden

- Missing **ai.configure or ai.logs.read**: full-page ForbiddenState via PermissionGate.
- Copy: `[DRAFT COPY] Bạn không có quyền xem cấu hình / nhật ký AI.`

### Conflict

- Activate version conflict → reload list.

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
| Log virtualized table | **MISSING COMPONENT** | — |
| Prompt version picker | **MISSING COMPONENT** | — |

## Accessibility notes (spec §7.4)

- Keyboard: tab order follows visual order; Modal traps focus and returns on close.
- Initial focus: first actionable control or page title heading.
- `aria-live`: Toast + async list refresh announcements.
- Tables (when built): header scope + sortable button names.

## Interaction notes

Activate confirm Modal; filter logs; open blocked detail drawer/Modal.

## Field validation (forms only — delete this section if not a form screen)

_Not a primary form screen — validation lives on Modal actions where noted._

## Open gaps found while drafting

- Contract field-level detail: bind only to frozen OpenAPI after `pnpm contracts:sync` — do not invent properties.
- Missing `packages/ui` components flagged above — build before polish, or compose from existing primitives.
- Production legal/security copy acceptance remains a later Human Owner gate; freeze uses HO policy C READY-MOCK.
