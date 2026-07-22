import { describe, expect, it, vi } from "vitest";
import { createLogger, logHttpRequest, redactValue } from "./index.js";

describe("redactValue", () => {
  it("redacts sensitive keys deeply", () => {
    expect(redactValue({ password: "x", nested: { token: "y", ok: 1 } })).toEqual({
      password: "[redacted]",
      nested: { token: "[redacted]", ok: 1 }
    });
  });
});

describe("logHttpRequest", () => {
  it("strips query strings before logging the URL", () => {
    const logger = createLogger("test", "silent");
    const info = vi.spyOn(logger, "info");
    logHttpRequest(logger, {
      method: "GET",
      url: "/auth/reset-password?token=abc123&email=a%40b.com",
      statusCode: 200,
      durationMs: 1
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/auth/reset-password" }),
      "http_request"
    );
  });
});

