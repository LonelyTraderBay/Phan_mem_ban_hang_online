import { describe, expect, it } from "vitest";
import { money } from "../money";

describe("money", () => {
  it("rejects non-integer minor units", () => {
    expect(() => money(10.5, "VND")).toThrow(/integer/);
  });

  it("builds a Money value", () => {
    expect(money(100, "VND")).toEqual({ minorUnits: 100, currency: "VND" });
  });
});
