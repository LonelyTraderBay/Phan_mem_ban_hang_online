import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, ErrorPanel, FormField, Input } from "@ai-sales/ui";
import { useAuth } from "../../../app/AuthProvider";

export default function ResetPasswordRoute() {
  const { apiClient } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  if (!token) {
    return (
      <main style={{ maxWidth: 420, margin: "4rem auto", padding: 24 }}>
        <ErrorPanel title="Liên kết không hợp lệ" detail="Thiếu token đặt lại mật khẩu." />
        <Link to="/forgot-password">Yêu cầu liên kết mới</Link>
      </main>
    );
  }

  async function submit() {
    if (password !== confirm) {
      setErrorCode("VALIDATION_FAILED");
      return;
    }
    setBusy(true);
    setErrorCode(null);
    const result = await apiClient.request("/auth/password/reset", {
      method: "POST",
      body: { token, password },
    });
    setBusy(false);
    if (!result.ok) {
      setErrorCode(result.problem?.code ?? "VALIDATION_FAILED");
      return;
    }
    setDone(true);
  }

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: 24 }}>
      <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>AI Sales OS</p>
      <h1 style={{ fontSize: "1.25rem" }}>Đặt lại mật khẩu</h1>
      {errorCode ? <ErrorPanel title="Không thể đặt lại mật khẩu" code={errorCode} /> : null}
      {done ? (
        <p>
          Mật khẩu đã được cập nhật. <Link to="/login">Đăng nhập</Link>
        </p>
      ) : (
        <>
          <FormField label="Mật khẩu mới">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          </FormField>
          <FormField label="Xác nhận mật khẩu">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
          </FormField>
          <Button style={{ width: "100%", marginTop: 16 }} disabled={busy} onClick={() => void submit()}>
            Lưu mật khẩu
          </Button>
        </>
      )}
    </main>
  );
}
