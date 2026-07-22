import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  "aria-label"?: string;
}

export function Skeleton({ width = "100%", height = "1em", ...rest }: SkeletonProps) {
  return <div className={styles.skeleton} style={{ width, height }} role="status" {...rest} />;
}
