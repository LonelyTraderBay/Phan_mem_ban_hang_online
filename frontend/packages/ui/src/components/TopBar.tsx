import type { ReactNode } from "react";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  title?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ title, meta, actions }: TopBarProps) {
  return (
    <div className={styles.root}>
      <div className={styles.left}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {meta}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
