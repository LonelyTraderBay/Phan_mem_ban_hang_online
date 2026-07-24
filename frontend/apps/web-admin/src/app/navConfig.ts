export interface AppRouteMeta {
  id: string;
  path: string;
  label: string;
  section: "main" | "commerce" | "ops" | "settings";
  match?: "exact" | "prefix";
  telemetryName: string;
}

export const NAV_SECTIONS: { id: AppRouteMeta["section"]; label: string }[] = [
  { id: "main", label: "Chính" },
  { id: "commerce", label: "Bán hàng" },
  { id: "ops", label: "Vận hành" },
  { id: "settings", label: "Cài đặt" },
];

/** Sidebar source of truth (spec §8.4). Permission gating stays on the server. */
export const WEB_ADMIN_NAV: readonly AppRouteMeta[] = [
  { id: "dashboard", path: "/", label: "Tổng quan", section: "main", match: "exact", telemetryName: "nav.dashboard" },
  { id: "inbox", path: "/inbox", label: "Hộp thư", section: "main", match: "prefix", telemetryName: "nav.inbox" },
  { id: "orders", path: "/orders", label: "Đơn hàng", section: "commerce", match: "prefix", telemetryName: "nav.orders" },
  { id: "products", path: "/products", label: "Sản phẩm", section: "commerce", match: "prefix", telemetryName: "nav.products" },
  { id: "customers", path: "/customers", label: "Khách hàng", section: "commerce", match: "prefix", telemetryName: "nav.customers" },
  { id: "inventory", path: "/inventory", label: "Tồn kho", section: "commerce", match: "prefix", telemetryName: "nav.inventory" },
  { id: "channels", path: "/channels", label: "Kênh", section: "ops", match: "prefix", telemetryName: "nav.channels" },
  { id: "knowledge", path: "/knowledge", label: "Tri thức", section: "ops", match: "prefix", telemetryName: "nav.knowledge" },
  { id: "ai", path: "/ai", label: "AI", section: "ops", match: "prefix", telemetryName: "nav.ai" },
  { id: "reports", path: "/reports", label: "Báo cáo", section: "ops", match: "prefix", telemetryName: "nav.reports" },
  { id: "billing", path: "/billing", label: "Thanh toán", section: "settings", match: "prefix", telemetryName: "nav.billing" },
  { id: "settings", path: "/settings", label: "Cài đặt", section: "settings", match: "prefix", telemetryName: "nav.settings" },
] as const;

export function isNavActive(pathname: string, item: AppRouteMeta): boolean {
  if (item.match === "exact") return pathname === item.path;
  if (item.path === "/") return pathname === "/";
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}
