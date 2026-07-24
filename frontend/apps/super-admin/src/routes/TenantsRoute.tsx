import { useEffect, useState } from "react";
import {
  Card,
  ContentArea,
  DataList,
  DataListItem,
  EmptyState,
  ErrorPanel,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "@ai-sales/ui";

interface TenantRow {
  id: string;
  status: string;
  tenant_id: string | null;
  created_at: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; rows: TenantRow[] }
  | { kind: "empty" }
  | { kind: "unauthorized"; status: number }
  | { kind: "forbidden"; status: number }
  | { kind: "error"; code: string };

function parseTenantRows(payload: unknown): TenantRow[] | null {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    return null;
  }

  const rows = (payload as { data: unknown[] }).data;
  if (
    !rows.every((row) => {
      if (!row || typeof row !== "object") return false;
      const value = row as Record<string, unknown>;
      return (
        typeof value.id === "string" &&
        typeof value.status === "string" &&
        typeof value.created_at === "string" &&
        (value.tenant_id === undefined || value.tenant_id === null || typeof value.tenant_id === "string")
      );
    })
  ) {
    return null;
  }

  return rows as TenantRow[];
}

/** Thin v1 wiring for OperationsResource; session stays isolated (ADR-FE-004). */
export default function TenantsRoute() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  async function load() {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/v1/super-admin/tenants", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        setState({ kind: "unauthorized", status: 401 });
        return;
      }
      if (response.status === 403) {
        setState({ kind: "forbidden", status: 403 });
        return;
      }
      if (!response.ok) {
        setState({ kind: "error", code: `HTTP_${response.status}` });
        return;
      }
      const rows = parseTenantRows((await response.json()) as unknown);
      if (!rows) {
        setState({ kind: "error", code: "INVALID_TENANT_RESPONSE" });
        return;
      }
      setState(rows.length === 0 ? { kind: "empty" } : { kind: "ok", rows });
    } catch {
      setState({ kind: "error", code: "NETWORK_ERROR" });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <ContentArea>
      <PageHeader
        title="Tenants"
        description="Danh sách tenant, chi tiết và health. Session ops tách ADR-FE-004 — không dùng cookie web-admin."
      />
      <Card>
        {state.kind === "loading" ? (
          <Skeleton height={120} aria-label="Đang tải tenant" />
        ) : state.kind === "unauthorized" ? (
          <EmptyState
            title="Cần phiên Super Admin"
            description="GET /api/v1/super-admin/tenants yêu cầu session ops riêng (ADR-FE-004). Đăng nhập ops trước khi xem tenant."
          />
        ) : state.kind === "forbidden" ? (
          <EmptyState
            title="Không đủ quyền ops"
            description="Phiên hiện tại không có permission Operations cho danh sách tenant."
          />
        ) : state.kind === "error" ? (
          <ErrorPanel
            title="Không thể tải danh sách tenant"
            code={state.code}
            retryable
            onRetry={() => void load()}
          />
        ) : state.kind === "empty" ? (
          <EmptyState title="Chưa có tenant" />
        ) : (
          <DataList>
            {state.rows.map((tenant) => (
              <DataListItem
                key={tenant.id}
                primary={tenant.tenant_id ?? tenant.id}
                secondary={tenant.tenant_id ? tenant.id : undefined}
                meta={<StatusBadge label={tenant.status} tone="neutral" />}
              />
            ))}
          </DataList>
        )}
      </Card>
    </ContentArea>
  );
}
