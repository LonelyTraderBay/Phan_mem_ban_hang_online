import { useRouteError } from "react-router";
import { ErrorPanel } from "@ai-sales/ui";

// F00.5 critical state: "route chunk load fail" — e.g. a stale deployed build's JS chunk 404s.
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
