# @ai-sales/realtime

SSE client state machine, event envelope validation, reconnect/resume, event router (spec 12.x,
FE-F00-006). No app UI imports this directly.

- SSE-only, via the browser's native `EventSource` (injectable via `createEventSource` for tests —
  see `mockHarness.ts`). No WebSocket client.
- **Known gap**: the native `EventSource` API cannot set custom request headers, so spec 12.4 step
  3's "send `Last-Event-ID` header" is approximated here via a `lastEventId` **query parameter**
  instead. A real header would need a fetch-based SSE implementation. Flag this to Backend/Platform
  before relying on it for a real integration — don't silently assume the header is being sent.
- `connectionState.ts`'s transition function intentionally ignores unrecognized events (no-op)
  rather than throwing — unlike the auth state machine, which throws on illegal transitions.
- Validates event envelopes with `zod`; reports `sse_error` telemetry via an optional
  `TelemetryAdapter` passed to `sseClient`. Has `test: vitest run` (unlike `platform`/`printing`).
  No README.
