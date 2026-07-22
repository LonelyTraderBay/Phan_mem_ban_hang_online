/**
 * BE-ORD-007 — Duplicate order fingerprint for idempotency warnings.
 */

export function buildOrderFingerprint(args: {
  readonly customerId: string;
  readonly items: readonly { readonly variantId: string; readonly quantity: string }[];
}): string {
  const normalized = [...args.items]
    .map((i) => `${i.variantId}:${i.quantity.trim()}`)
    .sort()
    .join("|");
  const raw = `${args.customerId}::${normalized}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `fp_${hash.toString(16)}`;
}
