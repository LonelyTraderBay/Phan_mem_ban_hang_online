import styles from "./ErrorPanel.module.css";
import { Button } from "./Button";

export interface ErrorPanelProps {
  title: string;
  detail?: string;
  code?: string;
  requestId?: string;
  retryable?: boolean;
  onRetry?: () => void;
}

/**
 * Presentational only — receives already-mapped error fields as props (a `code`/`requestId`
 * pair, not a raw ProblemDetails object) rather than importing @ai-sales/api-client, which
 * packages/ui is not allowed to depend on (spec 4.3).
 */
export function ErrorPanel({ title, detail, code, requestId, retryable, onRetry }: ErrorPanelProps) {
  return (
    <div className={styles.panel} role="alert">
      <p className={styles.title}>{title}</p>
      {detail && <p className={styles.detail}>{detail}</p>}
      {(code || requestId) && (
        <p className={styles.meta}>
          {code && <>Mã lỗi: {code} </>}
          {requestId && <>· Mã yêu cầu: {requestId}</>}
        </p>
      )}
      {retryable && onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}
