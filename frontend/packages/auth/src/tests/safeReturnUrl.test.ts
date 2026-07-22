import { describe, expect, it } from "vitest";
import { resolveSafeReturnUrl, safeReturnUrlFromSearch } from "../safeReturnUrl";

describe("resolveSafeReturnUrl", () => {
  it("accepts relative same-origin paths", () => {
    expect(resolveSafeReturnUrl("/products")).toBe("/products");
    expect(resolveSafeReturnUrl("/settings/users?tab=1")).toBe("/settings/users?tab=1");
  });

  it("rejects open redirects", () => {
    expect(resolveSafeReturnUrl("https://evil.example/phish")).toBe("/");
    expect(resolveSafeReturnUrl("//evil.example")).toBe("/");
    expect(resolveSafeReturnUrl("javascript:alert(1)")).toBe("/");
  });

  it("defaults when missing", () => {
    expect(resolveSafeReturnUrl(null)).toBe("/");
    expect(resolveSafeReturnUrl("")).toBe("/");
  });
});

describe("safeReturnUrlFromSearch", () => {
  it("reads return_to preferentially", () => {
    expect(safeReturnUrlFromSearch("?return_to=%2Forders&next=%2Fbad")).toBe("/orders");
  });

  it("falls back to next", () => {
    expect(safeReturnUrlFromSearch("?next=/dashboard")).toBe("/dashboard");
  });
});
