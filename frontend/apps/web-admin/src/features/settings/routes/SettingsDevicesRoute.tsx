import { useEffect, useState } from "react";
import { Button, EmptyState, ErrorPanel, Skeleton, StatusBadge } from "@ai-sales/ui";
import { useAuth } from "../../../app/AuthProvider";

interface DeviceRow {
  id: string;
  name: string;
  current: boolean;
  last_seen_at?: string;
}

export default function SettingsDevicesRoute() {
  const { authenticatedClient, logout, session } = useAuth();
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: DeviceRow[]; items?: DeviceRow[] }>("/devices", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    const list = result.data.data ?? result.data.items ?? (Array.isArray(result.data) ? (result.data as DeviceRow[]) : []);
    setDevices(list);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(deviceId: string, isCurrent: boolean) {
    const result = await authenticatedClient.request(`/devices/${deviceId}/revoke`, {
      method: "POST",
      body: {},
    });
    if (!result.ok) {
      setError(result.problem?.code ?? "DEVICE_ALREADY_REVOKED");
      return;
    }
    if (isCurrent) {
      await logout();
      window.location.assign("/login");
      return;
    }
    void load();
  }

  return (
    <main style={{ padding: 24, maxWidth: 960 }}>
      <h1>Thiết bị & phiên</h1>
      <p style={{ color: "#5c6b7a" }}>
        Quản lý phiên đăng nhập. Thiết bị hiện tại: {session?.device.id ?? "—"}.
      </p>
      {error ? <ErrorPanel title="Không thể tải thiết bị" code={error} retryable onRetry={() => void load()} /> : null}
      {loading ? (
        <Skeleton height={120} aria-label="Đang tải thiết bị" />
      ) : !devices || devices.length === 0 ? (
        <EmptyState title="Không có thiết bị nào." />
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {devices.map((d) => (
            <li key={d.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #e5e7eb" }}>
              <span style={{ flex: 1 }}>{d.name || d.id}</span>
              {d.current ? <StatusBadge label="Hiện tại" tone="success" /> : null}
              <Button variant="danger" onClick={() => void revoke(d.id, d.current)}>
                Thu hồi
              </Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
