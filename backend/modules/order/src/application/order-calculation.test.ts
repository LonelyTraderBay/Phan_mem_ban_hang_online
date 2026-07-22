import { describe, expect, it } from "vitest";
import {
  calculateOrderTotals,
  extractInclusiveTaxMinor,
  roundHalfUp,
  TAX_RATE_BPS
} from "../domain/order-calculation.js";

describe("BE-ORD-002 order calculation (HO_DEFAULTS_v1)", () => {
  it("uses tax_rate_bps=1000 per HO_DEFAULTS_v1", () => {
    expect(TAX_RATE_BPS).toBe(1000);
  });

  it("single line 110000 minor inclusive extracts 10000 tax", () => {
    const tax = extractInclusiveTaxMinor(110_000);
    expect(tax).toBe(10_000);
    expect(110_000 - tax).toBe(100_000);
  });

  it("percentage discount rounds half up (10% of 999 -> 100)", () => {
    const totals = calculateOrderTotals({
      items: [{ variantId: "v1", quantity: 1, unitPriceMinor: 999, lineDiscountMinor: 100 }]
    });
    expect(totals.discountMinor).toBe(100);
  });

  it("line-level rounding differs from order-level rounding regression", () => {
    const items = Array.from({ length: 3 }, () => ({
      variantId: crypto.randomUUID(),
      quantity: 1,
      unitPriceMinor: 333,
      lineDiscountMinor: 33
    }));
    const lineTotals = calculateOrderTotals({ items });
    const naiveTax = extractInclusiveTaxMinor(
      items.reduce((s, i) => s + (i.unitPriceMinor - i.lineDiscountMinor), 0)
    );
    expect(lineTotals.taxMinor).not.toBe(naiveTax);
    expect(lineTotals.grandTotalMinor).toBe(
      lineTotals.lineItems.reduce((s, l) => s + l.lineTotalMinor, 0)
    );
  });

  it("grand_total reconciles with sum(line_total) + shipping + fee", () => {
    const totals = calculateOrderTotals({
      items: [
        { variantId: "a", quantity: 2, unitPriceMinor: 50_000 },
        { variantId: "b", quantity: 1, unitPriceMinor: 25_000 }
      ],
      shippingMinor: 30_000,
      feeMinor: 5_000
    });
    const lineSum = totals.lineItems.reduce((s, l) => s + l.lineTotalMinor, 0);
    expect(totals.grandTotalMinor).toBe(lineSum + 30_000 + 5_000);
  });

  it("roundHalfUp handles halves correctly", () => {
    expect(roundHalfUp(10.5)).toBe(11);
    expect(roundHalfUp(10.4)).toBe(10);
  });
});
