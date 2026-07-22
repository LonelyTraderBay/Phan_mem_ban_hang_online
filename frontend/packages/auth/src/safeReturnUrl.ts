/**
 * Safe return URL after login (spec 9.x / FE-F01-001). Only same-origin relative paths;
 * reject open redirects (absolute URLs, protocol-relative, javascript:, etc.).
 */

const DEFAULT_RETURN = "/";

function isSafeRelativePath(candidate: string): boolean {
  if (!candidate.startsWith("/")) return false;
  if (candidate.startsWith("//")) return false;
  if (candidate.includes("://")) return false;
  if (/[\r\n]/.test(candidate)) return false;
  return true;
}

/**
 * Resolves a return_to / next / redirect query value to a safe in-app path.
 * Defaults to `/` when missing or unsafe.
 */
export function resolveSafeReturnUrl(
  raw: string | null | undefined,
  fallback: string = DEFAULT_RETURN,
): string {
  if (raw == null || raw.trim() === "") {
    return isSafeRelativePath(fallback) ? fallback : DEFAULT_RETURN;
  }
  const trimmed = raw.trim();
  try {
    const decoded = decodeURIComponent(trimmed);
    if (isSafeRelativePath(decoded)) return decoded;
  } catch {
    // malformed percent-encoding
  }
  return isSafeRelativePath(fallback) ? fallback : DEFAULT_RETURN;
}

/** Read `return_to` (preferred) or `next` from a URLSearchParams / location search string. */
export function safeReturnUrlFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return resolveSafeReturnUrl(params.get("return_to") ?? params.get("next"));
}
