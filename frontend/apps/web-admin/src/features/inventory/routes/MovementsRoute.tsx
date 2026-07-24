import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Button,
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

interface MovementRow {
  id: string;
  tenant_id: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export default function MovementsRoute() {
  const allowed = usePermission("inventory.read");
  const { authenticatedClient } = useAuth();
  const [rows, setRows] = useState<MovementRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: MovementRow[] }>("/inventory/movements", {
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
      fallback={<ForbiddenState message="Bạn không có quyền xem biến động kho." />}
    >
      <ContentArea>
        <PageHeader
          title="Biến động kho"
          description="Lịch sử nhập, xuất và điều chỉnh tồn."
          actions={
            <Link to="/inventory">
              <Button variant="secondary">Số dư</Button>
            </Link>
          }
        />
        {error ? (
          <ErrorPanel title="Không thể tải biến động" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={120} aria-label="Đang tải biến động" />
        ) : !rows || rows.length === 0 ? (
          <EmptyState title="Chưa có biến động nào." />
        ) : (
          <DataList>
            {rows.map((row) => (
              <DataListItem
                key={row.id}
                primary={row.id}
                secondary={`Trạng thái: ${row.status} · ${row.created_at}`}
                meta={<StatusBadge label={`v${row.version}`} tone="neutral" />}
              />
            ))}
          </DataList>
        )}
      </ContentArea>
    </PermissionGate>
  );
}
