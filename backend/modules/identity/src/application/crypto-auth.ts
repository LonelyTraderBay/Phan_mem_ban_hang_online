import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify, Algorithm } from "@node-rs/argon2";

/** Argon2id password hash (blueprint §12). */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, { algorithm: Algorithm.Argon2id });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** RFC 6238 TOTP (SHA-1, 30s, 6 digits) — no extra dependency. */
export function generateTotpSecret(): string {
  return randomBytes(20).toString("base64url");
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function decodeSecret(secret: string): Buffer {
  try {
    return Buffer.from(secret, "base64url");
  } catch {
    return Buffer.from(secret, "utf8");
  }
}

/** Current TOTP code (tests / enrollment UX). */
export function currentTotpCode(secret: string, now = new Date()): string {
  const secretBuf = decodeSecret(secret);
  const timestep = Math.floor(now.getTime() / 1000 / 30);
  return hotp(secretBuf, timestep);
}

export function verifyTotpCode(secret: string, code: string, now = new Date(), window = 1): boolean {
  if (!/^[0-9]{6}$/.test(code)) return false;
  const secretBuf = decodeSecret(secret);
  const timestep = Math.floor(now.getTime() / 1000 / 30);
  const expected = Buffer.from(code);
  for (let w = -window; w <= window; w++) {
    const candidate = Buffer.from(hotp(secretBuf, timestep + w));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", "aisales-recovery")
    .update(code.trim().toLowerCase(), "utf8")
    .digest("hex");
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomBytes(5).toString("hex"));
}
