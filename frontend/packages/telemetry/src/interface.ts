/**
 * Provider-neutral telemetry surface. Nothing outside this package may import `@sentry/*`
 * directly (FE-F00-008 step 1) — callers depend only on this interface.
 */

export interface TelemetrySpan {
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
}

export interface TelemetryAdapter {
  captureError(error: unknown, context?: Record<string, unknown>): void;
  captureEvent(name: string, payload?: Record<string, unknown>): void;
  setContext(key: string, value: Record<string, unknown>): void;
  startSpan(name: string): TelemetrySpan;
}
