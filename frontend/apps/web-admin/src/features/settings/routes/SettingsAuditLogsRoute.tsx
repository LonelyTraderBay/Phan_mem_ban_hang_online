import { useEffect, useState } from "react";
import {
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

interface AuditRow {
  id: string;
  status: string;
  created_at: string;
  download_url?: string | null;
}

export default function SettingsAuditLogsRoute() {
  const allowed = usePermission("audit.read");
  const { authenticatedClient } = useAuth();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: AuditRow[] }>("/audit-logs", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    setRows(result.data.data ?? []);
  }

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed]);

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem nhật ký kiểm toán." />}
    >
      <ContentArea>
        <PageHeader
          title="Nhật ký kiểm toán"
          description="Theo dõi hành động nhạy cảm trong không gian (dữ liệu đã được ẩn/redact từ máy chủ)."
        />
        {error ? (
          <ErrorPanel title="Không tải được nhật ký" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={120} aria-label="Đang tải nhật ký kiểm toán" />
        ) : !rows || rows.length === 0 ? (
          <EmptyState title="Chưa có sự kiện kiểm toán trong bộ lọc hiện tại." />
        ) : (
          <DataList>
            {rows.map((row) => (
              <DataListItem
                key={row.id}
                primary={row.id}
                secondary={new Date(row.created_at).toLocaleString("vi-VN")}
                meta={<StatusBadge label={row.status} tone="neutral" />}
              />
            ))}
          </DataList>
        )}
      </ContentArea>
    </PermissionGate>
  );
}
