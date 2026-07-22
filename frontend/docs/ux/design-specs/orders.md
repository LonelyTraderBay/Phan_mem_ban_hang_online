# Design spec: `/orders` — Đơn hàng / Chi tiết đơn

**Status:** READY-MOCK — HO defaults policy C (enterprise freeze W6) 2026-07-22
**Version:** v1 — 2026-07-22
**Author:** Design AI Agent
**Route:** `/orders, /orders/:orderId`
**Required permission(s):** order.read; mutations per order.create/update/cancel matrix keys
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
LIST /orders:
  Filters + DataTable (MISSING) of order_code, status badges, grand_total
  Button: Tạo đơn (PermissionGate)
DETAIL /orders/:orderId:
  Header: order_code + StatusBadge (order/payment/fulfillment)
  Line items snapshot (immutable after confirm)
  Money summary: subtotal / VAT 10% inclusive / grand total (HO_DEFAULTS)
  Actions: Confirm / Cancel / Print packing slip (gated)
```

## States

### Happy

- Prices tax-inclusive VAT 10% (HO_DEFAULTS_v1). Display đồng integer minor; never invent tax rate.
- Sample chrome: `[DRAFT COPY]` titles as in layout sketch.

### Empty

- EmptyState: [DRAFT COPY] Chưa có đơn hàng. Tạo đơn đầu tiên hoặc đồng bộ từ hội thoại.

### Loading

- Skeleton for primary regions; keep chrome visible. No full-page blank flash.

### Error

Map by **code** from `contracts/errors/error-catalog.yaml` (never by raw `detail`):

| Code (catalog) | Copy `[DRAFT COPY]` |
|---|---|
| `VALIDATION_FAILED` | Không lưu được đơn. Kiểm tra dòng hàng. |
| `RESOURCE_NOT_FOUND` | Không tìm thấy đơn hàng. |
| `TAX_RATE_MISMATCH` | Thuế suất không khớp cấu hình hệ thống (10%). Liên hệ hỗ trợ. |
| `ENTITLEMENT_LIMIT_EXCEEDED` | Đã đạt hạn mức đơn trong tháng. Nâng gói để tiếp tục. |
| `ENTITLEMENT_WARNING` | Sắp hết hạn mức đơn. Cân nhắc nâng gói. |
| `RATE_LIMITED` | Thử lại sau. |
| `INTERNAL_ERROR` | Có lỗi hệ thống. Thử lại; nếu vẫn lỗi hãy báo hỗ trợ. |

Load failure: ErrorPanel + retry Button.

### Forbidden

- Missing **order.read**: full-page ForbiddenState via PermissionGate.
- Copy: `[DRAFT COPY] Bạn không có quyền xem đơn hàng.`

### Conflict

- RESOURCE_VERSION_MISMATCH → [DRAFT COPY] Đơn vừa được cập nhật. Tải lại trước khi thao tác.

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
| DataTable | **MISSING COMPONENT** | — |
| Order status timeline | **MISSING COMPONENT** | — |
| Money summary block | **MISSING COMPONENT** | — |

## Accessibility notes (spec §7.4)

- Keyboard: tab order follows visual order; Modal traps focus and returns on close.
- Initial focus: first actionable control or page title heading.
- `aria-live`: Toast + async list refresh announcements.
- Tables (when built): header scope + sortable button names.

## Interaction notes

List → open detail. Confirm uses Modal + Idempotency-Key. Cancel requires reason if contract says so.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Số lượng dòng | Required | > 0 | Nhập số lượng hợp lệ. |
| Đơn giá | Required | integer ≥ 0 (đồng, tax-inclusive) | Nhập đơn giá hợp lệ. |

## Open gaps found while drafting

- Contract field-level detail: bind only to frozen OpenAPI after `pnpm contracts:sync` — do not invent properties.
- Missing `packages/ui` components flagged above — build before polish, or compose from existing primitives.
- Production legal/security copy acceptance remains a later Human Owner gate; freeze uses HO policy C READY-MOCK.
