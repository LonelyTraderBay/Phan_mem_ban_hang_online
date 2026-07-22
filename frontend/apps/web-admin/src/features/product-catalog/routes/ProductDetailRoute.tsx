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

interface ProductDetail {
  id: string;
  name: string;
  sku?: string;
  version: number;
}

export default function ProductDetailRoute() {
  const { productId } = useParams<{ productId: string }>();
  const canRead = usePermission("catalog.read");
  const canWrite = usePermission("catalog.write");
  const { authenticatedClient } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!productId) return;
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: ProductDetail }>(`/products/${productId}`, {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    const data = result.data.data ?? null;
    setProduct(data);
    if (data) setName(data.name);
  }

  useEffect(() => {
    if (canRead && productId) void load();
    else setLoading(false);
  }, [canRead, productId]);

  async function save() {
    if (!product) return;
    setBusy(true);
    const result = await authenticatedClient.request(`/products/${product.id}`, {
      method: "PATCH",
      body: { name },
      ifMatch: String(product.version),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem?.code ?? "RESOURCE_VERSION_MISMATCH");
      return;
    }
    void load();
  }

  return (
    <PermissionGate
      allowed={canRead}
      fallback={<ForbiddenState message="Bạn không có quyền xem sản phẩm." />}
    >
      <main style={{ padding: 24, maxWidth: 720 }}>
        <p>
          <Link to="/products">← Danh mục sản phẩm</Link>
        </p>
        <h1>Chi tiết sản phẩm</h1>
        {error ? (
          <ErrorPanel title="Không thể tải sản phẩm" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={160} aria-label="Đang tải sản phẩm" />
        ) : !product ? (
          <EmptyState title="Không tìm thấy sản phẩm." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <StatusBadge label={`v${product.version}`} tone="neutral" />
            <FormField label="Tên sản phẩm">
              <Input value={name} onChange={(e) => setName(e.target.value)} readOnly={!canWrite} />
            </FormField>
            <FormField label="SKU">
              <Input value={product.sku ?? ""} readOnly />
            </FormField>
            <PermissionGate allowed={canWrite} fallback={null}>
              <Button disabled={busy || name === product.name} onClick={() => void save()}>
                Lưu thay đổi
              </Button>
            </PermissionGate>
          </div>
        )}
      </main>
    </PermissionGate>
  );
}
