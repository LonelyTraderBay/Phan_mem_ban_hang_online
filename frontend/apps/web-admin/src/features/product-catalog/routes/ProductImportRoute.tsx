import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Button,
  ErrorPanel,
  ForbiddenState,
  FormField,
  Input,
  PermissionGate,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useAuth } from "../../../app/AuthProvider";

interface ImportJob {
  id: string;
  status: string;
  file_name: string;
}

export default function ProductImportRoute() {
  const allowed = usePermission("catalog.import");
  const { authenticatedClient } = useAuth();
  const navigate = useNavigate();
  const [fileName, setFileName] = useState("san-pham.csv");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createJob() {
    setBusy(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: ImportJob }>("/imports", {
      method: "POST",
      body: { file_name: fileName },
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem?.code ?? "IMPORT_CREATE_FAILED");
      return;
    }
    const jobId = result.data.data?.id;
    if (jobId) navigate(`/products/import/${jobId}`);
  }

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền nhập sản phẩm." />}
    >
      <main style={{ padding: 24, maxWidth: 720 }}>
        <p>
          <Link to="/products">← Danh mục sản phẩm</Link>
        </p>
        <h1>Nhập sản phẩm</h1>
        <p style={{ color: "#5c6b7a" }}>Tạo job nhập từ file CSV (READY-MOCK).</p>
        {error ? <ErrorPanel title="Không thể tạo job nhập" code={error} /> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          <FormField label="Tên file">
            <Input value={fileName} onChange={(e) => setFileName(e.target.value)} />
          </FormField>
          <Button disabled={busy || !fileName} onClick={() => void createJob()}>
            Tạo job nhập
          </Button>
        </div>
      </main>
    </PermissionGate>
  );
}
