import { describe, expect, it } from "vitest";
import { emailAddress, isoDateString, nonEmptyString, nonNegativeInteger } from "../validators";

describe("nonEmptyString", () => {
  it("rejects empty/whitespace-only strings", () => {
    expect(nonEmptyString.safeParse("").success).toBe(false);
    expect(nonEmptyString.safeParse("   ").success).toBe(false);
  });
  it("accepts a non-empty string", () => {
    expect(nonEmptyString.safeParse("hello").success).toBe(true);
  });
});

describe("emailAddress", () => {
  it("rejects an invalid email", () => {
    expect(emailAddress.safeParse("not-an-email").success).toBe(false);
  });
  it("accepts a valid email", () => {
    expect(emailAddress.safeParse("a@b.com").success).toBe(true);
  });
});

describe("isoDateString", () => {
  it("rejects an unparseable date string", () => {
    expect(isoDateString.safeParse("not-a-date").success).toBe(false);
  });
  it("accepts a valid ISO date string", () => {
    expect(isoDateString.safeParse("2026-06-26T10:00:00Z").success).toBe(true);
  });
});

describe("nonNegativeInteger", () => {
  it("rejects negative numbers and non-integers", () => {
    expect(nonNegativeInteger.safeParse(-1).success).toBe(false);
    expect(nonNegativeInteger.safeParse(1.5).success).toBe(false);
  });
  it("accepts zero and positive integers", () => {
    expect(nonNegativeInteger.safeParse(0).success).toBe(true);
    expect(nonNegativeInteger.safeParse(10).success).toBe(true);
  });
});
