export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type UuidV7 = Brand<string, "UuidV7">;

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function parseUuidV7(value: string): UuidV7 {
  if (!UUID_V7_PATTERN.test(value)) {
    throw new DomainInvariantError("INVALID_UUIDV7", "Expected UUIDv7 identifier.");
  }
  return value as UuidV7;
}

/** Generates a UUIDv7-shaped identifier for development and walking-skeleton flows. */
export function generateUuidV7(): UuidV7 {
  const unixMs = BigInt(Date.now());
  const timeHex = unixMs.toString(16).padStart(12, "0").slice(-12);
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const randHex = [...rand].map((b) => b.toString(16).padStart(2, "0")).join("");
  return parseUuidV7(
    `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-7${randHex.slice(0, 3)}-a${randHex.slice(3, 6)}-${randHex.slice(6, 18)}`
  );
}

export class DomainInvariantError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "DomainInvariantError";
  }
}

export class Money {
  private constructor(
    public readonly minorUnits: bigint,
    public readonly currency: string
  ) {}

  static fromMinorUnits(minorUnits: bigint | number, currency: string): Money {
    if (typeof minorUnits === "number" && !Number.isInteger(minorUnits)) {
      throw new DomainInvariantError("MONEY_FLOAT_NOT_ALLOWED", "Money must use integer minor units.");
    }
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new DomainInvariantError("INVALID_CURRENCY", "Currency must be a three-letter uppercase code.");
    }
    return new Money(BigInt(minorUnits), currency);
  }
}

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: UuidV7;
  readonly type: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly tenantId?: UuidV7;
  readonly payload: TPayload;
}

export type Result<TOk, TErr extends Error = Error> =
  | { readonly ok: true; readonly value: TOk }
  | { readonly ok: false; readonly error: TErr };

export function ok<TOk>(value: TOk): Result<TOk, never> {
  return { ok: true, value };
}

export function err<TErr extends Error>(error: TErr): Result<never, TErr> {
  return { ok: false, error };
}
