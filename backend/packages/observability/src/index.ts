import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";

export { sanitizeSpanAttributes, startTracing, type StartTracingOptions, type TracingHandle } from "./telemetry.js";

const REDACTED_KEYS = new Set(["authorization", "cookie", "password", "token", "secret", "apiKey", "prompt"]);

export function createCorrelationId(): string {
  return randomUUID();
}

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, REDACTED_KEYS.has(key) ? "[redacted]" : redactValue(nested)])
    );
  }
  return value;
}

export function createLogger(serviceName: string, level = "info") {
  return pino({
    name: serviceName,
    level,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token", "*.secret", "*.prompt"],
      censor: "[redacted]"
    }
  });
}

export interface RequestLogFields {
  readonly method: string;
  readonly url: string;
  readonly statusCode: number;
  readonly durationMs: number;
  readonly correlationId?: string;
  readonly requestId?: string;
}

function stripUrlQuery(url: string): string {
  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

export function logHttpRequest(logger: Logger, fields: RequestLogFields): void {
  logger.info(
    {
      msg: "http_request",
      method: fields.method,
      // Blueprint §15.1 — never log full URL query (tokens, email, etc.).
      url: stripUrlQuery(fields.url),
      statusCode: fields.statusCode,
      durationMs: fields.durationMs,
      correlationId: fields.correlationId,
      requestId: fields.requestId
    },
    "http_request"
  );
}
