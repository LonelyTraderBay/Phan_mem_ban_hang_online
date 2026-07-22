import { describe, expect, it } from "vitest";
import { compareIsoDateTime, isoDateTime, isoDateTimeFromDate } from "../datetime";

describe("datetime", () => {
  it("rejects invalid ISO strings", () => {
    expect(() => isoDateTime("not-a-date")).toThrow(/Invalid ISO datetime/);
  });

  it("accepts valid ISO strings and round-trips from Date", () => {
    const a = isoDateTime("2026-01-01T00:00:00.000Z");
    const b = isoDateTimeFromDate(new Date("2026-06-01T00:00:00.000Z"));
    expect(compareIsoDateTime(a, b)).toBeLessThan(0);
  });
});
