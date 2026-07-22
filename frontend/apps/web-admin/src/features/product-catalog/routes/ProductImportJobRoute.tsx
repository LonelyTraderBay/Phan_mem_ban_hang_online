import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
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

interface ImportJob {
  id: string;
  status: string;
  file_name: string;
  row_count: number;
  version: number;
}

interface PreviewRow {
  row: number;
  sku: string;
  name: string;
  valid: boolean;
}

export default function ProductImportJobRoute() {
  const { jobId } = useParams<{ jobId: string }>();
  const allowed = usePermission("catalog.import");
  const { authenticatedClient } = useAuth();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    const [jobResult, previewResult, errorsResult] = await Promise.all([
      authenticatedClient.request<{ data?: ImportJob }>(`/imports/${jobId}`, { method: "GET" }),
      authenticatedClient.request<{ data?: { rows?: PreviewRow[] } }>(`/imports/${jobId}/preview`, { method: "GET" }),
      authenticatedClient.request<{ data?: Array<{ row: number; field: string; message: string }> }>(
        `/imports/${jobId}/errors`,
        { method: "GET" },
      ),
    ]);
    setLoading(false);
    if (!jobResult.ok) {
      setError(jobResult.problem?.code ?? `HTTP_${jobResult.status}`);
      return;
    }
    setJob(jobResult.data.data ?? null);
    setPreviewRows(previewResult.ok ? (previewResult.data.data?.rows ?? []) : []);
    setErrors(errorsResult.ok ? (errorsResult.data.data ?? []) : []);
  }

  useEffect(() => {
    if (allowed && jobId) void load();
    else setLoading(false);
  }, [allowed, jobId]);

  async function cancelJob() {
    if (!jobId) return;
    setBusy(true);
    const result = await authenticatedClient.request(`/imports/${jobId}/cancel`, {
      method: "POST",
      body: {},
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem?.code ?? "IMPORT_CANCEL_FAILED");
      return;
    }
    void load();
  }

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem job nhập sản phẩm." />}
    >
      <main style={{ padding: 24, maxWidth: 960 }}>
        <p>
          <Link to="/products/import">← Tạo job nhập</Link>
        </p>
        <h1>Job nhập sản phẩm</h1>
        {error ? (
          <ErrorPanel title="Không thể tải job nhập" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={200} aria-label="Đang tải job nhập" />
        ) : !job ? (
          <EmptyState title="Không tìm thấy job nhập." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <p>
                <strong>File:</strong> {job.file_name}
              </p>
              <p>
                <StatusBadge label={job.status} tone="neutral" />{" "}
                <StatusBadge label={`${job.row_count} dòng`} tone="neutral" />
              </p>
              {job.status !== "cancelled" && job.status !== "confirmed" ? (
                <Button variant="danger" disabled={busy} onClick={() => void cancelJob()}>
                  Hủy job
                </Button>
              ) : null}
            </div>
            <section>
              <h2>Xem trước</h2>
              {previewRows.length === 0 ? (
                <EmptyState title="Chưa có dữ liệu xem trước." />
              ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {previewRows.map((row) => (
                    <li key={row.row} style={{ padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
                      Dòng {row.row}: {row.name} ({row.sku || "—"}){" "}
                      <StatusBadge label={row.valid ? "Hợp lệ" : "Lỗi"} tone={row.valid ? "success" : "danger"} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2>Lỗi</h2>
              {errors.length === 0 ? (
                <EmptyState title="Không có lỗi." />
              ) : (
                <ul>
                  {errors.map((e) => (
                    <li key={`${e.row}-${e.field}`}>
                      Dòng {e.row} — {e.field}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </PermissionGate>
  );
}
