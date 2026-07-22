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

interface MemberRow {
  id: string;
  display_name: string;
  email: string;
  status: string;
  roles: string[];
}

export default function SettingsUsersRoute() {
  const allowed = usePermission("member.read");
  const canInvite = usePermission("member.invite");
  const { authenticatedClient } = useAuth();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: MemberRow[]; items?: MemberRow[] }>("/members", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    const list = result.data.data ?? result.data.items ?? (Array.isArray(result.data) ? (result.data as MemberRow[]) : []);
    setMembers(list);
  }

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed]);

  async function sendInvite() {
    setInviteBusy(true);
    const result = await authenticatedClient.request("/invitations", {
      method: "POST",
      body: { email: inviteEmail },
      idempotencyKey: crypto.randomUUID(),
    });
    setInviteBusy(false);
    if (!result.ok) {
      setError(result.problem?.code ?? "VALIDATION_FAILED");
      return;
    }
    setInviteOpen(false);
    setInviteEmail("");
    void load();
  }

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem danh sách thành viên." />}
    >
      <main style={{ padding: 24, maxWidth: 960 }}>
        <h1>Thành viên</h1>
        <p style={{ color: "#5c6b7a" }}>Mời và quản lý người trong không gian này.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <PermissionGate allowed={canInvite} fallback={null}>
            <Button onClick={() => setInviteOpen(true)}>Mời thành viên</Button>
          </PermissionGate>
        </div>
        {error ? <ErrorPanel title="Không thể tải thành viên" code={error} retryable onRetry={() => void load()} /> : null}
        {loading ? (
          <Skeleton height={120} aria-label="Đang tải thành viên" />
        ) : !members || members.length === 0 ? (
          <EmptyState title="Chưa có thành viên nào khớp bộ lọc." />
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {members.map((m) => (
              <li key={m.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ flex: 1 }}>{m.display_name || m.email}</span>
                <span>{m.email}</span>
                <StatusBadge label={m.status} tone="neutral" />
              </li>
            ))}
          </ul>
        )}
        <Modal open={inviteOpen} onOpenChange={setInviteOpen} title="Mời thành viên">
          <FormField label="Email">
            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </FormField>
          <Button disabled={inviteBusy || !inviteEmail} onClick={() => void sendInvite()}>
            Gửi lời mời
          </Button>
        </Modal>
      </main>
    </PermissionGate>
  );
}
