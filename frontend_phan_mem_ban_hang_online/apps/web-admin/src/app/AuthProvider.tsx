import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiClient } from "@ai-sales/api-client";
import {
  bootstrapSession,
  createSessionStore,
  type SessionBootstrap,
  type SessionStore,
  type AuthStatus,
} from "@ai-sales/auth";

interface AuthContextValue {
  status: AuthStatus;
  session: SessionBootstrap | null;
  store: SessionStore;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  apiClient: ApiClient;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wires `@ai-sales/auth` sessionStore + state machine into web-admin (F00→F01 prep).
 * Each app keeps its own store instance (ADR-FE-004). Refresh is never triggered for 403
 * (that lives in `@ai-sales/auth`'s `createRequestWithRefresh` — this provider only bootstraps).
 */
export function AuthProvider({ apiClient, children, fallback }: AuthProviderProps) {
  const [store] = useState(() => createSessionStore());
  const [status, setStatus] = useState<AuthStatus>(() => store.getState().status);
  const [session, setSession] = useState<SessionBootstrap | null>(() => store.getState().session);
  // StrictMode remounts effects; the state machine throws on a second BOOTSTRAP_START from
  // "bootstrapping", so we gate the start to once per store instance.
  const bootstrapStarted = useRef(false);

  useEffect(() => {
    return store.subscribe((state) => {
      setStatus(state.status);
      setSession(state.session);
    });
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    if (!bootstrapStarted.current && store.getState().status === "unknown") {
      bootstrapStarted.current = true;
      store.getState().dispatch({ type: "BOOTSTRAP_START" });
    }
    void bootstrapSession(apiClient).then((result) => {
      if (cancelled || store.getState().status !== "bootstrapping") return;
      if (result.ok) {
        store.getState().setSession(result.session);
        store.getState().dispatch({ type: "BOOTSTRAP_RESULT_AUTHENTICATED" });
      } else {
        store.getState().setSession(null);
        store.getState().dispatch({ type: "BOOTSTRAP_RESULT_ANONYMOUS" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient, store]);

  const value = useMemo(() => ({ status, session, store }), [status, session, store]);

  if (status === "unknown" || status === "bootstrapping") {
    return <>{fallback ?? null}</>;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
