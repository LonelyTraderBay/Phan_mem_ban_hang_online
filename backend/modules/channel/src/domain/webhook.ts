import { createHash, timingSafeEqual } from "node:crypto";

/**
 * BE-CHN-004 — Raw-body webhook signature verification stub.
 */

export function digestRawBody(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/** Stub HMAC-SHA256 verify — production uses provider-specific adapter rules. */
export function verifyWebhookSignatureStub(args: {
  readonly rawBody: Buffer;
  readonly signatureHeader: string | null;
  readonly secret: string;
}): boolean {
  if (!args.signatureHeader?.trim()) return false;
  const expected = createHash("sha256")
    .update(args.secret)
    .update(args.rawBody)
    .digest("hex");
  const provided = args.signatureHeader.replace(/^sha256=/, "").trim();
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export function redactWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/token|secret|password|authorization/i.test(key)) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      redacted[key] = redactWebhookPayload(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
