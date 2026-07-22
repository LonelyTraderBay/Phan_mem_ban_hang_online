import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiClient } from "@ai-sales/api-client";
import type { QueryClient } from "@tanstack/react-query";
import {
  bootstrapSession,
  createSessionStore,
  createCrossTabChannel,
  createAuthenticatedApiClient,
  clearSessionLocally,
  logoutSession,
  type SessionBootstrap,
  type SessionStore,
  type AuthStatus,
  type CrossTabChannel,
} from "@ai-sales/auth";

interface AuthContextValue {
  status: AuthStatus;
  session: SessionBootstrap | null;
  store: SessionStore;
  /** Base client without refresh wrapping — use for bootstrap/refresh/logout. */
  apiClient: ApiClient;
  /** Client that retries once on 401 after single-flight refresh. */
  authenticatedClient: ApiClient;
  logout: () => Promise<void>;
  rebootstrap: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  apiClient: ApiClient;
  queryClient: QueryClient;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wires `@ai-sales/auth` sessionStore + refresh + cross-tab into web-admin (FE-F01-001).
 * Each app keeps its own store instance (ADR-FE-004). Refresh is never triggered for 403.
 */
export function AuthProvider({ apiClient, queryClient, children, fallback }: AuthProviderProps) {
  const [store] = useState(() => createSessionStore());
  const [status, setStatus] = useState<AuthStatus>(() => store.getState().status);
  const [session, setSession] = useState<SessionBootstrap | null>(() => store.getState().session);
  const bootstrapStarted = useRef(false);
  const crossTabRef = useRef<CrossTabChannel | null>(null);

  useEffect(() => {
    return store.subscribe((state) => {
      setStatus(state.status);
      setSession(state.session);
    });
  }, [store]);

  const onRefreshFailure = useCallback(async () => {
    const crossTab = crossTabRef.current;
    await clearSessionLocally({
      store,
      queryClient,
      ...(crossTab ? { crossTab } : {}),
    });
  }, [store, queryClient]);

  const authenticatedClient = useMemo(
    () =>
      createAuthenticatedApiClient({
        base: apiClient,
        refreshSession: async () => {
          const current = store.getState().status;
          if (current === "authenticated") {
            store.getState().dispatch({ type: "REFRESH_START" });
          }
          const result = await apiClient.request("/auth/refresh", { method: "POST", body: {} });
          if (!result.ok) {
            if (store.getState().status === "refreshing") {
              store.getState().dispatch({ type: "REFRESH_FAILURE" });
            }
            throw new Error(result.problem?.code ?? "AUTH_REFRESH_FAILED");
          }
          if (store.getState().status === "refreshing") {
            store.getState().dispatch({ type: "REFRESH_SUCCESS" });
          }
        },
        onRefreshFailure,
      }),
    [apiClient, store, onRefreshFailure],
  );

  const rebootstrap = useCallback(async () => {
    const result = await bootstrapSession(apiClient);
    if (result.ok) {
      store.getState().setSession(result.session);
      const s = store.getState().status;
      if (s === "anonymous" || s === "expired" || s === "bootstrapping") {
        if (s === "anonymous" || s === "expired") {
          store.getState().dispatch({ type: "LOGIN_START" });
          store.getState().dispatch({ type: "LOGIN_SUCCESS" });
        } else {
          store.getState().dispatch({ type: "BOOTSTRAP_RESULT_AUTHENTICATED" });
        }
      } else if (s === "authenticating") {
        store.getState().dispatch({ type: "LOGIN_SUCCESS" });
      }
      return true;
    }
    store.getState().setSession(null);
    if (store.getState().status === "bootstrapping") {
      store.getState().dispatch({ type: "BOOTSTRAP_RESULT_ANONYMOUS" });
    }
    return false;
  }, [apiClient, store]);

  const logout = useCallback(async () => {
    const crossTab = crossTabRef.current;
    await logoutSession({
      apiClient,
      store,
      queryClient,
      ...(crossTab ? { crossTab } : {}),
    });
  }, [apiClient, store, queryClient]);

  useEffect(() => {
    const channel = createCrossTabChannel();
    crossTabRef.current = channel;
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "logout" || message.type === "session_revoked") {
        void clearSessionLocally({
          store,
          queryClient,
          crossTab: channel,
          broadcast: false,
        });
      }
    });
    return () => {
      unsubscribe();
      channel.close();
      crossTabRef.current = null;
    };
  }, [store, queryClient]);

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

  const value = useMemo(
    () => ({
      status,
      session,
      store,
      apiClient,
      authenticatedClient,
      logout,
      rebootstrap,
    }),
    [status, session, store, apiClient, authenticatedClient, logout, rebootstrap],
  );

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
