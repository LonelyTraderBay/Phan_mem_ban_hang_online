import type { MouseEvent, ReactNode } from "react";
import clsx from "clsx";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
  brand?: string;
  brandHref?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Sidebar({ brand = "AI Sales OS", brandHref = "/", children, footer }: SidebarProps) {
  return (
    <div className={styles.root}>
      <a className={styles.brand} href={brandHref}>
        {brand}
      </a>
      <nav className={styles.nav} aria-label="Điều hướng chính">
        {children}
      </nav>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}

export interface SidebarSectionProps {
  label?: string;
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  return (
    <div className={styles.section}>
      {label ? <p className={styles.sectionLabel}>{label}</p> : null}
      <ul className={styles.list}>{children}</ul>
    </div>
  );
}

export interface SidebarNavItemProps {
  label: string;
  href: string;
  active?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function SidebarNavItem({ label, href, active, onClick }: SidebarNavItemProps) {
  return (
    <li>
      <a
        className={clsx(styles.item, active && styles.itemActive)}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
      >
        {label}
      </a>
    </li>
  );
}
