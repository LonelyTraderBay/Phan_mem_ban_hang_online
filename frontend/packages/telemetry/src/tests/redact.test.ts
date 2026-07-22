import { describe, expect, it } from "vitest";
import { scrubBody, scrubDeep, scrubText, scrubUrl } from "../redact";

describe("scrubUrl", () => {
  it("redacts sensitive query params", () => {
    expect(scrubUrl("/api/login?token=abc123&next=/home")).toBe("/api/login?token=%5Bredacted%5D&next=%2Fhome");
  });

  it("leaves URLs with no sensitive params untouched", () => {
    expect(scrubUrl("/api/products?page=2")).toBe("/api/products?page=2");
  });
});

describe("scrubText", () => {
  it("redacts emails and phone-like digit runs", () => {
    const result = scrubText("Contact a@b.com or 0912-345-678");
    expect(result).not.toContain("a@b.com");
    expect(result).toContain("[redacted-email]");
  });
});

describe("scrubDeep", () => {
  it("recursively scrubs nested string values", () => {
    const result = scrubDeep({ user: { email: "a@b.com" }, tags: ["x@y.com"] });
    expect(JSON.stringify(result)).not.toContain("a@b.com");
    expect(JSON.stringify(result)).not.toContain("x@y.com");
  });
});

describe("scrubBody", () => {
  it("defaults to fully redacted when no allowlist is given", () => {
    expect(scrubBody({ password: "hunter2" })).toBeUndefined();
  });

  it("keeps only allowlisted fields", () => {
    expect(scrubBody({ orderId: "o_1", password: "hunter2" }, ["orderId"])).toEqual({ orderId: "o_1" });
  });
});
