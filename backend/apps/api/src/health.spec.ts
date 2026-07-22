import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "./health";

describe("api health payload", () => {
  it("returns stable health shape", () => {
    const payload = buildHealthPayload("api", new Date("2026-06-27T00:00:00.000Z"));

    expect(payload).toEqual({
      service: "api",
      status: "ok",
      timestamp: "2026-06-27T00:00:00.000Z"
    });
  });
});
