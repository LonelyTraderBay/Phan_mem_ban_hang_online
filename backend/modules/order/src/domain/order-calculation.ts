/**
 * BE-ORD-002 — Deterministic order money calculation.
 * Authority: docs/domain/order-calculation.md + HO_DEFAULTS_v1 (10% VAT tax-inclusive).
 */

/** HO_DEFAULTS_v1 — do not invent another rate. */
export const TAX_RATE_BPS = 1000;

export interface OrderLineInput {
  readonly variantId: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly lineDiscountMinor?: number;
}

export interface CalculatedLineItem {
  readonly variantId: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly lineSubtotalMinor: number;
  readonly lineDiscountMinor: number;
  readonly lineTaxMinor: number;
  readonly lineTotalMinor: number;
}

export interface OrderTotals {
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly feeMinor: number;
  readonly grandTotalMinor: number;
  readonly lineItems: readonly CalculatedLineItem[];
}

/** ROUND_HALF_UP on integer minor units. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Invalid money value.");
  }
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

/** Tax-inclusive extraction per order-calculation.md STEP 3. */
export function extractInclusiveTaxMinor(grossMinor: number, taxRateBps = TAX_RATE_BPS): number {
  return roundHalfUp((grossMinor * taxRateBps) / (10_000 + taxRateBps));
}

export function calculateOrderTotals(args: {
  readonly items: readonly OrderLineInput[];
  readonly shippingMinor?: number;
  readonly feeMinor?: number;
  readonly taxRateBps?: number;
}): OrderTotals {
  const taxRateBps = args.taxRateBps ?? TAX_RATE_BPS;
  const shippingMinor = args.shippingMinor ?? 0;
  const feeMinor = args.feeMinor ?? 0;

  const lineItems: CalculatedLineItem[] = args.items.map((item) => {
    const lineSubtotalMinor = roundHalfUp(item.unitPriceMinor * item.quantity);
    const lineDiscountMinor = item.lineDiscountMinor ?? 0;
    const lineTaxableBaseMinor = lineSubtotalMinor - lineDiscountMinor;
    const lineTotalMinor = lineTaxableBaseMinor;
    const lineTaxMinor = extractInclusiveTaxMinor(lineTotalMinor, taxRateBps);
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineSubtotalMinor,
      lineDiscountMinor,
      lineTaxMinor,
      lineTotalMinor
    };
  });

  const subtotalMinor = lineItems.reduce((sum, l) => sum + l.lineSubtotalMinor, 0);
  const discountMinor = lineItems.reduce((sum, l) => sum + l.lineDiscountMinor, 0);
  const taxMinor = lineItems.reduce((sum, l) => sum + l.lineTaxMinor, 0);
  const lineGrand = lineItems.reduce((sum, l) => sum + l.lineTotalMinor, 0);
  const grandTotalMinor = lineGrand + shippingMinor + feeMinor;

  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    shippingMinor,
    feeMinor,
    grandTotalMinor,
    lineItems
  };
}
