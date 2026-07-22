import { describe, expect, it, vi } from "vitest";
import { createSseClient } from "../sseClient";
import { createFakeEventSourceFactory } from "../mockHarness";
import type { SseConnectionState } from "../connectionState";

const envelope = {
  specversion: "1.0",
  id: "evt_1",
  source: "aisales/conversation-service",
  type: "com.aisales.conversation.created.v1",
  time: "2026-06-26T08:30:00.123Z",
  datacontenttype: "application/json",
  tenantid: "ten_1",
  correlationid: "req_abc",
  data: {},
};

describe("createSseClient", () => {
  it("transitions closed -> connecting -> connected and delivers a deduplicated envelope", () => {
    const { createEventSource, handles } = createFakeEventSourceFactory();
    const states: SseConnectionState[] = [];
    const envelopes: unknown[] = [];
    let lastEventId: string | null = null;

    const client = createSseClient({
      url: "/realtime/stream",
      createEventSource,
      onStateChange: (state) => states.push(state),
      onEnvelope: (env) => envelopes.push(env),
      onResyncRequired: vi.fn(),
      getLastEventId: () => lastEventId,
      setLastEventId: (id) => {
        lastEventId = id;
      },
    });

    expect(client.getState()).toBe("closed");
    client.start();
    expect(states).toEqual(["connecting"]);

    const handle = handles[0];
    handle?.simulateOpen();
    expect(states).toEqual(["connecting", "connected"]);

    handle?.simulateMessage(JSON.stringify(envelope));
    handle?.simulateMessage(JSON.stringify(envelope)); // duplicate, must not be delivered twice
    expect(envelopes).toHaveLength(1);
    expect(lastEventId).toBe("evt_1");
  });

  it("moves to reconnecting on error and schedules a reconnect attempt", () => {
    vi.useFakeTimers();
    const { createEventSource, handles } = createFakeEventSourceFactory();
    const states: SseConnectionState[] = [];

    const client = createSseClient({
      url: "/realtime/stream",
      createEventSource,
      onStateChange: (state) => states.push(state),
      onEnvelope: vi.fn(),
      onResyncRequired: vi.fn(),
      getLastEventId: () => null,
      setLastEventId: vi.fn(),
    });

    client.start();
    handles[0]?.simulateOpen();
    handles[0]?.simulateError();
    expect(states).toContain("reconnecting");
    expect(handles[0]?.closed).toBe(true);

    vi.runAllTimers();
    expect(handles.length).toBeGreaterThan(1); // a new EventSource was opened for the retry

    vi.useRealTimers();
  });

  it("stop() closes the connection and does not schedule further reconnects", () => {
    const { createEventSource, handles } = createFakeEventSourceFactory();
    const client = createSseClient({
      url: "/realtime/stream",
      createEventSource,
      onStateChange: vi.fn(),
      onEnvelope: vi.fn(),
      onResyncRequired: vi.fn(),
      getLastEventId: () => null,
      setLastEventId: vi.fn(),
    });

    client.start();
    handles[0]?.simulateOpen();
    client.stop();

    expect(client.getState()).toBe("closed");
    expect(handles[0]?.closed).toBe(true);
  });
});
