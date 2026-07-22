import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  Button,
  EmptyState,
  ErrorPanel,
  ForbiddenState,
  FormField,
  Input,
  PermissionGate,
  Skeleton,
  StatusBadge,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useAuth } from "../../../app/AuthProvider";

interface CustomerDetail {
  id: string;
  display_name: string;
  email?: string;
  phone?: string;
  version: number;
}

export default function CustomerDetailRoute() {
  const { customerId } = useParams<{ customerId: string }>();
  const allowed = usePermission("customer.read");
  const { authenticatedClient } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: CustomerDetail }>(`/customers/${customerId}`, {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    setCustomer(result.data.data ?? null);
  }

  useEffect(() => {
    if (allowed && customerId) void load();
    else setLoading(false);
  }, [allowed, customerId]);

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem chi tiết khách hàng." />}
    >
      <main style={{ padding: 24, maxWidth: 720 }}>
        <p>
          <Link to="/customers">← Danh sách khách hàng</Link>
        </p>
        <h1>Chi tiết khách hàng</h1>
        {error ? (
          <ErrorPanel title="Không thể tải khách hàng" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={160} aria-label="Đang tải chi tiết khách hàng" />
        ) : !customer ? (
          <EmptyState title="Không tìm thấy khách hàng." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <StatusBadge label={`v${customer.version}`} tone="neutral" />
            <FormField label="Tên hiển thị">
              <Input value={customer.display_name} readOnly />
            </FormField>
            <FormField label="Email">
              <Input value={customer.email ?? ""} readOnly />
            </FormField>
            <FormField label="Số điện thoại">
              <Input value={customer.phone ?? ""} readOnly />
            </FormField>
            <Button variant="secondary" onClick={() => void load()}>
              Tải lại
            </Button>
          </div>
        )}
      </main>
    </PermissionGate>
  );
}
