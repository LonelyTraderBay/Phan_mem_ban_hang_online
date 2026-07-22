/**
 * Redaction is enforced here structurally, not by convention: both the Sentry adapter's
 * `beforeSend` and the dev console adapter run every payload through these functions before
 * it leaves the process (FE-F00-008 steps 2 and 5 — "never log PII").
 */

const SENSITIVE_QUERY_KEYS = ["token", "password", "secret", "authorization", "apikey", "api_key"];

export function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    let changed = false;
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive))) {
        parsed.searchParams.set(key, "[redacted]");
        changed = true;
      }
    }
    if (!changed) return url;
    // Reconstruct as a relative URL if the input was relative.
    return url.startsWith("http") ? parsed.toString() : `${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return url;
  }
}

/**
 * Request/response bodies are dropped by default. Pass an explicit field allowlist to keep
 * specific non-sensitive fields (spec 15.x: default-deny for request body capture).
 */
export function scrubBody(body: unknown, fieldAllowlist: string[] = []): unknown {
  if (body === null || typeof body !== "object") return undefined;
  if (fieldAllowlist.length === 0) return undefined;

  const source = body as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of fieldAllowlist) {
    if (field in source) result[field] = source[field];
  }
  return result;
}

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_LIKE_PATTERN = /\b\d[\d\s-]{7,}\d\b/g;

/** Best-effort net for free-text fields — not a substitute for not sending PII in the first place. */
export function scrubText(text: string): string {
  return text.replace(EMAIL_PATTERN, "[redacted-email]").replace(PHONE_LIKE_PATTERN, "[redacted-number]");
}

/**
 * Recursively applies `scrubText` to every string value in a developer-supplied telemetry
 * payload (event/context metadata, not a raw HTTP body — see `scrubBody` for that).
 */
export function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[redacted-too-deep]";
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = scrubDeep(nested, depth + 1);
    }
    return result;
  }
  return value;
}
