import { Outlet, useLocation, useNavigate } from "react-router";
import {
  AppFrame,
  Sidebar,
  SidebarSection,
  SidebarNavItem,
  TopBar,
} from "@ai-sales/ui";
import { SUPER_ADMIN_NAV, SUPER_ADMIN_SECTIONS, isSuperNavActive } from "./navConfig";

export function SuperAdminShell() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <AppFrame
      sidebar={
        <Sidebar brand="AI Sales OS" brandHref="/" footer={<span>Super Admin</span>}>
          {SUPER_ADMIN_SECTIONS.map((section) => {
            const items = SUPER_ADMIN_NAV.filter((item) => item.section === section.id);
            return (
              <SidebarSection key={section.id} label={section.label}>
                {items.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    label={item.label}
                    href={item.path}
                    active={isSuperNavActive(location.pathname, item)}
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
      topbar={<TopBar title="Operations portal" meta={<span style={{ color: "var(--ai-sales-color-text-muted)", fontSize: "var(--ai-sales-font-size-sm)" }}>Super Admin</span>} />}
    >
      <Outlet />
    </AppFrame>
  );
}
