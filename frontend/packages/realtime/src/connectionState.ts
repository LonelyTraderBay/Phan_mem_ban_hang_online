/**
 * SSE connection state machine. UI must render exactly these states (spec 12.4 step 8):
 * connecting/reconnecting/offline/resyncing/connected — plus `closed` for before-start/after-stop.
 */

export type SseConnectionState = "closed" | "connecting" | "connected" | "reconnecting" | "offline" | "resyncing";

export type SseConnectionEvent =
  | { type: "START" }
  | { type: "OPENED" }
  | { type: "ERROR" }
  | { type: "OFFLINE_THRESHOLD_EXCEEDED" }
  | { type: "RESYNC_REQUIRED" }
  | { type: "RESYNC_COMPLETE" }
  | { type: "STOP" };

type EventType = SseConnectionEvent["type"];

const TRANSITIONS: Record<SseConnectionState, Partial<Record<EventType, SseConnectionState>>> = {
  closed: { START: "connecting" },
  connecting: { OPENED: "connected", ERROR: "reconnecting", STOP: "closed" },
  connected: { ERROR: "reconnecting", RESYNC_REQUIRED: "resyncing", STOP: "closed" },
  reconnecting: {
    OPENED: "connected",
    OFFLINE_THRESHOLD_EXCEEDED: "offline",
    RESYNC_REQUIRED: "resyncing",
    STOP: "closed",
  },
  offline: { OPENED: "connected", ERROR: "reconnecting", STOP: "closed" },
  resyncing: { RESYNC_COMPLETE: "connected", ERROR: "reconnecting", STOP: "closed" },
};

/**
 * Unlike the auth state machine (which throws on an illegal transition), an unrecognized event
 * here is ignored and returns the current state unchanged — a real `EventSource` can legitimately
 * fire late/racy events (e.g. an `ERROR` arriving just after an explicit `STOP`), and treating
 * that as a crash would be worse than a no-op.
 */
export function transitionConnectionState(current: SseConnectionState, event: SseConnectionEvent): SseConnectionState {
  const next = TRANSITIONS[current]?.[event.type];
  return next ?? current;
}
