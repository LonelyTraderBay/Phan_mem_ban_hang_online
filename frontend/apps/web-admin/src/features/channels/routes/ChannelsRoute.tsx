import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
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
import { useAuth } from "../../../app/AuthProvider";

interface ChannelRow {
  id: string;
  tenant_id: string;
  provider: string;
  display_name: string | null;
  status: string;
  health: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  connecting: "warning",
  active: "success",
  degraded: "warning",
  disconnected: "danger",
  revoked: "danger",
};

const HEALTH_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  ok: "success",
  warn: "warning",
  error: "danger",
};

export default function ChannelsRoute() {
  const { channelId } = useParams<{ channelId?: string }>();
  const { pathname } = useLocation();
  const isHealthView = Boolean(channelId && pathname.endsWith("/health"));
  const allowed = usePermission("channel.read");
  const { authenticatedClient } = useAuth();
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthDetail, setHealthDetail] = useState<ChannelRow | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: ChannelRow[] }>("/channels/accounts", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    setChannels(result.data.data ?? []);
  }

  async function loadHealth(id: string) {
    setHealthLoading(true);
    setHealthError(null);
    const result = await authenticatedClient.request<{ data?: ChannelRow }>(`/channels/accounts/${id}`, {
      method: "GET",
    });
    setHealthLoading(false);
    if (!result.ok) {
      setHealthError(result.problem?.code ?? `HTTP_${result.status}`);
      setHealthDetail(null);
      return;
    }
    setHealthDetail(result.data.data ?? null);
  }

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed]);

  useEffect(() => {
    if (allowed && isHealthView && channelId) {
      void loadHealth(channelId);
    } else {
      setHealthDetail(null);
      setHealthError(null);
      setHealthLoading(false);
    }
  }, [allowed, channelId, isHealthView]);

  if (isHealthView) {
    const channel = healthDetail?.id === channelId ? healthDetail : channels?.find((c) => c.id === channelId);
    const healthDescription = channel
      ? (channel.display_name ?? channel.provider)
      : (channelId ?? "");
    return (
      <PermissionGate
        allowed={allowed}
        fallback={<ForbiddenState message="Bạn không có quyền xem sức khỏe kênh." />}
      >
        <ContentArea>
          <PageHeader
            title="Sức khỏe kênh"
            description={healthDescription}
            actions={
              <Link to="/channels">
                <Button variant="secondary">Quay lại danh sách</Button>
              </Link>
            }
          />
          {healthError ? (
            <ErrorPanel
              title="Không thể tải chi tiết sức khỏe kênh"
              code={healthError}
              retryable
              onRetry={() => {
                if (channelId) void loadHealth(channelId);
              }}
            />
          ) : null}
          {healthLoading && !channel ? (
            <Skeleton height={220} aria-label="Đang tải chi tiết sức khỏe" />
          ) : !channel ? (
            <EmptyState title="Không tìm thấy kênh." description="Kiểm tra lại kênh đã chọn hoặc quay lại danh sách." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
              <Card>
                <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Trạng thái kết nối</h2>
                <p style={{ margin: 0 }}>
                  <StatusBadge label={channel.status} tone={STATUS_TONE[channel.status] ?? "neutral"} />
                </p>
                <dl style={{ marginBottom: 0, fontSize: "0.875rem" }}>
                  <dt>Nhà cung cấp</dt>
                  <dd>{channel.provider}</dd>
                  <dt>Tên hiển thị</dt>
                  <dd>{channel.display_name ?? "—"}</dd>
                </dl>
              </Card>
              <Card>
                <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Tín hiệu sức khỏe</h2>
                <p style={{ margin: 0 }}>
                  <StatusBadge
                    label={channel.health ?? "Chưa có dữ liệu"}
                    tone={channel.health ? (HEALTH_TONE[channel.health] ?? "neutral") : "neutral"}
                  />
                </p>
                <dl style={{ marginBottom: 0, fontSize: "0.875rem" }}>
                  <dt>Phiên bản</dt>
                  <dd>v{channel.version}</dd>
                  <dt>Cập nhật gần nhất</dt>
                  <dd>{channel.updated_at}</dd>
                </dl>
              </Card>
            </div>
          )}
        </ContentArea>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem kênh bán hàng." />}
    >
      <ContentArea>
        <PageHeader title="Kênh bán hàng" description="Kết nối và theo dõi sức khỏe kênh." />
        {error ? (
          <ErrorPanel title="Không thể tải kênh" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={120} aria-label="Đang tải kênh" />
        ) : !channels || channels.length === 0 ? (
          <EmptyState title="Chưa có kênh nào được kết nối." />
        ) : (
          <DataList>
            {channels.map((ch) => (
              <DataListItem
                key={ch.id}
                primary={ch.display_name ?? ch.provider}
                secondary={`Nhà cung cấp: ${ch.provider}`}
                meta={
                  <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <StatusBadge label={ch.status} tone={STATUS_TONE[ch.status] ?? "neutral"} />
                    {ch.health ? (
                      <StatusBadge label={ch.health} tone={HEALTH_TONE[ch.health] ?? "neutral"} />
                    ) : null}
                    <Link to={`/channels/${ch.id}/health`}>
                      <Button variant="secondary">Sức khỏe</Button>
                    </Link>
                  </span>
                }
              />
            ))}
          </DataList>
        )}
      </ContentArea>
    </PermissionGate>
  );
}
