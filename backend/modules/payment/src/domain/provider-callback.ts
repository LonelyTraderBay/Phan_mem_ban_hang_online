/**
 * BE-PAY-003 — Provider callback adapter baseline (stub).
 */

export interface ProviderCallbackPayload {
  readonly provider: string;
  readonly providerEventId: string;
  readonly paymentId: string;
  readonly tenantId: string;
  readonly status: "captured" | "failed";
  readonly amountMinor: number;
  readonly currency: string;
}

export function verifyProviderCallbackSignatureStub(args: {
  readonly provider: string;
  readonly rawBody: string;
  readonly signature: string | undefined;
}): boolean {
  if (!args.signature?.trim()) return false;
  const expected = `stub-${args.provider}-${args.rawBody.length}`;
  return args.signature === expected;
}

export function normalizeProviderCallbackStub(
  provider: string,
  body: Record<string, unknown>
): ProviderCallbackPayload | null {
  const paymentId = typeof body.payment_id === "string" ? body.payment_id : null;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : null;
  const providerEventId = typeof body.event_id === "string" ? body.event_id : null;
  const amountMinor = typeof body.amount_minor === "number" ? body.amount_minor : null;
  const currency = typeof body.currency === "string" ? body.currency : null;
  const status = body.status === "failed" ? "failed" : body.status === "captured" ? "captured" : null;
  if (!paymentId || !tenantId || !providerEventId || amountMinor == null || !currency || !status) {
    return null;
  }
  return {
    provider,
    providerEventId,
    paymentId,
    tenantId,
    status,
    amountMinor,
    currency
  };
}
