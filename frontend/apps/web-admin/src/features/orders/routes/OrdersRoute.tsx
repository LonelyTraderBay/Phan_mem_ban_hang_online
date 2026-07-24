import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  Button,
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
import { money } from "@ai-sales/domain";
import { useAuth } from "../../../app/AuthProvider";

interface OrderRow {
  id: string;
  status?: string;
  currency?: string;
  total_minor?: number;
  version?: number;
  packing_slip_preview_url?: string;
}

function formatOrderTotal(minor: number | undefined, currency: string | undefined): string {
  if (minor === undefined) return "—";
  const m = money(minor, currency ?? "VND");
  return `${m.minorUnits.toLocaleString("vi-VN")} ${m.currency}`;
}

export function OrdersListRoute() {
  const allowed = usePermission("order.read");
  const { authenticatedClient } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: OrderRow[]; items?: OrderRow[] }>("/orders", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    const list =
      result.data.data ?? result.data.items ?? (Array.isArray(result.data) ? (result.data as OrderRow[]) : []);
    setOrders(list);
  }

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed]);

  return (
    <PermissionGate allowed={allowed} fallback={<ForbiddenState message="Bạn không có quyền xem đơn hàng." />}>
      <ContentArea>
        <PageHeader title="Đơn hàng" description="Theo dõi đơn, thanh toán và giao hàng." />
        {error ? (
          <ErrorPanel title="Không thể tải đơn hàng" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Card>
            <Skeleton height={120} aria-label="Đang tải đơn hàng" />
          </Card>
        ) : !orders || orders.length === 0 ? (
          <Card>
            <EmptyState title="Chưa có đơn hàng" description="Đơn mới sẽ xuất hiện khi tạo từ hội thoại hoặc API." />
          </Card>
        ) : (
          <DataList>
            {orders.map((o) => (
              <DataListItem
                key={o.id}
                primary={
                  <Link to={`/orders/${o.id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>
                    {o.id}
                  </Link>
                }
                secondary={formatOrderTotal(o.total_minor, o.currency)}
                meta={o.status ? <StatusBadge label={o.status} tone="neutral" /> : null}
              />
            ))}
          </DataList>
        )}
      </ContentArea>
    </PermissionGate>
  );
}

export function OrderDetailRoute() {
  const { orderId } = useParams<{ orderId: string }>();
  const allowed = usePermission("order.read");
  const { authenticatedClient } = useAuth();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: OrderRow }>(`/orders/${orderId}`, { method: "GET" });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    setOrder(result.data.data ?? null);
  }

  useEffect(() => {
    if (allowed && orderId) void load();
    else setLoading(false);
  }, [allowed, orderId]);

  return (
    <PermissionGate allowed={allowed} fallback={<ForbiddenState message="Bạn không có quyền xem đơn hàng." />}>
      <ContentArea>
        <PageHeader
          title="Chi tiết đơn hàng"
          description={orderId ?? ""}
          actions={
            <Link to="/orders">
              <Button variant="secondary">Quay lại</Button>
            </Link>
          }
        />
        {error ? (
          <ErrorPanel title="Không thể tải đơn" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={160} aria-label="Đang tải đơn" />
        ) : !order ? (
          <Card>
            <EmptyState title="Không tìm thấy đơn hàng." />
          </Card>
        ) : (
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {order.status ? <StatusBadge label={order.status} tone="neutral" /> : null}
              <p style={{ margin: 0 }}>Tổng: {formatOrderTotal(order.total_minor, order.currency)}</p>
              {order.version !== undefined ? <StatusBadge label={`v${order.version}`} tone="neutral" /> : null}
              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    // READY-MOCK: signed URL from packing-slip job when live.
                    const url =
                      order.packing_slip_preview_url ??
                      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                >
                  Xem packing slip
                </Button>
              </div>
            </div>
          </Card>
        )}
      </ContentArea>
    </PermissionGate>
  );
}

export default function OrdersRoute() {
  const { orderId } = useParams<{ orderId?: string }>();
  return orderId ? <OrderDetailRoute /> : <OrdersListRoute />;
}
