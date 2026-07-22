import { useState } from "react";
import { Link } from "react-router";
import {
  Button,
  ErrorPanel,
  ForbiddenState,
  FormField,
  Input,
  PermissionGate,
  StatusBadge,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useAuth } from "../../../app/AuthProvider";

interface MergePreview {
  source_customer_id: string;
  target_customer_id: string;
  preview: { identities_merged: number; addresses_merged: number; tags_merged: number };
}

export default function CustomerMergeRoute() {
  const allowed = usePermission("customer.merge");
  const { authenticatedClient } = useAuth();
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runPreview() {
    setBusy(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: MergePreview }>("/customers/merge-preview", {
      method: "POST",
      body: { source_customer_id: sourceId, target_customer_id: targetId },
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem?.code ?? "VALIDATION_FAILED");
      return;
    }
    setPreview(result.data.data ?? null);
  }

  async function runMerge() {
    setBusy(true);
    setError(null);
    const result = await authenticatedClient.request("/customers/merge", {
      method: "POST",
      body: { source_customer_id: sourceId, target_customer_id: targetId },
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem?.code ?? "MERGE_FAILED");
      return;
    }
    setPreview(null);
    setSourceId("");
    setTargetId("");
  }

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền gộp khách hàng." />}
    >
      <main style={{ padding: 24, maxWidth: 720 }}>
        <p>
          <Link to="/customers">← Danh sách khách hàng</Link>
        </p>
        <h1>Gộp khách hàng</h1>
        <p style={{ color: "#5c6b7a" }}>Chọn khách nguồn (sẽ bị gộp) và khách đích (giữ lại).</p>
        {error ? <ErrorPanel title="Không thể gộp khách hàng" code={error} /> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          <FormField label="ID khách nguồn">
            <Input value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="cus_002" />
          </FormField>
          <FormField label="ID khách đích">
            <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="cus_001" />
          </FormField>
          <div style={{ display: "flex", gap: 8 }}>
            <Button disabled={busy || !sourceId || !targetId} onClick={() => void runPreview()}>
              Xem trước
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !preview}
              onClick={() => void runMerge()}
            >
              Xác nhận gộp
            </Button>
          </div>
          {preview ? (
            <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <p>
                Gộp <StatusBadge label={preview.source_customer_id} tone="neutral" /> →{" "}
                <StatusBadge label={preview.target_customer_id} tone="success" />
              </p>
              <ul>
                <li>Định danh: {preview.preview.identities_merged}</li>
                <li>Địa chỉ: {preview.preview.addresses_merged}</li>
                <li>Thẻ: {preview.preview.tags_merged}</li>
              </ul>
            </div>
          ) : null}
        </div>
      </main>
    </PermissionGate>
  );
}
