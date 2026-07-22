/**
 * Money is always an integer minor-unit amount (e.g. cents) plus an ISO 4217 currency code.
 * Never use floating-point arithmetic on money (spec 4.4) — this module is the only place
 * money arithmetic should happen.
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

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot operate on Money with different currencies: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits + b.minorUnits, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits - b.minorUnits, a.currency);
}

export function multiplyMoney(a: Money, factor: number): Money {
  if (!Number.isInteger(factor)) {
    throw new Error("Money can only be multiplied by an integer factor to avoid floating-point drift.");
  }
  return money(a.minorUnits * factor, a.currency);
}

export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.minorUnits - b.minorUnits;
}

export function isZeroMoney(a: Money): boolean {
  return a.minorUnits === 0;
}
