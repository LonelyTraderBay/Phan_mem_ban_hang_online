import type { ReactNode, TableHTMLAttributes } from "react";
import styles from "./TableChrome.module.css";

export interface TableChromeProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export function TableChrome({ children, className, ...rest }: TableChromeProps) {
  return (
    <div className={styles.wrap}>
      <table className={`${styles.table}${className ? ` ${className}` : ""}`} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function DataList({ children }: { children: ReactNode }) {
  return <ul className={styles.dataList}>{children}</ul>;
}

export function DataListItem({
  primary,
  secondary,
  meta,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <li className={styles.dataItem}>
      <div className={styles.dataText}>
        <div className={styles.dataPrimary}>{primary}</div>
        {secondary ? <div className={styles.dataSecondary}>{secondary}</div> : null}
      </div>
      {meta ? <div className={styles.dataMeta}>{meta}</div> : null}
    </li>
  );
}
