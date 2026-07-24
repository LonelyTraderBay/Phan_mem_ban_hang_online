import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";

export interface AuthLayoutProps {
  brand?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({
  brand = "AI Sales OS",
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <p className={styles.brand}>{brand}</p>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </main>
  );
}
