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

interface InventoryRow {
  id: string;
  tenant_id: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export default function InventoryRoute() {
  const allowed = usePermission("inventory.read");
  const { authenticatedClient } = useAuth();
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: InventoryRow[] }>("/inventory/balances", {
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
      fallback={<ForbiddenState message="Bạn không có quyền xem tồn kho." />}
    >
      <ContentArea>
        <PageHeader
          title="Tồn kho"
          description="Số dư tồn kho theo kho hàng."
          actions={
            <Link to="/inventory/movements">
              <Button variant="secondary">Biến động</Button>
            </Link>
          }
        />
        {error ? (
          <ErrorPanel title="Không thể tải tồn kho" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={120} aria-label="Đang tải tồn kho" />
        ) : !rows || rows.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu tồn kho." />
        ) : (
          <DataList>
            {rows.map((row) => (
              <DataListItem
                key={row.id}
                primary={row.id}
                secondary={`Trạng thái: ${row.status}`}
                meta={<StatusBadge label={`v${row.version}`} tone="neutral" />}
              />
            ))}
          </DataList>
        )}
      </ContentArea>
    </PermissionGate>
  );
}
