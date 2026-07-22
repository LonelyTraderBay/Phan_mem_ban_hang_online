import { useSyncExternalStore } from "react";
import type { SseConnectionState } from "./connectionState";

/**
 * A tiny pub-sub store bridging `createSseClient`'s single `onStateChange` callback to
 * `useSyncExternalStore`. Wire it up as: `createSseClient({ ..., onStateChange: store.setState })`.
 * The rendered banner/indicator (`OfflineState`, connection badge) lives in packages/ui — this
 * package stays headless (FE-F00-006 step 6).
 */
export function createConnectionStatusStore(initial: SseConnectionState = "closed") {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: (): SseConnectionState => state,
    setState(next: SseConnectionState): void {
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ConnectionStatusStore = ReturnType<typeof createConnectionStatusStore>;

export function useConnectionStatus(store: ConnectionStatusStore): SseConnectionState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
