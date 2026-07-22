import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { createOpaqueToken, OidcAuthError, sha256Hex } from "./oidc-types.js";
import { hashPassword } from "./crypto-auth.js";

export interface PasswordResetStore {
  /**
   * Enumeration-safe: always succeeds from caller POV.
   * Returns whether a token was issued (tests only; never expose to HTTP).
   */
  requestReset(args: {
    readonly email: string;
    readonly tokenId: UuidV7;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  }): Promise<{ readonly issued: boolean }>;

  consumeReset(args: {
    readonly tokenHash: string;
    readonly passwordHash: string;
    readonly auditId: UuidV7;
  }): Promise<"ok" | "invalid">;

  /** Test/ops helper — never expose via public API. */
  peekLastPlainToken?(email: string): string | undefined;
}

export async function requestPasswordReset(options: {
  readonly store: PasswordResetStore;
  readonly email: string;
  readonly tokenTtlMinutes?: number;
  readonly now?: Date;
  /** When set, store may record plaintext for test harness only. */
  readonly recordPlainToken?: (email: string, token: string) => void;
}): Promise<{ readonly data: Record<string, never>; readonly meta: Record<string, never> }> {
  const email = options.email.trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 320) {
    throw new OidcAuthError("Invalid email.", "VALIDATION_FAILED");
  }

  const now = options.now ?? new Date();
  const ttl = options.tokenTtlMinutes ?? 30;
  const plain = createOpaqueToken();
  const tokenId = generateUuidV7();
  const expiresAt = new Date(now.getTime() + ttl * 60 * 1000);

  const result = await options.store.requestReset({
    email,
    tokenId,
    tokenHash: sha256Hex(plain),
    expiresAt
  });

  if (result.issued) {
    options.recordPlainToken?.(email, plain);
  }

  // Always identical success — enumeration-safe
  return { data: {}, meta: {} };
}

export async function resetPassword(options: {
  readonly store: PasswordResetStore;
  readonly token: string;
  readonly newPassword: string;
}): Promise<{ readonly data: Record<string, never>; readonly meta: Record<string, never> }> {
  const token = options.token.trim();
  const password = options.newPassword;
  if (token.length < 16 || token.length > 256) {
    throw new OidcAuthError("Invalid or expired reset token.", "AUTH_UNAUTHORIZED");
  }
  if (password.length < 8 || password.length > 256) {
    throw new OidcAuthError("Invalid password.", "VALIDATION_FAILED");
  }

  const passwordHash = await hashPassword(password);
  const outcome = await options.store.consumeReset({
    tokenHash: sha256Hex(token),
    passwordHash,
    auditId: generateUuidV7()
  });

  if (outcome !== "ok") {
    throw new OidcAuthError("Invalid or expired reset token.", "AUTH_UNAUTHORIZED");
  }

  return { data: {}, meta: {} };
}
