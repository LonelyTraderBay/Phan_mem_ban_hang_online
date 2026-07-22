/**
 * Builds a fixture matching spec 9.3's session bootstrap contract shape (@ai-sales/auth's
 * `sessionBootstrapSchema`). Kept independent of @ai-sales/auth's types (test-utils stays a leaf
 * package) — if the schema changes, update both places.
 */
export function buildSessionBootstrap(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    user: { id: "usr_fixture", display_name: "Người dùng thử nghiệm", locale: "vi-VN", timezone: "Asia/Ho_Chi_Minh" },
    tenant: { id: "ten_fixture", name: "Shop thử nghiệm", currency: "VND", timezone: "Asia/Ho_Chi_Minh" },
    session: { id: "ses_fixture", version: 1, expires_at: "2099-01-01T00:00:00Z", reauth_required_at: null },
    device: { id: "dev_fixture", trusted: true },
    permissions: [] as string[],
    feature_flags: {} as Record<string, { enabled: boolean; variant?: string }>,
    ...overrides,
  };
}
