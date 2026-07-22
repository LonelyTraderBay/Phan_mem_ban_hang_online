import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, ErrorPanel, FormField, Input } from "@ai-sales/ui";
import { useAuth } from "../../../app/AuthProvider";

export default function AcceptInviteRoute() {
  const { apiClient, rebootstrap, store } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");

  if (!token) {
    return (
      <main style={{ maxWidth: 480, margin: "4rem auto", padding: 24 }}>
        <ErrorPanel title="Lời mời không hợp lệ" code="INVITATION_TOKEN_INVALID" />
        <Link to="/login">Đăng nhập</Link>
      </main>
    );
  }

  async function accept() {
    setBusy(true);
    setErrorCode(null);
    const result = await apiClient.request("/invitations/accept", {
      method: "POST",
      body: { token, display_name: displayName || undefined },
    });
    if (!result.ok) {
      setErrorCode(result.problem?.code ?? "INVITATION_TOKEN_INVALID");
      setBusy(false);
      return;
    }
    store.getState().dispatch({ type: "LOGIN_START" });
    const ok = await rebootstrap();
    setBusy(false);
    if (ok) {
      window.location.assign("/");
    } else {
      setErrorCode("AUTH_SESSION_REVOKED");
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: 24 }}>
      <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>AI Sales OS</p>
      <h1 style={{ fontSize: "1.25rem" }}>Tham gia không gian làm việc</h1>
      <p style={{ color: "#5c6b7a" }}>Bạn được mời vào nhóm. Chấp nhận để tiếp tục.</p>
      {errorCode ? <ErrorPanel title="Không thể chấp nhận lời mời" code={errorCode} /> : null}
      <FormField label="Tên hiển thị (tuỳ chọn)">
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={busy} />
      </FormField>
      <Button style={{ width: "100%", marginTop: 16 }} disabled={busy} onClick={() => void accept()}>
        {busy ? "Đang xử lý…" : "Chấp nhận lời mời"}
      </Button>
      <p style={{ marginTop: 16 }}>
        <Link to="/login">Đã có tài khoản? Đăng nhập</Link>
      </p>
    </main>
  );
}
