import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import {
  Card,
  ContentArea,
  DataList,
  DataListItem,
  EmptyState,
  ErrorPanel,
  ForbiddenState,
  PageHeader,
  PermissionGate,
  Skeleton,
  StatusBadge,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useAuth } from "../../../app/AuthProvider";

interface AiLogRow {
  id: string;
  summary?: string;
  status?: string;
}

export default function AiRoute() {
  const location = useLocation();
  const canConfigure = usePermission("ai.configure");
  const canReview = usePermission("ai.review");
  const canUse = usePermission("ai.use");
  const allowed = canConfigure || canReview || canUse;
  const { authenticatedClient } = useAuth();
  const [logs, setLogs] = useState<AiLogRow[] | null>(null);
  const [blocked, setBlocked] = useState<AiLogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const section = location.pathname.includes("/blocked")
    ? "blocked"
    : location.pathname.includes("/logs")
      ? "logs"
      : "settings";

  async function load() {
    setLoading(true);
    setError(null);
    const [logsRes, blockedRes] = await Promise.all([
      authenticatedClient.request<{ data?: AiLogRow[] }>("/ai/logs", { method: "GET" }),
      authenticatedClient.request<{ data?: AiLogRow[] }>("/ai/blocked-outputs", { method: "GET" }),
    ]);
    setLoading(false);
    if (!logsRes.ok && !blockedRes.ok) {
      setError(logsRes.problem?.code ?? `HTTP_${logsRes.status}`);
      return;
    }
    setLogs(logsRes.ok ? (logsRes.data.data ?? []) : []);
    setBlocked(blockedRes.ok ? (blockedRes.data.data ?? []) : []);
  }

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed]);

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem cấu hình AI." />}
    >
      <ContentArea>
        <PageHeader
          title="AI Copilot"
          description="Cấu hình, nhật ký và đầu ra bị chặn. Feature flags fail-closed."
        />
        {error ? (
          <ErrorPanel title="Không thể tải dữ liệu AI" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Card>
            <Skeleton height={120} aria-label="Đang tải AI" />
          </Card>
        ) : section === "blocked" ? (
          <Card>
            {!blocked || blocked.length === 0 ? (
              <EmptyState title="Không có đầu ra bị chặn" />
            ) : (
              <DataList>
                {blocked.map((row) => (
                  <DataListItem
                    key={row.id}
                    primary={row.summary ?? row.id}
                    meta={row.status ? <StatusBadge label={row.status} tone="warning" /> : null}
                  />
                ))}
              </DataList>
            )}
          </Card>
        ) : section === "logs" ? (
          <Card>
            {!logs || logs.length === 0 ? (
              <EmptyState title="Chưa có nhật ký AI" />
            ) : (
              <DataList>
                {logs.map((row) => (
                  <DataListItem key={row.id} primary={row.summary ?? row.id} secondary={row.id} />
                ))}
              </DataList>
            )}
          </Card>
        ) : (
          <Card>
            <EmptyState
              title="Cài đặt AI"
              description="Prompt versions, evaluate, enable/disable theo contract /ai/*. Dùng /ai/logs và /ai/blocked để xem vận hành."
            />
          </Card>
        )}
      </ContentArea>
    </PermissionGate>
  );
}
