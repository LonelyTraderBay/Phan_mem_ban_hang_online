import type { TelemetryAdapter, TelemetrySpan } from "./interface";
import { scrubDeep, scrubText } from "./redact";

const noopSpan: TelemetrySpan = {
  end: () => {},
  setAttribute: () => {},
};

/**
 * Dev-only adapter. Every payload is run through `scrubDeep`/`scrubText` before printing —
 * "never log PII" is enforced by code here, not left as a convention (FE-F00-008 step 5).
 */
export function createConsoleAdapter(): TelemetryAdapter {
  return {
    captureError(error, context) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[telemetry:error]", scrubText(message), context ? scrubDeep(context) : undefined);
    },
    captureEvent(name, payload) {
      console.info("[telemetry:event]", scrubText(name), payload ? scrubDeep(payload) : undefined);
    },
    setContext(key, value) {
      console.debug("[telemetry:context]", scrubText(key), scrubDeep(value));
    },
    startSpan(name) {
      console.debug("[telemetry:span:start]", scrubText(name));
      return noopSpan;
    },
  };
}
