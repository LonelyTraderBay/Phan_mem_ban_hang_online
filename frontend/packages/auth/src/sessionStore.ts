import { create, type StoreApi, type UseBoundStore } from "zustand";
import { transitionAuthStatus, type AuthEvent, type AuthStatus } from "./authStateMachine";
import type { SessionBootstrap } from "./schemas";

export interface SessionState {
  status: AuthStatus;
  session: SessionBootstrap | null;
  dispatch(event: AuthEvent): void;
  setSession(session: SessionBootstrap | null): void;
}

export type SessionStore = UseBoundStore<StoreApi<SessionState>>;

/**
 * Each app (web-admin, super-admin, windows-client) creates its own store instance — sessions
 * are never shared across apps (ADR-FE-004: Super Admin has a fully separate session context).
 */
export function createSessionStore(): SessionStore {
  return create<SessionState>((set, get) => ({
    status: "unknown",
    session: null,
    dispatch(event) {
      const next = transitionAuthStatus(get().status, event);
      set({ status: next });
    },
    setSession(session) {
      set({ session });
    },
  }));
}
