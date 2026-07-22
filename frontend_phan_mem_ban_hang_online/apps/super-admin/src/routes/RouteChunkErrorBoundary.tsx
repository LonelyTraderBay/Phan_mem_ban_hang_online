import { useRouteError } from "react-router";
import { ErrorPanel } from "@ai-sales/ui";

export default function RouteChunkErrorBoundary() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : "Không thể tải trang.";
  return (
    <ErrorPanel
      title="Không thể tải trang"
      detail={message}
      retryable
      onRetry={() => window.location.reload()}
    />
  );
}
