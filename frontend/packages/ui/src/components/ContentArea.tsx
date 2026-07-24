import type { ReactNode } from "react";
import styles from "./ContentArea.module.css";

export interface ContentAreaProps {
  children: ReactNode;
}

export function ContentArea({ children }: ContentAreaProps) {
  return <div className={styles.root}>{children}</div>;
}
