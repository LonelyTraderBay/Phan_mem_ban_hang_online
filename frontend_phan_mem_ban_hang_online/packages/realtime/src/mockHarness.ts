/**
 * In-memory fake `EventSource`-compatible emitter (FE-F00-006 step 5) so Vitest/Playwright
 * tests can push synthetic envelopes into `createSseClient` without a real server.
 */

export interface FakeEventSourceHandle {
  readonly url: string;
  readonly closed: boolean;
  simulateOpen(): void;
  simulateMessage(data: string): void;
  simulateNamedEvent(eventName: string, data?: string): void;
  simulateError(): void;
}

export function createFakeEventSourceFactory(): {
  createEventSource: (url: string) => EventSource;
  handles: FakeEventSourceHandle[];
} {
  const handles: FakeEventSourceHandle[] = [];

  function createEventSource(url: string): EventSource {
    let closed = false;
    const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
    const fake = {
      url,
      onopen: null as (() => void) | null,
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as (() => void) | null,
      addEventListener(eventName: string, listener: (event: MessageEvent) => void) {
        let set = listeners.get(eventName);
        if (!set) {
          set = new Set();
          listeners.set(eventName, set);
        }
        set.add(listener);
      },
      removeEventListener(eventName: string, listener: (event: MessageEvent) => void) {
        listeners.get(eventName)?.delete(listener);
      },
      close() {
        closed = true;
      },
    };

    const handle: FakeEventSourceHandle = {
      url,
      get closed() {
        return closed;
      },
      simulateOpen() {
        fake.onopen?.();
      },
      simulateMessage(data: string) {
        fake.onmessage?.({ data } as MessageEvent);
      },
      simulateNamedEvent(eventName: string, data = "") {
        for (const listener of listeners.get(eventName) ?? []) listener({ data } as MessageEvent);
      },
      simulateError() {
        fake.onerror?.();
      },
    };
    handles.push(handle);

    return fake as unknown as EventSource;
  }

  return { createEventSource, handles };
}
