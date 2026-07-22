import { useState } from "react";
import { Link } from "react-router";
import { Button, ErrorPanel, FormField, Input } from "@ai-sales/ui";
import { useAuth } from "../../../app/AuthProvider";

/** Local-credential recovery only — not primary OIDC path. */
export default function ForgotPasswordRoute() {
  const { apiClient } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErrorCode(null);
    const result = await apiClient.request("/auth/password/forgot", {
      method: "POST",
      body: { email },
    });
    setBusy(false);
    // Enumeration-safe: always treat as success copy when 200 or generic failure.
    if (result.ok || result.status === 200) {
      setSent(true);
      return;
    }
    if (result.status === 429) {
      setErrorCode("RATE_LIMITED");
      return;
    }
    setSent(true);
  }

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: 24 }}>
      <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>AI Sales OS</p>
      <h1 style={{ fontSize: "1.25rem" }}>Quên mật khẩu</h1>
      <p style={{ color: "#5c6b7a" }}>
        Nếu email tồn tại, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu.
      </p>
      {errorCode ? <ErrorPanel title="Thử lại sau" code={errorCode} /> : null}
      {sent ? (
        <p>Nếu tài khoản tồn tại, hãy kiểm tra hộp thư của bạn.</p>
      ) : (
        <>
          <FormField label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </FormField>
          <Button style={{ width: "100%", marginTop: 16 }} disabled={busy || !email} onClick={() => void submit()}>
            Gửi hướng dẫn
          </Button>
        </>
      )}
      <p style={{ marginTop: 16 }}>
        <Link to="/login">Quay lại đăng nhập</Link>
      </p>
    </main>
  );
}
