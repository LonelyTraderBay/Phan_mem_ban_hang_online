import type { ReactNode } from "react";
import styles from "./AppFrame.module.css";

export interface AppFrameProps {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
}

export function AppFrame({ sidebar, topbar, children }: AppFrameProps) {
  return (
    <div className={styles.frame}>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <div className={styles.main}>
        <header className={styles.topbar}>{topbar}</header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
