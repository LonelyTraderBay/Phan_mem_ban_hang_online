/**
 * Money is always an integer minor-unit amount (e.g. cents) plus an ISO 4217 currency code.
 * Never use floating-point arithmetic on money (spec 4.4) — this module is the only place
 * money arithmetic should happen. Add helpers when a second call site needs them.
 */

export interface Money {
  readonly minorUnits: number;
  readonly currency: string;
}

export function money(minorUnits: number, currency: string): Money {
  if (!Number.isInteger(minorUnits)) {
    throw new Error(`Money.minorUnits must be an integer, got ${minorUnits}`);
  }
  return { minorUnits, currency };
}
