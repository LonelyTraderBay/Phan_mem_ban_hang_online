/**
 * Formatting helpers. Currency is always a required parameter — spec 7.6 explicitly forbids
 * defaulting to VND when the contract (tenant currency) has not been confirmed for a given value.
 */

export function formatDate(
  value: Date | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatMoney(minorUnits: number, currency: string, locale: string): string {
  const majorUnits = minorUnits / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(majorUnits);
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
