import styles from "./Divider.module.css";

export interface DividerProps {
  label?: string;
}

export function Divider({ label }: DividerProps) {
  if (!label) return <hr className={styles.line} />;
  return (
    <div className={styles.labeled} role="separator">
      <span className={styles.rule} />
      <span className={styles.label}>{label}</span>
      <span className={styles.rule} />
    </div>
  );
}
