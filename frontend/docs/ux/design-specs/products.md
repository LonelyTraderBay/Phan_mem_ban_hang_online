# Design spec: `/products` — Sản phẩm / Import / Chi tiết

**Status:** READY-MOCK — HO defaults policy C (enterprise freeze W6) 2026-07-22
**Version:** v1 — 2026-07-22
**Author:** Design AI Agent
**Route:** `/products, /products/import, /products/:productId`
**Required permission(s):** catalog.read; catalog.write / catalog.import / catalog.publish as gated
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
LIST /products: search + table of products/variants; unit_price_minor shown tax-inclusive
IMPORT /products/import: upload → preview → confirm apply (wizard)
DETAIL /products/:productId: variants, media, cost (field-level gate), publish
```

## States

### Happy

- unit_price_minor tax-inclusive (HO_DEFAULTS). cost_minor only if permission allows.
- Sample chrome: `[DRAFT COPY]` titles as in layout sketch.

### Empty

- EmptyState: [DRAFT COPY] Chưa có sản phẩm. Thêm sản phẩm hoặc nhập file.

### Loading

- Skeleton for primary regions; keep chrome visible. No full-page blank flash.

### Error

Map by **code** from `contracts/errors/error-catalog.yaml` (never by raw `detail`):

| Code (catalog) | Copy `[DRAFT COPY]` |
|---|---|
| `VALIDATION_FAILED` | Dữ liệu sản phẩm không hợp lệ. |
| `RESOURCE_NOT_FOUND` | Không tìm thấy sản phẩm. |
| `RATE_LIMITED` | Thử lại sau. |
| `INTERNAL_ERROR` | Có lỗi hệ thống. Thử lại; nếu vẫn lỗi hãy báo hỗ trợ. |

Load failure: ErrorPanel + retry Button.

### Forbidden

- Missing **catalog.read**: full-page ForbiddenState via PermissionGate.
- Copy: `[DRAFT COPY] Bạn không có quyền xem danh mục sản phẩm.`

### Conflict

- ETag mismatch on save → reload + Toast.

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
| File upload dropzone | **MISSING COMPONENT** | — |
| Import preview grid | **MISSING COMPONENT** | — |

## Accessibility notes (spec §7.4)

- Keyboard: tab order follows visual order; Modal traps focus and returns on close.
- Initial focus: first actionable control or page title heading.
- `aria-live`: Toast + async list refresh announcements.
- Tables (when built): header scope + sortable button names.

## Interaction notes

CRUD via forms; import wizard steps; publish gated by catalog.publish.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Tên sản phẩm | Required | non-empty | Nhập tên sản phẩm. |
| Đơn giá (đã gồm VAT 10%) | Required | integer ≥ 0 đồng | Nhập đơn giá hợp lệ. |

## Open gaps found while drafting

- Contract field-level detail: bind only to frozen OpenAPI after `pnpm contracts:sync` — do not invent properties.
- Missing `packages/ui` components flagged above — build before polish, or compose from existing primitives.
- Production legal/security copy acceptance remains a later Human Owner gate; freeze uses HO policy C READY-MOCK.
