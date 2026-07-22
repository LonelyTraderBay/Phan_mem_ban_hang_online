import { StatusBadge } from "./StatusBadge";

export type ConnectionBannerState = "connecting" | "connected" | "reconnecting" | "offline" | "resyncing";

export interface OfflineStateProps {
  state: ConnectionBannerState;
}

const LABELS: Record<ConnectionBannerState, string> = {
  connecting: "Đang kết nối...",
  connected: "Đã kết nối",
  reconnecting: "Đang kết nối lại...",
  offline: "Mất kết nối",
  resyncing: "Đang đồng bộ lại...",
};

const TONES: Record<ConnectionBannerState, "neutral" | "success" | "warning" | "danger"> = {
  connecting: "neutral",
  connected: "success",
  reconnecting: "warning",
  offline: "danger",
  resyncing: "warning",
};

/**
 * Renders `@ai-sales/realtime`'s connection state (passed as a prop — this stays presentational,
 * spec 4.3). Per spec 12.4: no toast per short reconnect, only a persistent banner for
 * offline/resyncing.
 */
export function OfflineState({ state }: OfflineStateProps) {
  if (state === "connected" || state === "connecting") return null;
  return <StatusBadge label={LABELS[state]} tone={TONES[state]} />;
}
