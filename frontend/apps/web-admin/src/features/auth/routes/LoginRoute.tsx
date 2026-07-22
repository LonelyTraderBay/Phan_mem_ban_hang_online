import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { safeReturnUrlFromSearch, resolveSafeReturnUrl } from "@ai-sales/auth";
import { Button, ErrorPanel } from "@ai-sales/ui";
import { useAuth } from "../../../app/AuthProvider";

/**
 * `/login` — IdP primary CTA (ADR-FE-013). Credential form intentionally out of scope.
 */
export default function LoginRoute() {
  const { status } = useAuth();
  const location = useLocation();
  const returnTo = safeReturnUrlFromSearch(location.search);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Navigate to={returnTo} replace />;
  }

  function startOidc() {
    setBusy(true);
    setErrorCode(null);
    const safe = resolveSafeReturnUrl(returnTo);
    // Full navigation to BFF start (sets cookies). MSW 302s toward /auth/callback.
    window.location.assign(`/api/auth/oidc/start?return_to=${encodeURIComponent(safe)}`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background-subtle, #f4f6f8)",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>AI Sales OS</p>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: 16 }}>Đăng nhập để tiếp tục</h1>
        <p style={{ color: "var(--color-text-muted, #5c6b7a)", marginTop: 8 }}>
          Một câu hỗ trợ ngắn. Phiên dùng cookie bảo mật (HttpOnly).
        </p>

        {errorCode ? (
          <div style={{ marginTop: 16 }}>
            <ErrorPanel title="Không thể bắt đầu đăng nhập" code={errorCode} />
          </div>
        ) : null}

        <div style={{ marginTop: 24 }}>
          <Button variant="primary" style={{ width: "100%" }} disabled={busy} onClick={() => startOidc()}>
            {busy ? "Đang chuyển hướng…" : "Tiếp tục với IdP"}
          </Button>
        </div>

        <p style={{ marginTop: 24, textAlign: "center", color: "var(--color-text-muted, #5c6b7a)" }}>
          <Link to="/forgot-password">Quên mật khẩu?</Link>
          {" · "}
          <Link to="/accept-invite">Có lời mời? Chấp nhận lời mời</Link>
        </p>
      </div>
    </main>
  );
}
