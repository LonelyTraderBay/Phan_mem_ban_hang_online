# Design spec: `/onboarding` — Onboarding không gian làm việc

**Status:** READY-MOCK — HO defaults policy C (enterprise freeze W6) 2026-07-22
**Version:** v1 — 2026-07-22
**Author:** Design AI Agent
**Route:** `/onboarding`
**Required permission(s):** authenticated (post-login); tenant.create / membership bootstrap per contract
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
[App chrome minimal]
Page title: [DRAFT COPY] Thiết lập không gian làm việc
Steps (wizard): 1 Tên không gian → 2 Mời đồng nghiệp (optional) → 3 Xong
  FormField + Input: Tên không gian
  Button primary: [DRAFT COPY] Tiếp tục
  Button secondary: [DRAFT COPY] Bỏ qua mời
Success → redirect /dashboard
```

## States

### Happy

- Wizard hoàn tất tạo tenant/membership theo BE contract; không invent field.
- Sample chrome: `[DRAFT COPY]` titles as in layout sketch.

### Empty

- EmptyState: N/A — wizard luôn có bước 1. Nếu đã onboarded: redirect /dashboard.

### Loading

- Skeleton for primary regions; keep chrome visible. No full-page blank flash.

### Error

Map by **code** from `contracts/errors/error-catalog.yaml` (never by raw `detail`):

| Code (catalog) | Copy `[DRAFT COPY]` |
|---|---|
| `VALIDATION_FAILED` | Kiểm tra lại tên không gian. |
| `RATE_LIMITED` | Bạn thao tác quá nhanh. Thử lại sau. |
| `CONFLICT` | Không gian này đã được thiết lập. Chuyển tới bảng điều khiển. |
| `INTERNAL_ERROR` | Có lỗi hệ thống. Thử lại; nếu vẫn lỗi hãy báo hỗ trợ. |

Load failure: ErrorPanel + retry Button.

### Forbidden

- Missing **session required**: full-page ForbiddenState via PermissionGate.
- Copy: `[DRAFT COPY] Bạn cần đăng nhập để thiết lập không gian.`

### Conflict

- RESOURCE_VERSION_MISMATCH / already provisioned → redirect dashboard + Toast.

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
| Wizard / Stepper shell | **MISSING COMPONENT** | — |

## Accessibility notes (spec §7.4)

- Keyboard: tab order follows visual order; Modal traps focus and returns on close.
- Initial focus: first actionable control or page title heading.
- `aria-live`: Toast + async list refresh announcements.
- Tables (when built): header scope + sortable button names.

## Interaction notes

1. Load onboarding status. 2. Submit step. 3. Optional invite. 4. Finish → dashboard.

## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy `[DRAFT COPY]` |
|---|---|---|---|
| Tên không gian | Required | 1–120 chars, trim | Nhập tên không gian làm việc. |

## Open gaps found while drafting

- Contract field-level detail: bind only to frozen OpenAPI after `pnpm contracts:sync` — do not invent properties.
- Missing `packages/ui` components flagged above — build before polish, or compose from existing primitives.
- Production legal/security copy acceptance remains a later Human Owner gate; freeze uses HO policy C READY-MOCK.
