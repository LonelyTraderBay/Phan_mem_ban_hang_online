import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, ErrorPanel, FormField, Input } from "@ai-sales/ui";
import { useAuth } from "../../../app/AuthProvider";
import { resolveSafeReturnUrl } from "@ai-sales/auth";

export default function MfaChallengeRoute() {
  const { apiClient, rebootstrap, store } = useAuth();
  const [params] = useSearchParams();
  const challengeId = params.get("challenge_id");
  const returnTo = resolveSafeReturnUrl(params.get("return_to"));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  if (!challengeId) {
    return (
      <main style={{ maxWidth: 420, margin: "4rem auto", padding: 24 }}>
        <ErrorPanel
          title="Phiên xác thực không còn hiệu lực"
          detail="Vui lòng đăng nhập lại."
        />
        <Link to="/login">Quay lại đăng nhập</Link>
      </main>
    );
  }

  async function verify() {
    setBusy(true);
    setErrorCode(null);
    const result = await apiClient.request("/auth/mfa/verify", {
      method: "POST",
      body: { challenge_id: challengeId, code },
    });
    if (!result.ok) {
      setErrorCode(result.problem?.code ?? "AUTH_MFA_INVALID");
      setCode("");
      setBusy(false);
      return;
    }
    store.getState().dispatch({ type: "LOGIN_START" });
    const ok = await rebootstrap();
    if (ok) {
      window.location.assign(returnTo);
    } else {
      setErrorCode("AUTH_SESSION_REVOKED");
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: 24 }}>
      <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>AI Sales OS</p>
      <h1 style={{ fontSize: "1.25rem" }}>Nhập mã xác thực</h1>
      <p style={{ color: "#5c6b7a" }}>Mở ứng dụng xác thực và nhập mã 6 số.</p>
      {errorCode ? <ErrorPanel title="Xác thực thất bại" code={errorCode} /> : null}
      <FormField label="Mã xác thực">
        <Input
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy}
          autoFocus
        />
      </FormField>
      <Button style={{ width: "100%", marginTop: 16 }} disabled={busy || code.length < 6} onClick={() => void verify()}>
        {busy ? "Đang xác nhận…" : "Xác nhận"}
      </Button>
      <p style={{ marginTop: 16 }}>
        <Link to="/login">Quay lại đăng nhập</Link>
      </p>
    </main>
  );
}
