import * as Sentry from "@sentry/react";
import type { TelemetryAdapter, TelemetrySpan } from "./interface";
import { scrubDeep, scrubUrl } from "./redact";
import type { TelemetryReleaseContext } from "./context";

export interface CreateSentryAdapterOptions {
  dsn: string;
  release: TelemetryReleaseContext;
}

const noopSpan: TelemetrySpan = {
  end: () => {},
  setAttribute: () => {},
};

export function createSentryAdapter(options: CreateSentryAdapterOptions): TelemetryAdapter {
  Sentry.init({
    dsn: options.dsn,
    release: `${options.release.releaseVersion}+${options.release.buildSha}`,
    environment: options.release.environment,
    // Request bodies are never sent to Sentry by default (spec 15.x default-deny); URLs are
    // scrubbed of sensitive query params before leaving the process (FE-F00-008 step 2).
    beforeSend(event) {
      if (event.request?.url) {
        event.request.url = scrubUrl(event.request.url);
      }
      if (event.request) {
        delete event.request.data;
      }
      return event;
    },
  });

  return {
    captureError(error, context) {
      Sentry.captureException(error, context ? { extra: scrubDeep(context) as Record<string, unknown> } : undefined);
    },
    captureEvent(name, payload) {
      const extra = payload ? (scrubDeep(payload) as Record<string, unknown>) : undefined;
      Sentry.captureMessage(name, extra ? { level: "info", extra } : { level: "info" });
    },
    setContext(key, value) {
      Sentry.setContext(key, scrubDeep(value) as Record<string, unknown>);
    },
    startSpan(name) {
      let activeSpan: ReturnType<typeof Sentry.startInactiveSpan> | undefined;
      Sentry.withActiveSpan(null, () => {
        activeSpan = Sentry.startInactiveSpan({ name });
      });
      if (!activeSpan) return noopSpan;
      const span = activeSpan;
      return {
        end: () => span.end(),
        setAttribute: (key, value) => span.setAttribute(key, value),
      };
    },
  };
}
