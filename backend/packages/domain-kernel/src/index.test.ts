import { describe, expect, it } from "vitest";
import { DomainInvariantError, Money, parseUuidV7 } from "./index";

describe("domain kernel", () => {
  it("rejects floating point money", () => {
    expect(() => Money.fromMinorUnits(12.5, "USD")).toThrow(DomainInvariantError);
  });

  it("accepts UUIDv7 identifiers", () => {
    expect(parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a")).toBeTruthy();
  });
});
