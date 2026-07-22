import type { ComponentProps } from "react";
import { PermissionGate, EmptyState, ErrorPanel, Skeleton, StatusBadge } from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useProductCatalog } from "../hooks/useProductCatalog";
import { CatalogRequestError } from "../api/products.queries";

/**
 * Proves the full F00 layer/import-boundary chain (F00.6 exit criterion): route → this
 * component → hook → domain mapper + query factory → generated API client → transport, while
 * also exercising @ai-sales/permissions (gate) and @ai-sales/ui (components).
 */
export function ProductCatalogScreen() {
  const allowed = usePermission("catalog.read");

  return (
    <PermissionGate allowed={allowed} fallback={<EmptyState title="Bạn không có quyền xem danh mục sản phẩm." />}>
      <ProductCatalogList />
    </PermissionGate>
  );
}

function ProductCatalogList() {
  const { data, isLoading, isError, error, refetch } = useProductCatalog();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={24} aria-label="Đang tải danh mục sản phẩm" />
        <Skeleton height={24} />
        <Skeleton height={24} />
      </div>
    );
  }

  if (isError) {
    const errorPanelProps: ComponentProps<typeof ErrorPanel> = {
      title: "Không thể tải danh mục sản phẩm",
      retryable: true,
      onRetry: () => void refetch(),
    };
    if (error instanceof Error) errorPanelProps.detail = error.message;
    if (error instanceof CatalogRequestError) errorPanelProps.code = `HTTP_${error.status}`;
    return <ErrorPanel {...errorPanelProps} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState title="Chưa có sản phẩm nào" />;
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((item) => (
        <li key={item.id} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{item.id}</span>
          {item.version !== undefined && <StatusBadge label={`v${item.version}`} tone="neutral" />}
        </li>
      ))}
    </ul>
  );
}
