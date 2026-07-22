/**
 * Dates/times are stored as ISO UTC strings; format at the display boundary only (spec 4.4).
 * `IsoDateTime` is a branded string so a raw, unvalidated string cannot silently flow through
 * domain code as if it were a validated timestamp.
 */

export type IsoDateTime = string & { readonly __brand: "IsoDateTime" };

export function isoDateTime(value: string): IsoDateTime {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO datetime: ${value}`);
  }
  return value as IsoDateTime;
}

export function isoDateTimeFromDate(date: Date): IsoDateTime {
  return date.toISOString() as IsoDateTime;
}

export function compareIsoDateTime(a: IsoDateTime, b: IsoDateTime): number {
  return new Date(a).getTime() - new Date(b).getTime();
}
