export interface SuperAdminNavItem {
  id: string;
  path: string;
  label: string;
  section: "ops" | "control";
  match?: "exact" | "prefix";
}

export const SUPER_ADMIN_SECTIONS = [
  { id: "ops" as const, label: "Vận hành" },
  { id: "control" as const, label: "Điều khiển" },
];

export const SUPER_ADMIN_NAV: readonly SuperAdminNavItem[] = [
  { id: "home", path: "/", label: "Tổng quan", section: "ops", match: "exact" },
  { id: "tenants", path: "/tenants", label: "Tenants", section: "ops", match: "prefix" },
  { id: "alerts", path: "/alerts", label: "Cảnh báo", section: "ops", match: "prefix" },
  { id: "channel-health", path: "/channel-health", label: "Sức khỏe kênh", section: "ops", match: "prefix" },
  { id: "ai-health", path: "/ai-health", label: "Sức khỏe AI", section: "ops", match: "prefix" },
  { id: "feature-flags", path: "/feature-flags", label: "Feature flags", section: "control", match: "prefix" },
  { id: "support-access", path: "/support-access", label: "Support access", section: "control", match: "prefix" },
  { id: "audit-logs", path: "/audit-logs", label: "Audit logs", section: "control", match: "prefix" },
];

export function isSuperNavActive(pathname: string, item: SuperAdminNavItem): boolean {
  if (item.match === "exact") return pathname === item.path;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}
