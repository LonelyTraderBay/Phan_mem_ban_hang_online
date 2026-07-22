import type { TelemetryAdapter } from "@ai-sales/telemetry";
import { createEventDeduper, parseEventEnvelope, type EventEnvelope } from "./envelope";
import { transitionConnectionState, type SseConnectionEvent, type SseConnectionState } from "./connectionState";
import { computeBackoffDelay } from "./backoff";

export interface SseClientOptions {
  url: string;
  onEnvelope: (envelope: EventEnvelope) => void;
  onStateChange: (state: SseConnectionState) => void;
  onResyncRequired: () => void;
  getLastEventId: () => string | null;
  setLastEventId: (id: string) => void;
  telemetry?: TelemetryAdapter;
  maxReconnectAttemptsBeforeOffline?: number;
  /** Injectable for tests (see mockHarness.ts) and to keep this file DOM-EventSource-shaped
   * without hard-coding the global constructor. */
  createEventSource?: (url: string) => EventSource;
}

export interface SseClient {
  start(): void;
  stop(): void;
  getState(): SseConnectionState;
}

/**
 * SSE client (spec 12.1/12.4, FE-F00-006). NOTE: the browser's native `EventSource` cannot set
 * custom request headers, so the spec's literal "gửi Last-Event-ID header" (12.4 step 3) is
 * approximated here via a `lastEventId` query parameter — a fetch-based SSE implementation would
 * be needed to send the real header. Flag this to Backend/Platform before relying on it for a
 * real integration.
 */
export function createSseClient(options: SseClientOptions): SseClient {
  let state: SseConnectionState = "closed";
  let source: EventSource | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const dedupe = createEventDeduper();
  const maxAttempts = options.maxReconnectAttemptsBeforeOffline ?? 5;
  const createEventSource = options.createEventSource ?? ((url: string) => new EventSource(url));

  function setState(event: SseConnectionEvent): void {
    const next = transitionConnectionState(state, event);
    if (next !== state) {
      state = next;
      options.onStateChange(state);
    }
  }

  function scheduleReconnect(): void {
    reconnectAttempts += 1;
    if (reconnectAttempts > maxAttempts) {
      setState({ type: "OFFLINE_THRESHOLD_EXCEEDED" });
    }
    const delay = computeBackoffDelay(reconnectAttempts);
    reconnectTimer = setTimeout(open, delay);
  }

  function open(): void {
    const lastEventId = options.getLastEventId();
    const url = lastEventId ? `${options.url}?lastEventId=${encodeURIComponent(lastEventId)}` : options.url;
    const es = createEventSource(url);
    source = es;

    es.onopen = () => {
      reconnectAttempts = 0;
      setState({ type: "OPENED" });
    };

    es.onmessage = (message: MessageEvent<string>) => {
      const envelope = parseEventEnvelope(message.data);
      if (!envelope) return;
      if (dedupe.isDuplicate(envelope.id)) return;
      options.setLastEventId(envelope.id);
      options.onEnvelope(envelope);
    };

    es.addEventListener("resync_required", () => {
      setState({ type: "RESYNC_REQUIRED" });
      options.onResyncRequired();
    });

    es.onerror = () => {
      options.telemetry?.captureEvent("sse_error", { attempts: reconnectAttempts });
      es.close();
      setState({ type: "ERROR" });
      scheduleReconnect();
    };
  }

  return {
    start() {
      if (state !== "closed") return;
      setState({ type: "START" });
      open();
    },
    stop() {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
      source = null;
      setState({ type: "STOP" });
    },
    getState() {
      return state;
    },
  };
}
