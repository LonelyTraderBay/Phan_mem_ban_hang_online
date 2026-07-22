import { trace, type Attributes, type AttributeValue, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

// Blueprint §15.1: never put email/phone/message text/prompt/token/full URL query/object
// payload into span attributes or metric labels.
const DENIED_ATTRIBUTE_KEY_FRAGMENTS = [
  "email",
  "phone",
  "message_text",
  "message.text",
  "prompt",
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "payload",
  "body"
];

const URL_KEY_FRAGMENTS = ["url", "target", "path"];

function stripUrlQuery(value: string): string {
  const queryStart = value.indexOf("?");
  return queryStart === -1 ? value : value.slice(0, queryStart);
}

/**
 * PII-safe span attribute guard (blueprint §15.1). Denied keys are redacted,
 * object values are dropped, and URL-ish values lose their query string.
 */
export function sanitizeSpanAttributes(attributes: Record<string, unknown>): Attributes {
  const safe: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const lowered = key.toLowerCase();
    if (DENIED_ATTRIBUTE_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
      safe[key] = "[redacted]";
      continue;
    }
    if (value == null) {
      continue;
    }
    if (typeof value === "object") {
      // No object payloads in attributes — drop instead of serializing PII.
      continue;
    }
    if (typeof value === "string" && URL_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
      safe[key] = stripUrlQuery(value);
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    }
  }
  return safe;
}

export interface StartTracingOptions {
  readonly serviceName: string;
  /** OTLP HTTP endpoint (e.g. http://localhost:4318). When unset, spans are not exported. */
  readonly otlpEndpoint?: string | undefined;
  /** Test seam: inject processors (e.g. SimpleSpanProcessor + InMemorySpanExporter). */
  readonly spanProcessors?: readonly SpanProcessor[];
  /** Register as global tracer provider. Default true; keep false in tests. */
  readonly registerGlobal?: boolean;
}

export interface TracingHandle {
  readonly tracer: Tracer;
  shutdown(): Promise<void>;
}

/**
 * OTel tracing bootstrap for every deployable (blueprint §15.1). Exports over
 * OTLP/HTTP when OTEL_EXPORTER_OTLP_ENDPOINT is configured; otherwise the
 * provider still hands out tracers so instrumentation code never branches.
 */
export function startTracing(options: StartTracingOptions): TracingHandle {
  const spanProcessors: SpanProcessor[] = options.spanProcessors ? [...options.spanProcessors] : [];
  if (spanProcessors.length === 0 && options.otlpEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${options.otlpEndpoint.replace(/\/$/, "")}/v1/traces` }))
    );
  }
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": options.serviceName }),
    spanProcessors
  });
  if (options.registerGlobal !== false) {
    provider.register();
  }
  return {
    tracer: provider.getTracer(options.serviceName),
    shutdown: async () => {
      await provider.shutdown();
      if (options.registerGlobal !== false) {
        trace.disable();
      }
    }
  };
}
