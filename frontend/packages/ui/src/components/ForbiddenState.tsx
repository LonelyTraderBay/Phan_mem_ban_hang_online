import styles from "./EmptyState.module.css";

export interface ForbiddenStateProps {
  message?: string;
}

// TODO(F01): richer forbidden illustration/copy once real auth/permission flows land.
export function ForbiddenState({ message = "Bạn không có quyền truy cập mục này." }: ForbiddenStateProps) {
  return (
    <div className={styles.empty} role="alert">
      <p className={styles.title}>{message}</p>
    </div>
  );
}
