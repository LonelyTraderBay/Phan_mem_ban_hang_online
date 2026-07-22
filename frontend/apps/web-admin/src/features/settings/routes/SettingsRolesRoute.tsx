import { useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  ErrorPanel,
  ForbiddenState,
  FormField,
  Input,
  Modal,
  PermissionGate,
  Skeleton,
  StatusBadge,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useAuth } from "../../../app/AuthProvider";

interface RoleRow {
  id: string;
  name: string;
  version: number;
  permissions: string[];
}

export default function SettingsRolesRoute() {
  const canRead = usePermission("role.read");
  const canManage = usePermission("role.manage");
  const { authenticatedClient } = useAuth();
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<RoleRow | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: RoleRow[]; items?: RoleRow[] }>("/roles", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    const list = result.data.data ?? result.data.items ?? (Array.isArray(result.data) ? (result.data as RoleRow[]) : []);
    setRoles(list);
  }

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    const result = await authenticatedClient.request(`/roles/${edit.id}`, {
      method: "PATCH",
      body: { name },
      ifMatch: String(edit.version),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem?.code ?? "RESOURCE_VERSION_MISMATCH");
      return;
    }
    setEdit(null);
    void load();
  }

  return (
    <PermissionGate
      allowed={canRead}
      fallback={<ForbiddenState message="Bạn không có quyền xem vai trò." />}
    >
      <main style={{ padding: 24, maxWidth: 960 }}>
        <h1>Vai trò</h1>
        <p style={{ color: "#5c6b7a" }}>Quản lý quyền theo vai trò. Mutate chỉ với role.manage.</p>
        {error ? <ErrorPanel title="Không thể tải vai trò" code={error} retryable onRetry={() => void load()} /> : null}
        {loading ? (
          <Skeleton height={120} aria-label="Đang tải vai trò" />
        ) : !roles || roles.length === 0 ? (
          <EmptyState title="Chưa có vai trò nào." />
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {roles.map((r) => (
              <li key={r.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ flex: 1 }}>{r.name}</span>
                <StatusBadge label={`v${r.version}`} tone="neutral" />
                <PermissionGate allowed={canManage} fallback={null}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEdit(r);
                      setName(r.name);
                    }}
                  >
                    Sửa
                  </Button>
                </PermissionGate>
              </li>
            ))}
          </ul>
        )}
        <Modal open={!!edit} onOpenChange={(open) => !open && setEdit(null)} title="Sửa vai trò">
          <FormField label="Tên">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <Button disabled={busy || !canManage} onClick={() => void save()}>
            Lưu
          </Button>
        </Modal>
      </main>
    </PermissionGate>
  );
}
