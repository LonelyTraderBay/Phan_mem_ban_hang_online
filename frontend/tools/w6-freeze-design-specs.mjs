#!/usr/bin/env node
/**
 * W6 — Generate missing FE design-specs + fe_screen_inventory.csv + handoff updates.
 * HO defaults policy C (2026-07-22): pack → READY-MOCK for freeze (production legal later).
 * Does not overwrite existing READY-MOCK specs unless --force-generated.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specsDir = path.join(root, "docs/ux/design-specs");
const handoffPath = path.join(root, "docs/ux/handoff-checklist.md");
const feFreezePath = path.join(root, "docs/enterprise-freeze/FE_FREEZE_CHECKLIST.md");
const beInventory = path.resolve(
  root,
  "../backend/docs/enterprise-freeze/inventory/fe_screen_inventory.csv",
);

const READY =
  "READY-MOCK — HO defaults policy C (enterprise freeze W6) 2026-07-22";
const DATE = "2026-07-22";

const UI = {
  button: "Button",
  input: "Input",
  form: "FormField",
  modal: "Modal",
  toast: "Toast",
  badge: "StatusBadge",
  skeleton: "Skeleton",
  error: "ErrorPanel",
  empty: "EmptyState",
  forbidden: "ForbiddenState",
  offline: "OfflineState",
  gate: "PermissionGate",
  flag: "FeatureFlagGate",
};

/** @typedef {{
 *  slug: string,
 *  routes: string,
 *  titleVi: string,
 *  app: 'web-admin' | 'super-admin' | 'public',
 *  permission: string,
 *  layout: string,
 *  emptyCopy: string,
 *  happyNotes: string,
 *  errors: [string, string][],
 *  forbiddenPerm: string,
 *  forbiddenCopy: string,
 *  conflict?: string,
 *  fields?: [string, string, string, string][],
 *  missing?: string[],
 *  hoMoney?: boolean,
 *  interactions: string,
 * }} Screen */

/** @type {Screen[]} */
const SCREENS = [
  {
    slug: "onboarding",
    routes: "/onboarding",
    titleVi: "Onboarding không gian làm việc",
    app: "web-admin",
    permission: "authenticated (post-login); tenant.create / membership bootstrap per contract",
    layout: `[App chrome minimal]
Page title: [DRAFT COPY] Thiết lập không gian làm việc
Steps (wizard): 1 Tên không gian → 2 Mời đồng nghiệp (optional) → 3 Xong
  FormField + Input: Tên không gian
  Button primary: [DRAFT COPY] Tiếp tục
  Button secondary: [DRAFT COPY] Bỏ qua mời
Success → redirect /dashboard`,
    emptyCopy: "N/A — wizard luôn có bước 1. Nếu đã onboarded: redirect /dashboard.",
    happyNotes: "Wizard hoàn tất tạo tenant/membership theo BE contract; không invent field.",
    errors: [
      ["VALIDATION_FAILED", "Kiểm tra lại tên không gian."],
      ["RATE_LIMITED", "Bạn thao tác quá nhanh. Thử lại sau."],
      ["CONFLICT", "Không gian này đã được thiết lập. Chuyển tới bảng điều khiển."],
    ],
    forbiddenPerm: "session required",
    forbiddenCopy: "Bạn cần đăng nhập để thiết lập không gian.",
    conflict: "RESOURCE_VERSION_MISMATCH / already provisioned → redirect dashboard + Toast.",
    fields: [
      ["Tên không gian", "Required", "1–120 chars, trim", "Nhập tên không gian làm việc."],
    ],
    missing: ["Wizard / Stepper shell"],
    interactions:
      "1. Load onboarding status. 2. Submit step. 3. Optional invite. 4. Finish → dashboard.",
  },
  {
    slug: "dashboard",
    routes: "/dashboard",
    titleVi: "Bảng điều khiển",
    app: "web-admin",
    permission: "authenticated + tenant context (feature.web_admin)",
    layout: `[App shell + nav]
Page title: [DRAFT COPY] Tổng quan
KPI cards row (orders today, open conversations, AI suggestions used) — data from report APIs when available
Quick links: Inbox | Đơn hàng | Sản phẩm
OfflineState banner when disconnected`,
    emptyCopy: "[DRAFT COPY] Chưa có dữ liệu hoạt động. Bắt đầu từ Hộp thư hoặc thêm sản phẩm.",
    happyNotes: "Read-only summary; deep-link cards to modules. No invent metrics beyond contract.",
    errors: [
      ["INTERNAL_ERROR", "Không tải được tổng quan. Thử lại."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "feature.web_admin / tenant membership",
    forbiddenCopy: "Bạn không có quyền xem bảng điều khiển của không gian này.",
    missing: ["KPI card / DataTable"],
    interactions: "Click KPI/quick link → navigate. Retry on ErrorPanel.",
  },
  {
    slug: "inbox",
    routes: "/inbox, /inbox/:conversationId",
    titleVi: "Hộp thư / Chi tiết hội thoại",
    app: "web-admin",
    permission: "conversation.read; send: conversation.reply (or matrix equivalent)",
    layout: `List+detail (master-detail):
LEFT: conversation list (filters: open/pending/all) — MISSING Table/List
RIGHT (/inbox/:id): message thread + composer
  StatusBadge: conversation states
  Button: Gửi / Gán / Đóng (PermissionGate)
Empty list vs empty thread distinguished`,
    emptyCopy: "[DRAFT COPY] Chưa có hội thoại. Kết nối kênh để bắt đầu nhận tin.",
    happyNotes: "Realtime/SSE when contract provides; otherwise poll. Never invent channel payloads.",
    errors: [
      ["RESOURCE_NOT_FOUND", "Không tìm thấy hội thoại."],
      ["VALIDATION_FAILED", "Không gửi được tin nhắn. Kiểm tra nội dung."],
      ["RATE_LIMITED", "Gửi quá nhanh. Thử lại sau."],
      ["ENTITLEMENT_LIMIT_EXCEEDED", "Đã hết hạn mức kênh/AI. Nâng gói hoặc thử lại sau kỳ."],
    ],
    forbiddenPerm: "conversation.read",
    forbiddenCopy: "Bạn không có quyền xem hộp thư.",
    conflict: "RESOURCE_VERSION_MISMATCH on assign/close → reload thread + Toast.",
    fields: [
      ["Nội dung tin", "Required", "non-empty, max per contract", "Nhập nội dung tin nhắn."],
    ],
    missing: ["Virtualized list", "Message composer", "Conversation filters"],
    interactions:
      "1. Select row → load detail. 2. Composer send with idempotency. 3. Assign/close via Modal confirm.",
  },
  {
    slug: "orders",
    routes: "/orders, /orders/:orderId",
    titleVi: "Đơn hàng / Chi tiết đơn",
    app: "web-admin",
    permission: "order.read; mutations per order.create/update/cancel matrix keys",
    layout: `LIST /orders:
  Filters + DataTable (MISSING) of order_code, status badges, grand_total
  Button: Tạo đơn (PermissionGate)
DETAIL /orders/:orderId:
  Header: order_code + StatusBadge (order/payment/fulfillment)
  Line items snapshot (immutable after confirm)
  Money summary: subtotal / VAT 10% inclusive / grand total (HO_DEFAULTS)
  Actions: Confirm / Cancel / Print packing slip (gated)`,
    emptyCopy: "[DRAFT COPY] Chưa có đơn hàng. Tạo đơn đầu tiên hoặc đồng bộ từ hội thoại.",
    happyNotes:
      "Prices tax-inclusive VAT 10% (HO_DEFAULTS_v1). Display đồng integer minor; never invent tax rate.",
    errors: [
      ["VALIDATION_FAILED", "Không lưu được đơn. Kiểm tra dòng hàng."],
      ["RESOURCE_NOT_FOUND", "Không tìm thấy đơn hàng."],
      ["TAX_RATE_MISMATCH", "Thuế suất không khớp cấu hình hệ thống (10%). Liên hệ hỗ trợ."],
      ["ENTITLEMENT_LIMIT_EXCEEDED", "Đã đạt hạn mức đơn trong tháng. Nâng gói để tiếp tục."],
      ["ENTITLEMENT_WARNING", "Sắp hết hạn mức đơn. Cân nhắc nâng gói."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "order.read",
    forbiddenCopy: "Bạn không có quyền xem đơn hàng.",
    conflict: "RESOURCE_VERSION_MISMATCH → [DRAFT COPY] Đơn vừa được cập nhật. Tải lại trước khi thao tác.",
    fields: [
      ["Số lượng dòng", "Required", "> 0", "Nhập số lượng hợp lệ."],
      ["Đơn giá", "Required", "integer ≥ 0 (đồng, tax-inclusive)", "Nhập đơn giá hợp lệ."],
    ],
    missing: ["DataTable", "Order status timeline", "Money summary block"],
    hoMoney: true,
    interactions:
      "List → open detail. Confirm uses Modal + Idempotency-Key. Cancel requires reason if contract says so.",
  },
  {
    slug: "products",
    routes: "/products, /products/import, /products/:productId",
    titleVi: "Sản phẩm / Import / Chi tiết",
    app: "web-admin",
    permission: "catalog.read; catalog.write / catalog.import / catalog.publish as gated",
    layout: `LIST /products: search + table of products/variants; unit_price_minor shown tax-inclusive
IMPORT /products/import: upload → preview → confirm apply (wizard)
DETAIL /products/:productId: variants, media, cost (field-level gate), publish`,
    emptyCopy: "[DRAFT COPY] Chưa có sản phẩm. Thêm sản phẩm hoặc nhập file.",
    happyNotes: "unit_price_minor tax-inclusive (HO_DEFAULTS). cost_minor only if permission allows.",
    errors: [
      ["VALIDATION_FAILED", "Dữ liệu sản phẩm không hợp lệ."],
      ["RESOURCE_NOT_FOUND", "Không tìm thấy sản phẩm."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "catalog.read",
    forbiddenCopy: "Bạn không có quyền xem danh mục sản phẩm.",
    conflict: "ETag mismatch on save → reload + Toast.",
    fields: [
      ["Tên sản phẩm", "Required", "non-empty", "Nhập tên sản phẩm."],
      ["Đơn giá (đã gồm VAT 10%)", "Required", "integer ≥ 0 đồng", "Nhập đơn giá hợp lệ."],
    ],
    missing: ["DataTable", "File upload dropzone", "Import preview grid"],
    hoMoney: true,
    interactions:
      "CRUD via forms; import wizard steps; publish gated by catalog.publish.",
  },
  {
    slug: "inventory",
    routes: "/inventory, /inventory/movements",
    titleVi: "Tồn kho / Nhật ký xuất nhập",
    app: "web-admin",
    permission: "inventory.read; inventory.adjust / inventory.reserve as gated",
    layout: `/inventory: balances by warehouse×variant (DataTable MISSING)
  Button: Điều chỉnh (Modal reason + qty)
/inventory/movements: append-only ledger list (read-only)`,
    emptyCopy: "[DRAFT COPY] Chưa có số dư tồn. Nhập kho hoặc đồng bộ từ đơn.",
    happyNotes: "Ledger movements never hard-deleted; adjustments create compensating rows.",
    errors: [
      ["VALIDATION_FAILED", "Số lượng điều chỉnh không hợp lệ."],
      ["CONFLICT", "Không đủ tồn để giữ chỗ / điều chỉnh."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "inventory.read",
    forbiddenCopy: "Bạn không có quyền xem tồn kho.",
    conflict: "Concurrent reservation → show conflict copy + reload balances.",
    fields: [
      ["Số lượng", "Required", "≠ 0, decimal per contract", "Nhập số lượng điều chỉnh."],
      ["Lý do", "Required", "non-empty", "Nhập lý do điều chỉnh."],
    ],
    missing: ["DataTable", "Warehouse selector"],
    interactions: "Adjust opens Modal; submit idempotent; movements filter by date/SKU.",
  },
  {
    slug: "knowledge",
    routes: "/knowledge",
    titleVi: "Kho tri thức",
    app: "web-admin",
    permission: "knowledge.read; knowledge.publish as gated",
    layout: `Source list + version status badges
Actions: Upload / Review / Publish / Archive (gated)
Test search panel (published-only retrieval)`,
    emptyCopy: "[DRAFT COPY] Chưa có nguồn tri thức. Tải tài liệu để AI trả lời chính xác hơn.",
    happyNotes: "Only published versions affect retrieval; drafts never leak cross-tenant.",
    errors: [
      ["VALIDATION_FAILED", "Không xử lý được tệp."],
      ["RATE_LIMITED", "Thử lại sau."],
      ["INTERNAL_ERROR", "Ingestion thất bại. Thử lại hoặc xem trạng thái job."],
    ],
    forbiddenPerm: "knowledge.read",
    forbiddenCopy: "Bạn không có quyền xem kho tri thức.",
    conflict: "Publish race → reload versions.",
    missing: ["File upload", "Version timeline"],
    interactions: "Upload → processing StatusBadge → review → publish confirm Modal.",
  },
  {
    slug: "channels",
    routes: "/channels, /channels/:channelId/health",
    titleVi: "Kênh / Sức khỏe kênh",
    app: "web-admin",
    permission: "channel.read; channel.connect / ops.channel.manage as gated",
    layout: `LIST: channel accounts + health StatusBadge
CONNECT: OAuth/start flow CTA
HEALTH /channels/:id/health: latency, last webhook, error rate panels`,
    emptyCopy: "[DRAFT COPY] Chưa kết nối kênh nào. Kết nối để nhận hội thoại.",
    happyNotes: "Credentials never shown in clear text. Entitlement meter.channel_accounts applies.",
    errors: [
      ["VALIDATION_FAILED", "Không kết nối được kênh."],
      ["ENTITLEMENT_LIMIT_EXCEEDED", "Đã hết slot kênh của gói hiện tại."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "channel.read",
    forbiddenCopy: "Bạn không có quyền xem kênh.",
    conflict: "Token refresh conflict → reconnect CTA.",
    missing: ["Health chart", "Provider logo row"],
    interactions: "Connect → provider redirect → callback → list refresh. Health auto-refresh.",
  },
  {
    slug: "ai",
    routes: "/ai/settings, /ai/logs, /ai/blocked",
    titleVi: "AI — Cài đặt / Nhật ký / Đầu ra bị chặn",
    app: "web-admin",
    permission: "ai.configure / ai.activate / ai.logs.read / ai.blocked.read as applicable",
    layout: `Tabs or subnav:
SETTINGS: prompt version activate, feature toggles (FeatureFlagGate)
LOGS: read-only decision traces list
BLOCKED: incident list + reason badges
Meter caption: AI suggestions / day (HO_DEFAULTS plan meters)`,
    emptyCopy: "[DRAFT COPY] Chưa có nhật ký AI trong khoảng đã chọn.",
    happyNotes: "Do not show raw secrets/PII in logs. Soft_warn/hard_block entitlement copy when limited.",
    errors: [
      ["ENTITLEMENT_WARNING", "Sắp hết hạn mức gợi ý AI trong ngày."],
      ["ENTITLEMENT_LIMIT_EXCEEDED", "Đã hết hạn mức gợi ý AI hôm nay."],
      ["VALIDATION_FAILED", "Không kích hoạt được phiên bản prompt."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "ai.configure or ai.logs.read",
    forbiddenCopy: "Bạn không có quyền xem cấu hình / nhật ký AI.",
    conflict: "Activate version conflict → reload list.",
    missing: ["Log virtualized table", "Prompt version picker"],
    hoMoney: true,
    interactions: "Activate confirm Modal; filter logs; open blocked detail drawer/Modal.",
  },
  {
    slug: "reports",
    routes: "/reports",
    titleVi: "Báo cáo",
    app: "web-admin",
    permission: "report.read (tab widgets may require report.revenue.read / report.sla.read / report.ai_quality.read)",
    layout: `Report type tabs (PermissionGate per tab)
Date range filters
Charts/tables MISSING — placeholder panels with EmptyState until components exist
Export button if contract supports`,
    emptyCopy: "[DRAFT COPY] Không có dữ liệu trong khoảng thời gian đã chọn.",
    happyNotes: "Revenue figures reconcile to order money rules (VAT inclusive).",
    errors: [
      ["VALIDATION_FAILED", "Khoảng thời gian không hợp lệ."],
      ["INSUFFICIENT_PERMISSION", "Handled as Forbidden."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "any report.*",
    forbiddenCopy: "Bạn không có quyền xem báo cáo.",
    missing: ["Chart", "DateRangePicker", "Export menu"],
    hoMoney: true,
    interactions: "Change range → refetch. Tab switch respects PermissionGate.",
  },
  {
    slug: "settings-audit-logs",
    routes: "/settings/audit-logs",
    titleVi: "Cài đặt — Nhật ký kiểm toán",
    app: "web-admin",
    permission: "audit.read (export: audit.export if present)",
    layout: `Settings shell
Filters: actor / action / date
Read-only table of redacted audit rows
Export CTA gated`,
    emptyCopy: "[DRAFT COPY] Chưa có sự kiện kiểm toán trong bộ lọc hiện tại.",
    happyNotes: "Never show secrets; respect redaction from BE.",
    errors: [
      ["RATE_LIMITED", "Thử lại sau."],
      ["INTERNAL_ERROR", "Không tải được nhật ký."],
    ],
    forbiddenPerm: "audit.read",
    forbiddenCopy: "Bạn không có quyền xem nhật ký kiểm toán.",
    missing: ["DataTable", "Date filters"],
    interactions: "Filter → refetch. Export downloads via contract.",
  },
  {
    slug: "settings-notifications",
    routes: "/settings/notifications",
    titleVi: "Cài đặt — Thông báo",
    app: "web-admin",
    permission: "authenticated; prefs per contract (notification preferences)",
    layout: `Settings shell
Toggle rows for email/in-app categories (only keys in contract)
Button: Lưu`,
    emptyCopy: "N/A — defaults always present after load.",
    happyNotes: "Do not invent notification channels not in OpenAPI.",
    errors: [
      ["VALIDATION_FAILED", "Không lưu được tùy chọn."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "session",
    forbiddenCopy: "Bạn cần đăng nhập để chỉnh thông báo.",
    conflict: "Version mismatch → reload prefs.",
    fields: [["Toggles", "Optional", "boolean", "—"]],
    missing: ["Toggle / Switch"],
    interactions: "Toggle dirty → Save. Toast on success.",
  },
  {
    slug: "billing",
    routes: "/billing",
    titleVi: "Gói dịch vụ & hạn mức",
    app: "web-admin",
    permission: "billing.read (or tenant.update for upgrade CTA — per matrix)",
    layout: `Current plan card: Free | Pro | Business (HO_DEFAULTS ids)
Meter bars: seats, orders/mo, AI/day, channels
Over-limit: soft_warn banner then hard_block messaging (no auto-upgrade)
CTA: [DRAFT COPY] Nâng cấp gói (opens support/checkout stub per contract)
Prices shown: Pro ₫499.000 / Business ₫1.999.000 monthly stubs`,
    emptyCopy: "N/A — subscription always resolves to a plan (default Free).",
    happyNotes:
      "Authoritative: docs/business/HO_DEFAULTS_v1.md — VAT N/A on plan price stubs; meters calendar month UTC.",
    errors: [
      ["ENTITLEMENT_WARNING", "Bạn sắp chạm hạn mức. Cân nhắc nâng gói."],
      ["ENTITLEMENT_LIMIT_EXCEEDED", "Đã chạm hạn mức. Nâng gói để tiếp tục thao tác bị chặn."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "billing.read",
    forbiddenCopy: "Bạn không có quyền xem thông tin gói dịch vụ.",
    missing: ["Plan comparison cards", "Meter progress bar"],
    hoMoney: true,
    interactions: "View meters; upgrade CTA; no silent plan change.",
  },
  // Super Admin
  {
    slug: "tenants",
    routes: "/tenants, /tenants/:tenantId, /tenants/:tenantId/health",
    titleVi: "Super Admin — Tenant / Chi tiết / Health",
    app: "super-admin",
    permission: "ops.* / platform tenant admin keys from matrix",
    layout: `LIST: tenants table + status
DETAIL: metadata, plan, membership counts
HEALTH: dependency checks, error rates`,
    emptyCopy: "[DRAFT COPY] Không có tenant khớp bộ lọc.",
    happyNotes: "Platform-only app; never reuse tenant web-admin session blindly.",
    errors: [
      ["RESOURCE_NOT_FOUND", "Không tìm thấy tenant."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "ops / platform role",
    forbiddenCopy: "Bạn không có quyền Super Admin.",
    missing: ["DataTable", "Health panels"],
    interactions: "Search → open detail → health tab.",
  },
  {
    slug: "feature-flags",
    routes: "/feature-flags",
    titleVi: "Super Admin — Feature flags",
    app: "super-admin",
    permission: "ops / feature flag admin key",
    layout: `Global flags list + per-tenant override editor
Toggle + save with audit note`,
    emptyCopy: "[DRAFT COPY] Chưa có flag nào trong catalog.",
    happyNotes: "Overrides are TENANT_OVERRIDE class; global keys GLOBAL.",
    errors: [
      ["VALIDATION_FAILED", "Không lưu được flag."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "platform flag admin",
    forbiddenCopy: "Bạn không có quyền quản lý feature flags.",
    conflict: "Concurrent edit → reload.",
    missing: ["Flag editor table"],
    interactions: "Edit override → confirm Modal → Toast.",
  },
  {
    slug: "alerts",
    routes: "/alerts",
    titleVi: "Super Admin — Cảnh báo hệ thống",
    app: "super-admin",
    permission: "ops.alert.acknowledge",
    layout: `Alert list by severity StatusBadge
Acknowledge action (PermissionGate)
Detail drawer`,
    emptyCopy: "[DRAFT COPY] Không có cảnh báo đang mở.",
    happyNotes: "system_alerts are GLOBAL ops rows — not tenant-owned.",
    errors: [
      ["RESOURCE_NOT_FOUND", "Không tìm thấy cảnh báo."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "ops.alert.acknowledge",
    forbiddenCopy: "Bạn không có quyền xem/acknowledge cảnh báo.",
    missing: ["Alert severity list"],
    interactions: "Acknowledge → optimistic UI + rollback on error.",
  },
  {
    slug: "support-access",
    routes: "/support-access",
    titleVi: "Super Admin — Support access (break-glass)",
    app: "super-admin",
    permission: "ops.support_access / feature.ops_support_access entitlement on target",
    layout: `Grant form: tenant_id, reason, TTL
Active grants table + revoke
Strong warning copy — break-glass`,
    emptyCopy: "[DRAFT COPY] Không có grant đang hiệu lực.",
    happyNotes: "Always require reason; audit every grant/revoke. Time-bound only.",
    errors: [
      ["VALIDATION_FAILED", "Thiếu lý do hoặc TTL không hợp lệ."],
      ["INSUFFICIENT_PERMISSION", "Forbidden."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "support grant permission",
    forbiddenCopy: "Bạn không có quyền cấp support access.",
    fields: [
      ["Tenant", "Required", "UUID", "Chọn tenant."],
      ["Lý do", "Required", "min length per policy", "Nhập lý do break-glass."],
      ["TTL", "Required", "enum durations", "Chọn thời hạn."],
    ],
    missing: ["Grant form layout"],
    interactions: "Create grant Modal → confirm → list refresh. Revoke confirm.",
  },
  {
    slug: "ai-health",
    routes: "/ai-health",
    titleVi: "Super Admin — AI health",
    app: "super-admin",
    permission: "ops.ai.disable / ops health read",
    layout: `Platform AI health panels + kill switch (ops.ai.disable)
Recent eval run summary (GLOBAL eval tables)`,
    emptyCopy: "[DRAFT COPY] Chưa có tín hiệu health.",
    happyNotes: "Kill switch is ops-only; show confirmation Modal.",
    errors: [
      ["INTERNAL_ERROR", "Không tải được AI health."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "ops AI",
    forbiddenCopy: "Bạn không có quyền xem AI health.",
    missing: ["Health dashboard widgets"],
    interactions: "Disable AI → typed confirm → audit.",
  },
  {
    slug: "channel-health",
    routes: "/channel-health",
    titleVi: "Super Admin — Channel health (platform)",
    app: "super-admin",
    permission: "ops.channel.manage",
    layout: `Cross-tenant channel health rollup
Provider status table`,
    emptyCopy: "[DRAFT COPY] Không có tín hiệu kênh.",
    happyNotes: "Platform rollup — do not expose tenant PII in aggregates.",
    errors: [
      ["INTERNAL_ERROR", "Không tải được channel health."],
      ["RATE_LIMITED", "Thử lại sau."],
    ],
    forbiddenPerm: "ops.channel.manage",
    forbiddenCopy: "Bạn không có quyền xem channel health nền tảng.",
    missing: ["Rollup table"],
    interactions: "Filter provider → refresh.",
  },
  {
    slug: "audit-logs",
    routes: "/audit-logs",
    titleVi: "Super Admin — Audit logs",
    app: "super-admin",
    permission: "ops audit read",
    layout: `Cross-tenant audit search (platform)
Redacted fields only`,
    emptyCopy: "[DRAFT COPY] Không có sự kiện khớp bộ lọc.",
    happyNotes: "Nullable-tenant audit rows allowed for global actions.",
    errors: [
      ["RATE_LIMITED", "Thử lại sau."],
      ["INTERNAL_ERROR", "Không tải được audit."],
    ],
    forbiddenPerm: "ops audit",
    forbiddenCopy: "Bạn không có quyền xem audit nền tảng.",
    missing: ["Cross-tenant audit table"],
    interactions: "Search/filter → export if allowed.",
  },
];

function viewportBlock() {
  return `| Breakpoint (spec §7.3) | Layout behavior for this screen |
|---|---|
| \`1280×720\` minimum | App shell + primary content; collapse secondary panels. |
| \`1440×900\` standard | Full master-detail / filters + main as sketched. |
| \`1920×1080+\` large | Cap content max-width; do not stretch forms/tables edge-to-edge. |
| \`1024×720\` Windows compact | Collapse nav to icons/top tabs; stack detail under list. |`;
}

function renderSpec(s) {
  const errRows = s.errors
    .map(([c, copy]) => `| \`${c}\` | ${copy} |`)
    .join("\n");
  const missingRows = (s.missing || [])
    .map((m) => `| ${m} | **MISSING COMPONENT** | — |`)
    .join("\n");
  const fieldSection =
    s.fields && s.fields.length
      ? `## Field validation (forms only — delete this section if not a form screen)

| Field | Required/Optional | Validation rule | Error copy \`[DRAFT COPY]\` |
|---|---|---|---|
${s.fields.map(([a, b, c, d]) => `| ${a} | ${b} | ${c} | ${d} |`).join("\n")}
`
      : `## Field validation (forms only — delete this section if not a form screen)

_Not a primary form screen — validation lives on Modal actions where noted._
`;

  const ho = s.hoMoney
    ? `\n**Money / entitlement:** Follow backend \`docs/business/HO_DEFAULTS_v1.md\` (VAT 10% tax-inclusive; plans Free/Pro/Business; over-limit soft_warn → hard_block, no auto-upgrade).\n`
    : "";

  return `# Design spec: \`${s.routes.split(",")[0].trim()}\` — ${s.titleVi}

**Status:** ${READY}
**Version:** v1 — ${DATE}
**Author:** Design AI Agent
**Route:** \`${s.routes}\`
**Required permission(s):** ${s.permission}
**App:** ${s.app}
**Freeze:** enterprise W6 ${DATE}
${ho}
## Viewport and responsive behavior

${viewportBlock()}

## Layout — happy state

\`\`\`text
${s.layout}
\`\`\`

## States

### Happy

- ${s.happyNotes}
- Sample chrome: \`[DRAFT COPY]\` titles as in layout sketch.

### Empty

- ${UI.empty}: ${s.emptyCopy}

### Loading

- ${UI.skeleton} for primary regions; keep chrome visible. No full-page blank flash.

### Error

Map by **code** from \`contracts/errors/error-catalog.yaml\` (never by raw \`detail\`):

| Code (catalog) | Copy \`[DRAFT COPY]\` |
|---|---|
${errRows}
| \`INTERNAL_ERROR\` | Có lỗi hệ thống. Thử lại; nếu vẫn lỗi hãy báo hỗ trợ. |

Load failure: ${UI.error} + retry Button.

### Forbidden

- Missing **${s.forbiddenPerm}**: full-page ${UI.forbidden} via ${UI.gate}.
- Copy: \`[DRAFT COPY] ${s.forbiddenCopy}\`

### Conflict

- ${s.conflict || "RESOURCE_VERSION_MISMATCH / concurrent update → Toast + reload Button `[DRAFT COPY] Tải lại`."}

## Component / token mapping

| Screen element | \`packages/ui\` component | Key design tokens |
|---|---|---|
| Permission wrapper | ${UI.gate} | — |
| Feature flag (if any) | ${UI.flag} | — |
| Primary / secondary actions | ${UI.button} | \`color.action.primary\` / \`secondary\` |
| Fields | ${UI.form} + ${UI.input} | \`color.border.*\`, \`spacing.3\` |
| Status | ${UI.badge} | \`color.status.*\` |
| Empty | ${UI.empty} | \`color.text.secondary\` |
| Error | ${UI.error} | \`color.danger.*\` |
| Forbidden | ${UI.forbidden} | \`color.text.secondary\` |
| Offline | ${UI.offline} | \`color.warning.*\` |
| Loading | ${UI.skeleton} | \`color.background.muted\` |
| Confirm dialogs | ${UI.modal} | \`spacing.4\`, \`color.background.surface\` |
| Success/info | ${UI.toast} | \`color.success.*\` |
${missingRows}

## Accessibility notes (spec §7.4)

- Keyboard: tab order follows visual order; Modal traps focus and returns on close.
- Initial focus: first actionable control or page title heading.
- \`aria-live\`: Toast + async list refresh announcements.
- Tables (when built): header scope + sortable button names.

## Interaction notes

${s.interactions}

${fieldSection}
## Open gaps found while drafting

- Contract field-level detail: bind only to frozen OpenAPI after \`pnpm contracts:sync\` — do not invent properties.
- Missing \`packages/ui\` components flagged above — build before polish, or compose from existing primitives.
- Production legal/security copy acceptance remains a later Human Owner gate; freeze uses HO policy C READY-MOCK.
`;
}

function isW6Generated(abs) {
  if (!fs.existsSync(abs)) return false;
  return fs.readFileSync(abs, "utf8").includes("enterprise W6");
}

function main() {
  const force = process.argv.includes("--force-generated");
  fs.mkdirSync(specsDir, { recursive: true });

  let created = 0;
  let regenerated = 0;
  let skipped = 0;

  for (const s of SCREENS) {
    const abs = path.join(specsDir, `${s.slug}.md`);
    const exists = fs.existsSync(abs);
    if (!exists || (force && isW6Generated(abs))) {
      fs.writeFileSync(abs, renderSpec(s), "utf8");
      if (exists) regenerated++;
      else created++;
    } else {
      skipped++;
    }
  }

  // Inventory: existing F01 + new
  const existing = [
    ["/login", "public", "docs/ux/design-specs/login.md", "READY-MOCK"],
    ["/auth/callback", "public", "", "N/A"],
    ["/forgot-password", "public", "docs/ux/design-specs/forgot-password.md", "READY-MOCK"],
    ["/reset-password", "public", "docs/ux/design-specs/reset-password.md", "READY-MOCK"],
    ["/2fa", "public", "docs/ux/design-specs/mfa-challenge.md", "READY-MOCK"],
    ["/accept-invite", "public", "docs/ux/design-specs/accept-invite.md", "READY-MOCK"],
    ["/settings/tenant", "web-admin", "docs/ux/design-specs/settings-tenant.md", "READY-MOCK"],
    ["/settings/users", "web-admin", "docs/ux/design-specs/settings-users.md", "READY-MOCK"],
    ["/settings/roles", "web-admin", "docs/ux/design-specs/settings-roles.md", "READY-MOCK"],
    ["/settings/devices", "web-admin", "docs/ux/design-specs/settings-devices.md", "READY-MOCK"],
  ];

  const inv = [
    "route,app,design_spec_path,status,notes",
    ...existing.map(([r, a, p, st]) =>
      [r.trim(), a, p, st, st === "N/A" ? "no persistent UI" : "F01 HO approved 2026-07-21"].join(
        ",",
      ),
    ),
    ...SCREENS.map((s) =>
      [
        `"${s.routes}"`,
        s.app,
        `docs/ux/design-specs/${s.slug}.md`,
        "READY-MOCK",
        s.hoMoney ? "HO_DEFAULTS;W6 policy C" : "W6 policy C",
      ].join(","),
    ),
  ].join("\n");

  fs.mkdirSync(path.dirname(beInventory), { recursive: true });
  fs.writeFileSync(beInventory, inv + "\n", "utf8");

  updateHandoff();
  updateFeFreeze();

  const productRows = existing.filter((e) => e[3] !== "N/A").length + SCREENS.length;
  console.log(
    JSON.stringify(
      {
        screens_catalog: SCREENS.length,
        specs_created: created,
        specs_regenerated: regenerated,
        specs_skipped: skipped,
        inventory_product_screens: productRows,
        inventory_path: beInventory,
      },
      null,
      2,
    ),
  );
}

function updateHandoff() {
  let t = fs.readFileSync(handoffPath, "utf8");
  const replacements = [
    [
      "| `/onboarding` | Onboarding | — | Not started |",
      `| \`/onboarding\` | Onboarding | \`docs/ux/design-specs/onboarding.md\` | ${READY} |`,
    ],
    [
      "| `/dashboard` | Dashboard | — | Not started |",
      `| \`/dashboard\` | Dashboard | \`docs/ux/design-specs/dashboard.md\` | ${READY} |`,
    ],
    [
      "| `/inbox`, `/inbox/:conversationId` | Inbox / conversation detail | — | Not started |",
      `| \`/inbox\`, \`/inbox/:conversationId\` | Inbox / conversation detail | \`docs/ux/design-specs/inbox.md\` | ${READY} |`,
    ],
    [
      "| `/orders`, `/orders/:orderId` | Order list / detail | — | Not started |",
      `| \`/orders\`, \`/orders/:orderId\` | Order list / detail | \`docs/ux/design-specs/orders.md\` | ${READY} |`,
    ],
    [
      "| `/products`, `/products/import`, `/products/:productId` | Product list / import / detail | — | Not started |",
      `| \`/products\`, \`/products/import\`, \`/products/:productId\` | Product list / import / detail | \`docs/ux/design-specs/products.md\` | ${READY} |`,
    ],
    [
      "| `/inventory`, `/inventory/movements` | Inventory / movement log | — | Not started |",
      `| \`/inventory\`, \`/inventory/movements\` | Inventory / movement log | \`docs/ux/design-specs/inventory.md\` | ${READY} |`,
    ],
    [
      "| `/knowledge` | Knowledge base | — | Not started |",
      `| \`/knowledge\` | Knowledge base | \`docs/ux/design-specs/knowledge.md\` | ${READY} |`,
    ],
    [
      "| `/channels`, `/channels/:channelId/health` | Channels / channel health | — | Not started |",
      `| \`/channels\`, \`/channels/:channelId/health\` | Channels / channel health | \`docs/ux/design-specs/channels.md\` | ${READY} |`,
    ],
    [
      "| `/ai/settings`, `/ai/logs`, `/ai/blocked` | AI settings / logs / blocked outputs | — | Not started |",
      `| \`/ai/settings\`, \`/ai/logs\`, \`/ai/blocked\` | AI settings / logs / blocked outputs | \`docs/ux/design-specs/ai.md\` | ${READY} |`,
    ],
    [
      "| `/reports` | Reports | — | Not started |",
      `| \`/reports\` | Reports | \`docs/ux/design-specs/reports.md\` | ${READY} |`,
    ],
    [
      "| `/settings/audit-logs`, `/settings/notifications` | Settings — audit / notifications | — | Not started |",
      `| \`/settings/audit-logs\`, \`/settings/notifications\` | Settings — audit / notifications | \`docs/ux/design-specs/settings-audit-logs.md\` + \`settings-notifications.md\` | ${READY} |`,
    ],
    [
      "| `/billing` | Billing | — | Not started |",
      `| \`/billing\` | Billing | \`docs/ux/design-specs/billing.md\` | ${READY} |`,
    ],
    [
      "| `/tenants`, `/tenants/:tenantId`, `/tenants/:tenantId/health` | Tenant list / detail / health | — | Not started |",
      `| \`/tenants\`, \`/tenants/:tenantId\`, \`/tenants/:tenantId/health\` | Tenant list / detail / health | \`docs/ux/design-specs/tenants.md\` | ${READY} |`,
    ],
    [
      "| `/feature-flags` | Feature flags | — | Not started |",
      `| \`/feature-flags\` | Feature flags | \`docs/ux/design-specs/feature-flags.md\` | ${READY} |`,
    ],
    [
      "| `/alerts` | Alerts | — | Not started |",
      `| \`/alerts\` | Alerts | \`docs/ux/design-specs/alerts.md\` | ${READY} |`,
    ],
    [
      "| `/support-access` | Support access (break-glass) | — | Not started |",
      `| \`/support-access\` | Support access (break-glass) | \`docs/ux/design-specs/support-access.md\` | ${READY} |`,
    ],
    [
      "| `/ai-health`, `/channel-health` | AI health / channel health | — | Not started |",
      `| \`/ai-health\`, \`/channel-health\` | AI health / channel health | \`docs/ux/design-specs/ai-health.md\` + \`channel-health.md\` | ${READY} |`,
    ],
    [
      "| `/audit-logs` | Audit logs | — | Not started |",
      `| \`/audit-logs\` | Audit logs | \`docs/ux/design-specs/audit-logs.md\` | ${READY} |`,
    ],
  ];

  for (const [from, to] of replacements) {
    if (!t.includes(from)) {
      console.warn("handoff row not found:", from.slice(0, 60));
    } else {
      t = t.replace(from, to);
    }
  }

  if (!t.includes("enterprise freeze W6")) {
    t = t.replace(
      "## Process",
      `## Freeze note (W6 — ${DATE})

Non-F01 product screens marked **READY-MOCK** under Human Owner **policy C** (enterprise doc-freeze):
pack completeness for AI coding freeze. Production legal/security copy acceptance remains a later gate.
Auth/settings F01 rows retain Human Owner approval 2026-07-21.

## Process`,
    );
  }

  fs.writeFileSync(handoffPath, t, "utf8");
}

function updateFeFreeze() {
  const md = `# FE Freeze Checklist

**Status:** COMPLETE for W6 design-spec pack (${DATE}) — feature coding still blocked until backend FREEZE=PASS

- [x] All routes in \`docs/ux/handoff-checklist.md\` have design-specs (except N/A callback)
- [x] Non-F01 screens moved to READY-MOCK under HO defaults policy C (${DATE})
- [x] Billing/order copy reflects VAT 10% inclusive (\`backend/.../HO_DEFAULTS_v1.md\`)
- [ ] After final BE contract commit: \`pnpm contracts:sync\` + codegen clean (W7)
- [x] No feature implementation PRs until backend FREEZE=PASS

Inventory (canonical): \`backend/.../enterprise-freeze/inventory/fe_screen_inventory.csv\`
`;
  fs.writeFileSync(feFreezePath, md, "utf8");
}

main();
