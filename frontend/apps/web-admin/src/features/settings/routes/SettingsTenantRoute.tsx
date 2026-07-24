import { useEffect, useRef, useState } from "react";
import { isConcurrencyConflictStatus } from "@ai-sales/api-client";
import {
  Button,
  ContentArea,
  EmptyState,
  ErrorPanel,
  ForbiddenState,
  FormField,
  Input,
  PageHeader,
  PermissionGate,
  Skeleton,
  Toast,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useAuth } from "../../../app/AuthProvider";

interface TenantResource {
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export default function SettingsTenantRoute() {
  const canRead = usePermission("tenant.read");
  const canUpdate = usePermission("tenant.update");
  const { authenticatedClient } = useAuth();
  const [tenant, setTenant] = useState<TenantResource | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const dirty = tenant !== null && name !== tenant.name;

  async function load() {
    setLoading(true);
    setError(null);
    setConflict(false);
    const result = await authenticatedClient.request<{ data?: TenantResource }>("/tenants/current", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      setTenant(null);
      return;
    }
    const row = result.data.data;
    if (!row) {
      setTenant(null);
      return;
    }
    setTenant(row);
    setName(row.name);
  }

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead]);

  useEffect(() => {
    if (!loading && canRead && canUpdate && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [loading, canRead, canUpdate]);

  async function save() {
    if (!tenant || !canUpdate) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    const result = await authenticatedClient.request<{ data?: TenantResource }>("/tenants/current", {
      method: "PATCH",
      body: { expected_version: tenant.version, name },
      ifMatch: String(tenant.version),
    });
    setSaving(false);
    if (!result.ok) {
      if (isConcurrencyConflictStatus(result.status)) {
        setConflict(true);
        setError("RESOURCE_VERSION_MISMATCH");
        return;
      }
      setError(result.problem?.code ?? "VALIDATION_FAILED");
      return;
    }
    const row = result.data.data;
    if (row) {
      setTenant(row);
      setName(row.name);
    }
    setToastOpen(true);
  }

  function cancel() {
    if (tenant) setName(tenant.name);
    setConflict(false);
    setError(null);
  }

  return (
    <PermissionGate
      allowed={canRead}
      fallback={<ForbiddenState message="Bạn không có quyền xem cài đặt không gian làm việc." />}
    >
      <ContentArea>
        <PageHeader
          title="Không gian làm việc"
          description="Tên và thông tin hiển thị cho thành viên trong tenant này."
        />
        {error && !conflict ? (
          <ErrorPanel
            title={tenant ? "Không thể lưu thay đổi" : "Không thể tải không gian"}
            code={error}
            retryable
            onRetry={() => void load()}
          />
        ) : null}
        {conflict ? (
          <ErrorPanel
            title="Xung đột phiên bản"
            code="RESOURCE_VERSION_MISMATCH"
            detail="Ai đó vừa cập nhật không gian này. Tải lại để xem bản mới, rồi thử lưu lại."
            retryable
            onRetry={() => void load()}
          />
        ) : null}
        {loading ? (
          <Skeleton height={160} aria-label="Đang tải cài đặt không gian" />
        ) : !tenant ? (
          <EmptyState title="Không tải được thông tin không gian." />
        ) : (
          <>
            {!canUpdate ? (
              <p style={{ color: "var(--ai-sales-color-text-muted)", marginBottom: "var(--ai-sales-spacing-4)" }}>
                Bạn chỉ có quyền xem.
              </p>
            ) : null}
            <FormField label="Tên không gian">
              <Input
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                readOnly={!canUpdate}
                aria-readonly={!canUpdate}
              />
            </FormField>
            <FormField label="Mã không gian">
              <Input value={tenant.code} readOnly aria-readonly />
            </FormField>
            <div style={{ display: "flex", gap: "var(--ai-sales-spacing-3)", marginTop: "var(--ai-sales-spacing-4)" }}>
              <PermissionGate allowed={canUpdate} fallback={null}>
                <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
                  {saving ? "Đang lưu…" : "Lưu thay đổi"}
                </Button>
                <Button variant="secondary" disabled={!dirty || saving} onClick={cancel}>
                  Hủy
                </Button>
              </PermissionGate>
            </div>
          </>
        )}
        <Toast
          open={toastOpen}
          onOpenChange={setToastOpen}
          title="Đã lưu thay đổi"
          variant="success"
        />
      </ContentArea>
    </PermissionGate>
  );
}
