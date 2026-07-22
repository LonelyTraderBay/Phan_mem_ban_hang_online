import type { ApiClient } from "@ai-sales/api-client";
import type { QueryClient } from "@tanstack/react-query";
import { clearAllCaches } from "@ai-sales/state";
import type { SessionStore } from "./sessionStore";
import type { CrossTabChannel } from "./crossTab";

export interface LogoutDeps {
  apiClient: ApiClient;
  store: SessionStore;
  queryClient?: QueryClient;
  crossTab?: CrossTabChannel;
  /** Optional local draft / telemetry cleanup. */
  clearLocalState?: () => void;
}

/**
 * Ends the session: POST /auth/logout (best-effort), clear query cache, broadcast logout,
 * transition state machine to anonymous.
 */
export async function logoutSession(deps: LogoutDeps): Promise<void> {
  const status = deps.store.getState().status;
  if (status === "authenticated" || status === "partially_authenticated" || status === "expired" || status === "revoked") {
    deps.store.getState().dispatch({ type: "LOGOUT_START" });
  }

  try {
    await deps.apiClient.request("/auth/logout", { method: "POST", body: {} });
  } catch {
    // best-effort — still clear local session
  }

  deps.store.getState().setSession(null);
  if (deps.queryClient) {
    await clearAllCaches(deps.queryClient);
  }
  deps.clearLocalState?.();
  deps.crossTab?.postMessage({ type: "logout" });

  if (deps.store.getState().status === "signing_out") {
    deps.store.getState().dispatch({ type: "LOGOUT_COMPLETE" });
  } else {
    // Already anonymous / mid-bootstrap — force clear without illegal transition
    deps.store.getState().setSession(null);
  }
}

/**
 * Local-only session clear (refresh reused, cross-tab logout, revoke) — no logout API call.
 */
export async function clearSessionLocally(deps: Omit<LogoutDeps, "apiClient"> & { broadcast?: boolean }): Promise<void> {
  const status = deps.store.getState().status;
  if (status === "authenticated" || status === "refreshing") {
    try {
      deps.store.getState().dispatch({ type: "SESSION_REVOKED" });
    } catch {
      // ignore illegal from non-auth states
    }
  }
  deps.store.getState().setSession(null);
  if (deps.queryClient) {
    await clearAllCaches(deps.queryClient);
  }
  deps.clearLocalState?.();
  if (deps.broadcast !== false) {
    deps.crossTab?.postMessage({ type: "session_revoked" });
  }
  if (deps.store.getState().status === "revoked" || deps.store.getState().status === "expired") {
    try {
      deps.store.getState().dispatch({ type: "LOGOUT_START" });
      deps.store.getState().dispatch({ type: "LOGOUT_COMPLETE" });
    } catch {
      // leave as-is
    }
  }
}
