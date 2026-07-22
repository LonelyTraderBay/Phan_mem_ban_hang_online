import clsx from "clsx";
import styles from "./StatusBadge.module.css";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface StatusBadgeProps {
  /** Text is mandatory — color alone must never be the only signal (spec 7.1). */
  label: string;
  tone?: StatusTone;
}

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={clsx(styles.badge, styles[tone])}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
