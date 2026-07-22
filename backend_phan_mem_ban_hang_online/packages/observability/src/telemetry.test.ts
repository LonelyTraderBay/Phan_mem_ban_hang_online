import { describe, expect, it } from "vitest";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { sanitizeSpanAttributes, startTracing } from "./telemetry.js";

describe("sanitizeSpanAttributes", () => {
  it("redacts PII/secret keys and drops object payloads", () => {
    const safe = sanitizeSpanAttributes({
      "tenant.id": "018f65fd-7c6b-7c2a-9c8f-46e0f7a1f0a1",
      operation: "order.confirm",
      customer_email: "a@b.com",
      phone_number: "0901234567",
      prompt: "raw prompt",
      request_body: "raw body",
      metadata: { nested: "object dropped" },
      duration_ms: 12
    });

    expect(safe).toEqual({
      "tenant.id": "018f65fd-7c6b-7c2a-9c8f-46e0f7a1f0a1",
      operation: "order.confirm",
      customer_email: "[redacted]",
      phone_number: "[redacted]",
      prompt: "[redacted]",
      request_body: "[redacted]",
      duration_ms: 12
    });
  });

  it("strips query strings from URL-ish attributes", () => {
    expect(sanitizeSpanAttributes({ "http.url": "https://api.local/orders?token=abc" })).toEqual({
      "http.url": "https://api.local/orders"
    });
  });
});

describe("startTracing", () => {
  it("exports spans with service resource and sanitized attributes", async () => {
    const exporter = new InMemorySpanExporter();
    const handle = startTracing({
      serviceName: "api-test",
      spanProcessors: [new SimpleSpanProcessor(exporter)],
      registerGlobal: false
    });

    const span = handle.tracer.startSpan("walking_skeleton.trace", {
      attributes: sanitizeSpanAttributes({ operation: "walking_skeleton.trace", token: "secret" })
    });
    span.end();

    // Assert before shutdown — InMemorySpanExporter.shutdown() clears its buffer.
    const finished = exporter.getFinishedSpans();
    expect(finished).toHaveLength(1);
    expect(finished[0]?.name).toBe("walking_skeleton.trace");
    expect(finished[0]?.attributes).toEqual({ operation: "walking_skeleton.trace", token: "[redacted]" });
    expect(finished[0]?.resource.attributes["service.name"]).toBe("api-test");
    await handle.shutdown();
  });

  it("boots without an OTLP endpoint (no exporter, tracer still usable)", async () => {
    const handle = startTracing({ serviceName: "worker-test", registerGlobal: false });
    const span = handle.tracer.startSpan("noop");
    expect(span.isRecording()).toBe(true);
    span.end();
    await handle.shutdown();
  });
});
