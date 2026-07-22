import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Button,
  EmptyState,
  ErrorPanel,
  ForbiddenState,
  PermissionGate,
  Skeleton,
  StatusBadge,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useAuth } from "../../../app/AuthProvider";

interface CustomerRow {
  id: string;
  display_name: string;
  email?: string;
  phone?: string;
  version: number;
}

export default function CustomersListRoute() {
  const allowed = usePermission("customer.read");
  const canMerge = usePermission("customer.merge");
  const { authenticatedClient } = useAuth();
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: CustomerRow[]; items?: CustomerRow[] }>("/customers", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    const list =
      result.data.data ?? result.data.items ?? (Array.isArray(result.data) ? (result.data as CustomerRow[]) : []);
    setCustomers(list);
  }

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed]);

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem danh sách khách hàng." />}
    >
      <main style={{ padding: 24, maxWidth: 960 }}>
        <h1>Khách hàng</h1>
        <p style={{ color: "#5c6b7a" }}>Danh sách khách hàng trong tenant.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <PermissionGate allowed={canMerge} fallback={null}>
            <Link to="/customers/merge">
              <Button variant="secondary">Gộp khách hàng</Button>
            </Link>
          </PermissionGate>
        </div>
        {error ? (
          <ErrorPanel title="Không thể tải khách hàng" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={120} aria-label="Đang tải khách hàng" />
        ) : !customers || customers.length === 0 ? (
          <EmptyState title="Chưa có khách hàng nào." />
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {customers.map((c) => (
              <li key={c.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #e5e7eb" }}>
                <Link to={`/customers/${c.id}`} style={{ flex: 1, color: "inherit", textDecoration: "none" }}>
                  {c.display_name}
                </Link>
                <span>{c.email ?? "—"}</span>
                <span>{c.phone ?? "—"}</span>
                <StatusBadge label={`v${c.version}`} tone="neutral" />
              </li>
            ))}
          </ul>
        )}
      </main>
    </PermissionGate>
  );
}
