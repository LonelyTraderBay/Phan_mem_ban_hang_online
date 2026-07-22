import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { safeReturnUrlFromSearch } from "@ai-sales/auth";
import { Skeleton, ErrorPanel, Button } from "@ai-sales/ui";
import { useAuth } from "../app/AuthProvider";

/**
 * Transient route after BFF OIDC callback (FE-F01-001). Re-bootstraps session then
 * navigates to a safe return URL.
 */
export default function AuthCallbackRoute() {
  const { status, rebootstrap } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const returnTo = safeReturnUrlFromSearch(location.search);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // MSW OIDC may land here with ?code= — session cookie already "set" by mock; just /me.
      const ok = status === "authenticated" ? true : await rebootstrap();
      if (cancelled) return;
      if (ok) {
        setDone(true);
      } else {
        setError("AUTH_SESSION_REVOKED");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rebootstrap, status, searchParams]);

  if (done || status === "authenticated") {
    return <Navigate to={returnTo} replace />;
  }

  if (error) {
    return (
      <main style={{ maxWidth: 420, margin: "4rem auto", padding: 24 }}>
        <ErrorPanel
          title="Không thể hoàn tất đăng nhập"
          code={error}
          detail="Phiên đăng nhập không hợp lệ. Vui lòng thử lại."
        />
        <Button variant="secondary" onClick={() => { window.location.href = "/login"; }}>
          Quay lại đăng nhập
        </Button>
      </main>
    );
  }

  return <Skeleton width="100%" height="60vh" aria-label="Đang hoàn tất đăng nhập" />;
}
