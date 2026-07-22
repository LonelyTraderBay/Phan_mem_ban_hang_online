import { isJwtConfigured, type AppConfig } from "@ai-sales/config";
import {
  createAccessTokenService,
  type AccessTokenService
} from "@ai-sales/security";

/** Build AccessTokenService from env config; returns null when JWT_ENABLED is false. */
export async function loadAccessTokenService(config: AppConfig): Promise<AccessTokenService | null> {
  if (!isJwtConfigured(config)) return null;
  return createAccessTokenService({
    issuer: config.JWT_ISSUER!,
    audience: config.JWT_AUDIENCE!,
    ttlSeconds: config.JWT_ACCESS_TTL_SECONDS,
    active: {
      kid: config.JWT_ACTIVE_KID!,
      privateKeyPem: config.JWT_ACTIVE_PRIVATE_KEY_PEM!
    },
    ...(config.JWT_PREVIOUS_KID && config.JWT_PREVIOUS_PUBLIC_KEY_PEM
      ? {
          previous: {
            kid: config.JWT_PREVIOUS_KID,
            publicKeyPem: config.JWT_PREVIOUS_PUBLIC_KEY_PEM
          }
        }
      : {})
  });
}
