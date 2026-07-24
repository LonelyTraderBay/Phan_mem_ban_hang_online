import { Outlet, useLocation, useNavigate } from "react-router";
import {
  AppFrame,
  Sidebar,
  SidebarSection,
  SidebarNavItem,
  TopBar,
  Button,
} from "@ai-sales/ui";
import { useAuth } from "./AuthProvider";
import { NAV_SECTIONS, WEB_ADMIN_NAV, isNavActive } from "./navConfig";

export function AuthenticatedShell() {
  const { session, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const tenantName = session?.tenant?.name ?? "Không gian làm việc";
  const userLabel = session?.user?.display_name ?? "Người dùng";

  return (
    <AppFrame
      sidebar={
        <Sidebar
          brand="AI Sales OS"
          brandHref="/"
          footer={<span>Web Admin</span>}
        >
          {NAV_SECTIONS.map((section) => {
            const items = WEB_ADMIN_NAV.filter((item) => item.section === section.id);
            if (items.length === 0) return null;
            return (
              <SidebarSection key={section.id} label={section.label}>
                {items.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    label={item.label}
                    href={item.path}
                    active={isNavActive(location.pathname, item)}
                    onClick={(event) => {
                      event.preventDefault();
                      void navigate(item.path);
                    }}
                  />
                ))}
              </SidebarSection>
            );
          })}
        </Sidebar>
      }
      topbar={
        <TopBar
          title={tenantName}
          meta={<span style={{ color: "var(--ai-sales-color-text-muted)", fontSize: "var(--ai-sales-font-size-sm)" }}>{userLabel}</span>}
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                void logout();
              }}
            >
              Đăng xuất
            </Button>
          }
        />
      }
    >
      <Outlet />
    </AppFrame>
  );
}
