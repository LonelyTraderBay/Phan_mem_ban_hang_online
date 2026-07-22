import { describe, expect, it } from "vitest";
import { addMoney, compareMoney, money, multiplyMoney, subtractMoney } from "../money";

describe("money", () => {
  it("rejects non-integer minor units", () => {
    expect(() => money(10.5, "VND")).toThrow(/integer/);
  });

  it("adds only within the same currency", () => {
    expect(addMoney(money(100, "VND"), money(50, "VND"))).toEqual(money(150, "VND"));
    expect(() => addMoney(money(100, "VND"), money(50, "USD"))).toThrow(/currencies/);
  });

  it("subtracts and multiplies by an integer factor", () => {
    expect(subtractMoney(money(100, "VND"), money(30, "VND"))).toEqual(money(70, "VND"));
    expect(multiplyMoney(money(100, "VND"), 3)).toEqual(money(300, "VND"));
    expect(() => multiplyMoney(money(100, "VND"), 1.5)).toThrow(/integer factor/);
  });

  it("compares amounts", () => {
    expect(compareMoney(money(100, "VND"), money(50, "VND"))).toBeGreaterThan(0);
  });
});
